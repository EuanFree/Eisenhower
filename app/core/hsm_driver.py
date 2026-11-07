"""Hardware Security Module (HSM) driver for PKCS#11 cryptographic operations.

This module provides a thin abstraction over PKCS#11 hardware devices
(Thales Luna, YubiHSM2, Nitrokey, SoftHSM2) using the ``python-pkcs11``
library.  It is used to sign forensic audit ledger blocks with an
on-premise hardware token, ensuring that the private signing key never
leaves the HSM.

Key Capabilities
~~~~~~~~~~~~~~~~

- **Token Discovery** — Locate the HSM token by label and slot ID.
- **Digital Signing** — Sign arbitrary data using the on-token private
  key (RSA-PKCS#1 v1.5 SHA-256 or ECDSA).
- **Signature Verification** — Verify signatures using the on-token
  public key / certificate.
- **Key Identifier** — Return a stable identifier for the signing key
  (derived from the public key SHA-256 fingerprint).

Fallback Behaviour
~~~~~~~~~~~~~~~~~~

When ``HSM_ENABLED`` is ``False`` (development mode), the driver falls
back to a pure-software Ed25519 signer so that the audit pipeline
remains functional without hardware.

Usage
~~~~~

.. code-block:: python

    from app.core.hsm_driver import HSMDriver

    driver = HSMDriver()
    signature, key_id = driver.sign_data(b"block-hash-bytes")
    is_valid = driver.verify_data(b"block-hash-bytes", signature, key_id)
"""

import hashlib
import logging
import os
from typing import Optional, Tuple

from app.config import settings

log = logging.getLogger(__name__)


class HSMError(Exception):
    """Raised when an HSM operation fails."""


class HSMDriver:
    """PKCS#11 HSM driver with software Ed25519 fallback.

    Parameters
    ----------
    pkcs11_lib : str or None
        Override for ``HSM_PKCS11_LIB_PATH`` from settings.
    slot_id : int or None
        Override for ``HSM_SLOT_ID`` from settings.
    token_label : str or None
        Override for ``HSM_TOKEN_LABEL`` from settings.
    pin : str or None
        Override for ``HSM_PIN`` from settings.
    key_label : str or None
        Override for ``HSM_KEY_LABEL`` from settings.
    """

    def __init__(
        self,
        pkcs11_lib: Optional[str] = None,
        slot_id: Optional[int] = None,
        token_label: Optional[str] = None,
        pin: Optional[str] = None,
        key_label: Optional[str] = None,
    ) -> None:
        self._lib_path = pkcs11_lib or settings.HSM_PKCS11_LIB_PATH
        self._slot_id = slot_id if slot_id is not None else settings.HSM_SLOT_ID
        self._token_label = token_label or settings.HSM_TOKEN_LABEL
        self._pin = pin or settings.HSM_PIN
        self._key_label = key_label or settings.HSM_KEY_LABEL

        # Lazy-loaded PKCS#11 objects
        self._pkcs11 = None
        self._mechanism = None
        self._private_key = None
        self._public_key = None
        self._key_id: Optional[str] = None

        # Software fallback key — shared across all driver instances (process-wide singleton)
        # This ensures signatures created by one HSMDriver instance can be verified by another
        if not hasattr(HSMDriver, "_shared_software_signer"):
            HSMDriver._shared_software_signer = None
            HSMDriver._shared_software_verifier = None
            HSMDriver._shared_software_key_id = None
        self._software_signer = HSMDriver._shared_software_signer
        self._software_verifier = HSMDriver._shared_software_verifier
        self._software_key_id = HSMDriver._shared_software_key_id

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def sign_data(self, data: bytes) -> Tuple[str, str]:
        """Sign *data* using the HSM private key or software fallback.

        Parameters
        ----------
        data : bytes
            The data to sign (typically a SHA-256 block hash).

        Returns
        -------
        tuple
            ``(signature_hex, key_identifier)`` where *signature_hex* is
            a hex-encoded signature string and *key_identifier* is a
            stable identifier for the signing key.

        Raises
        ------
        HSMError
            If the HSM is enabled but signing fails.
        """
        if settings.HSM_ENABLED:
            return self._sign_hsm(data)
        else:
            return self._sign_software(data)

    def verify_data(self, data: bytes, signature_hex: str, key_identifier: str) -> bool:
        """Verify *signature_hex* against *data*.

        Parameters
        ----------
        data : bytes
            The original data that was signed.
        signature_hex : str
            Hex-encoded signature to verify.
        key_identifier : str
            The key identifier that was returned during signing.

        Returns
        -------
        bool
            ``True`` if the signature is mathematically valid.
        """
        if key_identifier.startswith("hsm:"):
            return self._verify_hsm(data, signature_hex)
        else:
            return self._verify_software(data, signature_hex, key_identifier)

    def get_key_identifier(self) -> str:
        """Return the current signing key identifier without performing a sign.

        Returns
        -------
        str
            A stable key identifier string.
        """
        if settings.HSM_ENABLED:
            self._ensure_hsm_session()
            return self._key_id or "hsm:unknown"
        else:
            self._ensure_software_key()
            return self._software_key_id or "sw:unknown"

    # ------------------------------------------------------------------
    # HSM (PKCS#11) internals
    # ------------------------------------------------------------------

    def _ensure_hsm_session(self) -> None:
        """Lazy-initialise the PKCS#11 connection and locate the key pair."""
        if self._private_key is not None:
            return

        try:
            import pkcs11h
            from pkcs11h import Mechanism, Object, Session
        except ImportError:
            raise HSMError(
                "python-pkcs11 (pkcs11h) is not installed. "
                "Install it with: pip install python-pkcs11"
            )

        if not os.path.exists(self._lib_path):
            raise HSMError(
                f"PKCS#11 library not found at {self._lib_path}. "
                "Check HSM_PKCS11_LIB_PATH configuration."
            )

        self._pkcs11 = pkcs11h.PKCS11V2(self._lib_path)

        # Find the slot with the matching token label
        slots = self._pkcs11.getSlotList(tokenPresent=True)
        if not slots:
            raise HSMError("No HSM slots with tokens present.")

        slot = None
        for s in slots:
            info = self._pkcs11.getTokenInfo(s)
            if info.label.strip() == self._token_label:
                slot = s
                break

        if slot is None:
            # Fall back to configured slot_id if label not found
            if self._slot_id in slots:
                slot = self._slot_id
            else:
                raise HSMError(
                    f"Token '{self._token_label}' not found in any slot. "
                    f"Available slots: {slots}"
                )

        # Open RW session and log in
        session = self._pkcs11.openSession(slot, pkcs11h.Session.RW)
        session.login(self._pin)

        # Find the private signing key by label
        private_key_template = [
            (pkcs11h.Object.CLASS, pkcs11h.Object.PRIVATE_KEY),
            (pkcs11h.Object.KEY_TYPE, pkcs11h.Object.KEY_TYPE_RSA),
            (pkcs11h.Object.LABEL, self._key_label),
        ]
        private_keys = session.findObjects(private_key_template)

        if not private_keys:
            # Try EC key type
            private_key_template[1] = (pkcs11h.Object.KEY_TYPE, pkcs11h.Object.KEY_TYPE_EC)
            private_keys = session.findObjects(private_key_template)

        if not private_keys:
            session.logout()
            session.closeSession()
            raise HSMError(
                f"Private key with label '{self._key_label}' not found on token."
            )

        self._private_key = private_keys[0]

        # Determine mechanism from key type
        key_type = self._pkcs11.getAttributeValue(session, self._private_key, [pkcs11h.Object.KEY_TYPE])[0]
        if key_type == pkcs11h.Object.KEY_TYPE_EC:
            self._mechanism = Mechanism.ECDSA_SHA256
        else:
            self._mechanism = Mechanism.SHA256_RSA_PKCS

        # Find the matching public key
        public_key_template = [
            (pkcs11h.Object.CLASS, pkcs11h.Object.PUBLIC_KEY),
            (pkcs11h.Object.LABEL, self._key_label),
        ]
        public_keys = session.findObjects(public_key_template)
        if public_keys:
            self._public_key = public_keys[0]

        # Compute key identifier from public key
        if self._public_key:
            pub_attrs = self._pkcs11.getAttributeValue(session, self._public_key, [
                pkcs11h.Object.MODULUS,
                pkcs11h.Object.PUBLIC_EXPONENT,
                pkcs11h.Object.EC_POINT,
            ])
            pub_material = b"".join(a for a in pub_attrs if a is not None)
            fingerprint = hashlib.sha256(pub_material).hexdigest()[:16]
            self._key_id = f"hsm:{fingerprint}"
        else:
            self._key_id = f"hsm:{self._key_label}"

        session.logout()
        session.closeSession()

    def _sign_hsm(self, data: bytes) -> Tuple[str, str]:
        """Sign using the HSM token."""
        self._ensure_hsm_session()

        import pkcs11h

        slot = self._pkcs11.getSlotList(tokenPresent=True)[0]
        session = self._pkcs11.openSession(slot, pkcs11h.Session.RW)
        session.login(self._pin)

        try:
            signature = self._pkcs11.sign(
                session, self._private_key, data, self._mechanism
            )
            sig_hex = signature.hex() if isinstance(signature, bytes) else signature
        finally:
            session.logout()
            session.closeSession()

        return sig_hex, self._key_id or "hsm:unknown"

    def _verify_hsm(self, data: bytes, signature_hex: str) -> bool:
        """Verify a signature using the HSM public key."""
        try:
            self._ensure_hsm_session()
            if self._public_key is None:
                log.warning("No HSM public key available for verification")
                return False

            import pkcs11h

            signature = bytes.fromhex(signature_hex)
            slot = self._pkcs11.getSlotList(tokenPresent=True)[0]
            session = self._pkcs11.openSession(slot, pkcs11h.Session.RO)

            try:
                result = self._pkcs11.verify(
                    session, self._public_key, data, signature, self._mechanism
                )
                return result is True
            finally:
                session.closeSession()
        except HSMError as exc:
            log.error("HSM verification failed: %s", exc)
            return False

    # ------------------------------------------------------------------
    # Software fallback (Ed25519)
    # ------------------------------------------------------------------

    def _ensure_software_key(self) -> None:
        """Generate a persistent software Ed25519 key pair (process-wide singleton).

        Always syncs class-level shared key to instance attributes so that
        any HSMDriver instance can sign and verify regardless of which
        instance first generated the key.
        """
        if HSMDriver._shared_software_signer is None:
            try:
                import nacl.signing
                import nacl.encoding
            except ImportError:
                raise HSMError(
                    "PyNaCl (nacl) is not installed for software signing fallback. "
                    "Install with: pip install pynacl"
                )

            # Generate a new key pair — shared across all HSMDriver instances
            sk_bytes = nacl.signing.SigningKey.generate()
            HSMDriver._shared_software_signer = sk_bytes
            HSMDriver._shared_verifier = sk_bytes.verify_key

            # Derive a stable key identifier
            pub_bytes = HSMDriver._shared_verifier.encode()
            fingerprint = hashlib.sha256(pub_bytes).hexdigest()[:16]
            HSMDriver._shared_software_key_id = f"sw:{fingerprint}"

        # Always sync class-level shared key to instance attributes
        self._software_signer = HSMDriver._shared_software_signer
        self._software_verifier = HSMDriver._shared_verifier
        self._software_key_id = HSMDriver._shared_software_key_id

    def _sign_software(self, data: bytes) -> Tuple[str, str]:
        """Sign using in-memory Ed25519 key."""
        self._ensure_software_key()

        import nacl.signing

        signature = self._software_signer.sign(data)
        sig_hex = signature.signature.hex()
        return sig_hex, self._software_key_id or "sw:unknown"

    def _verify_software(
        self, data: bytes, signature_hex: str, key_identifier: str
    ) -> bool:
        """Verify an Ed25519 signature."""
        try:
            self._ensure_software_key()

            # Only verify if the key identifier matches
            if key_identifier != self._software_key_id:
                log.warning(
                    "Software key ID mismatch: expected %s, got %s",
                    self._software_key_id,
                    key_identifier,
                )
                return False

            import nacl.signing

            signature = bytes.fromhex(signature_hex)
            self._software_verifier.verify(data, signature)
            return True
        except Exception as exc:
            log.error("Software signature verification failed: %s", exc)
            return False

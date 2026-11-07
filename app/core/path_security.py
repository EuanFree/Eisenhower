"""Centralized safe path resolution to prevent directory traversal attacks.

This module provides a single, auditable function for resolving file paths
derived from untrusted input (user-supplied filenames, query parameters,
uploaded file names, etc.).  Every call resolves the final absolute path
and verifies it remains within an expected base directory.

Usage
~~~~~

    from app.core.path_security import safe_resolve_path, PathTraversalAttackException
    from pathlib import Path

    base = Path("/var/app/uploads")
    try:
        safe = safe_resolve_path(base, user_supplied_filename)
        # safe is guaranteed to be under /var/app/uploads
    except PathTraversalAttackException:
        # Reject the request
        pass

Security Model
~~~~~~~~~~~~~~

The :func:`safe_resolve_path` function follows these steps:

1. **Join** — Concatenate ``base_dir`` and ``untrusted_filename`` using
   ``Path`` operations.
2. **Resolve** — Call ``.resolve()`` to canonicalise the path (resolve
   symlinks, remove ``.`` and ``..`` segments).
3. **Verify** — Check that the resolved path is still a child of
   ``base_dir.resolve()`` using ``Path.is_relative_to()``.
4. **Return or Reject** — Return the resolved path on success, or raise
   :class:`PathTraversalAttackException` on escape attempts.

Common Attack Patterns Blocked
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- ``../../etc/shadow`` — Classic parent-directory traversal.
- ``..\\..\\windows\\win.ini`` — Windows-style backslash traversal.
- ``./subdir/../../../escape`` — Mixed dot-segment traversal.
- Symlink-based escapes — ``resolve()`` follows symlinks before checking.

All file-handling services should route any user-influenced file path
through this function before performing file I/O.
"""

from pathlib import Path


class PathTraversalAttackException(Exception):
    """Exception raised when a path traversal attack is detected.

    This exception is triggered when :func:`safe_resolve_path` detects
    that a resolved file path escapes the allowed base directory.  It
    indicates a potential directory traversal attack attempt and should
    be treated as a security incident.

    Attributes
    ----------
    untrusted_filename : str
        The original untrusted filename that caused the escape attempt.
    base_dir : Path
        The base directory that the path was not allowed to leave.
    resolved_path : Path
        The fully resolved absolute path that escaped the base directory.

    Example
    -------

    .. code-block:: python

        try:
            safe = safe_resolve_path(Path("/uploads"), "../../etc/shadow")
        except PathTraversalAttackException as e:
            print(f"Blocked: {e}")
            # Blocked: Path escape attempt: ../../etc/shadow
    """

    def __init__(
        self,
        message: str,
        untrusted_filename: str = "",
        base_dir: Path = Path(),
        resolved_path: Path = Path(),
    ):
        """Initialise a path traversal attack exception.

        Parameters
        ----------
        message : str
            Human-readable description of the attack.
        untrusted_filename : str
            The original untrusted filename input.
        base_dir : Path
            The base directory boundary that was violated.
        resolved_path : Path
            The resolved path that escaped the boundary.
        """
        super().__init__(message)
        self.untrusted_filename = untrusted_filename
        self.base_dir = base_dir
        self.resolved_path = resolved_path


def safe_resolve_path(base_dir: Path, untrusted_filename: str) -> Path:
    """Safely resolve a user-supplied filename within a base directory.

    This function prevents directory traversal attacks by ensuring that
    the resolved path remains within the specified base directory.  It
    handles both Unix-style (``../``) and Windows-style (``..\\``)
    traversal attempts, as well as symlink-based escapes.

    Parameters
    ----------
    base_dir : Path
        The trusted base directory that the resolved path must remain
        within.  This should be an absolute path to a known-safe
        directory (e.g., ``/var/app/uploads``).
    untrusted_filename : str
        A filename or relative path derived from untrusted input
        (user request, query parameter, uploaded file name, etc.).

    Returns
    -------
    Path
        The resolved absolute path, guaranteed to be within ``base_dir``.

    Raises
    ------
    PathTraversalAttackException
        If the resolved path escapes ``base_dir``.  This indicates a
        directory traversal attack attempt.
    ValueError
        If ``untrusted_filename`` is empty.

    Examples
    --------

    Basic safe usage:

    .. code-block:: python

        base = Path("/var/app/uploads")
        result = safe_resolve_path(base, "report.pdf")
        # result == Path("/var/app/uploads/report.pdf")

    Traversal attempt (raises exception):

    .. code-block:: python

        base = Path("/var/app/uploads")
        safe_resolve_path(base, "../../etc/shadow")
        # Raises PathTraversalAttackException

    Subdirectory access (allowed):

    .. code-block:: python

        base = Path("/var/app/uploads")
        result = safe_resolve_path(base, "subdir/file.txt")
        # result == Path("/var/app/uploads/subdir/file.txt")
    """
    if not untrusted_filename or not untrusted_filename.strip():
        raise ValueError("Filename cannot be empty")

    # Resolve base directory to absolute path
    base_resolved = base_dir.resolve()

    # Join and resolve the untrusted filename
    resolved = (base_dir / untrusted_filename).resolve()

    # Verify the resolved path is still within the base directory
    try:
        if not resolved.is_relative_to(base_resolved):
            raise PathTraversalAttackException(
                f"Path escape attempt: {untrusted_filename}",
                untrusted_filename=untrusted_filename,
                base_dir=base_resolved,
                resolved_path=resolved,
            )
    except AttributeError:
        # Python < 3.9 compatibility: is_relative_to doesn't exist
        try:
            resolved.relative_to(base_resolved)
        except ValueError:
            raise PathTraversalAttackException(
                f"Path escape attempt: {untrusted_filename}",
                untrusted_filename=untrusted_filename,
                base_dir=base_resolved,
                resolved_path=resolved,
            )

    return resolved

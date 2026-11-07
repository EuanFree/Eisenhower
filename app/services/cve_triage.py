"""Air-gapped CVE Ingest & Match Service.

This module provides the vulnerability matching engine for air-gapped
environments.  It ingests NIST NVD offline JSON vulnerability feeds
dropped via the data diode spooler, parses CPE matching rules, and
compares installed software component versions against ingested CVE
definitions.

Workflow
--------

1. **Ingest** — ``ingest_offline_cve_feed()`` validates and unpacks NIST
   NVD offline JSON vulnerability feeds from the diode drop directory
   (``/var/spool/eisenhower/diode_drop/``).

2. **Parse CPE** — Extracts Common Platform Enumeration (CPE) matching
   rules from incoming CVE definitions.

3. **Match** — ``match_vulnerabilities_against_sbom()`` compares installed
   software component versions against ingested CVE definitions.

4. **Filter** — Dev-only dependencies are excluded; only production
   runtime components are evaluated.

5. **Report** — Returns a list of matched vulnerabilities with CVSS
   scores, affected libraries, and mitigation guidance.

Usage
~~~~~

.. code-block:: python

    from app.services.cve_triage import CVE_triage

    triage = CVE_triage()

    # Ingest an offline CVE feed
    feed = triage.ingest_offline_cve_feed("/var/spool/eisenhower/diode_drop/nvd-2024.json")

    # Match against SBOM components
    matches = triage.match_vulnerabilities_against_sbom(sbom_components)

    # Check for critical vulnerabilities
    if triage.has_critical_vulnerabilities(matches):
        print("ALERT: Critical vulnerabilities detected!")

"""
import hashlib
import json
import logging
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# Default diode drop directory
DEFAULT_DIODE_DROP_DIR = Path("/var/spool/eisenhower/diode_drop")

# SBOM output path
DEFAULT_SBOM_PATH = Path("dist/sbom/cyclonedx.json")

# CVSS severity thresholds
CVSS_CRITICAL_THRESHOLD = 9.0
CVSS_HIGH_THRESHOLD = 7.0
CVSS_MEDIUM_THRESHOLD = 4.0

# CPE URI pattern: cpe:2.3:a:<vendor>:<product>:<version>:...
CPE_PATTERN = re.compile(
    r"cpe:2\.3:a:([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*):([^:]*)"
)


@dataclass
class CPEMatch:
    """Parsed CPE (Common Platform Enumeration) match rule.

    Attributes
    ----------
    vendor : str
        Vendor name (e.g., ``python``, ``npm``, ``nginx``).
    product : str
        Product name (e.g., ``django``, ``express``, ``nginx``).
    version_start : str
        Inclusive minimum affected version.
    version_end : str
        Exclusive maximum affected version.
    version_end_inclusive : bool
        Whether ``version_end`` is inclusive.
    update : str
        Update field (often ``*`` for any).
    edition : str
        Edition field.
    language : str
        Language field.
    sw_edition : str
        Software edition field.
    target_sw : str
        Target software field.
    target_hw : str
        Target hardware field.
    """

    vendor: str
    product: str
    version_start: str = "*"
    version_end: str = "*"
    version_end_inclusive: bool = False
    update: str = "*"
    edition: str = "*"
    language: str = "*"
    sw_edition: str = "*"
    target_sw: str = "*"
    target_hw: str = "*"

    @property
    def product_key(self) -> str:
        """Return a normalised product identifier for matching.

        Returns
        -------
        str
            Lowercase vendor:product string.
        """
        return f"{self.vendor.lower()}:{self.product.lower()}"


@dataclass
class CVSSScore:
    """CVSS (Common Vulnerability Scoring System) score data.

    Attributes
    ----------
    version : str
        CVSS version (e.g., ``3.1``, ``4.0``).
    base_score : float
        Base CVSS score (0.0–10.0).
    vector_string : str
        CVSS vector string.
    severity : str
        Severity rating (``CRITICAL``, ``HIGH``, ``MEDIUM``, ``LOW``).
    """

    version: str
    base_score: float
    vector_string: str = ""
    severity: str = ""

    def __post_init__(self):
        """Derive severity from base score if not provided."""
        if not self.severity:
            self.severity = self._derive_severity()

    def _derive_severity(self) -> str:
        """Derive severity rating from base score.

        Returns
        -------
        str
            Severity string.
        """
        if self.base_score >= CVSS_CRITICAL_THRESHOLD:
            return "CRITICAL"
        elif self.base_score >= CVSS_HIGH_THRESHOLD:
            return "HIGH"
        elif self.base_score >= CVSS_MEDIUM_THRESHOLD:
            return "MEDIUM"
        else:
            return "LOW"


@dataclass
class CVEEntry:
    """A single CVE (Common Vulnerabilities and Exposures) entry.

    Attributes
    ----------
    cve_id : str
        CVE identifier (e.g., ``CVE-2024-12345``).
    description : str
        Human-readable description of the vulnerability.
    cpe_matches : list of CPEMatch
        Parsed CPE matching rules.
    cvss_scores : list of CVSSScore
        CVSS score data.
    references : list of str
        Reference URLs.
    published_date : str
        CVE publication date (ISO 8601).
    last_modified : str
        Last modification date (ISO 8601).
    weaknesses : list of str
        CWE identifiers (e.g., ``CWE-79``).
    mitigation : str
        Mitigation guidance text.
    """

    cve_id: str
    description: str = ""
    cpe_matches: List[CPEMatch] = field(default_factory=list)
    cvss_scores: List[CVSSScore] = field(default_factory=list)
    references: List[str] = field(default_factory=list)
    published_date: str = ""
    last_modified: str = ""
    weaknesses: List[str] = field(default_factory=list)
    mitigation: str = ""

    @property
    def max_cvss_score(self) -> float:
        """Return the maximum CVSS base score across all vectors.

        Returns
        -------
        float
            Maximum base score, or 0.0 if no scores.
        """
        if not self.cvss_scores:
            return 0.0
        return max(score.base_score for score in self.cvss_scores)

    @property
    def severity(self) -> str:
        """Return the highest severity rating.

        Returns
        -------
        str
            Severity string.
        """
        if self.max_cvss_score >= CVSS_CRITICAL_THRESHOLD:
            return "CRITICAL"
        elif self.max_cvss_score >= CVSS_HIGH_THRESHOLD:
            return "HIGH"
        elif self.max_cvss_score >= CVSS_MEDIUM_THRESHOLD:
            return "MEDIUM"
        return "LOW"


@dataclass
class VulnerabilityMatch:
    """A matched vulnerability against an SBOM component.

    Attributes
    ----------
    cve_id : str
        CVE identifier.
    component_name : str
        Name of the affected SBOM component.
    component_version : str
        Version of the affected component.
    component_type : str
        Component type (``library``, ``container``, etc.).
    cvss_score : float
        CVSS base score.
    severity : str
        Severity rating.
    description : str
        Vulnerability description.
    mitigation : str
        Mitigation guidance.
    is_dev_dependency : bool
        Whether the component is a dev-only dependency.
    cpe_match : str
        Matching CPE string.
    """

    cve_id: str
    component_name: str
    component_version: str
    component_type: str
    cvss_score: float
    severity: str
    description: str
    mitigation: str
    is_dev_dependency: bool = False
    cpe_match: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialisation.

        Returns
        -------
        dict
            Dictionary representation.
        """
        return asdict(self)


class CVETriageError(Exception):
    """Raised when CVE ingestion or matching fails."""

    def __init__(self, reason: str, feed_path: str = ""):
        self.reason = reason
        self.feed_path = feed_path
        super().__init__(f"CVE triage error: {reason}")


class CVETriage:
    """Air-gapped CVE Ingest & Match Service.

    Manages offline CVE feed ingestion, CPE parsing, and SBOM-based
    vulnerability matching for air-gapped environments.

    Parameters
    ----------
    diode_drop_dir : Path, optional
        Path to the diode drop directory. Defaults to
        ``/var/spool/eisenhower/diode_drop/``.
    sbom_path : Path, optional
        Path to the CycloneDX SBOM JSON file. Defaults to
        ``dist/sbom/cyclonedx.json``.
    """

    def __init__(
        self,
        diode_drop_dir: Path = DEFAULT_DIODE_DROP_DIR,
        sbom_path: Path = DEFAULT_SBOM_PATH,
    ):
        self.diode_drop_dir = diode_drop_dir
        self.sbom_path = sbom_path
        self._cve_entries: Dict[str, CVEEntry] = {}
        self._feed_hashes: Dict[str, str] = {}
        self._last_ingest_time: Optional[datetime] = None

    @property
    def cve_entries(self) -> Dict[str, CVEEntry]:
        """Return the ingested CVE entries.

        Returns
        -------
        dict of str to CVEEntry
            Mapping of CVE ID to CVEEntry.
        """
        return self._cve_entries

    @property
    def cve_count(self) -> int:
        """Return the number of ingested CVE entries.

        Returns
        -------
        int
            Number of CVE entries.
        """
        return len(self._cve_entries)

    def ingest_offline_cve_feed(self, feed_archive_path: Path) -> Dict[str, Any]:
        """Validate and unpack a NIST NVD offline JSON vulnerability feed.

        Reads a JSON feed archive dropped via the data diode spooler,
        parses CVE definitions, extracts CPE matching rules, and stores
        them for later matching.

        Parameters
        ----------
        feed_archive_path : Path
            Path to the NVD JSON feed archive file.

        Returns
        -------
        dict
            Ingestion summary with keys:
            ``total_cves``, ``new_cves``, ``updated_cves``, ``skipped_cves``,
            ``feed_hash``, ``ingest_time``.

        Raises
        ------
        CVETriageError
            If the feed file is not found, is not valid JSON, or has
            an unexpected structure.
        """
        feed_path = Path(feed_archive_path)
        if not feed_path.is_file():
            raise CVETriageError(
                f"Feed archive not found: {feed_path}",
                feed_path=str(feed_path),
            )

        # Compute feed hash for deduplication
        feed_hash = hashlib.sha256(feed_path.read_bytes()).hexdigest()

        # Check if we already ingested this exact feed
        stored_hash = self._feed_hashes.get(feed_path.name)
        if stored_hash == feed_hash:
            logger.info("Feed already ingested (hash match): %s", feed_path.name)
            return {
                "total_cves": 0,
                "new_cves": 0,
                "updated_cves": 0,
                "skipped_cves": self.cve_count,
                "feed_hash": feed_hash,
                "ingest_time": datetime.now(timezone.utc).isoformat(),
                "deduplicated": True,
            }

        # Parse JSON feed
        try:
            with open(feed_path, "r", encoding="utf-8") as f:
                feed_data = json.load(f)
        except json.JSONDecodeError as e:
            raise CVETriageError(
                f"Invalid JSON in feed archive: {e}",
                feed_path=str(feed_path),
            )

        # Support both NVD API 2.0 format and KEV-style flat arrays
        cve_list = self._extract_cve_list(feed_data)
        if not cve_list:
            logger.warning("No CVE entries found in feed: %s", feed_path.name)
            return {
                "total_cves": 0,
                "new_cves": 0,
                "updated_cves": 0,
                "skipped_cves": 0,
                "feed_hash": feed_hash,
                "ingest_time": datetime.now(timezone.utc).isoformat(),
            }

        new_count = 0
        updated_count = 0
        skipped_count = 0

        for cve_data in cve_list:
            try:
                entry = self._parse_cve_entry(cve_data)
                if entry is None:
                    skipped_count += 1
                    continue

                if entry.cve_id in self._cve_entries:
                    # Update existing entry
                    self._cve_entries[entry.cve_id] = entry
                    updated_count += 1
                else:
                    self._cve_entries[entry.cve_id] = entry
                    new_count += 1
            except Exception as e:
                logger.warning("Failed to parse CVE entry: %s", e)
                skipped_count += 1

        self._feed_hashes[feed_path.name] = feed_hash
        self._last_ingest_time = datetime.now(timezone.utc)

        summary = {
            "total_cves": len(cve_list),
            "new_cves": new_count,
            "updated_cves": updated_count,
            "skipped_cves": skipped_count,
            "feed_hash": feed_hash,
            "ingest_time": self._last_ingest_time.isoformat(),
        }

        logger.info(
            "CVE feed ingested: %d total, %d new, %d updated, %d skipped",
            len(cve_list), new_count, updated_count, skipped_count,
        )
        return summary

    def _extract_cve_list(self, feed_data: Any) -> List[Dict[str, Any]]:
        """Extract the CVE list from various NVD feed formats.

        Parameters
        ----------
        feed_data : any
            Parsed JSON data from the feed file.

        Returns
        -------
        list of dict
            List of CVE data dictionaries.
        """
        if isinstance(feed_data, list):
            return feed_data

        if isinstance(feed_data, dict):
            # NVD API 2.0 format
            if "vulnerabilities" in feed_data:
                return feed_data["vulnerabilities"]

            # KEV-style format
            if "cves" in feed_data:
                return feed_data["cves"]

            # Flat format with individual CVE keys
            cve_keys = [k for k in feed_data if k.startswith("cve") or k == "cveItems"]
            if cve_keys:
                key = cve_keys[0]
                value = feed_data[key]
                if isinstance(value, list):
                    return value

        return []

    def _parse_cve_entry(self, cve_data: Dict[str, Any]) -> Optional[CVEEntry]:
        """Parse a single CVE data dict into a CVEEntry.

        Parameters
        ----------
        cve_data : dict
            Raw CVE data dictionary.

        Returns
        -------
        CVEEntry or None
            Parsed CVE entry or None if unparseable.
        """
        # NVD API 2.0 wraps CVE in cveObjects
        cve_id = ""
        description = ""
        cpe_matches = []
        cvss_scores = []
        references = []
        published_date = ""
        last_modified = ""
        weaknesses = []
        mitigation = ""

        if "cve" in cve_data:
            cve_obj = cve_data["cve"]
            cve_id = cve_obj.get("id", "")
            published_date = cve_obj.get("published", "")
            last_modified = cve_obj.get("lastModified", "")

            # Descriptions
            for desc in cve_obj.get("descriptions", []):
                if desc.get("lang") == "en":
                    description = desc.get("value", "")
                    break

            # References
            for ref in cve_obj.get("references", []):
                url = ref.get("url", "")
                if url:
                    references.append(url)

            # Weaknesses
            for weak in cve_obj.get("weaknesses", []):
                for desc in weak.get("description", []):
                    id_val = desc.get("value", "")
                    if id_val:
                        weaknesses.append(id_val)

            # NVD API 2.0: configurations
            for config in cve_obj.get("configurations", []):
                nodes = config.get("nodes", [])
                for node in nodes:
                    criteria = node.get("matchCriteria", "")
                    if isinstance(criteria, str) and criteria:
                        cpe = self._parse_cpe(criteria)
                        if cpe:
                            cpe_matches.append(cpe)
                    elif isinstance(criteria, dict):
                        for match_id in criteria.get("matchCriteriaId", []):
                            cpe = self._parse_cpe(match_id)
                            if cpe:
                                cpe_matches.append(cpe)

            # Metrics
            metrics = cve_obj.get("metrics", {})
            for version_key, score_data in metrics.items():
                # Derive CVSS version from key (e.g., "cvssMetricV31" -> "3.1")
                cvss_version = version_key
                if version_key.startswith("cvssMetricV"):
                    try:
                        cvss_version = version_key.replace("cvssMetricV", "")
                    except Exception:
                        pass

                if isinstance(score_data, list):
                    for cvss_item in score_data:
                        if isinstance(cvss_item, dict):
                            cvss = self._parse_cvss(cvss_item, cvss_version)
                            if cvss:
                                cvss_scores.append(cvss)
                elif isinstance(score_data, dict):
                    for cvss_item in score_data.get("cvssMetric", []):
                        if isinstance(cvss_item, dict):
                            cvss = self._parse_cvss(cvss_item, version_key)
                            if cvss:
                                cvss_scores.append(cvss)

        else:
            # Flat format (e.g., synthetic test data)
            cve_id = cve_data.get("id", cve_data.get("cve_id", ""))
            description = cve_data.get("description", "")
            published_date = cve_data.get("published", cve_data.get("published_date", ""))
            last_modified = cve_data.get("lastModified", cve_data.get("last_modified", ""))
            references = cve_data.get("references", [])
            weaknesses = cve_data.get("weaknesses", [])
            mitigation = cve_data.get("mitigation", "")

            # Parse CPEs
            for cpe_str in cve_data.get("cpe_matches", cve_data.get("cpe", [])):
                cpe = self._parse_cpe(cpe_str)
                if cpe:
                    cpe_matches.append(cpe)

            # Parse CVSS
            for cvss_data in cve_data.get("cvss_scores", cve_data.get("metrics", [])):
                if isinstance(cvss_data, dict):
                    cvss = CVSSScore(
                        version=cvss_data.get("version", "3.1"),
                        base_score=float(cvss_data.get("base_score", cvss_data.get("score", 0))),
                        vector_string=cvss_data.get("vector_string", ""),
                        severity=cvss_data.get("severity", ""),
                    )
                    cvss_scores.append(cvss)
                elif isinstance(cvss_data, (int, float)):
                    cvss = CVSSScore(
                        version="3.1",
                        base_score=float(cvss_data),
                    )
                    cvss_scores.append(cvss)

        if not cve_id:
            return None

        return CVEEntry(
            cve_id=cve_id,
            description=description,
            cpe_matches=cpe_matches,
            cvss_scores=cvss_scores,
            references=references,
            published_date=published_date,
            last_modified=last_modified,
            weaknesses=weaknesses,
            mitigation=mitigation,
        )

    def _parse_cpe(self, cpe_str: str) -> Optional[CPEMatch]:
        """Parse a CPE 2.3 URI string into a CPEMatch.

        Parameters
        ----------
        cpe_str : str
            CPE URI string (e.g., ``cpe:2.3:a:django:django:4.2.0:*:*:*:*:*:*:*``).

        Returns
        -------
        CPEMatch or None
            Parsed CPE match or None if unparseable.
        """
        match = CPE_PATTERN.match(cpe_str)
        if not match:
            # Try partial CPE: cpe:/a:vendor:product:version
            parts = cpe_str.split(":")
            if len(parts) >= 4 and parts[0] == "cpe" and parts[1] in ("", "/"):
                return CPEMatch(
                    vendor=parts[2] if len(parts) > 2 else "*",
                    product=parts[3] if len(parts) > 3 else "*",
                    version_start=parts[4] if len(parts) > 4 else "*",
                )
            return None

        return CPEMatch(
            vendor=match.group(1) if match.group(1) != "*" else "*",
            product=match.group(2) if match.group(2) != "-" else "*",
            version_start=match.group(3) if match.group(3) not in ("*", "-") else "*",
            version_end=match.group(4) if match.group(4) not in ("*", "-") else "*",
            version_end_inclusive=match.group(5) == "inclusive",
            update=match.group(6) if match.group(6) != "*" else "*",
            edition=match.group(7) if match.group(7) != "*" else "*",
            language=match.group(8) if match.group(8) != "*" else "*",
            sw_edition=match.group(9) if match.group(9) != "*" else "*",
            target_hw=match.group(10) if match.group(10) != "*" else "*",
        )

    def _parse_cvss(self, cvss_item: Dict[str, Any], version: str) -> Optional[CVSSScore]:
        """Parse a CVSS metric item.

        Parameters
        ----------
        cvss_item : dict
            CVSS metric data.
        version : str
            CVSS version string.

        Returns
        -------
        CVSSScore or None
            Parsed CVSS score or None.
        """
        cvss_data = cvss_item.get("cvssData", {})
        base_score = cvss_data.get("baseMetricScore", 0)
        vector = cvss_data.get("vectorString", "")
        severity = cvss_data.get("severity", "")

        if base_score is None:
            return None

        return CVSSScore(
            version=version,
            base_score=float(base_score),
            vector_string=vector,
            severity=severity,
        )

    def match_vulnerabilities_against_sbom(
        self,
        sbom_components: Optional[List[Dict[str, Any]]] = None,
    ) -> List[VulnerabilityMatch]:
        """Compare installed software component versions against ingested CVE definitions.

        Filters out dev-only dependencies and identifies critical or high-severity
        vulnerabilities affecting active production runtime components.

        Parameters
        ----------
        sbom_components : list of dict, optional
            List of SBOM component dicts. If not provided, reads from the
            default SBOM path.

        Returns
        -------
        list of VulnerabilityMatch
            List of matched vulnerabilities.
        """
        if sbom_components is None:
            sbom_components = self._load_sbom_components()

        if not self._cve_entries:
            logger.warning("No CVE entries ingested; run ingest_offline_cve_feed() first")
            return []

        matches = []
        for component in sbom_components:
            # Skip dev-only dependencies
            if self._is_dev_component(component):
                continue

            comp_name = component.get("name", "")
            comp_version = component.get("version", "")
            comp_type = component.get("type", "library")

            if not comp_name or not comp_version:
                continue

            for cve_id, cve_entry in self._cve_entries.items():
                matched_cpe = self._match_component_against_cve(
                    comp_name, comp_version, comp_type, cve_entry
                )
                if matched_cpe:
                    match = VulnerabilityMatch(
                        cve_id=cve_id,
                        component_name=comp_name,
                        component_version=comp_version,
                        component_type=comp_type,
                        cvss_score=cve_entry.max_cvss_score,
                        severity=cve_entry.severity,
                        description=cve_entry.description,
                        mitigation=cve_entry.mitigation or self._generate_mitigation(cve_entry),
                        is_dev_dependency=False,
                        cpe_match=matched_cpe,
                    )
                    matches.append(match)

        logger.info(
            "Vulnerability matching complete: %d matches across %d components",
            len(matches), len(sbom_components),
        )
        return matches

    def _load_sbom_components(self) -> List[Dict[str, Any]]:
        """Load SBOM components from the default SBOM path.

        Returns
        -------
        list of dict
            List of component dicts.
        """
        if not self.sbom_path.is_file():
            logger.warning("SBOM file not found: %s", self.sbom_path)
            return []

        try:
            with open(self.sbom_path, "r", encoding="utf-8") as f:
                sbom_data = json.load(f)
            return sbom_data.get("components", [])
        except (json.JSONDecodeError, OSError) as e:
            logger.error("Failed to load SBOM: %s", e)
            return []

    def _is_dev_component(self, component: Dict[str, Any]) -> bool:
        """Check if a component is a dev-only dependency.

        Parameters
        ----------
        component : dict
            SBOM component dict.

        Returns
        -------
        bool
            True if the component is dev-only.
        """
        for prop in component.get("properties", []):
            if prop.get("name") == "devDependency" and prop.get("value", "").lower() == "true":
                return True
        return False

    def _match_component_against_cve(
        self,
        comp_name: str,
        comp_version: str,
        comp_type: str,
        cve_entry: CVEEntry,
    ) -> Optional[str]:
        """Check if a component matches any CPE rule in a CVE entry.

        Parameters
        ----------
        comp_name : str
            Component name.
        comp_version : str
            Component version.
        comp_type : str
            Component type.
        cve_entry : CVEEntry
            CVE entry to match against.

        Returns
        -------
        str or None
            Matching CPE string or None.
        """
        comp_name_lower = comp_name.lower().replace("-", "").replace("_", "")

        for cpe in cve_entry.cpe_matches:
            cpe_product_lower = cpe.product.lower().replace("-", "").replace("_", "")
            cpe_vendor_lower = cpe.vendor.lower().replace("-", "").replace("_", "")

            # Match product name
            name_match = (
                cpe_product_lower == "*"
                or cpe_product_lower == comp_name_lower
                or cpe_product_lower in comp_name_lower
                or comp_name_lower in cpe_product_lower
            )

            # Match vendor (for pypi, npm, docker)
            vendor_match = cpe_vendor_lower == "*" or self._vendor_matches(
                cpe_vendor_lower, comp_name, comp_type
            )

            if name_match and vendor_match:
                # Check version range
                if self._version_in_range(comp_version, cpe):
                    return f"cpe:2.3:a:{cpe.vendor}:{cpe.product}:{cpe.version_start}"
                # If name matches but version is out of range, do NOT fall through
                # to description matching — the CPE explicitly excludes this version
                return None

        return None

    def _vendor_matches(self, cpe_vendor: str, comp_name: str, comp_type: str) -> bool:
        """Check if a CPE vendor matches a component's ecosystem.

        Parameters
        ----------
        cpe_vendor : str
            CPE vendor string.
        comp_name : str
            Component name.
        comp_type : str
            Component type.

        Returns
        -------
        bool
            True if vendor matches.
        """
        if cpe_vendor == "*":
            return True

        vendor_map = {
            "pypi": "pypi",
            "python": "pypi",
            "npm": "npm",
            "node": "npm",
            "docker": "docker",
            "nginx": "nginx",
            "postgresql": "postgresql",
            "redis": "redis",
        }

        # Check if component purl indicates the vendor
        purl = ""
        # We don't have purl here, so check type
        if comp_type == "container":
            return cpe_vendor in ("docker", "nginx", "postgresql", "redis", "*")

        return True  # Default: allow match

    def _version_in_range(self, version: str, cpe: CPEMatch) -> bool:
        """Check if a version falls within a CPE version range.

        Parameters
        ----------
        version : str
            Component version string.
        cpe : CPEMatch
            CPE match with version range.

        Returns
        -------
        bool
            True if version is in range.
        """
        # Wildcard means any version
        if cpe.version_start == "*" and cpe.version_end == "*":
            return True

        # Exact version match
        if cpe.version_start != "*" and cpe.version_start == version:
            return True

        # Parse version tuples for range comparison
        try:
            ver_tuple = self._parse_version(version)
            start_tuple = self._parse_version(cpe.version_start) if cpe.version_start != "*" else (0, 0, 0)
            end_tuple = self._parse_version(cpe.version_end) if cpe.version_end != "*" else (999999, 999999, 999999)

            if ver_tuple >= start_tuple:
                if cpe.version_end_inclusive:
                    return ver_tuple <= end_tuple
                else:
                    return ver_tuple < end_tuple
        except (ValueError, TypeError):
            # If version parsing fails, do string comparison
            if cpe.version_start != "*":
                if version < cpe.version_start:
                    return False
            if cpe.version_end != "*":
                if cpe.version_end_inclusive:
                    if version > cpe.version_end:
                        return False
                else:
                    if version >= cpe.version_end:
                        return False

        return True

    def _parse_version(self, version: str) -> Tuple[int, ...]:
        """Parse a version string into a tuple of integers.

        Parameters
        ----------
        version : str
            Version string (e.g., ``1.2.3``).

        Returns
        -------
        tuple of int
            Version tuple.
        """
        parts = re.split(r"[.\-+]", version)
        tuples = []
        for part in parts:
            try:
                tuples.append(int(part))
            except ValueError:
                # Skip non-numeric parts (e.g., "rc1", "beta")
                pass
        return tuple(tuples) if tuples else (0,)

    def _generate_mitigation(self, cve_entry: CVEEntry) -> str:
        """Generate mitigation guidance for a CVE entry.

        Parameters
        ----------
        cve_entry : CVEEntry
            CVE entry.

        Returns
        -------
        str
            Mitigation guidance text.
        """
        parts = []
        if cve_entry.references:
            parts.append(f"References: {', '.join(cve_entry.references[:3])}")

        if cve_entry.weaknesses:
            parts.append(f"Weaknesses: {', '.join(cve_entry.weaknesses)}")

        # General mitigation advice based on severity
        if cve_entry.severity == "CRITICAL":
            parts.append(
                "ACTION REQUIRED: Immediately update the affected package to the latest "
                "patched version. Consider temporary network isolation if update is not "
                "immediately available."
            )
        elif cve_entry.severity == "HIGH":
            parts.append(
                "Update the affected package to the latest patched version at the earliest "
                "opportunity. Review application logs for signs of exploitation."
            )
        else:
            parts.append(
                "Plan to update the affected package in the next maintenance window."
            )

        return ". ".join(parts) if parts else "No specific mitigation guidance available."

    def has_critical_vulnerabilities(self, matches: List[VulnerabilityMatch]) -> bool:
        """Check if any matched vulnerability is critical (CVSS >= 9.0).

        Parameters
        ----------
        matches : list of VulnerabilityMatch
            List of vulnerability matches.

        Returns
        -------
        bool
            True if any critical vulnerability is present.
        """
        return any(m.cvss_score >= CVSS_CRITICAL_THRESHOLD for m in matches)

    def get_critical_matches(self, matches: List[VulnerabilityMatch]) -> List[VulnerabilityMatch]:
        """Filter matches to only critical vulnerabilities (CVSS >= 9.0).

        Parameters
        ----------
        matches : list of VulnerabilityMatch
            List of vulnerability matches.

        Returns
        -------
        list of VulnerabilityMatch
            Only critical matches.
        """
        return [m for m in matches if m.cvss_score >= CVSS_CRITICAL_THRESHOLD]

    def get_high_matches(self, matches: List[VulnerabilityMatch]) -> List[VulnerabilityMatch]:
        """Filter matches to only high-severity vulnerabilities (CVSS >= 7.0).

        Parameters
        ----------
        matches : list of VulnerabilityMatch
            List of vulnerability matches.

        Returns
        -------
        list of VulnerabilityMatch
            Only high-severity matches.
        """
        return [m for m in matches if m.cvss_score >= CVSS_HIGH_THRESHOLD]

    def get_vulnerability_summary(self, matches: List[VulnerabilityMatch]) -> Dict[str, Any]:
        """Generate a summary of vulnerability matches.

        Parameters
        ----------
        matches : list of VulnerabilityMatch
            List of vulnerability matches.

        Returns
        -------
        dict
            Summary with counts by severity and affected components.
        """
        critical = [m for m in matches if m.severity == "CRITICAL"]
        high = [m for m in matches if m.severity == "HIGH"]
        medium = [m for m in matches if m.severity == "MEDIUM"]
        low = [m for m in matches if m.severity == "LOW"]

        affected_components: Set[str] = set()
        for m in matches:
            affected_components.add(f"{m.component_name}@{m.component_version}")

        return {
            "total_matches": len(matches),
            "critical_count": len(critical),
            "high_count": len(high),
            "medium_count": len(medium),
            "low_count": len(low),
            "affected_components": sorted(affected_components),
            "has_critical": len(critical) > 0,
            "critical_cves": [m.cve_id for m in critical],
        }


# Module-level convenience instance
cve_triage = CVETriage()
"""Default CVE triage service instance.

Use this singleton for simple scripts.  For full control, create
a new ``CVETriage()`` instance with custom paths.
"""

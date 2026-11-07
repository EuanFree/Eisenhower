"""Comprehensive tests for the CVE triage service.

Validates offline CVE feed ingestion, CPE parsing, version matching,
SBOM component comparison, dev-dependency filtering, and severity
classification using synthetic CVE fixtures matched against known
SBOM package entries.
"""
import json
import tempfile
from pathlib import Path
from typing import Any, Dict, List

import pytest

from app.services.cve_triage import (
    CVETriage,
    CVETriageError,
    CPEMatch,
    CVSSScore,
    CVEEntry,
    VulnerabilityMatch,
    CVSS_CRITICAL_THRESHOLD,
    CVSS_HIGH_THRESHOLD,
    CVSS_MEDIUM_THRESHOLD,
)


# ============================================================================
# Synthetic CVE Fixtures
# ============================================================================


def _make_sbom_components() -> List[Dict[str, Any]]:
    """Create a set of synthetic SBOM components for testing.

    Returns
    -------
    list of dict
        SBOM component dicts with production and dev-only entries.
    """
    return [
        # Production Python packages
        {
            "type": "library",
            "name": "requests",
            "version": "2.31.0",
            "purl": "pkg:pypi/requests@2.31.0",
            "properties": [
                {"name": "SrcOrganization", "value": "pypi"},
                {"name": "devDependency", "value": "false"},
            ],
        },
        {
            "type": "library",
            "name": "urllib3",
            "version": "2.0.7",
            "purl": "pkg:pypi/urllib3@2.0.7",
            "properties": [
                {"name": "SrcOrganization", "value": "pypi"},
                {"name": "devDependency", "value": "false"},
            ],
        },
        {
            "type": "library",
            "name": "django",
            "version": "4.2.6",
            "purl": "pkg:pypi/django@4.2.6",
            "properties": [
                {"name": "SrcOrganization", "value": "pypi"},
                {"name": "devDependency", "value": "false"},
            ],
        },
        {
            "type": "library",
            "name": "flask",
            "version": "3.0.0",
            "purl": "pkg:pypi/flask@3.0.0",
            "properties": [
                {"name": "SrcOrganization", "value": "pypi"},
                {"name": "devDependency", "value": "false"},
            ],
        },
        # Dev-only package — should be filtered out
        {
            "type": "library",
            "name": "pytest",
            "version": "7.4.3",
            "purl": "pkg:pypi/pytest@7.4.3",
            "properties": [
                {"name": "SrcOrganization", "value": "pypi"},
                {"name": "devDependency", "value": "true"},
            ],
        },
        # NPM package
        {
            "type": "library",
            "name": "express",
            "version": "4.18.2",
            "purl": "pkg:npm/express@4.18.2",
            "properties": [
                {"name": "SrcOrganization", "value": "npm"},
                {"name": "devDependency", "value": "false"},
            ],
        },
        # Docker container
        {
            "type": "container",
            "name": "postgres",
            "version": "16-bookworm",
            "purl": "pkg:docker/postgres:16-bookworm",
            "properties": [
                {"name": "SrcOrganization", "value": "docker"},
                {"name": "service", "value": "postgres"},
            ],
        },
    ]


def _make_cve_feed_with_critical() -> List[Dict[str, Any]]:
    """Create a synthetic CVE feed with a critical vulnerability.

    Returns
    -------
    list of dict
        CVE feed data with one critical CVE matching ``requests``.
    """
    return [
        {
            "id": "CVE-2024-99001",
            "description": "Critical remote code execution in requests library allows "
                           "an attacker to execute arbitrary code via crafted URL.",
            "cpe_matches": [
                "cpe:2.3:a:python:requests:2.31.0:*:*:*:*:*:*:*"
            ],
            "cvss_scores": [
                {
                    "version": "3.1",
                    "base_score": 9.8,
                    "vector_string": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
                    "severity": "CRITICAL",
                }
            ],
            "references": [
                "https://nvd.nist.gov/vuln/detail/CVE-2024-99001",
                "https://github.com/psf/requests/security/advisories/GHSA-xxxx",
            ],
            "weaknesses": ["CWE-94"],
            "mitigation": "Upgrade requests to version 2.32.0 or later.",
            "published_date": "2024-06-15T00:00:00Z",
        },
        {
            "id": "CVE-2024-99002",
            "description": "High severity SQL injection in Django ORM allows "
                           "authenticated users to extract database contents.",
            "cpe_matches": [
                "cpe:2.3:a:djangoproject:django:4.2.0:4.2.7:inclusive:*:*:*:*:*"
            ],
            "cvss_scores": [
                {
                    "version": "3.1",
                    "base_score": 8.1,
                    "vector_string": "CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:H",
                    "severity": "HIGH",
                }
            ],
            "references": [
                "https://nvd.nist.gov/vuln/detail/CVE-2024-99002",
            ],
            "weaknesses": ["CWE-89"],
            "published_date": "2024-07-01T00:00:00Z",
        },
        {
            "id": "CVE-2024-99003",
            "description": "Medium severity XSS vulnerability in Express.js middleware.",
            "cpe_matches": [
                "cpe:2.3:a:expressjs:express:4.18.0:4.18.2:inclusive:*:*:*:*:*"
            ],
            "cvss_scores": [
                {
                    "version": "3.1",
                    "base_score": 5.4,
                    "vector_string": "CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:U/C:L/I:L/A:N",
                    "severity": "MEDIUM",
                }
            ],
            "references": [
                "https://nvd.nist.gov/vuln/detail/CVE-2024-99003",
            ],
            "weaknesses": ["CWE-79"],
            "published_date": "2024-08-01T00:00:00Z",
        },
        # This CVE should NOT match because pytest is a dev dependency
        {
            "id": "CVE-2024-99004",
            "description": "Critical vulnerability in pytest that should be filtered out.",
            "cpe_matches": [
                "cpe:2.3:a:python:pytest:7.4.0:*:*:*:*:*:*:*"
            ],
            "cvss_scores": [
                {
                    "version": "3.1",
                    "base_score": 9.1,
                    "vector_string": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
                    "severity": "CRITICAL",
                }
            ],
            "published_date": "2024-09-01T00:00:00Z",
        },
        # This CVE should NOT match because the version is outside the range
        {
            "id": "CVE-2024-99005",
            "description": "Vulnerability in urllib3 versions before 2.0.0.",
            "cpe_matches": [
                "cpe:2.3:a:urllib3:urllib3:1.0.0:2.0.0:*:*:*:*:*:*"
            ],
            "cvss_scores": [
                {
                    "version": "3.1",
                    "base_score": 7.5,
                    "vector_string": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/H/I:N/A:N",
                    "severity": "HIGH",
                }
            ],
            "published_date": "2024-05-01T00:00:00Z",
        },
    ]


def _make_cve_feed_nvd_format() -> Dict[str, Any]:
    """Create a synthetic CVE feed in NVD API 2.0 format.

    Returns
    -------
    dict
        NVD API 2.0 formatted feed data.
    """
    return {
        "resultsPerPage": 1,
        "startIndex": 0,
        "totalResults": 1,
        "format": "NVD_CVE",
        "version": "2.0",
        "vulnerabilities": [
            {
                "cve": {
                    "id": "CVE-2024-99010",
                    "published": "2024-10-01T00:00:00Z",
                    "lastModified": "2024-10-02T00:00:00Z",
                    "descriptions": [
                        {
                            "lang": "en",
                            "value": "NVD-format vulnerability in Flask allowing SSRF.",
                        }
                    ],
                    "references": [
                        {"url": "https://nvd.nist.gov/vuln/detail/CVE-2024-99010"}
                    ],
                    "weaknesses": [
                        {
                            "description": [
                                {"lang": "en", "value": "CWE-918"}
                            ]
                        }
                    ],
                    "configurations": [
                        {
                            "nodes": [
                                {
                                    "matchCriteria": "cpe:2.3:a:pallets:flask:3.0.0:*:*:*:*:*:*:*"
                                }
                            ]
                        }
                    ],
                    "metrics": {
                        "cvssMetricV31": [
                            {
                                "cvssData": {
                                    "version": "3.1",
                                    "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N",
                                    "baseMetricScore": 7.5,
                                    "baseSeverity": "HIGH",
                                }
                            }
                        ]
                    },
                }
            }
        ],
    }


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def triage():
    """Create a fresh CVETriage instance for each test."""
    return CVETriage()


@pytest.fixture
def sbom_components():
    """Return synthetic SBOM components."""
    return _make_sbom_components()


@pytest.fixture
def cve_feed_file(tmp_path: Path) -> Path:
    """Write a synthetic CVE feed to a temp file.

    Parameters
    ----------
    tmp_path : Path
        pytest temporary directory.

    Returns
    -------
    Path
        Path to the written CVE feed JSON file.
    """
    feed_data = _make_cve_feed_with_critical()
    feed_path = tmp_path / "nvd-synthetic.json"
    feed_path.write_text(json.dumps(feed_data))
    return feed_path


@pytest.fixture
def cve_feed_nvd_file(tmp_path: Path) -> Path:
    """Write an NVD-format CVE feed to a temp file.

    Parameters
    ----------
    tmp_path : Path
        pytest temporary directory.

    Returns
    -------
    Path
        Path to the written CVE feed JSON file.
    """
    feed_data = _make_cve_feed_nvd_format()
    feed_path = tmp_path / "nvd-api-2.0.json"
    feed_path.write_text(json.dumps(feed_data))
    return feed_path


# ============================================================================
# Tests: CVE Feed Ingestion
# ============================================================================


class TestIngestOfflineCVEFeed:
    """Tests for CVE feed ingestion."""

    def test_ingest_flat_format(self, triage: CVETriage, cve_feed_file: Path):
        """Verify ingestion of flat-format CVE feed."""
        result = triage.ingest_offline_cve_feed(cve_feed_file)

        assert result["total_cves"] == 5
        assert result["new_cves"] == 5
        assert result["updated_cves"] == 0
        assert result["skipped_cves"] == 0
        assert triage.cve_count == 5
        assert "CVE-2024-99001" in triage.cve_entries

    def test_ingest_nvd_format(self, triage: CVETriage, cve_feed_nvd_file: Path):
        """Verify ingestion of NVD API 2.0 format CVE feed."""
        result = triage.ingest_offline_cve_feed(cve_feed_nvd_file)

        assert result["total_cves"] == 1
        assert result["new_cves"] == 1
        assert triage.cve_count == 1
        assert "CVE-2024-99010" in triage.cve_entries

        # Verify parsed fields
        entry = triage.cve_entries["CVE-2024-99010"]
        assert entry.description == "NVD-format vulnerability in Flask allowing SSRF."
        assert len(entry.cvss_scores) == 1
        assert entry.cvss_scores[0].base_score == 7.5
        assert len(entry.cpe_matches) == 1

    def test_ingest_nonexistent_file(self, triage: CVETriage):
        """Verify CVETriageError is raised for missing feed file."""
        with pytest.raises(CVETriageError, match="Feed archive not found"):
            triage.ingest_offline_cve_feed(Path("/nonexistent/feed.json"))

    def test_ingest_invalid_json(self, triage: CVETriage, tmp_path: Path):
        """Verify CVETriageError is raised for invalid JSON."""
        bad_file = tmp_path / "bad.json"
        bad_file.write_text("{invalid json}")

        with pytest.raises(CVETriageError, match="Invalid JSON"):
            triage.ingest_offline_cve_feed(bad_file)

    def test_ingest_deduplication(self, triage: CVETriage, cve_feed_file: Path):
        """Verify that re-ingesting the same feed is deduplicated."""
        triage.ingest_offline_cve_feed(cve_feed_file)
        result = triage.ingest_offline_cve_feed(cve_feed_file)

        assert result["deduplicated"] is True
        assert result["new_cves"] == 0
        assert triage.cve_count == 5  # Still 5, not 10

    def test_ingest_empty_feed(self, triage: CVETriage, tmp_path: Path):
        """Verify ingestion of an empty feed."""
        empty_file = tmp_path / "empty.json"
        empty_file.write_text("[]")

        result = triage.ingest_offline_cve_feed(empty_file)
        assert result["total_cves"] == 0
        assert triage.cve_count == 0


# ============================================================================
# Tests: CPE Parsing
# ============================================================================


class TestCPEParsing:
    """Tests for CPE URI parsing."""

    def test_parse_full_cpe(self, triage: CVETriage):
        """Verify parsing of a full CPE 2.3 URI."""
        cpe_str = "cpe:2.3:a:python:requests:2.31.0:*:*:*:*:*:*:*"
        cpe = triage._parse_cpe(cpe_str)

        assert cpe is not None
        assert cpe.vendor == "python"
        assert cpe.product == "requests"
        assert cpe.version_start == "2.31.0"
        assert cpe.version_end == "*"

    def test_parse_cpe_with_version_range(self, triage: CVETriage):
        """Verify parsing of CPE with version range."""
        cpe_str = "cpe:2.3:a:djangoproject:django:4.2.0:4.2.7:inclusive:*:*:*:*:*"
        cpe = triage._parse_cpe(cpe_str)

        assert cpe is not None
        assert cpe.product == "django"
        assert cpe.version_start == "4.2.0"
        assert cpe.version_end == "4.2.7"
        assert cpe.version_end_inclusive is True

    def test_parse_invalid_cpe(self, triage: CVETriage):
        """Verify that invalid CPE strings return None."""
        cpe = triage._parse_cpe("not-a-cpe-string")
        assert cpe is None

    def test_cpe_product_key(self):
        """Verify CPEMatch.product_key normalisation."""
        cpe = CPEMatch(vendor="Python", product="Requests")
        assert cpe.product_key == "python:requests"


# ============================================================================
# Tests: CVSS Scoring
# ============================================================================


class TestCVSSScoring:
    """Tests for CVSS score handling."""

    def test_critical_severity(self):
        """Verify CVSS 9.8 is classified as CRITICAL."""
        score = CVSSScore(version="3.1", base_score=9.8)
        assert score.severity == "CRITICAL"

    def test_high_severity(self):
        """Verify CVSS 8.1 is classified as HIGH."""
        score = CVSSScore(version="3.1", base_score=8.1)
        assert score.severity == "HIGH"

    def test_medium_severity(self):
        """Verify CVSS 5.4 is classified as MEDIUM."""
        score = CVSSScore(version="3.1", base_score=5.4)
        assert score.severity == "MEDIUM"

    def test_low_severity(self):
        """Verify CVSS 3.1 is classified as LOW."""
        score = CVSSScore(version="3.1", base_score=3.1)
        assert score.severity == "LOW"

    def test_severity_from_explicit_field(self):
        """Verify explicit severity field is preserved."""
        score = CVSSScore(version="3.1", base_score=5.0, severity="HIGH")
        assert score.severity == "HIGH"

    def test_cve_entry_max_score(self):
        """Verify CVEEntry returns the maximum CVSS score."""
        entry = CVEEntry(
            cve_id="CVE-TEST-001",
            cvss_scores=[
                CVSSScore(version="3.1", base_score=5.0),
                CVSSScore(version="4.0", base_score=9.5),
            ],
        )
        assert entry.max_cvss_score == 9.5
        assert entry.severity == "CRITICAL"


# ============================================================================
# Tests: Version Matching
# ============================================================================


class TestVersionMatching:
    """Tests for version range matching."""

    def test_version_in_range_exact(self, triage: CVETriage):
        """Verify exact version match."""
        cpe = CPEMatch(vendor="python", product="requests", version_start="2.31.0")
        assert triage._version_in_range("2.31.0", cpe) is True

    def test_version_in_range_wildcard(self, triage: CVETriage):
        """Verify wildcard version matches any."""
        cpe = CPEMatch(vendor="python", product="requests", version_start="*", version_end="*")
        assert triage._version_in_range("1.0.0", cpe) is True
        assert triage._version_in_range("99.0.0", cpe) is True

    def test_version_in_range_inclusive(self, triage: CVETriage):
        """Verify inclusive version range."""
        cpe = CPEMatch(
            vendor="django",
            product="django",
            version_start="4.2.0",
            version_end="4.2.7",
            version_end_inclusive=True,
        )
        assert triage._version_in_range("4.2.0", cpe) is True
        assert triage._version_in_range("4.2.3", cpe) is True
        assert triage._version_in_range("4.2.7", cpe) is True
        assert triage._version_in_range("4.2.8", cpe) is False

    def test_version_out_of_range(self, triage: CVETriage):
        """Verify version outside range does not match."""
        cpe = CPEMatch(
            vendor="urllib3",
            product="urllib3",
            version_start="1.0.0",
            version_end="2.0.0",
            version_end_inclusive=False,
        )
        assert triage._version_in_range("2.0.7", cpe) is False
        assert triage._version_in_range("1.5.0", cpe) is True

    def test_parse_version(self, triage: CVETriage):
        """Verify version string parsing."""
        assert triage._parse_version("1.2.3") == (1, 2, 3)
        assert triage._parse_version("2.0") == (2, 0)
        assert triage._parse_version("1.0.0-rc1") == (1, 0, 0)


# ============================================================================
# Tests: Vulnerability Matching Against SBOM
# ============================================================================


class TestMatchVulnerabilitiesAgainstSBOM:
    """Tests for CVE-to-SBOM vulnerability matching."""

    def test_match_critical_vulnerability(
        self, triage: CVETriage, cve_feed_file: Path, sbom_components: List[Dict[str, Any]]
    ):
        """Verify critical CVE is matched against the correct SBOM component."""
        triage.ingest_offline_cve_feed(cve_feed_file)
        matches = triage.match_vulnerabilities_against_sbom(sbom_components)

        # CVE-2024-99001 should match requests@2.31.0
        critical_matches = [m for m in matches if m.cve_id == "CVE-2024-99001"]
        assert len(critical_matches) >= 1
        match = critical_matches[0]
        assert match.component_name == "requests"
        assert match.component_version == "2.31.0"
        assert match.cvss_score == 9.8
        assert match.severity == "CRITICAL"

    def test_match_high_vulnerability(
        self, triage: CVETriage, cve_feed_file: Path, sbom_components: List[Dict[str, Any]]
    ):
        """Verify HIGH CVE is matched against Django."""
        triage.ingest_offline_cve_feed(cve_feed_file)
        matches = triage.match_vulnerabilities_against_sbom(sbom_components)

        high_matches = [m for m in matches if m.cve_id == "CVE-2024-99002"]
        assert len(high_matches) >= 1
        match = high_matches[0]
        assert match.component_name == "django"
        assert match.severity == "HIGH"

    def test_match_medium_vulnerability(
        self, triage: CVETriage, cve_feed_file: Path, sbom_components: List[Dict[str, Any]]
    ):
        """Verify MEDIUM CVE is matched against Express."""
        triage.ingest_offline_cve_feed(cve_feed_file)
        matches = triage.match_vulnerabilities_against_sbom(sbom_components)

        medium_matches = [m for m in matches if m.cve_id == "CVE-2024-99003"]
        assert len(medium_matches) >= 1
        match = medium_matches[0]
        assert match.component_name == "express"
        assert match.severity == "MEDIUM"

    def test_dev_dependency_filtered(
        self, triage: CVETriage, cve_feed_file: Path, sbom_components: List[Dict[str, Any]]
    ):
        """Verify dev-only dependencies are excluded from matching."""
        triage.ingest_offline_cve_feed(cve_feed_file)
        matches = triage.match_vulnerabilities_against_sbom(sbom_components)

        # CVE-2024-99004 targets pytest, which is a dev dependency
        pytest_matches = [m for m in matches if m.cve_id == "CVE-2024-99004"]
        assert len(pytest_matches) == 0

    def test_version_outside_range_not_matched(
        self, triage: CVETriage, cve_feed_file: Path, sbom_components: List[Dict[str, Any]]
    ):
        """Verify CVE with version outside range is not matched."""
        triage.ingest_offline_cve_feed(cve_feed_file)
        matches = triage.match_vulnerabilities_against_sbom(sbom_components)

        # CVE-2024-99005 targets urllib3 < 2.0.0, but we have 2.0.7
        urllib3_matches = [m for m in matches if m.cve_id == "CVE-2024-99005"]
        assert len(urllib3_matches) == 0

    def test_no_cve_entries_returns_empty(
        self, triage: CVETriage, sbom_components: List[Dict[str, Any]]
    ):
        """Verify empty result when no CVEs are ingested."""
        matches = triage.match_vulnerabilities_against_sbom(sbom_components)
        assert matches == []

    def test_empty_sbom_returns_empty(
        self, triage: CVETriage, cve_feed_file: Path
    ):
        """Verify empty result when SBOM has no components."""
        triage.ingest_offline_cve_feed(cve_feed_file)
        matches = triage.match_vulnerabilities_against_sbom([])
        assert matches == []

    def test_nvd_format_matching(
        self, triage: CVETriage, cve_feed_nvd_file: Path, sbom_components: List[Dict[str, Any]]
    ):
        """Verify NVD-format CVE is matched against Flask."""
        triage.ingest_offline_cve_feed(cve_feed_nvd_file)
        matches = triage.match_vulnerabilities_against_sbom(sbom_components)

        flask_matches = [m for m in matches if m.cve_id == "CVE-2024-99010"]
        assert len(flask_matches) >= 1
        match = flask_matches[0]
        assert match.component_name == "flask"
        assert match.component_version == "3.0.0"
        assert match.cvss_score == 7.5


# ============================================================================
# Tests: Critical Vulnerability Detection
# ============================================================================


class TestCriticalVulnerabilityDetection:
    """Tests for critical vulnerability detection and alerting."""

    def test_has_critical_vulnerabilities(
        self, triage: CVETriage, cve_feed_file: Path, sbom_components: List[Dict[str, Any]]
    ):
        """Verify critical vulnerability detection."""
        triage.ingest_offline_cve_feed(cve_feed_file)
        matches = triage.match_vulnerabilities_against_sbom(sbom_components)

        assert triage.has_critical_vulnerabilities(matches) is True

    def test_get_critical_matches(
        self, triage: CVETriage, cve_feed_file: Path, sbom_components: List[Dict[str, Any]]
    ):
        """Verify critical match filtering."""
        triage.ingest_offline_cve_feed(cve_feed_file)
        matches = triage.match_vulnerabilities_against_sbom(sbom_components)

        critical = triage.get_critical_matches(matches)
        assert len(critical) >= 1
        for m in critical:
            assert m.cvss_score >= CVSS_CRITICAL_THRESHOLD

    def test_get_high_matches(
        self, triage: CVETriage, cve_feed_file: Path, sbom_components: List[Dict[str, Any]]
    ):
        """Verify high-severity match filtering."""
        triage.ingest_offline_cve_feed(cve_feed_file)
        matches = triage.match_vulnerabilities_against_sbom(sbom_components)

        high = triage.get_high_matches(matches)
        for m in high:
            assert m.cvss_score >= CVSS_HIGH_THRESHOLD

    def test_no_critical_vulnerabilities(self, triage: CVETriage):
        """Verify no critical alert when there are no matches."""
        assert triage.has_critical_vulnerabilities([]) is False

    def test_vulnerability_summary(
        self, triage: CVETriage, cve_feed_file: Path, sbom_components: List[Dict[str, Any]]
    ):
        """Verify vulnerability summary statistics."""
        triage.ingest_offline_cve_feed(cve_feed_file)
        matches = triage.match_vulnerabilities_against_sbom(sbom_components)

        summary = triage.get_vulnerability_summary(matches)

        assert summary["total_matches"] >= 3
        assert summary["critical_count"] >= 1
        assert summary["high_count"] >= 1
        assert summary["medium_count"] >= 1
        assert summary["has_critical"] is True
        assert "CVE-2024-99001" in summary["critical_cves"]
        assert len(summary["affected_components"]) >= 3


# ============================================================================
# Tests: VulnerabilityMatch Data Model
# ============================================================================


class TestVulnerabilityMatchModel:
    """Tests for the VulnerabilityMatch data model."""

    def test_to_dict(self):
        """Verify VulnerabilityMatch serialises to dict."""
        match = VulnerabilityMatch(
            cve_id="CVE-2024-00001",
            component_name="testlib",
            component_version="1.0.0",
            component_type="library",
            cvss_score=9.8,
            severity="CRITICAL",
            description="Test vulnerability",
            mitigation="Update to 1.0.1",
            cpe_match="cpe:2.3:a:test:testlib:1.0.0",
        )

        d = match.to_dict()
        assert d["cve_id"] == "CVE-2024-00001"
        assert d["component_name"] == "testlib"
        assert d["cvss_score"] == 9.8
        assert d["severity"] == "CRITICAL"
        assert d["is_dev_dependency"] is False


# ============================================================================
# Tests: Mitigation Guidance
# ============================================================================


class TestMitigationGuidance:
    """Tests for mitigation guidance generation."""

    def test_critical_mitigation(self, triage: CVETriage):
        """Verify critical severity generates urgent mitigation."""
        entry = CVEEntry(
            cve_id="CVE-TEST-001",
            description="Critical RCE",
            cvss_scores=[CVSSScore(version="3.1", base_score=9.8)],
            weaknesses=["CWE-94"],
            references=["https://example.com/advisory"],
        )
        mitigation = triage._generate_mitigation(entry)
        assert "ACTION REQUIRED" in mitigation
        assert "CWE-94" in mitigation

    def test_high_mitigation(self, triage: CVETriage):
        """Verify high severity generates standard mitigation."""
        entry = CVEEntry(
            cve_id="CVE-TEST-002",
            description="High severity SQLi",
            cvss_scores=[CVSSScore(version="3.1", base_score=8.1)],
        )
        mitigation = triage._generate_mitigation(entry)
        assert "Update the affected package" in mitigation

    def test_medium_mitigation(self, triage: CVETriage):
        """Verify medium severity generates maintenance-window mitigation."""
        entry = CVEEntry(
            cve_id="CVE-TEST-003",
            description="Medium XSS",
            cvss_scores=[CVSSScore(version="3.1", base_score=5.4)],
        )
        mitigation = triage._generate_mitigation(entry)
        assert "maintenance window" in mitigation

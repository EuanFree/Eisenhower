"""Tests for the automatic user documentation generator.

Verifies that the generation script correctly discovers routers,
categorises features, and produces valid RST output.
"""
import os
import sys
from pathlib import Path

# Ensure project root is on the path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import scripts.generate_user_docs as gen


def test_discover_routers_finds_modules():
    """The router discovery should find multiple routers."""
    routers = gen.discover_routers()
    assert len(routers) > 0, "Expected to discover at least one router"
    # Each router should have required keys
    for router in routers:
        assert "tag" in router
        assert "prefix" in router
        assert "module_doc" in router
        assert "endpoints" in router


def test_discover_routers_has_endpoints():
    """At least some routers should have endpoints."""
    routers = gen.discover_routers()
    routers_with_endpoints = [r for r in routers if r["endpoints"]]
    assert len(routers_with_endpoints) > 0, "Expected routers with endpoints"


def test_classify_tag_known():
    """Known tag prefixes should map to feature categories."""
    assert gen._classify_tag("Cockpit - Daily Landing Page") == "Cockpit"
    assert gen._classify_tag("Schedule") == "Schedule"
    assert gen._classify_tag("Authentication") == "Authentication"
    assert gen._classify_tag("WBS") == "WBS"


def test_classify_tag_unknown():
    """Unknown tags should map to 'Other'."""
    assert gen._classify_tag("TotallyUnknownFeature") == "Other"


def test_generate_index_contains_sections():
    """The generated index should contain key sections."""
    routers = gen.discover_routers()
    index = gen.generate_index(routers)

    assert "User Guide" in index
    assert "Getting Started" in index or "getting-started" in index
    assert "Features" in index
    assert "Reference" in index
    assert "roles" in index
    assert "glossary" in index


def test_generate_getting_started():
    """Getting started guide should contain key sections."""
    gs = gen.generate_getting_started()

    assert "Logging In" in gs
    assert "Understanding Your Role" in gs
    assert "Daily Cockpit" in gs
    assert "Navigating the System" in gs
    assert "Security Classifications" in gs


def test_generate_feature_docs():
    """Feature docs should be generated for discovered routers."""
    routers = gen.discover_routers()
    features = gen.generate_feature_docs(routers)

    assert len(features) > 0, "Expected at least one feature file"

    # Each feature file should have valid RST structure
    for filename, content in features.items():
        assert filename.endswith(".rst"), f"Expected .rst extension: {filename}"
        assert len(content) > 0, f"Empty content for {filename}"
        # Should have a title (first line followed by underline)
        lines = content.strip().split("\n")
        assert len(lines) >= 2, f"Too few lines in {filename}"


def test_generate_roles():
    """Roles reference should contain all defined roles."""
    roles = gen.generate_roles()

    for role_name in gen.ROLES:
        assert role_name in roles, f"Missing role: {role_name}"


def test_generate_glossary():
    """Glossary should contain all defined terms."""
    glossary = gen.generate_glossary()

    for term in gen.GLOSSARY_TERMS:
        assert term in glossary, f"Missing glossary term: {term}"


def test_translate_endpoint_to_user_language():
    """Endpoint translation should produce user-friendly descriptions."""
    result = gen._translate_endpoint_to_user_language(
        "GET", "/tasks", "List all tasks", ""
    )
    assert "View" in result
    assert "List all tasks" in result

    result = gen._translate_endpoint_to_user_language(
        "POST", "/tasks", "Create a new task", ""
    )
    assert "Create" in result


def test_ast_fallback_parses_router():
    """AST fallback should parse a router file without importing it."""
    # Find a real router file
    routers_dir = PROJECT_ROOT / "app" / "routers"
    router_files = list(routers_dir.glob("*.py"))
    router_files = [f for f in router_files if not f.name.startswith("_")]

    assert len(router_files) > 0, "No router files found"

    # Test AST parsing on the first router file
    info = gen._extract_router_info_ast(str(router_files[0]))
    assert len(info) > 0, "AST parsing should return at least one router"
    assert "tag" in info[0]
    assert "endpoints" in info[0]


def test_no_duplicate_features_in_index():
    """The index should not list the same feature twice."""
    routers = gen.discover_routers()
    index = gen.generate_index(routers)

    # Check that no feature doc link appears more than once
    import re
    doc_links = re.findall(r":doc:`features/([^`]+)`", index)
    duplicates = [d for d in doc_links if doc_links.count(d) > 1]
    assert not duplicates, f"Duplicate feature links in index: {duplicates}"


def test_output_files_writable():
    """Generated files should be writable to the output directory."""
    routers = gen.discover_routers()

    # Generate all content
    index = gen.generate_index(routers)
    gs = gen.generate_getting_started()
    features = gen.generate_feature_docs(routers)
    roles = gen.generate_roles()
    glossary = gen.generate_glossary()

    # All content should be non-empty strings
    assert isinstance(index, str) and len(index) > 0
    assert isinstance(gs, str) and len(gs) > 0
    assert isinstance(roles, str) and len(roles) > 0
    assert isinstance(glossary, str) and len(glossary) > 0
    assert isinstance(features, dict) and len(features) > 0

"""Sphinx configuration file for the Eisenhower Portfolio Manager API.

This file configures Sphinx to generate comprehensive API documentation
from the Python source code.  It is designed to produce documentation
that is readable by both technical developers and non-technical reviewers,
such as project managers, security auditors, and defence programme stakeholders.

The documentation covers:
- The overall system architecture and data model
- All API endpoints and their security requirements
- The Critical Path Method (CPM) scheduling engine
- Attribute-Based Access Control (ABAC) for classified data
- The forensic audit logging system
- Display settings persistence for SCIF environments
"""
import os
import sys
from datetime import datetime

# ---------------------------------------------------------------------------
# Path setup: ensure the 'app' package is importable during documentation
# generation so that Sphinx can introspect the code.
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.abspath('..'))

# ---------------------------------------------------------------------------
# General information
# ---------------------------------------------------------------------------
project = 'Eisenhower Portfolio Manager'
copyright = f'{datetime.now().year}, Defence Programme Management'
author = 'Eisenhower Development Team'

# The short X.Y version
version = '1.0'
# The full version, including alpha/beta/rc tags
release = '1.0.0'

# ---------------------------------------------------------------------------
# General configuration
# ---------------------------------------------------------------------------
extensions = [
    'sphinx.ext.autodoc',       # Automatically document docstrings
    'sphinx.ext.napoleon',      # Support for Google/NumPy-style docstrings
    'sphinx.ext.viewcode',      # Add links to highlighted source code
    'sphinx.ext.intersphinx',   # Link to other projects' documentation
    'sphinx.ext.ifconfig',      # Conditional content for user/dev docs
]

# Napoleon settings — allow Google-style docstrings (used throughout the codebase)
napoleon_google_docstring = True
napoleon_numpy_docstring = False
napoleon_include_init_with_doc = True
napoleon_include_private_with_doc = False
napoleon_include_special_with_doc = True
napoleon_use_admonition_for_examples = True
napoleon_use_admonition_for_notes = True
napoleon_use_admonition_for_references = False
napoleon_use_ivar = True
napoleon_use_param = True
napoleon_use_rtype = True
napoleon_preprocess_types = False
napoleon_type_aliases = None
napoleon_attr_annotations = True

# Autodoc settings — control how Sphinx extracts documentation
autodoc_default_options = {
    'members': True,
    'member-order': 'bysource',
    'special-members': '__init__',
}
autodoc_mock_imports = [
    # Packages not installed in the current environment
    'python_pptx',
    'aiofiles',
    'alembic',
    'gunicorn',
    # Installed but incompatible with Sphinx autodoc / Pydantic version
    'mcp',
]

# ---------------------------------------------------------------------------
# Intersphinx: link to external Python documentation
# ---------------------------------------------------------------------------
intersphinx_mapping = {
    'python': ('https://docs.python.org/3', None),
    'fastapi': ('https://fastapi.tiangolo.com/', None),
    'sqlalchemy': ('https://docs.sqlalchemy.org/en/20/', None),
    'pydantic': ('https://docs.pydantic.dev/latest/', None),
}

# ---------------------------------------------------------------------------
# HTML output configuration
# ---------------------------------------------------------------------------
html_theme = 'sphinx_rtd_theme'
html_title = 'Eisenhower Portfolio Manager — API Documentation'
html_short_title = 'Eisenhower API Docs'

html_theme_options = {
    'style_nav_header_background': '#2c3e50',
}

# Display version in the sidebar (sphinx-rtd-theme >= 3.0 handles this automatically)
html_display_version = True

html_sidebars = {
    '**': [
        'about.html',
        'navigation.html',
        'relations.html',
        'searchbox.html',
    ]
}

# ---------------------------------------------------------------------------
# Source file configuration
# ---------------------------------------------------------------------------
source_suffix = {
    '.rst': 'restructuredtext',
}

master_doc = 'index'
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store', '*.md']

# ---------------------------------------------------------------------------
# Type hints configuration
# ---------------------------------------------------------------------------
autodoc_typehints = 'description'
autodoc_typehints_format = 'short'

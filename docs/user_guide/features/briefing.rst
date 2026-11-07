Executive Briefings
===================


Create PowerPoint briefing decks for executive reviews with automated data from your projects.

briefing
~~~~~~~~


Briefing Pack Export Router.

This module provides the API endpoint for generating executive briefing
decks in PowerPoint (.pptx) format.  The briefing generator produces
standardized presentations containing programme health metrics, schedule
visualizations, EVM S-Curves, risk tornado charts, and risk matrices.

Endpoint
~~~~~~~~

POST /api/v1/reports/briefing/generate-deck

Accepts a project ID, reporting cut-off date, and optional slide selection
flags.  Returns a downloadable .pptx briefing deck with defence classification
stamps on every slide.

Security
~~~~~~~~

All endpoints require JWT authentication.  The caller must have sufficient
clearance to access the programme data being briefed.  Classification
markings are automatically derived from the programme's highest-classified
node and stamped on every slide.

Slide Selection
~~~~~~~~~~~~~~~

The ``slide_selection`` parameter allows the caller to request specific
slides rather than the full 5-slide deck.  For example, ``[1, 3]`` generates
only the Programme Master Health and EVM S-Curve slides.

References
~~~~~~~~~~

- IPMR/CPR Formats 1–5 (ANSI/EIA-748B)
- DoD 5000.02-M: Defense Acquisition Program Management

What You Can Do
~~~~~~~~~~~~~~~

**Creating New Items**

* **Create**: Generate an executive briefing deck for a programme.

Currency Exchange
=================


Manage multi-currency cost tracking with exchange rate conversions.

currency
~~~~~~~~


Currency exchange rate management API endpoints.

This module provides the REST API for managing foreign currency exchange
rates and performing currency conversions in the Eisenhower Portfolio Manager.

Why Currency Endpoints?
~~~~~~~~~~~~~~~~~~~~~~~

International defence programmes involve multi-currency procurement.  These
endpoints allow financial managers to:

- **Maintain Exchange Rates** — Record contractual fixed rates, floating
  spot rates, and forward hedge rates with effective date ranges.

- **Test Conversions** — Validate that the correct rate is being applied
  for a given currency pair and valuation date.

- **Analyse FX Variance** — Separate standard Cost Variance from currency
  fluctuation impact for accurate financial reporting.

API Endpoints
~~~~~~~~~~~~~

All endpoints are mounted under ``/api/v1/currency``:

- **POST /rates** — Create a new exchange rate record.
- **GET /rates** — List all exchange rates (with optional filtering).
- **GET /rates/{id}** — Get a specific exchange rate.
- **PUT /rates/{id}** — Update an existing exchange rate.
- **DELETE /rates/{id}** — Delete an exchange rate record.
- **POST /convert** — Convert an amount between currencies.
- **GET /tasks/{task_id}/fx-variance** — Analyse currency variance for a task.

Authentication
~~~~~~~~~~~~~~

All endpoints require a valid JWT token via the ``Authorization`` header.
Only authenticated users can access currency data.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: List all currency exchange rate records.
* **View**: Get a specific currency exchange rate record.
* **View**: Analyse currency variance for a task.

**Creating New Items**

* **Create**: Create a new currency exchange rate record.
* **Create**: Convert an amount from one currency to another.

**Updating Information**

* **Update**: Update an existing currency exchange rate record.

**Removing Items**

* **Delete**: Delete a currency exchange rate record.

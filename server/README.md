# HyTech CRM Server

This dev server provides JSON-backed APIs for the field app.

Storage modes:

- Local in-memory mock (default): No env vars required. Data resets on restart.
- Google Cloud Storage (GCS): Set credentials to persist data between restarts.

Enable GCS by providing either:

- Direct env vars: GCS_PROJECT_ID, GCS_BUCKET, GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY
- Or set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON file path and provide GCS_BUCKET.

Notes:

- If using GCS_PRIVATE_KEY from env, preserve newlines by either using a multiline value, or by escaping as \n; the server converts escaped \n into newlines.
- Default bucket name: hytechcrm_app_storage if not provided.

APIs:

- GET /api/customers?assignedTo=...
- POST /api/customers (create/update)
- DELETE /api/customers/:id
- GET /api/appointments?assignedTo=...&date=YYYY-MM-DD
- POST /api/appointments (create/update)
- DELETE /api/appointments/:id
- POST /api/storage/upload|sign|list|delete

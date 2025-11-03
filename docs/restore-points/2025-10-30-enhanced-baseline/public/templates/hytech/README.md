Place your exact proposal HTML file here as `proposal.html`.

Runtime behavior:

- The public routes `/p/{token}/view` and `/p/{token}/print` will fetch this HTML and fill placeholders with CRM data.
- If this file is missing, the app falls back to an internal default template.

Supported placeholders (replace inside your HTML):

- Company
  - `{{company_name}}`
  - `{{company_address}}`
  - `{{company_contact_line}}` (e.g., `508-555-1212 • office@example.com`)
  - `{{hic_csl_line}}` (e.g., `HIC #184383 • CSL #105951`)
- Customer
  - `{{customer_name}}`
  - `{{customer_street}}`
  - `{{customer_city_state_zip}}`
  - `{{customer_contact_line}}` (e.g., `email • tel • cell`)
- Proposal
  - `{{scope_lines}}` (HTML paragraphs for the “Supply and install …” lines)
  - `{{grand_total}}` (formatted USD)

If your template uses different token names, tell me and I’ll map them 1:1.

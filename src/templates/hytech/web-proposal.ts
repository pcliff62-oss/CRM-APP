const TEMPLATE = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Proposal</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; background:#fff; color:#0f172a; }
    .container { max-width: 768px; margin: 0 auto; padding: 16px; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 16px; }
    .muted { color: #64748b; }
    .small { font-size: 12px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 16px 0 8px; }
    .row { display:flex; align-items:flex-start; justify-content:space-between; gap: 16px; }
    .right { text-align:right; }
  </style>
</head>
<body>
  <div class="proposal-html">
    <div class="container">
      <div class="card">
        <div class="row">
          <div>
            <h1>{{company_name}}</h1>
            <div class="muted small">{{company_address}}</div>
            <div class="muted small">{{company_contact_line}}</div>
            <div class="muted small">{{hic_csl_line}}</div>
          </div>
          <div class="right">
            <div class="muted small">Grand Total</div>
            <div><strong>{{grand_total}}</strong></div>
          </div>
        </div>

        <div style="margin-top:12px; padding-top:12px; border-top:1px solid #e2e8f0">
          <div class="small" style="font-weight:600">Customer</div>
          <div>{{customer_name}}</div>
          <div>{{customer_street}}</div>
          <div>{{customer_city_state_zip}}</div>
          <div>{{customer_contact_line}}</div>
        </div>

        <h2>Proposal</h2>
        <div>{{scope_lines}}</div>

        <div class="right" style="margin-top:12px;"><strong>Total: {{grand_total}}</strong></div>
      </div>
    </div>
  </div>
</body>
</html>`;

export default TEMPLATE;

# Web Proposal: File Inventory

This document lists all files involved in the web-based proposal feature, grouped by role, with short purposes.

## Public proposal pages

- `src/app/p/[id]/page.tsx` — redirect to the public viewer.
- `src/app/p/[id]/view/page.tsx` — public viewer; fetches snapshot and HTML template, renders proposal, applies DOM enhancements.
- `src/app/p/[id]/print/page.tsx` — print-friendly render; loads overrides CSS/JS, runs customizer for stable print.
- `src/app/sign/[token]/page.tsx` — redirect signed token links to viewer.

## DOM post-processing overrides

- `public/elink-overrides.js` — runtime customizer (stabilize Asphalt TOTAL rows, Ice & Water text cleanup, header normalization, mutation observer bootstrap).
- `public/elink-overrides.css` — pill/labels and TOTAL-row filler styling.
- `public/proposal.css` — additional public CSS referenced by templates (if present in template).

## Template rendering pipeline

- `src/lib/webProposal/data.ts` — WebProposal types and money formatting helpers.
- `src/lib/webProposal/render.ts` — token replacement (renderProposalTemplate), image embedding, docx-like shaping.
- `src/templates/hytech/field-map.ts` — snapshot → WebProposal mapping (flags for roof/siding/trim/skylights, computed values).
- `src/lib/proposalDoc.ts` — generates default scope lines for siding/trim/skylights, etc.
- `src/templates/hytech/web-proposal.html` — example HTML template.
- `src/templates/hytech/web-proposal.ts` — TS template variant for development.

## API routes used by the viewer/print

- `src/app/api/proposals/public/[token]/route.ts` — fetch proposal by token.
- `src/app/api/proposals/public/[token]/sign/route.ts` — accept/sign proposal.
- `src/app/api/proposals/public/[token]/pdf/route.ts` — save/export signed HTML/PDF.
- `src/app/api/proposals/public/[token]/finalize/route.ts` — finalize hook (optional).
- `src/app/api/proposals/template/route.ts` — serve HTML template for viewer.
- `src/app/api/proposals/prefill/route.ts` — prefill snapshot values.
- `src/app/api/proposals/create/route.ts` — create proposal records and token.
- `src/app/api/proposals/send-to-customer/route.ts` — email/export pipeline.
- `src/app/api/proposals/views/route.ts` — view counters/analytics.
- `src/app/api/proposals/track-view/route.ts` — track open events.

## Styling for proposal renders

- `src/styles/globals.css` — print parity for `.proposal-doc/.proposal-html` and hides controls in print.
- `src/styles/proposal-font-override.css` — enforce Times New Roman inside proposal HTML.

## Builder/editor and admin tools

- `src/app/proposals/page.tsx` — proposals listing + editor host.
- `src/app/proposals/create/page.tsx` — launch proposal app with lead context.
- `src/app/proposals/proposalEditor.tsx` — simple HTML editor for proposals.
- `src/app/admin/mapper/page.tsx` — Web Proposal Mapper preview using `mapSnapshotToWeb`.
- `packages/proposal-app-launched/src/App.jsx` — standalone proposal SPA (compose/export DOCX, email, save).

## Components/utilities

- `src/components/SignaturePad.tsx` — signature capture component (internal app usage).
- `src/lib/jwt.ts` — signing/verification secrets for public token links.

## Assets/templates

- `public/templates/hytech/` — static assets/templates referenced by web proposal.
- `public/assets/*` — logos/images used in templates.

## Notes

- The viewer page (`view/page.tsx`) contains most DOM enhancement rules: price-pill insertion, totals normalization, trim/windows checkboxes, signature overlay, section dividers.
- `public/elink-overrides.js` provides late, idempotent post-processing (Asphalt TOTAL row stabilization and minor text cleanup).

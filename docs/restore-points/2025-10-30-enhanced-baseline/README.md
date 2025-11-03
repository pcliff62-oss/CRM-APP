Restore Point: 2025-10-30 Enhanced Baseline

What’s included

- Template override and renderer paths
  - public/templates/hytech/proposal.html
  - src/app/api/proposals/template/route.ts
  - src/templates/hytech/web-proposal.ts (fallback)
  - src/lib/webProposal/render.ts, src/lib/webProposal/data.ts
- Client viewer/print pages (all UI enhancements)
  - src/app/p/[id]/view/page.tsx
  - src/app/p/[id]/print/page.tsx
- UI override entrypoints you can edit safely
  - public/elink-overrides.css
  - public/elink-overrides.js

How to restore

1. Copy any file(s) above back to its original path.
2. Or checkout this commit/tag if you saved one (recommended):
   git switch -c restore/2025-10-30 && git checkout tags/stable/elink-override-point

How to customize the eLink UI (safe lane)

- Edit public/elink-overrides.css for styling.
- Edit public/elink-overrides.js to define window.elinkCustomize(root, { snapshot, proposal }).
- The hook runs after each enhancement pass in view and once in print.

Verify

- Visit the proposal view page; UI should reflect overrides.
- Windows & Doors, Skylights, Trim, dividers, and signature still work.

Notes

- The override files are version-agnostic and won’t break core logic.
- If you remove them, the app continues to work with default UI.

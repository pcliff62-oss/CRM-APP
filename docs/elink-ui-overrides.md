# eLink Proposal UI Overrides

This project supports drop‑in UI customization for the eLink proposal without touching React, the DOM enhancer, or the Word‑exported template. You can safely edit a CSS file and an optional JS hook that run after every enhancement pass.

## Quick start

1. Edit `public/elink-overrides.css` for styling tweaks. It hot‑reloads in dev on refresh.
2. (Optional) Edit `public/elink-overrides.js` to run `window.elinkCustomize(root, ctx)` for one‑off DOM tweaks.
3. Open a proposal (View or Print). Your changes layer on top of the rendered template.

If these files don’t exist, create them (see examples below). The app loads them automatically.

## File locations

- CSS: `public/elink-overrides.css`
- JS: `public/elink-overrides.js` (defines `window.elinkCustomize` if needed)

Both files are served statically and are cache‑busted with a timestamp query in dev so you see changes immediately.

## CSS examples

```css
/* Proposal container */
.proposal-html {
}

/* Price pill visuals */
.proposal-html .price-choice {
  border-color: #94a3b8;
}

/* Blue divider thickness */
.section-divider {
  height: 10px;
  box-shadow: 0 0 10px rgba(29, 78, 216, 0.35);
}

/* Signature size */
.signature-overlay {
  max-width: 60%;
}
```

Tip: Scope all selectors under `.proposal-html` to avoid bleeding into the app chrome.

## JS customizer examples

Create `public/elink-overrides.js` with:

```js
// window.elinkCustomize(root: HTMLElement, ctx: { snapshot: any, proposal: any })
window.elinkCustomize = function (root, ctx) {
  try {
    // 1) Example: remove any price pills inside Ice & Water descriptive blocks
    const iceBlocks = Array.from(
      root.querySelectorAll("table, p, div, span")
    ).filter((el) => /ICE\s*(?:&|AND|-)?\s*WATER/i.test(el.textContent || ""));
    for (const el of iceBlocks)
      el.querySelectorAll("label.price-choice").forEach((p) => p.remove());

    // 2) Example: ensure COLOR lines remain visible
    const colorLeafs = Array.from(
      root.querySelectorAll("td,th,p,span,div")
    ).filter((el) => {
      const t = (el.textContent || "").toUpperCase();
      return (
        /\bCOLOR\s*:/.test(t) &&
        !Array.from(el.querySelectorAll("*")).some((ch) =>
          /\bCOLOR\s*:/.test((ch.textContent || "").toUpperCase())
        )
      );
    });
    colorLeafs.forEach((el) => {
      const txt = (el.textContent || "").trim();
      if (!/\bCOLOR\s*:/.test(txt))
        el.textContent = "COLOR: ________________________";
    });

    // 3) Example: reinforce NorthGate TOTAL pills
    const tables = Array.from(root.querySelectorAll("table")).filter(
      (t) =>
        /NORTHGATE|CLIMATEFLEX/i.test(t.textContent || "") &&
        /(GOOD|BETTER|BEST)/i.test(t.textContent || "")
    );
    for (const t of tables) {
      const totalRow = Array.from(t.querySelectorAll("tr")).find((r) =>
        /TOTAL\s+INVESTMENT\s*:/i.test(r.textContent || "")
      );
      if (!totalRow) continue;
      for (const cell of Array.from(totalRow.querySelectorAll("td,th"))) {
        if (cell.querySelector("label.price-choice")) continue;
        const m = (cell.textContent || "").match(
          /\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/
        );
        if (!m) continue;
        const amt = Number((m[1] || "").replace(/[^0-9.\-]/g, ""));
        if (!(amt > 0)) continue;
        cell.innerHTML = `<label class="price-choice gbb"><span>${m[0]}</span><input type="checkbox" class="proposal-price-checkbox" data-amount="${amt}"></label>`;
      }
    }
  } catch (e) {
    console.warn("elinkCustomize failed:", e);
  }
};
```

Notes:

- The hook is idempotent. It’s called after the enhancer runs and again after significant DOM changes.
- Never mutate outside of `root`.
- Keep changes small and safe—focus on UI; avoid business logic.

## Troubleshooting

- CSS not applying? Ensure the file is at `public/elink-overrides.css` and refresh the page.
- JS not running? Ensure `public/elink-overrides.js` exists and defines `window.elinkCustomize` on `window`.
- Print view differences? The same override files load for both View and Print.

## Reverting

Delete or rename `public/elink-overrides.css`/`.js` to disable overrides. The base enhancer and template will continue to function.

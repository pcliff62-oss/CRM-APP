/* eLink UI Customizer (focused; Asphalt TOTAL-row only, money-only detection, uploader-safe) */
(function () {
  const A = (x) => Array.from(x || []);

  // Parse a money amount from a cell; prefer $…, fallback to plain number
  function readAmount(cell) {
    if (!cell) return null;
    const txt = (cell.textContent || '').replace(/\u00A0/g, ' ').trim();
    let m = txt.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
    if (m) return Number(m[1].replace(/[^0-9.\-]/g, ''));
    const m2 = txt.match(/([0-9][0-9,]*(?:\.[0-9]{2})?)/);
    if (m2) return Number(m2[1].replace(/[^0-9.\-]/g, ''));
    return null;
  }

  function wrapCell(cell, amt = null) {
    if (!cell) return;
    let amount = amt;
    if (amount == null) amount = readAmount(cell);
    if (!Number.isFinite(amount)) return;

    // If already wrapped with same amount, skip rewrite (idempotent)
    const existingInput = cell.querySelector('label.price-choice input.proposal-price-checkbox');
    if (existingInput) {
      const prev = Number(existingInput.getAttribute('data-amount') || 'NaN');
      if (Number.isFinite(prev) && Math.abs(prev - amount) < 0.005) return;
    }

    // Build display like $12,345.67 (keep existing $ if present)
    const txt = (cell.textContent || '').replace(/\u00A0/g, ' ');
    const hasDollar = /\$/.test(txt);
    const display = hasDollar
      ? (txt.match(/\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?/) || [new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)])[0]
      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

    const safe = display.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    cell.innerHTML = `<label class="price-choice gbb"><span>${safe}</span><input type="checkbox" class="proposal-price-checkbox" data-amount="${amount}"></label>`;
  }

  // Limit to Asphalt tables only
  function findAsphaltTables(root) {
    return Array.from(root.querySelectorAll('table')).filter(t => {
      const T = (t.textContent || '').toUpperCase();
      // Strictly target Asphalt tables; avoid generic SHINGLE matches that may include Cedar/DaVinci
      const isAsphalt = /(ASPHALT|NORTHGATE|LANDMARK)/.test(T) && !/(CEDAR|DAVINCI)/.test(T);
      return isAsphalt && /TOTAL\s+INVESTMENT/.test(T);
    });
  }

  // Authoritative TOTAL row mapping for Asphalt: no headers, money-only cells
  function fixTotalsFromRow(root) {
    const tables = findAsphaltTables(root);

    const moneyCell = (cell) => {
      if (!cell) return false;
      const txt = (cell.textContent || '').replace(/\u00A0/g,' ').trim();
      return /\$\s*[0-9][0-9,]*(?:\.[0-9]{2})?/.test(txt) || /[0-9][0-9,]*(?:\.[0-9]{2})?/.test(txt);
    };

    const applyMapping = (row) => {
      if (row.__gbbApplying) return; // prevent re-entrancy from our own DOM writes
      row.__gbbApplying = true;
      try {
        const cells = Array.from(row.querySelectorAll('td,th'));
        if (!cells.length) return;

        // 1) Choose targets: prefer label + next 3; fallback rightmost numeric clustered
        let targets = null;
        let labelIdx = cells.findIndex(c => /TOTAL\s+INVESTMENT\s*:?/i.test(c.textContent || ''));
        if (labelIdx >= 0) {
          const tri = [labelIdx + 1, labelIdx + 2, labelIdx + 3].filter(i => i < cells.length);
          const triMoney = tri.filter(i => moneyCell(cells[i]));
          if (triMoney.length >= 1) targets = triMoney; // accept 1–3 targets
        }
        if (!targets) {
          const idxs = [];
          for (let i = 0; i < cells.length; i++) if (moneyCell(cells[i])) idxs.push(i);
          if (idxs.length >= 1) {
            const cluster = idxs.slice(-3); // up to 3
            targets = cluster;
          }
        }

        // 2) Read amounts from targets
        let amounts = null;
        if (targets && targets.length >= 1) {
          const values = targets.map(i => readAmount(cells[i]));
          if (values.every(v => Number.isFinite(v))) {
            amounts = values;
          }
        }
        // Rehydrate from saved data if needed
        if (!amounts && row.__gbbSaved && Array.isArray(row.__gbbSaved.amounts) && row.__gbbSaved.amounts.length >= 1) {
          amounts = row.__gbbSaved.amounts;
          if (!targets) {
            if (labelIdx >= 0) {
              const tri = [labelIdx + 1, labelIdx + 2, labelIdx + 3].filter(i => i < cells.length);
              targets = tri.length ? tri : [cells.length - 1].filter(i => i >= 0);
            }
          }
        }

        // If we still don’t have a confident target/amount, do nothing (never strip existing pills)
        if (!targets || !amounts) return;

        // Save for future rehydrate
        row.__gbbSaved = { targets, amounts };

        // 3) Do NOT remove pills in non-target cells; preserve anything existing
        // Previously removed all label.price-choice in non-target cells, which could strip valid pills.
        // Keep existing pills untouched.

        // 4) Ensure pills on targets using known amounts (overwrite only these cells)
        for (let k = 0; k < Math.min(targets.length, amounts.length); k++) {
          wrapCell(cells[targets[k]], amounts[k]);
        }

        // 5) Mark authority for guards in other scripts (optional)
        row.setAttribute('data-gbb-authority', 'asphalt');
      } finally {
        row.__gbbApplying = false;
      }
    };

    for (const t of tables) {
      const totalRows = Array.from(t.querySelectorAll('tr')).filter(r => /TOTAL\s+INVESTMENT\s*:?/i.test(r.textContent || ''));
      for (const row of totalRows) {
        applyMapping(row);
        if (!row.__gbbRowLock) {
          const mo = new MutationObserver(() => {
            if (row.__gbbApplying) return; // ignore our own writes
            // throttle to next frame
            if (row.__gbbRaf) cancelAnimationFrame(row.__gbbRaf);
            row.__gbbRaf = requestAnimationFrame(() => applyMapping(row));
          });
          mo.observe(row, { childList: true, subtree: true, characterData: true, attributes: true });
          row.__gbbRowLock = true;
        }
      }
    }
  }

  // Keep the Ice & Water descriptive-text cleanup only (don’t touch totals)
  function cleanIceWater(root) {
    const blocks = A(root.querySelectorAll('table, p, div, span')).filter(el => {
      const T = (el.textContent || '').toUpperCase();
      return /(ICE\s*&?\s*WATER|WINTER-?GUARD|UNDERLAYMENT\s+SYSTEM)/.test(T) && !/TOTAL\s+INVESTMENT/.test(T);
    });
    for (const el of blocks) {
      for (const pill of A(el.querySelectorAll('label.price-choice'))) {
        const txt = (pill.querySelector('span')?.textContent || '').toUpperCase();
        const m = txt.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/);
        if (!m) continue;
        const amt = Number((m[1] || '').replace(/[^0-9.\-]/g, ''));
        const hasUnit = /\b(MIL|MM|SQ|FT|LF|PLY|ROLL|SHEET)\b/.test(txt);
        if ((isFinite(amt) && amt <= 150) || hasUnit) pill.remove();
      }
    }
  }

  // Stabilize only Asphalt tables so Trim-off can't collapse the TOTAL row shape
  function stabilizeAsphaltTables(root) {
    const tables = findAsphaltTables(root);
    for (const t of tables) {
      if (t.__gbbStabilizing) continue;
      t.__gbbStabilizing = true;

      // Optional: if an Asphalt G/B/B header exists, force its cells to colSpan=1
      const hdr = Array.from(t.querySelectorAll('tr')).find(r => /(GOOD|BETTER|BEST)/i.test(r.textContent || ''));
      if (hdr) {
        Array.from(hdr.querySelectorAll('th,td')).forEach((c) => {
          const txt = (c.textContent || '').toUpperCase();
          if (/(GOOD|BETTER|BEST)/.test(txt) && c.colSpan > 1) c.colSpan = 1;
        });
      }

      // Ensure TOTAL row has [label + 3] cells immediately after the label
      const total = Array.from(t.querySelectorAll('tr')).find(r => /TOTAL\s+INVESTMENT\s*:?/i.test(r.textContent || ''));
      if (total) {
        const cells = Array.from(total.querySelectorAll('td,th'));
        if (cells.length) {
          let labelIdx = cells.findIndex(c => /TOTAL\s+INVESTMENT\s*:?/i.test(c.textContent || ''));
          if (labelIdx < 0) labelIdx = 0;
          const labelCell = total.querySelectorAll('td,th')[labelIdx];
          if (labelCell) {
            if (labelCell.colSpan > 1) labelCell.colSpan = 1; // prevent label eating columns

            // Count next sibling cells and unmerge if needed
            const nextCells = [];
            let sib = labelCell.nextElementSibling;
            while (sib && nextCells.length < 3) {
              if (sib.matches && sib.matches('td,th')) {
                if (sib.colSpan > 1) sib.colSpan = 1;
                nextCells.push(sib);
              }
              sib = sib.nextElementSibling;
            }
            // Insert fillers until we have 3 cells after label
            for (let i = nextCells.length; i < 3; i++) {
              const filler = document.createElement('td');
              filler.className = 'gbb-filler';
              filler.innerHTML = '&nbsp;';
              labelCell.after(filler);
            }
          }
        }
      }

      t.__gbbStabilizing = false;
    }
  }

  // Remove any legacy filler cells we may have injected earlier in non-Total rows or non-Asphalt tables
  function cleanupLegacyFillers(root) {
    const asphaltTables = new Set(findAsphaltTables(root));
    const fillers = root.querySelectorAll('td.gbb-filler, th.gbb-filler');
    fillers.forEach(f => {
      let keep = false;
      // keep only if inside an Asphalt table AND in the TOTAL row
      let t = f.closest('table');
      let r = f.closest('tr');
      if (t && asphaltTables.has(t) && r && /TOTAL\s+INVESTMENT\s*:?/i.test(r.textContent || '')) {
        keep = true;
      }
      if (!keep) f.remove();
    });
  }

  // Ensure section title and "Remove and haul away" rows span the full width
  function normalizeTopFullWidthRows(root) {
    // Limit normalization to Asphalt only to avoid affecting Cedar/Davinci table shapes
    const TITLE_RX = /(ASPHALT(\s+SHINGLE)?\s*.*ROOF)/i;
    const REMOVE_RX = /REMOVE\s+AND\s+HAUL/i;

    const tables = Array.from(root.querySelectorAll('table')).filter(t => TITLE_RX.test((t.textContent || '')));
    for (const t of tables) {
      // Determine total columns for the table (max of visible cells across early rows)
      const rows = Array.from(t.querySelectorAll('tr'));
      const scanRows = rows.slice(0, 12); // only early header/intro chunk
      let totalCols = 0;
      for (const r of scanRows) {
        const cells = Array.from(r.querySelectorAll('td,th'));
        const sum = cells.reduce((s,c)=> s + (Number(c.colSpan) || 1), 0);
        totalCols = Math.max(totalCols, sum);
      }
      if (!totalCols) totalCols = 4; // default typical layout

      const unifyRow = (r) => {
        const cells = Array.from(r.querySelectorAll('td,th'));
        if (!cells.length) return;
        const first = cells[0];
        // Combine all cell HTML to preserve formatting
        const combined = cells.map(c=>c.innerHTML).join(' ');
        first.innerHTML = combined;
        first.colSpan = totalCols;
        // Remove the remaining cells
        for (let i=1;i<cells.length;i++) cells[i].remove();
      };

      // Normalize the first few rows that match
      for (let i = 0; i < Math.min(rows.length, 8); i++) {
        const r = rows[i];
        const txt = (r.textContent || '').toUpperCase();
        if (TITLE_RX.test(txt) || REMOVE_RX.test(txt)) unifyRow(r);
      }
    }
  }

  function run(root) {
    // Cleanup any legacy filler cells left from previous sessions
    cleanupLegacyFillers(root);

    // Restore title and intro rows to full-width for named sections
    normalizeTopFullWidthRows(root);

    // Stabilize Asphalt TOTAL row shape and apply mapping
    stabilizeAsphaltTables(root);
    fixTotalsFromRow(root);      // Asphalt-only TOTAL rows
    cleanIceWater(root);         // descriptive-text cleanup only
  }

  // Expose for enhancer (safe, idempotent)
  window.elinkCustomize = function (root) { try { run(root); } catch (e) { console.warn('elinkCustomize failed:', e); } };

  // Robust init (ignore uploader-only churn; staged passes)
  function init() {
    const root = document.querySelector('.proposal-html');
    if (!root) return false;
    const schedule = (() => { let s = false, id = 0; return () => { if (s) return; s = true; id && cancelAnimationFrame(id); id = requestAnimationFrame(() => { s = false; run(root); }); }; })();
    // Add a final late pass to beat slow scripts
    [0, 200, 800, 1800, 3200, 5200].forEach(ms => setTimeout(schedule, ms));

    // Ignore uploader-only churn
    const IGNORE = ['.trim-photos','.trim-uploader','.photo-uploader','[data-section="trim"] [data-uploader]','.filepond','.dz-default','.dz-preview','.dz-progress'].join(',');
  const mo = new MutationObserver((mut) => {
      const allFromUploader = mut.length > 0 && mut.every(m => {
        const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        return el && el.closest && el.closest(IGNORE);
      });
      if (!allFromUploader) schedule();
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
    window.addEventListener('pageshow', schedule);
    return true;
  }
  if (!init()) {
    const t = setInterval(() => { if (init()) clearInterval(t); }, 100);
    window.addEventListener('DOMContentLoaded', () => { if (init()) clearInterval(t); });
  }
})();

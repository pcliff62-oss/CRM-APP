"use client";
import { useEffect } from 'react';

/**
 * Initializes native HTML5 drag & drop for lead thumbnails across stage columns.
 * Relies on existing data attributes:
 *  - data-lead-id on each card
 *  - data-stage on each card (current stage)
 *  - data-stage-container on each column content area
 */
export default function LeadsDragDropClient() {
  useEffect(() => {
    const DRAG_CARD_SELECTOR = '[data-lead-id]';
    const COLUMN_SELECTOR = '[data-stage-container]';

    let draggedId: string | null = null;
    let originStage: string | null = null;
    let dragGhost: HTMLElement | null = null;

    function handleDragStart(e: DragEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.matches(DRAG_CARD_SELECTOR)) return;
      draggedId = target.getAttribute('data-lead-id');
      originStage = target.getAttribute('data-stage');
      e.dataTransfer?.setData('text/plain', draggedId || '');
      e.dataTransfer?.setDragImage(createGhost(target), 10, 10);
      requestAnimationFrame(() => target.classList.add('opacity-60'));
    }

    function createGhost(el: HTMLElement) {
      const rect = el.getBoundingClientRect();
      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.style.position = 'absolute';
      ghost.style.top = '-9999px';
      ghost.style.left = '-9999px';
      ghost.style.pointerEvents = 'none';
      ghost.style.margin = '0';
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
      ghost.style.boxSizing = 'border-box';
      ghost.style.display = 'block';
      // Remove any potential flex-grow or width stretching classes
      ghost.classList.remove('w-full');
      ghost.classList.add('bg-white','shadow','rounded','overflow-hidden');
      document.body.appendChild(ghost);
      dragGhost = ghost;
      return ghost;
    }

    function handleDragEnd(e: DragEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.matches(DRAG_CARD_SELECTOR)) {
        target.classList.remove('opacity-60');
      }
      if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
      }
      draggedId = null;
      originStage = null;
      document.querySelectorAll(COLUMN_SELECTOR).forEach(c => c.classList.remove('ring','ring-sky-400','bg-sky-50/40'));
    }

    function handleDragOver(e: DragEvent) {
      if (!draggedId) return;
      const col = (e.target as HTMLElement).closest(COLUMN_SELECTOR) as HTMLElement | null;
      if (!col) return;
      e.preventDefault(); // allow drop
      col.classList.add('ring','ring-sky-400','bg-sky-50/40');
    }

    function handleDragLeave(e: DragEvent) {
      const col = (e.target as HTMLElement).closest(COLUMN_SELECTOR) as HTMLElement | null;
      if (!col) return;
      // Remove highlight only if leaving the column completely
      const related = e.relatedTarget as HTMLElement | null;
      if (related && col.contains(related)) return;
      col.classList.remove('ring','ring-sky-400','bg-sky-50/40');
    }

  async function handleDrop(e: DragEvent) {
      if (!draggedId) return;
      const col = (e.target as HTMLElement).closest(COLUMN_SELECTOR) as HTMLElement | null;
      if (!col) return;
      e.preventDefault();
      const newStage = col.getAttribute('data-stage-container');
      if (!newStage) return;

      // optimistic move
      const card = document.querySelector(`[data-lead-id="${draggedId}"]`);
      if (card && card.parentElement !== col) {
        col.appendChild(card);
        card.setAttribute('data-stage', newStage);
      }

      // skip if same stage
      if (originStage === newStage) return;

      try {
        // We need contactId to call API. It's not on DOM.
        // Use overlay component's in-memory data by emitting a custom event; fallback to refetch not implemented yet.
        // Instead, call a lightweight POST that accepts leadId directly (extend API?)
        // For now call existing /api/contact-stage requiring contactId: we'll look up via fetch to /api/leads maybe.
        // Simpler: create a hidden endpoint? We'll inline dynamic fetch to update via existing form endpoint moveLead??
        // We cannot call server action directly here, so use /api/contact-stage with contactId attr embedded on card if present.
        const contactId = (card as HTMLElement).getAttribute('data-contact-id');
        const res = await fetch('/api/lead-stage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: draggedId, stage: newStage }) });
        if (res.ok) {
          let detail: any = { leadId: draggedId, stage: newStage };
          try { const data = await res.json(); detail.contactId = data.contactId; } catch {}
          if (contactId && !detail.contactId) detail.contactId = contactId;
          window.dispatchEvent(new CustomEvent('lead-stage-changed', { detail }));
        } else {
          // revert if server rejected
          if (originStage && originStage !== newStage && card) {
            const originCol = document.querySelector(`[data-stage-container="${originStage}"]`);
            originCol?.appendChild(card);
            card.setAttribute('data-stage', originStage);
          }
        }
      } catch (err) {
        // revert on error
        const card = document.querySelector(`[data-lead-id="${draggedId}"]`);
        if (originStage && card) {
          const originCol = document.querySelector(`[data-stage-container="${originStage}"]`);
          originCol?.appendChild(card);
          card.setAttribute('data-stage', originStage);
        }
      } finally {
        document.querySelectorAll(COLUMN_SELECTOR).forEach(c => c.classList.remove('ring','ring-sky-400','bg-sky-50/40'));
      }
    }

    // Mark cards draggable & attach listeners via delegation
    function init() {
      document.querySelectorAll(DRAG_CARD_SELECTOR).forEach(el => {
        (el as HTMLElement).setAttribute('draggable','true');
      });
      document.addEventListener('dragstart', handleDragStart as any);
      document.addEventListener('dragend', handleDragEnd as any);
      document.addEventListener('dragover', handleDragOver as any);
      document.addEventListener('drop', handleDrop as any);
      document.addEventListener('dragleave', handleDragLeave as any);
      // observe for new cards appended
      const obs = new MutationObserver(muts => {
        for (const m of muts) {
          m.addedNodes.forEach(node => {
            if (node instanceof HTMLElement && node.matches?.(DRAG_CARD_SELECTOR)) {
              node.setAttribute('draggable','true');
            }
          });
        }
      });
      document.querySelectorAll(COLUMN_SELECTOR).forEach(col => {
        obs.observe(col, { childList: true });
      });
    }

    init();
    return () => {
      document.removeEventListener('dragstart', handleDragStart as any);
      document.removeEventListener('dragend', handleDragEnd as any);
      document.removeEventListener('dragover', handleDragOver as any);
      document.removeEventListener('drop', handleDrop as any);
      document.removeEventListener('dragleave', handleDragLeave as any);
    };
  }, []);
  return null;
}

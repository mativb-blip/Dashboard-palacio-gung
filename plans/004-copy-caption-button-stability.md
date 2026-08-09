# 004 — Stop the "Copiar caption" button from jumping width

**Status:** TODO
**Commit stamp:** 5f322e6
**Severity:** MEDIUM
**Category:** Physicality / layout stability
**Effort:** Low

## Problem

`src/components/dashboard/CaptionPanel.tsx`'s copy button swaps its label between `"Copiar caption"` and `"Copiado ✓"` (for 1.8s, via `setTimeout` in `handleCopy`). The two strings render at different widths, so the button's own width changes with the label — an instant layout jump every time someone copies, which happens often since it's the primary action in the caption panel.

Measured on the live production build: the button at its "Copiar caption" state (the longer of the two labels) renders at **141.7px wide × 36px tall**.

## Target values

- `min-width`: **142px** (rounds the measured 141.7px up by a fraction of a pixel — just enough to guarantee the longer label never clips, without visibly changing the button's current resting size).
- Label crossfade duration: **150ms**, ease-out (same window as every other micro-transition in this codebase).
- Must respect `prefers-reduced-motion: reduce` (label swap becomes instant, `min-width` fix stays — that part isn't motion, it's layout stability, so it always applies).

## Files touched

1. `src/app/globals.css` — one keyframes block + one utility class.
2. `src/components/dashboard/CaptionPanel.tsx` — `min-width` on the button, `key` + class on the label.

## Current code

`src/components/dashboard/CaptionPanel.tsx` lines 63–82:

```tsx
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex min-h-9 items-center gap-[7px] rounded border border-line-2 bg-white px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? "Copiado ✓" : "Copiar caption"}
          </button>
```

## Exact change

### Step 1 — add the keyframes to `globals.css`

Append (alongside any keyframes already added by plans 001/002 — order between plan blocks doesn't matter):

```css
@keyframes copy-label-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.copy-label-fade {
  animation: copy-label-fade 150ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .copy-label-fade {
    animation: none;
  }
}
```

### Step 2 — fix the button's width and wrap the label

Replace the button block in `CaptionPanel.tsx` with:

```tsx
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex min-h-9 min-w-[142px] items-center gap-[7px] rounded border border-line-2 bg-white px-3.5 text-xs leading-none font-bold tracking-[0.04em] text-brand-ink"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span key={copied ? "copied" : "idle"} className="copy-label-fade">
              {copied ? "Copiado ✓" : "Copiar caption"}
            </span>
          </button>
```

Only two things changed: `min-w-[142px]` added to the button's `className`, and the bare `{copied ? ... : ...}` expression wrapped in a `<span key={...} className="copy-label-fade">`.

## Scope boundaries

- Do **not** change `handleCopy`, the 1800ms timeout, or the clipboard-write logic — this plan is purely visual.
- Do **not** touch the icon SVG.
- Do **not** apply this `min-width` pattern to any other button in the codebase (e.g. the "Descargar" / "Descargando…" button in `ArtViewer.tsx` has the same class of problem, but it isn't part of this finding — a separate plan if wanted).
- Keep `min-w-[142px]`, not a larger round number — the point is to match the button's already-correct resting size, not to make it bigger.

## Verification

1. `npm run dev`, open the app, click "Copiar caption" in the aside.
2. Confirm the button does **not** change width when the label flips to "Copiado ✓", and does not change width back when it reverts after ~1.8s.
3. Confirm the label crossfades (brief fade) rather than popping, on both the "idle → copied" and "copied → idle" transitions.
4. **Feel-check**: DevTools "prefers-reduced-motion: reduce" emulation — label should swap instantly (no fade) but the button must still stay the same width throughout (that part is not motion-gated).
5. Resize to mobile width (390px) and repeat — confirm the fixed `min-width` doesn't cause any overflow/wrapping issues in the aside's narrower layout.
6. `npx tsc --noEmit` and `npm run lint` must both stay clean.

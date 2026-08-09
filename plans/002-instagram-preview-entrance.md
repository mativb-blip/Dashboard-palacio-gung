# 002 — Entrance animation for the Instagram-style preview modal

**Status:** TODO
**Commit stamp:** 5f322e6
**Severity:** MEDIUM-HIGH
**Category:** Missed opportunity (transition)
**Effort:** Low

## Problem

`src/components/dashboard/InstagramPreview.tsx` is the only modal/overlay in the app (opened from the "Previsualizar" button in `src/app/nueva-propuesta/page.tsx`). It mounts and unmounts with a hard cut: no backdrop fade, no card fade or scale. It's modeled after Instagram's own post view, which does animate in — a hard cut undercuts the "here's how it'll look" moment this modal exists for.

## Scope decision — entrance only, not exit

This plan **only animates the entrance** (mount). Animating the exit gracefully would require delaying the actual unmount (e.g. holding state for one more tick after `onClose` fires, only removing the component after the exit animation finishes) — there's no animation library in this repo (no Framer Motion `AnimatePresence`), so a correct exit animation means hand-rolling that delay logic in the parent (`nueva-propuesta/page.tsx`), which is a meaningfully bigger, separate change. Keeping this plan to entrance-only keeps it proportional — it's the higher-value half of the fix, and matches the project's documented "sin animaciones llamativas" restraint (don't over-build a modal transition system for one modal). If an exit animation is wanted later, it should be its own plan.

## Target values

- Duration: **180ms** for both backdrop and card (top of the documented .12–.18s hover/press window — a modal appearing is a slightly bigger perceptual event than a hover, but must not creep past what "sin animaciones llamativas" implies).
- Easing: **ease-out**.
- Card motion: opacity 0→1 **and** `scale(0.96)` → `scale(1)` — a subtle settle, not a bounce or overshoot.
- Backdrop motion: opacity 0→1 only (no scale).
- Must respect `prefers-reduced-motion: reduce` (both animations disabled; modal still appears, just instantly).

## Files touched

1. `src/app/globals.css` — add two keyframes + two utility classes.
2. `src/components/dashboard/InstagramPreview.tsx` — apply the classes to the backdrop and card divs.

## Current code

`src/components/dashboard/InstagramPreview.tsx` lines 19–27:

```tsx
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] rounded-lg border border-line-2 bg-white font-sans text-brand-ink shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
```

## Exact change

### Step 1 — add keyframes to `globals.css`

Append (after the `art-fade-in` block from plan 001, if that plan lands first — otherwise just append to the end of the file):

```css
@keyframes preview-backdrop-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes preview-card-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.preview-backdrop-in {
  animation: preview-backdrop-in 180ms ease-out;
}

.preview-card-in {
  animation: preview-card-in 180ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .preview-backdrop-in,
  .preview-card-in {
    animation: none;
  }
}
```

### Step 2 — apply the classes in `InstagramPreview.tsx`

Change lines 19–27 to:

```tsx
  return (
    <div
      className="preview-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="preview-card-in w-full max-w-[400px] rounded-lg border border-line-2 bg-white font-sans text-brand-ink shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
```

No other lines in this file change.

## Scope boundaries

- Do **not** build an exit animation or touch how/when the component unmounts (see "Scope decision" above).
- Do **not** touch `nueva-propuesta/page.tsx`'s `{showPreview && <InstagramPreview .../>}` conditional — mounting logic stays exactly as-is.
- Do **not** animate the carousel dots inside the preview (already has its own `transition-all duration-150`, out of scope here) or the heart/comment/send/bookmark icons.
- Keep the scale subtle — do not exceed `scale(0.96)` as the start value; anything lower reads as a "pop" and violates the documented "sin animaciones llamativas".

## Verification

1. `npm run dev`, go to `/nueva-propuesta`, fill in a caption, click "Previsualizar".
2. Confirm the backdrop fades in and the card fades + settles from a very slightly smaller size — it should read as a quick, subtle appearance, not a bounce or zoom.
3. Click outside the card (on the backdrop) or the "×" button to close — closing stays instant (by design, see scope decision); confirm nothing looks broken on close (no flash, no leftover partial-opacity frame).
4. **Feel-check**: use DevTools' "prefers-reduced-motion: reduce" emulation (Rendering tab) and reopen the preview — modal should appear instantly with no fade/scale.
5. Test with an empty `images` array (no art uploaded yet) — confirm the "Sin arte cargado" placeholder state still animates in the same way as the image state.
6. `npx tsc --noEmit` and `npm run lint` must both stay clean.

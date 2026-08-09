# 001 — Crossfade on ArtViewer slider navigation

**Status:** TODO
**Commit stamp:** 5f322e6
**Severity:** HIGH
**Category:** Missed opportunity (transition)
**Effort:** Low

## Problem

`src/components/dashboard/ArtViewer.tsx` renders the active art via `<ArtSlot art={arts[activeIndex]} .../>` inside the slider view. When the user clicks `‹`/`›` or a pagination dot, `activeIndex` changes and the `<img>` (or `<ArtTile>` placeholder) is swapped with a hard cut — no transition at all. This is the single most frequently exercised interaction in the app (reviewers flip through every art of a proposal), so the hard cut is felt on almost every visit.

This is a genuine gap, not a documented decision: `Desing/README.md:49` only specifies duration bounds for hover/press ("Transiciones: hover/press cortos (.12–.18s). Sin animaciones llamativas."), it says nothing about content swaps having no transition at all.

## Target values

- Duration: **160ms** (inside the documented .12–.18s hover/press window; use the same window for this content-swap since it's a single small crossfade, not a flashy animation).
- Easing: **ease-out** (`cubic-bezier(0, 0, 0.2, 1)` — standard exit-fast/settle curve, no bounce).
- Technique: CSS `@keyframes` fade-in triggered by a React `key` change (forces a real DOM remount, so the animation reliably replays every navigation — no JS state machine needed, no library).
- Must respect `prefers-reduced-motion: reduce` (disable the animation entirely; the art still swaps instantly, just without the fade).

## Files touched

1. `src/app/globals.css` — add the keyframes + utility class.
2. `src/components/dashboard/ArtViewer.tsx` — apply the class + a `key` prop to the `ArtSlot` render.

## Current code

`src/app/globals.css` (end of file, after the existing `input[type="text"]:focus` rule):

```css
textarea:focus,
input[type="text"]:focus {
  outline: none;
  border-color: var(--color-brand-blue) !important;
  box-shadow: 0 0 0 3px rgba(22, 63, 107, 0.1);
}
```

`src/components/dashboard/ArtViewer.tsx` (lines 130–141, inside the slider branch):

```tsx
            <div
              className="max-w-[var(--art-box-w)] flex-1 aspect-[var(--art-ratio)] min-w-0 overflow-hidden rounded desktop:aspect-auto desktop:h-[var(--art-box-h)] desktop:w-[var(--art-box-w)] desktop:max-w-none desktop:flex-none"
              style={
                {
                  "--art-box-w": `${boxWidth}px`,
                  "--art-box-h": `${boxHeight}px`,
                  "--art-ratio": cssAspectRatio,
                } as React.CSSProperties
              }
            >
              <ArtSlot art={arts[activeIndex]} total={totalPadded} />
            </div>
```

`ArtViewer.tsx` (lines 194–200, the `ArtSlot` component — also used by the grid branch a few lines above, at line 185: `<ArtSlot art={art} total={totalPadded} />` inside the `.map()`):

```tsx
function ArtSlot({ art, total }: { art: Art; total: string }) {
  if (art.src) {
    // eslint-disable-next-line @next/next/no-img-element -- galería de artes propios del contenido, no assets estáticos del sitio
    return <img src={art.src} alt={art.label} className="block h-full w-full object-cover" />;
  }
  return <ArtTile n={art.n} total={total} label={art.label} dimension={art.dimension} />;
}
```

## Exact change

### Step 1 — add the keyframes to `globals.css`

Append at the end of `src/app/globals.css`:

```css
@keyframes art-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.art-fade-in {
  animation: art-fade-in 160ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .art-fade-in {
    animation: none;
  }
}
```

### Step 2 — key + fade class on `ArtSlot`'s output

Replace the `ArtSlot` function body in `ArtViewer.tsx` with:

```tsx
function ArtSlot({ art, total }: { art: Art; total: string }) {
  if (art.src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- galería de artes propios del contenido, no assets estáticos del sitio
      <img
        key={art.index}
        src={art.src}
        alt={art.label}
        className="art-fade-in block h-full w-full object-cover"
      />
    );
  }
  return (
    <div key={art.index} className="art-fade-in h-full w-full">
      <ArtTile n={art.n} total={total} label={art.label} dimension={art.dimension} />
    </div>
  );
}
```

Do **not** change the two call sites (`<ArtSlot art={arts[activeIndex]} total={totalPadded} />` in the slider branch, `<ArtSlot art={art} total={totalPadded} />` in the grid `.map()`) — the `key` now lives inside `ArtSlot` itself, on the actual DOM node that needs to remount. This means the grid thumbnails will also get a one-time fade-in on their initial mount (harmless, consistent bonus — not the target of this plan, don't design around it).

## Scope boundaries

- Do **not** touch `ArtTile.tsx` itself — the fade wrapper goes around it from the outside (a plain `div`), not inside the component.
- Do **not** add the fade to the prev/next buttons, the dots, or the download button — only the art slot.
- Do **not** introduce a JS animation library. This must stay a CSS-only `@keyframes` + `key`-remount technique.
- Do **not** touch the grid-view layout logic (columns, outline) — only `ArtSlot`.

## Verification

1. `npm run dev`, open the app, land on a seed proposal with multiple arts.
2. Click `›` repeatedly: each art should fade in over the swap instead of popping instantly. Click `‹` too.
3. Click each pagination dot directly (not just next/prev) — same fade should play.
4. **Feel-check**: open Chrome DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce", reload, and confirm the art still swaps but with zero animation (instant, no fade).
5. Switch to "Grilla" mode inside ArtViewer — confirm the thumbnails still render correctly (a fade-in on first switch to grid is expected/fine; clicking a thumbnail to change `activeIndex` should NOT cause the grid thumbnails to re-fade, since their `key` doesn't change).
6. `npx tsc --noEmit` and `npm run lint` must both stay clean.

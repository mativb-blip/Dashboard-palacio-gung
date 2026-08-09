# 005 — Hover scale on month-view calendar day cells

**Status:** TODO
**Commit stamp:** 5f322e6
**Severity:** N/A (requested addition, not an audit finding)
**Category:** Missed opportunity / physicality
**Effort:** Low

## Request

User-requested addition (not from the original audit): *"Al pasar el mouse sobre los días del calendario en la vista mensual, cada día aumenta de tamaño, manteniendo el criterio de Emil Kowalski."*

## Problem / opportunity

`src/components/dashboard/Calendar.tsx`'s month-view day cell (the `<button>` inside the `monthDays.map(...)` at line 48) currently has no hover feedback for days that already hold a proposal — only empty days get `hover:border-brand-blue` (line 70). Days with content are inert under the cursor even though they're clickable (`onClick` always fires either `onSelectProposal` or `onSelectEmptyDate`). Plan 003 already gave this cell `transition-colors duration-150`, so the timing convention for this cell is established; this plan adds a second, complementary hover cue — a subtle scale — that must fold into the same transition rather than compete with it.

## Emil Kowalski criteria applied here

- **Subtlety over spectacle**: `Desing/README.md:49` hard constraint — *"Transiciones: hover/press cortos (.12–.18s). Sin animaciones llamativas."* A hover scale must read as a gentle lift, not a pop. Target **1.06** (6% growth) — enough to register, not enough to feel like a button mashing a "bounce" effect. Do not use a spring/bounce easing; use the same linear-in-appearance default Tailwind already applies to every other transition in this file (`cubic-bezier(0.4, 0, 0.2, 1)` — confirmed via computed style on the existing `transition-colors` cells, so this is not a new easing token, it's the one already in use).
- **Duration**: **150ms** — reuses the exact value plan 003 put on this same element; do not introduce a second duration for a second property on the same cell.
- **No layout shift**: `transform: scale()` is the only property that can grow an element without reflowing its 31 siblings (a `width`/`height`/`padding` based "grow" would shove neighboring days and violate the "no layout shift" principle even on a 60px fixed-height row). This is why `scale` is the right tool here, not a size utility.
- **Respect motion preference**: gate the whole effect behind Tailwind's `motion-safe:` variant (`@media (prefers-reduced-motion: no-preference)`) rather than adding a competing override class. Unlike plans 001/002/004 (which needed custom `@keyframes` for an entrance animation and therefore added an explicit `@media (prefers-reduced-motion: reduce) { animation: none }` block), a hover-only `scale` has no keyframes to disable — `motion-safe:` simply never generates/matches the rule when reduced motion is requested, so the cell never grows in the first place. No edit to `globals.css` is needed for this plan.
- **Don't apply where it doesn't belong**: gate the hover behind the project's own `desktop:` breakpoint (`--breakpoint-desktop: 861px`, already the convention used elsewhere in this exact button's class list for `desktop:w-auto desktop:min-w-0 desktop:flex-1`). Touch devices keep `:hover` "stuck" after a tap until the user taps elsewhere, so an un-gated hover-scale would leave a day looking permanently enlarged after someone taps it on a phone — the same reasoning this codebase already applies to every other hover-only affordance.

## Known risk to feel-check (cannot be judged from code alone)

- The month-view row is a **tightly packed flex row**: `gap-[5px]` between 31 cells, `items-stretch` inside a fixed `h-[60px]` container (`src/components/dashboard/Calendar.tsx:48`). Scaling a cell by 6% grows it in every direction from its center, so it will visually creep ~1-2px into the 5px gap toward each neighbor. This should not cause a *hover flicker loop* (mouse enters cell A → A grows → grown A's edge now sits under the cursor of cell B → B's hover fires → jitter) at 1.06, but it hasn't been feel-tested. If jitter shows up, drop to `scale-[1.04]` before trying anything more invasive.
- The calendar section's wrapper (`src/app/page.tsx:118`, `overflow-x-auto`) only clips horizontally, not vertically, so a vertical pop is safe — but the **first and last day of the month** sit right at the scrollable area's horizontal edge; a horizontal 6% grow on those two specific cells could get visually clipped by the `overflow-x-auto` boundary. Check those two cells specifically during the feel-check.
- Because the scaled cell's hit-testing region grows along with its paint, `z-10` is added on hover so it visually renders above its neighbors' borders instead of looking like it's tucked halfway behind them.

## Files touched

1. `src/components/dashboard/Calendar.tsx` only. No `globals.css` changes (see "Respect motion preference" above).

## Current code

`src/components/dashboard/Calendar.tsx` lines 53–72:

```tsx
            return (
              <button
                key={iso}
                type="button"
                onClick={() => (proposal ? onSelectProposal(proposal.id) : onSelectEmptyDate(iso))}
                title={proposal ? undefined : "Cargar contenido para este día"}
                className={[
                  // Ancho fijo y sin encoger en mobile: con 31 columnas, dejarlas
                  // repartirse (flex-1) dentro de un contenedor que no siempre
                  // fuerza scroll (min-width:660 puede quedar corto en anchos
                  // intermedios, p. ej. una tablet) las aplastaría ilegibles.
                  // En desktop sí se reparten a lo ancho, como el resto del layout.
                  "flex w-9 shrink-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded border px-[5px] py-1.5 text-left font-sans transition-colors duration-150 desktop:w-auto desktop:min-w-0 desktop:flex-1",
                  active
                    ? "border-brand-blue bg-brand-blue/[0.06]"
                    : proposal
                      ? "border-line bg-white"
                      : "border-line bg-panel-2 hover:border-brand-blue",
                ].join(" ")}
              >
```

## Exact change

Replace the first string in the `className` array (the one starting with `"flex w-9 shrink-0..."`) with:

```tsx
                  "relative flex w-9 shrink-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded border px-[5px] py-1.5 text-left font-sans transition-[border-color,background-color,transform] duration-150 desktop:w-auto desktop:min-w-0 desktop:flex-1 desktop:motion-safe:hover:z-10 desktop:motion-safe:hover:scale-[1.06]",
```

Three things changed from the current string, nothing else:

1. `relative` prepended — required for the `z-10` hover bump to have any effect (an unpositioned element ignores `z-index`).
2. `transition-colors` → `transition-[border-color,background-color,transform]` — **same two color properties this cell already transitions** (`border-color`, `background-color` — it never transitions text `color`, so the more generic `transition-colors` was already broader than necessary), now with `transform` folded into the *same* property list so both the color swap and the new scale share one `duration-150` declaration. This is a like-for-like replacement, not a behavior change to the existing color transition.
3. Two new utilities appended at the end: `desktop:motion-safe:hover:z-10 desktop:motion-safe:hover:scale-[1.06]`.

Do not touch the second string in the array (the `active`/`proposal` conditional — the color values themselves are out of scope, exactly as in plan 003).

## Scope boundaries

- Do **not** add a corresponding `active:scale-*` (press-down) state. The user asked specifically for a hover grow; a press-shrink wasn't requested and risks reading as more animation than the "sin animaciones llamativas" constraint wants. If the user wants that too, it's a separate follow-up.
- Do **not** apply this to the week-view day chip (`Calendar.tsx:138`) or the 12-month tab row (`Calendar.tsx:36`) — the request was specifically about month-view day cells.
- Do **not** change the `FormatIcon`/`PlusIcon` sizing inside the cell — they scale along with their parent button automatically since `transform: scale()` scales the whole rendered subtree; no separate icon-level change is needed or wanted.
- Do **not** remove `overflow-hidden` from this button — unrelated to this plan, keep it as-is.
- Keep the scale factor at **1.06**. If the feel-check (below) finds jitter between adjacent cells, drop to `1.04` — do not go the other direction (larger) without checking back, since "sin animaciones llamativas" caps how much growth reads as subtle here.

## Verification

1. `npm run dev`, switch to "Mes" view, resize to ≥861px (desktop breakpoint).
2. Hover slowly across a run of 5-6 consecutive days, including at least one with a proposal (icon) and one empty (`+`). Each cell should grow in place with a short, smooth pop — no snapping, no stutter.
3. **Jitter feel-check**: move the mouse slowly along the row, left to right, right at the boundary between two cells. Confirm hovering doesn't rapidly flicker between two neighboring cells growing/shrinking in sequence. If it does, apply the `1.04` fallback noted above.
4. **Edge feel-check**: hover the very first day of the month and the very last day of the month specifically — confirm neither gets visually clipped by the calendar row's horizontal scroll boundary (`src/app/page.tsx:118`, `overflow-x-auto`).
5. Resize below 861px (mobile) and tap a day — confirm it does **not** grow (the `desktop:` gate should keep mobile untouched, avoiding the "stuck hover" problem touch devices have).
6. DevTools → Rendering → emulate `prefers-reduced-motion: reduce` → hover a day again — it should **not** grow at all (since `motion-safe:` never applies its rule under reduced motion), while the border/background color transition (unaffected by this preference, it's not motion-gated in this codebase's own convention — see plans 001/002/004, which only gate the *animations* they add, not pre-existing color transitions) still behaves as before.
7. `npx tsc --noEmit` and `npm run lint` must both stay clean.

# 003 — Add the missing transition to the month-view day cell

**Status:** TODO
**Commit stamp:** 5f322e6
**Severity:** MEDIUM
**Category:** Cohesion
**Effort:** Trivial

## Problem

`src/components/dashboard/Calendar.tsx` has two structurally-equivalent "day cell" components:

- The week-view day chip (line 138) — has `transition-colors duration-150` on its border/background.
- The month-view day cell (line 65) — has **no transition class at all**.

Selecting a different day, or hovering an empty day (which has `hover:border-brand-blue`), causes the month-view cell's color to snap instantly, while the exact same interaction in week view fades smoothly. This is an inconsistency between two components that should feel identical, not a deliberate choice — nothing in `Desing/README.md` documents this asymmetry.

## Target values

- Duration: **150ms** (matching the week-view chip exactly, and the 6 other `transition-colors duration-150` instances already in the codebase — this plan does not introduce a new value, it applies the existing one).
- Easing: default (Tailwind's `transition-colors` default timing function — same as every other toggle in the app; do not add an explicit `ease-*` class, since none of the other 7 existing `transition-colors` usages in this codebase specify one either).

## Files touched

1. `src/components/dashboard/Calendar.tsx` only.

## Current code

Lines 53–72 (the month-view day `<button>`):

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
                  "flex w-9 shrink-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded border px-[5px] py-1.5 text-left font-sans desktop:w-auto desktop:min-w-0 desktop:flex-1",
                  active
                    ? "border-brand-blue bg-brand-blue/[0.06]"
                    : proposal
                      ? "border-line bg-white"
                      : "border-line bg-panel-2 hover:border-brand-blue",
                ].join(" ")}
              >
```

For reference, the week-view chip that already has the correct treatment (line 138):

```tsx
                    className="flex w-full cursor-pointer flex-col gap-0.5 rounded-[3px] border px-[10px] py-1.5 text-left font-sans transition-colors duration-150"
```

## Exact change

In the month-view button's `className` array (the first string in the array, the one starting with `"flex w-9 shrink-0..."`), add `transition-colors duration-150` to the end of that string. Result:

```tsx
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
```

(`transition-colors duration-150` inserted right after `font-sans`, before `desktop:w-auto` — placement within the string doesn't matter for Tailwind, but keep it there for consistency with how other multi-class strings in this file are ordered: layout/sizing classes, then behavior classes, then responsive overrides.)

## Scope boundaries

- Do **not** change the `active`/`proposal` conditional classes (the color values themselves) — only add the transition.
- Do **not** touch the week-view chip (line 138) — it's already correct, it's the reference.
- Do **not** touch the 12-month tab row (`MONTHS_SHORT.map`, line ~40) — it already has `transition-colors duration-150`.
- Do **not** add a transition to the `FormatIcon`/`PlusIcon` swap inside the cell (that's a separate, much smaller, lower-value item not in scope here — the icon color comes from an inline `style` prop, not a class, and isn't part of this finding).

## Verification

1. `npm run dev`, switch to "Mes" view.
2. Click between several days (with and without posts) — the selected cell's border/background should now fade in ~150ms instead of snapping, matching the feel of clicking day chips in "Semana" view.
3. Hover an empty day (desktop only, ≥861px) — the border should fade to blue instead of snapping.
4. Compare side-by-side: switch to "Semana", click a day chip, switch back to "Mes", click a day cell — the two transitions should feel identical in speed.
5. `npx tsc --noEmit` and `npm run lint` must both stay clean.

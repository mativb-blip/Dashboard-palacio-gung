"use client";

import { useState } from "react";
import { PRESS_SCALE_CLASS } from "@/lib/dashboard/ui";
import { updateContentPillars } from "./actions";

interface BrandListsPanelProps {
  contentPillars: string[];
}

/** Lista configurable de pilares de contenido (ficha 2), una por línea. Sin
 * UI de arrastrar u ordenar: un textarea de una por línea alcanza. */
export default function BrandListsPanel({ contentPillars }: BrandListsPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2">
      <ListEditor
        title="Pilares de contenido"
        hint="Uno por línea — aparecen en Cargar propuesta y en el filtro del panel."
        defaultValue={contentPillars.join("\n")}
        action={updateContentPillars}
      />
    </div>
  );
}

function ListEditor({
  title,
  hint,
  defaultValue,
  action,
}: {
  title: string;
  hint: string;
  defaultValue: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [saved, setSaved] = useState(false);

  async function handleAction(formData: FormData) {
    await action(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <form action={handleAction} className="flex flex-col gap-2 rounded border border-line-2 p-4">
      <div className="text-[11px] tracking-label text-tx-3 uppercase">{title}</div>
      <p className="text-xs text-tx-3">{hint}</p>
      <textarea
        name="raw"
        defaultValue={defaultValue}
        rows={5}
        className="w-full resize-y rounded border border-line-2 bg-panel-2 px-3 py-2 font-sans text-sm"
      />
      <button
        type="submit"
        className={`self-start rounded bg-brand-ink px-4 py-2 text-xs font-bold whitespace-nowrap text-[var(--bg)] transition-transform duration-[400ms] ${PRESS_SCALE_CLASS}`}
      >
        {saved ? "Guardado ✓" : "Guardar"}
      </button>
    </form>
  );
}

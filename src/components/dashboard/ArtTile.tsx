"use client";

import { useBrand } from "@/lib/dashboard/BrandContext";

interface ArtTileProps {
  n: string;
  total: string;
  label: string;
  dimension: string;
}

/** Placeholder de arte — se usa mientras una propuesta no tiene imágenes reales
 * (Desing/ArtTile.dc.html). */
export default function ArtTile({ n, total, label, dimension }: ArtTileProps) {
  const { brandName } = useBrand();
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden border border-line-2 bg-panel-2 p-4 font-sans">
      <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
        <span className="font-thin text-[96px] leading-none font-light text-[#ECEEF1]">{n}</span>
      </div>
      <div className="relative z-[2] flex items-start justify-between">
        <span className="text-[13px] font-bold tracking-[0.24em] text-brand-blue">{brandName.toUpperCase()}</span>
        <span className="text-[10px] tracking-label text-tx-3 uppercase">
          {n} / {total}
        </span>
      </div>
      <div className="relative z-[2]">
        <div className="mb-[9px] flex h-[3px] w-[34px]">
          <span className="w-3 bg-brand-red" />
          <span className="flex-1 bg-brand-blue" />
        </div>
        <div className="text-sm leading-[1.2] font-bold text-brand-ink">{label}</div>
        <div className="mt-[3px] text-[11px] tracking-[0.02em] text-tx-3">{dimension}</div>
      </div>
    </div>
  );
}

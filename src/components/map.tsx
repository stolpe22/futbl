"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// Leaflet só funciona no navegador
export const FieldsMap = dynamic(() => import("./fields-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[60vh] place-items-center rounded-2xl border border-line bg-surface-2 text-muted" role="status">
      <span className="flex items-center gap-2">
        <Loader2 className="size-5 animate-spin" aria-hidden /> Carregando mapa…
      </span>
    </div>
  ),
});

export type { LatLng } from "./fields-map";

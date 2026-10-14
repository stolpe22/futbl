"use client";

import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import L from "leaflet";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MapContainer, Marker, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { LocateFixed } from "lucide-react";
import { GOIANIA, type Bbox, type PlaceResult } from "@/lib/geo";
import { brl } from "@/lib/format";
import { SURFACE_LABEL, type FieldRow } from "@/lib/types";

export type LatLng = { lat: number; lng: number };
type MapView = { center: [number, number]; zoom: number };

export type FieldsMapProps = {
  fields?: FieldRow[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** resultados de busca: pinos verdes numerados (mesmo número da lista) */
  searchResults?: PlaceResult[];
  selectedPlaceId?: string | null;
  onPlaceSelect?: (p: PlaceResult) => void;
  onPlaceChoose?: (p: PlaceResult) => void;
  /** texto do botão no pino de resultado de busca */
  placeActionLabel?: string;
  pick?: LatLng | null;
  onPick?: (p: LatLng) => void;
  /** texto do pino "pick" quando não é arrastável (padrão: "Local do campo") */
  pickLabel?: string;
  focus?: (LatLng & { zoom?: number }) | null;
  /** enquadra o mapa para mostrar todos estes pontos (ex.: resultado de busca) */
  fitTo?: LatLng[] | null;
  /** avisa a área visível sempre que o mapa para de mexer */
  onBoundsChange?: (b: Bbox) => void;
  /** conteúdo sobre o mapa (ex.: botão "Buscar nesta área") */
  overlay?: ReactNode;
  className?: string;
};

const fieldIcon = (selected: boolean) =>
  L.divIcon({
    className: "",
    html: `<div class="pin-campo${selected ? " selected" : ""}"><span>⚽</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  });

const numberIcon = (n: number, selected: boolean) =>
  L.divIcon({
    className: "",
    html: `<div class="pin-campo pin-novo${selected ? " selected" : ""}"><span class="pin-num">${n}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
  });

const pickIcon = L.divIcon({
  className: "",
  html: `<div class="pin-campo pin-novo"><span>📍</span></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -32],
});

// Correção do plugin: ele agenda uma atualização para o próximo quadro e, se o fundo
// do mapa foi removido nesse meio tempo (troca de tema, sair da tela), quebrava com erro.
type GlProto = { _transitionEnd: (e: unknown) => void; _map?: unknown; __patched?: boolean };
const glProto = (L as unknown as { MaplibreGL: { prototype: GlProto } }).MaplibreGL.prototype;
if (!glProto.__patched) {
  const original = glProto._transitionEnd;
  glProto._transitionEnd = function (this: GlProto, e: unknown) {
    // o plugin usa L.Util.requestAnimFrame; troca por uma versão que confere se ainda está no mapa
    const raf = L.Util.requestAnimFrame;
    L.Util.requestAnimFrame = ((fn: (...a: unknown[]) => void, ctx?: unknown, immediate?: boolean) =>
      raf((...a: unknown[]) => {
        if (this._map) fn.apply(ctx, a);
      }, undefined, immediate)) as typeof raf;
    try {
      if (this._map) original.call(this, e);
    } finally {
      L.Util.requestAnimFrame = raf;
    }
  };
  glProto.__patched = true;
}

const maxBounds = L.latLngBounds([GOIANIA.south - 0.15, GOIANIA.west - 0.2], [GOIANIA.north + 0.15, GOIANIA.east + 0.2]);

function useDarkTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      const t = document.documentElement.dataset.theme;
      setDark(t === "dark" || (t !== "light" && mq.matches));
    };
    read();
    mq.addEventListener("change", read);
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", read);
      obs.disconnect();
    };
  }, []);
  return dark;
}

export default function FieldsMap({
  fields = [],
  selectedId,
  onSelect,
  searchResults = [],
  selectedPlaceId,
  onPlaceSelect,
  onPlaceChoose,
  placeActionLabel = "Usar este lugar",
  pick,
  onPick,
  pickLabel = "Local do campo",
  focus,
  fitTo,
  onBoundsChange,
  overlay,
  className = "h-[60vh]",
}: FieldsMapProps) {
  const dark = useDarkTheme();
  // OpenFreeMap: mapa gratuito, sem chave e sem limite de uso
  const style = `https://tiles.openfreemap.org/styles/${dark ? "dark" : "liberty"}`;

  // O Next esconde a página ao trocar de aba (Activity) em vez de desmontar, e o
  // Leaflet não suporta isso. Então o mapa é desmontado de verdade ao esconder e
  // recriado do zero ao voltar, reabrindo na mesma posição e zoom.
  const [active, setActive] = useState(false);
  const [view, setView] = useState<MapView>({ center: GOIANIA.center, zoom: GOIANIA.zoom });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- liga/desliga o mapa conforme a página aparece
    setActive(true);
    return () => setActive(false);
  }, []);

  return (
    <div className={`relative isolate overflow-hidden rounded-2xl border border-line bg-surface-2 ${className}`}>
      {active && (
      <MapContainer
        center={view.center}
        zoom={view.zoom}
        minZoom={10}
        maxBounds={maxBounds}
        maxBoundsViscosity={0.8}
        className="size-full"
        style={onPick ? { cursor: "crosshair" } : undefined}
      >
        <BaseMap key={style} style={style} />
        <FlyTo focus={focus} />
        <FitBounds points={fitTo} />
        {onPick && <PickHandler onPick={onPick} />}
        {onBoundsChange && <BoundsWatcher onChange={onBoundsChange} />}
        <ViewSaver onSave={setView} />

        {searchResults.map((p, i) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={numberIcon(p.n ?? i + 1, p.id === selectedPlaceId)}
            zIndexOffset={p.id === selectedPlaceId ? 2000 : 500}
            eventHandlers={{ click: () => onPlaceSelect?.(p) }}
          >
            <Tooltip direction="top" offset={[0, -30]}>
              {p.n ?? i + 1}. {p.name}
            </Tooltip>
            <Popup>
              <div className="min-w-44">
                <p className="font-semibold">{p.n ?? i + 1}. {p.name}</p>
                <p className="text-sm text-[var(--muted)]">{p.address}</p>
                {onPlaceChoose && (
                  <button
                    onClick={() => onPlaceChoose(p)}
                    className="mt-2 w-full rounded-lg bg-[var(--gold)] px-3 py-1.5 text-sm font-semibold text-[#1a160e]"
                  >
                    {placeActionLabel}
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {fields.map((f) => (
          <Marker
            key={f.id}
            position={[f.lat, f.lng]}
            icon={fieldIcon(f.id === selectedId)}
            zIndexOffset={f.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect?.(f.id) }}
          >
            <Tooltip direction="top" offset={[0, -30]}>
              {f.name}
            </Tooltip>
            <Popup>
              <div className="min-w-44">
                <p className="font-semibold">{f.name}</p>
                <p className="text-sm text-[var(--muted)]">
                  {SURFACE_LABEL[f.surface]} · {f.price_per_hour != null ? `${brl(f.price_per_hour)}/h` : "preço não informado"}
                </p>
                <Link href={`/campos/${f.id}`} className="mt-2 inline-block text-sm font-semibold text-[var(--gold-ink)] underline">
                  Ver detalhes →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}

        {pick && (
          <Marker
            position={[pick.lat, pick.lng]}
            icon={pickIcon}
            draggable={!!onPick}
            eventHandlers={{
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                onPick?.({ lat: ll.lat, lng: ll.lng });
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -30]} permanent={!!onPick}>
              {onPick ? "Arraste para ajustar" : pickLabel}
            </Tooltip>
          </Marker>
        )}

        <RecenterButton />
      </MapContainer>
      )}
      {overlay && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[600] flex justify-center px-14">
          <div className="pointer-events-auto">{overlay}</div>
        </div>
      )}
    </div>
  );
}

/** Fundo do mapa: vetorial (MapLibre) dentro do Leaflet */
function BaseMap({ style }: { style: string }) {
  const map = useMap();
  useEffect(() => {
    const credit =
      '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
    const layer = maplibreGL({ style, attributionControl: false }).addTo(map);
    map.attributionControl?.addAttribution(credit);
    return () => {
      map.attributionControl?.removeAttribution(credit);
      layer.remove();
    };
  }, [map, style]);
  return null;
}

/** Lembra posição e zoom para reabrir o mapa no mesmo lugar */
function ViewSaver({ onSave }: { onSave: (v: MapView) => void }) {
  const last = useRef("");
  const map = useMapEvents({
    moveend: () => {
      const size = map.getSize();
      if (!size.x || !size.y) return; // mapa escondido: não há o que lembrar
      const c = map.getCenter();
      const key = `${c.lat.toFixed(5)},${c.lng.toFixed(5)},${map.getZoom()}`;
      if (key === last.current) return;
      last.current = key;
      onSave({ center: [c.lat, c.lng], zoom: map.getZoom() });
    },
  });
  return null;
}

/**
 * Avisa a área visível quando o mapa para de mexer. Só avisa quando a área muda de
 * verdade, e nunca com o mapa escondido (tamanho zero): assim um aviso não provoca
 * outro em cadeia ("Maximum update depth exceeded").
 */
function BoundsWatcher({ onChange }: { onChange: (b: Bbox) => void }) {
  const last = useRef("");
  const emit = () => {
    const size = map.getSize();
    if (!size.x || !size.y) return;
    const b = map.getBounds();
    const r = (n: number) => Math.round(n * 1e4) / 1e4; // ~10 m
    const next = { south: r(b.getSouth()), west: r(b.getWest()), north: r(b.getNorth()), east: r(b.getEast()) };
    const key = `${next.south},${next.west},${next.north},${next.east}`;
    if (key === last.current) return;
    last.current = key;
    onChange(next);
  };
  const map = useMapEvents({ moveend: emit });
  // avisa a área inicial assim que o mapa aparece, fora do ciclo de efeitos do React
  useEffect(() => {
    const frame = requestAnimationFrame(() => map.whenReady(emit));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

function PickHandler({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FitBounds({ points }: { points?: LatLng[] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    if (points.length === 1) map.flyTo([points[0].lat, points[0].lng], 16, { duration: 0.6 });
    else map.flyToBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [48, 48], maxZoom: 16, duration: 0.6 });
  }, [points, map]);
  return null;
}

function FlyTo({ focus }: { focus?: (LatLng & { zoom?: number }) | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], focus.zoom ?? Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [focus, map]);
  return null;
}

function RecenterButton() {
  const map = useMap();
  return (
    <button
      type="button"
      ref={(el) => {
        // clique no botão não deve marcar ponto no mapa
        if (el) L.DomEvent.disableClickPropagation(el);
      }}
      onClick={() => map.flyTo(GOIANIA.center, GOIANIA.zoom, { duration: 0.6 })}
      className="absolute bottom-6 right-3 z-[500] flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink shadow-md hover:bg-surface-2"
      title="Voltar a ver Goiânia inteira"
    >
      <LocateFixed className="size-4" aria-hidden /> Ver Goiânia toda
    </button>
  );
}

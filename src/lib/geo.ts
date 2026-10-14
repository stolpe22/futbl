/** Região metropolitana de Goiânia (Goiânia, Aparecida, Senador Canedo, Trindade) */
export const GOIANIA = {
  center: [-16.6869, -49.2648] as [number, number],
  zoom: 12,
  south: -16.95,
  west: -49.55,
  north: -16.45,
  east: -49.0,
};

export const inGoiania = (lat: number, lng: number) =>
  lat >= GOIANIA.south && lat <= GOIANIA.north && lng >= GOIANIA.west && lng <= GOIANIA.east;

/** Retângulo do mapa (área visível) */
export type Bbox = { south: number; west: number; north: number; east: number };

/** Limita uma área à região de Goiânia */
export const clampBbox = (b: Bbox): Bbox => ({
  south: Math.max(b.south, GOIANIA.south),
  west: Math.max(b.west, GOIANIA.west),
  north: Math.min(b.north, GOIANIA.north),
  east: Math.min(b.east, GOIANIA.east),
});

export const bboxParam = (b: Bbox) => [b.south, b.west, b.north, b.east].map((n) => n.toFixed(5)).join(",");

export const inBbox = (b: Bbox, lat: number, lng: number) =>
  lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;

/** Categorias pelo nome do lugar (um lugar pode ter mais de uma) */
export const CATEGORY_RULES: { id: string; label: string; re: RegExp }[] = [
  { id: "society", label: "Society", re: /societ|soçaite|socyet|sint[eé]tico/i },
  { id: "futsal", label: "Futsal", re: /futsal|quadra|gin[aá]sio/i },
  { id: "futebol", label: "Futebol", re: /futebol|soccer|campo|est[aá]dio|\bf\.?\s?c\b|clube|arena|bola/i },
  { id: "areia", label: "Areia", re: /areia|beach|futev[oô]lei/i },
];

export function categorize(name: string): { id: string; label: string }[] {
  const found = CATEGORY_RULES.filter((c) => c.re.test(name)).map(({ id, label }) => ({ id, label }));
  return found.length ? found : [{ id: "nao-identificado", label: "Não identificado" }];
}

export type PlaceResult = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  instagram?: string;
  source: "busca" | "osm" | "google";
  /** link do lugar no Google Maps (resultados do Google) */
  mapsUrl?: string;
  /** número exibido no pino e na lista */
  n?: number;
};

/** Busca de endereço/lugar limitada a Goiânia (OpenStreetMap / Nominatim) */
export async function searchPlaces(q: string, signal?: AbortSignal, area: Bbox = GOIANIA): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    q,
    viewbox: `${area.west},${area.north},${area.east},${area.south}`,
    bounded: "1",
    limit: "8",
    countrycodes: "br",
    addressdetails: "0",
    extratags: "1",
    "accept-language": "pt-BR",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal });
  if (!res.ok) throw new Error("A busca de endereços está fora do ar. Tente de novo em instantes.");
  const data = (await res.json()) as {
    place_id: number;
    name: string;
    display_name: string;
    lat: string;
    lon: string;
    extratags?: Record<string, string>;
  }[];
  return data.map((d) => ({
    id: String(d.place_id),
    name: d.name || d.display_name.split(",")[0],
    address: d.display_name.split(", Região Centro-Oeste")[0],
    lat: Number(d.lat),
    lng: Number(d.lon),
    phone: d.extratags?.phone ?? d.extratags?.["contact:phone"],
    website: d.extratags?.website ?? d.extratags?.["contact:website"],
    instagram: d.extratags?.["contact:instagram"],
    source: "busca",
  }));
}

export type SearchOutcome = {
  results: PlaceResult[];
  engine: "google" | "osm";
  /** por que não usou o Google (cota do mês, sem chave, erro) */
  reason?: string;
};

const FALLBACK_REASON: Record<string, string> = {
  cota: "A busca do Google pausou até o mês que vem: o grupo usou todas as buscas grátis deste mês e o app para antes de qualquer cobrança. Estes resultados são da busca gratuita (OpenStreetMap).",
  "erro-google": "O Google não respondeu agora, então estes resultados são da busca gratuita (OpenStreetMap).",
};

const DEFAULT_QUERY = "campo de futebol society";

/** Junta lugares com o mesmo nome a menos de ~400 m (ex.: várias quadras do mesmo complexo) */
function dedupePlaces(list: PlaceResult[]): PlaceResult[] {
  const key = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const out: PlaceResult[] = [];
  for (const p of list) {
    if (!out.some((o) => key(o.name) === key(p.name) && Math.abs(o.lat - p.lat) < 0.004 && Math.abs(o.lng - p.lng) < 0.004)) out.push(p);
  }
  return out;
}

/**
 * Procura campos novos numa área (ou em toda Goiânia): Google, dentro da cota grátis,
 * com nome, endereço e posição. Se não der, cai sozinho no OpenStreetMap
 * (busca por nome, ou os campos com nome mapeados naquela área).
 */
export async function searchNewPlaces(q: string, area?: Bbox): Promise<SearchOutcome> {
  const term = q.trim() || DEFAULT_QUERY;
  const box = area ? clampBbox(area) : undefined;
  const fallback = async (): Promise<PlaceResult[]> => {
    if (q.trim()) return searchPlaces(term, undefined, box);
    const all = await fetchOsmPitches().catch(() => []);
    return dedupePlaces(all.filter((p) => !/sem nome/i.test(p.name) && (!box || inBbox(box, p.lat, p.lng)))).slice(0, 20);
  };
  // mesma busca na mesma área (arredondada ~1 km) na última hora: reaproveita sem chamar o Google
  const round = (n: number) => n.toFixed(2);
  const cacheKey = `busca:${term.toLowerCase()}|${box ? [box.south, box.west, box.north, box.east].map(round).join(",") : "goiania"}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(cacheKey) ?? "null") as { at: number; results: PlaceResult[] } | null;
    if (hit && Date.now() - hit.at < 3_600_000) return { engine: "google", results: hit.results };
  } catch {}
  try {
    const url = `/api/places/text?q=${encodeURIComponent(term)}${box ? `&bbox=${bboxParam(box)}` : ""}`;
    const res = await fetch(url);
    const data = (await res.json()) as { results?: PlaceResult[]; fallback?: string };
    if (res.ok && data.results) {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), results: data.results }));
      } catch {}
      return { engine: "google", results: data.results };
    }
    return { engine: "osm", results: await fallback(), reason: data.fallback && FALLBACK_REASON[data.fallback] };
  } catch {
    return { engine: "osm", results: await fallback() };
  }
}

/** Telefone e site de um lugar do Google. `limit` quando a cota grátis do mês acabou. */
export async function googleContact(id: string): Promise<{ phone?: string; website?: string } | "limit" | null> {
  try {
    const res = await fetch(`/api/places/details?id=${encodeURIComponent(id)}`);
    const data = (await res.json()) as { contact?: { phone?: string; website?: string }; fallback?: string };
    if (data.fallback === "cota") return "limit";
    return res.ok && data.contact ? data.contact : null;
  } catch {
    return null;
  }
}

export type GooglePhoto = { uri: string; authors: { name: string; uri: string | null }[] };
export type PhotoOutcome = { photo: GooglePhoto } | { none: true } | { limit: true } | { error: true };

/** Foto de capa do lugar no Google (gasta 1 da cota de fotos; nunca passa do limite grátis) */
export async function googlePhoto(id: string): Promise<PhotoOutcome> {
  try {
    const res = await fetch(`/api/places/photo?id=${encodeURIComponent(id)}`);
    const data = (await res.json()) as { photo?: GooglePhoto; none?: boolean; fallback?: string };
    if (data.photo) return { photo: data.photo };
    if (data.none) return { none: true };
    if (data.fallback === "cota") return { limit: true };
    return { error: true };
  } catch {
    return { error: true };
  }
}

/** Endereço a partir de coordenadas (quando a pessoa clica no mapa) */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=pt-BR`,
    );
    if (!res.ok) return null;
    const d = (await res.json()) as { display_name?: string };
    return d.display_name?.split(", Região Centro-Oeste")[0] ?? null;
  } catch {
    return null;
  }
}

/** Campos de futebol mapeados no OpenStreetMap (via /api/osm-campos), com cache de 1 dia no aparelho */
export async function fetchOsmPitches(): Promise<PlaceResult[]> {
  const KEY = "osm-campos-v1";
  try {
    const cached = JSON.parse(localStorage.getItem(KEY) ?? "null") as { at: number; items: PlaceResult[] } | null;
    if (cached && Date.now() - cached.at < 86_400_000) return cached.items;
  } catch {}
  const res = await fetch("/api/osm-campos");
  if (!res.ok) throw new Error("O OpenStreetMap está sobrecarregado agora. Tente de novo em alguns minutos.");
  const items = (await res.json()) as PlaceResult[];
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), items }));
  } catch {}
  return items;
}

/**
 * Extrai coordenadas e nome de um link do Google Maps.
 * Aceita links longos (…/place/Nome/@-16.7,-49.2,17z/…!3d-16.7!4d-49.2) e "?q=lat,lng".
 */
export function parseGoogleMapsUrl(url: string): { lat: number; lng: number; name?: string } | null {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {}
  const name = decoded.match(/\/place\/([^/@]+)/)?.[1]?.replace(/\+/g, " ").trim();
  const patterns = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // posição exata do lugar
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // centro do mapa
    /[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
  ];
  for (const p of patterns) {
    const m = decoded.match(p);
    if (m) return { lat: Number(m[1]), lng: Number(m[2]), name };
  }
  return null;
}

export const isGoogleMapsUrl = (s: string) =>
  /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i.test(s.trim());

/** Links curtos (maps.app.goo.gl) são resolvidos no servidor */
export async function resolveGoogleMapsUrl(url: string) {
  const direct = parseGoogleMapsUrl(url);
  if (direct) return direct;
  const res = await fetch(`/api/resolve-maps?url=${encodeURIComponent(url.trim())}`);
  if (!res.ok) return null;
  const { url: full } = (await res.json()) as { url: string };
  return parseGoogleMapsUrl(full);
}

export const googleMapsSearchUrl = (q: string) =>
  `https://www.google.com/maps/search/${encodeURIComponent(q + " Goiânia")}/@${GOIANIA.center[0]},${GOIANIA.center[1]},12z`;

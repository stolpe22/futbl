import { connection, NextResponse } from "next/server";
import { GOIANIA, type PlaceResult } from "@/lib/geo";

const MIRRORS = [
  "https://gall.openstreetmap.de/api/interpreter",
  "https://lambert.openstreetmap.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const BBOX = `${GOIANIA.south},${GOIANIA.west},${GOIANIA.north},${GOIANIA.east}`;
const QUERY = `[out:json][timeout:40];
(
  nwr["leisure"="pitch"]["sport"~"soccer|futsal|society"](${BBOX});
  nwr["leisure"="sports_centre"]["sport"~"soccer|futsal"](${BBOX});
);
out center tags;`;

type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

// cache em memória do servidor: os dados do OSM mudam pouco
let cache: { at: number; items: PlaceResult[] } | null = null;

export async function GET() {
  await connection();
  if (cache && Date.now() - cache.at < 6 * 3_600_000) return json(cache.items);

  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "futebol-missao/1.0" },
        body: "data=" + encodeURIComponent(QUERY),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });
      if (!res.ok || !res.headers.get("content-type")?.includes("json")) continue;
      const { elements } = (await res.json()) as { elements: OsmElement[] };
      const items = elements
        .map((e): PlaceResult | null => {
          const lat = e.lat ?? e.center?.lat;
          const lng = e.lon ?? e.center?.lon;
          if (lat == null || lng == null) return null;
          const t = e.tags ?? {};
          const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ");
          return {
            id: `${e.type}/${e.id}`,
            name: t.name ?? (t.leisure === "sports_centre" ? "Centro esportivo sem nome" : "Campo sem nome"),
            address: [street, t["addr:suburb"]].filter(Boolean).join(" · "),
            lat,
            lng,
            phone: t.phone ?? t["contact:phone"] ?? t["contact:whatsapp"],
            website: t.website ?? t["contact:website"],
            instagram: t["contact:instagram"],
            source: "osm",
          };
        })
        .filter((x): x is PlaceResult => x !== null);
      cache = { at: Date.now(), items };
      return json(items);
    } catch {
      // tenta o próximo espelho
    }
  }
  return NextResponse.json({ error: "overpass indisponível" }, { status: 503 });
}

const json = (items: PlaceResult[]) =>
  NextResponse.json(items, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=21600" } });

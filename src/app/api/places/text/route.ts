import { NextResponse, type NextRequest } from "next/server";
import { GOIANIA } from "@/lib/geo";
import { GOOGLE_KEY, reserveQuota } from "@/lib/places-server";

// Text Search Pro: nome, endereço e posição -> dá para pôr pino no mapa.
// 5.000 grátis por mês; o app para em 3.500 (ver quota_limit no banco).
const FIELDS = "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri";

/** Busca de campos novos no Google. Responde { fallback } quando não pode usar o Google. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json({ error: "busca curta" }, { status: 400 });
  // área visível do mapa ("Buscar nesta área"); sempre dentro de Goiânia
  const b = request.nextUrl.searchParams.get("bbox")?.split(",").map(Number);
  const area =
    b?.length === 4 && b.every(Number.isFinite) && b[0] < b[2] && b[1] < b[3]
      ? {
          south: Math.max(b[0], GOIANIA.south),
          west: Math.max(b[1], GOIANIA.west),
          north: Math.min(b[2], GOIANIA.north),
          east: Math.min(b[3], GOIANIA.east),
        }
      : GOIANIA;
  if (!GOOGLE_KEY) return NextResponse.json({ fallback: "sem-chave" });

  const quota = await reserveQuota("text_search");
  if (quota === "sem-login") return NextResponse.json({ error: "login" }, { status: 401 });
  if (quota === "esgotada") return NextResponse.json({ fallback: "cota" });

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({
        textQuery: q,
        languageCode: "pt-BR",
        regionCode: "br",
        pageSize: 20,
        locationRestriction: {
          rectangle: {
            low: { latitude: area.south, longitude: area.west },
            high: { latitude: area.north, longitude: area.east },
          },
        },
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ fallback: "erro-google" });
    const data = (await res.json()) as {
      places?: {
        id: string;
        displayName?: { text: string };
        formattedAddress?: string;
        location?: { latitude: number; longitude: number };
        googleMapsUri?: string;
      }[];
    };
    const results = (data.places ?? [])
      .filter((p) => p.location)
      .map((p) => ({
        id: p.id,
        name: p.displayName?.text ?? "",
        address: (p.formattedAddress ?? "").replace(/, (Brazil|Brasil)$/, ""),
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        mapsUrl: p.googleMapsUri,
        source: "google",
      }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ fallback: "erro-google" });
  }
}

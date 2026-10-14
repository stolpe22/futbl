import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_KEY, reserveQuota } from "@/lib/places-server";

// Telefone e site ficam na faixa "Place Details Enterprise": 1.000 grátis por mês.
// O app para em 900 (ver quota_limit no banco). Endereço e posição já vêm da busca.
const FIELDS = "id,nationalPhoneNumber,websiteUri";

/** Contato (telefone e site) do lugar escolhido. Responde { fallback } quando a cota acabou. */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w-]{10,}$/.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  if (!GOOGLE_KEY) return NextResponse.json({ fallback: "sem-chave" });

  const quota = await reserveQuota("details_enterprise");
  if (quota === "sem-login") return NextResponse.json({ error: "login" }, { status: 401 });
  if (quota === "esgotada") return NextResponse.json({ fallback: "cota" });

  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${id}`);
    url.searchParams.set("languageCode", "pt-BR");
    url.searchParams.set("regionCode", "br");
    const res = await fetch(url, {
      headers: { "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": FIELDS },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ fallback: "erro-google" });
    const p = (await res.json()) as { nationalPhoneNumber?: string; websiteUri?: string };
    return NextResponse.json({ contact: { phone: p.nationalPhoneNumber, website: p.websiteUri } });
  } catch {
    return NextResponse.json({ fallback: "erro-google" });
  }
}

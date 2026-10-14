import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_KEY, isLoggedIn, reserveQuota } from "@/lib/places-server";

// Foto do lugar, em dois passos:
// 1. Place Details só com o campo "photos": faixa "Essentials (IDs Only)", uso grátis ilimitado.
//    O nome da foto não pode ser guardado (termos do Google), então é pego de novo a cada vez.
// 2. Place Photos: faixa "Place Details Photos", 1.000 grátis por mês, cobrado por foto pedida.
//    Antes de pedir, reserva 1 na cota do banco (limite 800). Sem cota, não chama o Google.
// Só a capa (1 foto) por clique. O endereço da imagem não expõe a chave.

type GooglePhoto = { name: string; authorAttributions?: { displayName?: string; uri?: string }[] };

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w-]{10,}$/.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  if (!GOOGLE_KEY) return NextResponse.json({ fallback: "sem-chave" });
  if (!(await isLoggedIn())) return NextResponse.json({ error: "login" }, { status: 401 });

  try {
    const details = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
      headers: { "X-Goog-Api-Key": GOOGLE_KEY, "X-Goog-FieldMask": "photos" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!details.ok) return NextResponse.json({ fallback: "erro-google" });
    const photo = ((await details.json()) as { photos?: GooglePhoto[] }).photos?.[0];
    if (!photo) return NextResponse.json({ none: true });

    const quota = await reserveQuota("photo");
    if (quota === "sem-login") return NextResponse.json({ error: "login" }, { status: 401 });
    if (quota === "esgotada") return NextResponse.json({ fallback: "cota" });

    const media = new URL(`https://places.googleapis.com/v1/${photo.name}/media`);
    media.searchParams.set("maxWidthPx", "960");
    media.searchParams.set("skipHttpRedirect", "true");
    const res = await fetch(media, {
      headers: { "X-Goog-Api-Key": GOOGLE_KEY },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ fallback: "erro-google" });
    const { photoUri } = (await res.json()) as { photoUri?: string };
    if (!photoUri) return NextResponse.json({ fallback: "erro-google" });

    return NextResponse.json({
      photo: {
        uri: photoUri,
        authors: (photo.authorAttributions ?? []).filter((a) => a.displayName).map((a) => ({ name: a.displayName!, uri: a.uri ?? null })),
      },
    });
  } catch {
    return NextResponse.json({ fallback: "erro-google" });
  }
}

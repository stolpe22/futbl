import { NextResponse, type NextRequest } from "next/server";

// Só segue redirecionamentos de domínios do Google Maps (evita virar proxy aberto)
const ALLOWED = /^(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)$/i;

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  let current: URL;
  try {
    current = new URL(raw ?? "");
  } catch {
    return NextResponse.json({ error: "link inválido" }, { status: 400 });
  }

  for (let i = 0; i < 5; i++) {
    if (current.protocol !== "https:" || !ALLOWED.test(current.hostname))
      return NextResponse.json({ error: "só links do Google Maps" }, { status: 400 });
    const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(8000), cache: "no-store" });
    const loc = res.headers.get("location");
    if (!loc || res.status < 300 || res.status >= 400) break;
    current = new URL(loc, current);
  }
  return NextResponse.json({ url: current.toString() });
}

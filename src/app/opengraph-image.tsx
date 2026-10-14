import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Prévia que aparece ao mandar o link no WhatsApp, Instagram, etc.
export const alt = "Futebol da Missão: agenda, campos e votações do futebol da galera em Goiânia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Bricolage em TTF (o Satori não lê woff2). Sem internet no build, cai na fonte padrão. */
async function bricolage(weight: number) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function Image() {
  const [icon, bold, regular] = await Promise.all([
    readFile(join(process.cwd(), "src/app/icon.svg"), "utf-8"),
    bricolage(800),
    bricolage(500),
  ]);
  const fonts = [
    ...(bold ? [{ name: "Bricolage", data: bold, weight: 800 as const }] : []),
    ...(regular ? [{ name: "Bricolage", data: regular, weight: 500 as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "radial-gradient(circle at 85% 20%, #3a2c0c 0%, #1a160e 45%, #070604 100%)",
          color: "#f7f4ec",
          fontFamily: "Bricolage",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse só entende <img> */}
          <img src={`data:image/svg+xml;base64,${Buffer.from(icon).toString("base64")}`} width={132} height={132} alt="" style={{ borderRadius: 30 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>Futebol da Missão</div>
            <div style={{ marginTop: 14, fontSize: 26, fontWeight: 500, letterSpacing: 6, color: "#fdb72d" }}>GOIÂNIA · MBL / MISSÃO</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 52, fontWeight: 800, color: "#fdb72d", letterSpacing: -1 }}>Bora pro jogo.</div>
          <div style={{ fontSize: 32, fontWeight: 500, color: "#c9c3b5", maxWidth: 1060 }}>
            Marque o jogo, escolha o campo e confirme presença num lugar só.
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {["Agenda", "Votações", "Campos", "Racha do valor"].map((t) => (
              <div
                key={t}
                style={{ display: "flex", padding: "10px 22px", borderRadius: 999, border: "2px solid #5c4a1c", fontSize: 24, fontWeight: 500, color: "#f7f4ec" }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

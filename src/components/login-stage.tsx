"use client";

import { useEffect, useState } from "react";

/** Avisa o cenário para a bola rolar de novo (ao clicar em Entrar) */
export const kickBall = () => window.dispatchEvent(new Event("lg-kick"));

/** Cenário do login: estádio à noite, refletores, campo em perspectiva e a bola rolando. Só decoração. */
export function StadiumScene() {
  // cada chute remonta a bola, e a animação de passar recomeça
  const [kicks, setKicks] = useState(0);
  useEffect(() => {
    const onKick = () => setKicks((k) => k + 1);
    window.addEventListener("lg-kick", onKick);
    return () => window.removeEventListener("lg-kick", onKick);
  }, []);
  return (
    <div className="lg-scene" aria-hidden>
      <div className="lg-stars" />
      <div className="lg-beam lg-beam-l" />
      <div className="lg-beam lg-beam-r" />
      <div className="lg-lamp left-[4%]">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
      <div className="lg-lamp right-[4%]">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
      <div className="lg-pitch-wrap">
        <div className="lg-pitch">
          <svg viewBox="0 0 1050 680" preserveAspectRatio="none" className="size-full" fill="none" stroke="rgb(255 255 255 / 0.32)" strokeWidth="3">
            <rect x="25" y="25" width="1000" height="630" />
            <line x1="525" y1="25" x2="525" y2="655" />
            <circle cx="525" cy="340" r="92" />
            <circle cx="525" cy="340" r="5" fill="rgb(255 255 255 / 0.4)" />
            <rect x="25" y="140" width="165" height="400" />
            <rect x="25" y="248" width="55" height="184" />
            <rect x="860" y="140" width="165" height="400" />
            <rect x="970" y="248" width="55" height="184" />
            <path d="M190 268 A92 92 0 0 1 190 412" />
            <path d="M860 268 A92 92 0 0 0 860 412" />
          </svg>
        </div>
      </div>
      <div className="lg-spot" />
      <div key={kicks} className={kicks ? "lg-ball-run lg-ball-kick" : "lg-ball-run"}>
        <div>
          <Ball className="size-10 sm:size-12" />
        </div>
      </div>
    </div>
  );
}

export function Ball({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className}>
      <circle cx="20" cy="20" r="18.5" fill="#faf7f0" stroke="#1a160e" strokeWidth="1.5" />
      <path d="M20 12.5 27.1 17.7 24.4 26.1H15.6L12.9 17.7Z" fill="#1a160e" />
      <path
        d="M20 12.5V2.5M27.1 17.7l9.4-3M24.4 26.1l5.8 8M15.6 26.1l-5.8 8M12.9 17.7l-9.4-3"
        stroke="#1a160e"
        strokeWidth="1.5"
      />
    </svg>
  );
}

const TICKER = ["Vou ✓", "Quinta 20h", "Campo escolhido", "+1", "Lista fechada", "Talvez", "Bate bola", "Futebol da Missão"];

/** Placar de LED correndo no pé da tela */
export function LedTicker() {
  const items = [...TICKER, ...TICKER];
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden border-t border-[#fdb72d]/20 bg-black/40 py-2.5 backdrop-blur-sm" aria-hidden>
      <div className="lg-ticker">
        {[0, 1].map((half) => (
          <div key={half} className="flex shrink-0">
            {items.map((t, i) => (
              <span key={i} className="flex items-center whitespace-nowrap px-5 text-sm font-extrabold uppercase tracking-[0.25em] text-[#fdb72d]/70">
                {t}
                <span className="ml-10 size-1.5 rounded-full bg-[#fdb72d]/50" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

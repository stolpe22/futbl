"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { CalendarCheck, Lightbulb, Vote, X } from "lucide-react";
import { cx } from "./ui";

const KEY = "fluxo-escondido";

const STEPS = [
  {
    id: "sugestao",
    icon: Lightbulb,
    title: "1. Sugestão",
    who: "Qualquer um",
    text: "“Quero jogar no campo X, quinta 20h.” Quem também quer dá +1.",
    href: "/sugestoes",
  },
  {
    id: "votacao",
    icon: Vote,
    title: "2. Votação",
    who: "Organizador, se precisar",
    text: "Quando tem dúvida entre campos ou horários. Pode pular.",
    href: "/votacoes",
  },
  {
    id: "jogo",
    icon: CalendarCheck,
    title: "3. Jogo oficial",
    who: "Organizador marca",
    text: "Vai para a Agenda e cada um diz se vai: Vou, Talvez ou Não vou.",
    href: "/agenda",
  },
] as const;

/** Como uma ideia vira jogo (heurísticas 2 e 10). Dá para esconder; a escolha fica neste aparelho. */
export function FlowSteps({ current }: { current: (typeof STEPS)[number]["id"] }) {
  // no servidor começa escondido (sem piscar); no navegador lê a escolha salva
  const saved = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(KEY) === "1";
      } catch {
        return false;
      }
    },
    () => true,
  );
  const [closed, setClosed] = useState(false);
  if (saved || closed) return null;
  return (
    <section aria-label="Como vira jogo" className="relative mb-6 rounded-2xl border border-line bg-surface p-4 pr-10">
      <button
        type="button"
        className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
        aria-label="Esconder explicação"
        title="Esconder (dá para ver de novo na Ajuda)"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            // sem storage: esconde só agora
          }
          setClosed(true);
        }}
      >
        <X className="size-4" />
      </button>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Como uma ideia vira jogo</h2>
      <ol className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.id}>
            <Link
              href={s.href}
              aria-current={s.id === current ? "step" : undefined}
              className={cx(
                "flex h-full gap-3 rounded-xl border p-3 transition-colors hover:border-ink/40",
                s.id === current ? "border-gold bg-talvez-bg/60" : "border-line",
              )}
            >
              <s.icon className={cx("mt-0.5 size-5 shrink-0", s.id === current ? "text-gold-ink" : "text-muted")} aria-hidden />
              <span>
                <span className="block font-semibold">{s.title}</span>
                <span className="block text-xs font-medium text-muted">{s.who}</span>
                <span className="mt-1 block text-sm text-muted">{s.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

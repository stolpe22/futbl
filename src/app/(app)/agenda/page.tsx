"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from "lucide-react";
import { useLoad, useSession } from "@/components/session";
import { GameCard } from "@/components/game-card";
import { SuggestDialog } from "@/components/suggest-dialog";
import { Button, EmptyState, ErrorState, HelpTip, LinkButton, Segmented, Skeleton, cx } from "@/components/ui";
import { applyRsvp, loadGames } from "@/lib/queries";
import { timeOf } from "@/lib/format";
import type { GameWithField } from "@/lib/types";

type View = "calendario" | "lista";
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function AgendaPage() {
  const { isOrganizer } = useSession();
  const [suggest, setSuggest] = useState<{ date?: string } | null>(null);
  const [view, setView] = useState<View>("calendario");

  // lembra a visualização preferida neste aparelho (heurística 7)
  useEffect(() => {
    try {
      const v = localStorage.getItem("agenda-view");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência salva no aparelho
      if (v === "lista" || v === "calendario") setView(v);
    } catch {}
  }, []);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("agenda-view", v);
    } catch {}
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Agenda</h1>
          <p className="mt-1 text-muted">Quando vai rolar futebol. Confirme sua presença.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Visualização"
            value={view}
            onChange={changeView}
            options={[
              { value: "calendario", label: <><CalendarDays className="size-4" aria-hidden /> Calendário</> },
              { value: "lista", label: <><List className="size-4" aria-hidden /> Lista</> },
            ]}
          />
          {isOrganizer ? (
            <LinkButton href="/agenda/novo" variant="primary" title="Atalho: n">
              <Plus className="size-4" aria-hidden /> Marcar jogo
            </LinkButton>
          ) : (
            <Button variant="primary" onClick={() => setSuggest({})}>
              <Plus className="size-4" aria-hidden /> Sugerir jogo
            </Button>
          )}
        </div>
      </header>
      <SuggestDialog open={!!suggest} date={suggest?.date} onClose={() => setSuggest(null)} />
      {view === "calendario" ? <CalendarView onSuggest={(date) => setSuggest({ date })} /> : <ListView />}
    </div>
  );
}

function CalendarView({ onSuggest }: { onSuggest: (date: string) => void }) {
  const { profile, isOrganizer } = useSession();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(() => startOfDay(new Date()));
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const { data, error, loading, reload, setData } = useLoad(
    () => loadGames({ from: gridStart, to: new Date(gridEnd.getTime() + 86_400_000) }),
    [month.getTime()],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, GameWithField[]>();
    for (const g of data?.games ?? []) {
      const k = format(new Date(g.starts_at), "yyyy-MM-dd");
      m.set(k, [...(m.get(k) ?? []), g]);
    }
    return m;
  }, [data]);

  const dayGames = byDay.get(format(selected, "yyyy-MM-dd")) ?? [];
  const goto = (d: Date) => {
    setMonth(startOfMonth(d));
    setSelected(startOfDay(d));
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <section aria-label="Calendário" className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold capitalize" aria-live="polite">
            {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
          </h2>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setMonth(subMonths(month, 1))} aria-label="Mês anterior">
              <ChevronLeft className="size-5" />
            </Button>
            <Button size="sm" onClick={() => goto(new Date())}>Hoje</Button>
            <Button size="sm" variant="ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Próximo mês">
              <ChevronRight className="size-5" />
            </Button>
          </div>
        </div>
        {error && <ErrorState message={error} onRetry={reload} />}
        <div role="grid" className={cx("grid grid-cols-7 gap-1", loading && !data && "animate-pulse")}>
          {WEEKDAYS.map((w) => (
            <div key={w} role="columnheader" className="pb-1 text-center text-xs font-semibold uppercase text-muted">
              {w}
            </div>
          ))}
          {days.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const games = byDay.get(k) ?? [];
            const sel = isSameDay(d, selected);
            const out = !isSameMonth(d, month);
            return (
              <button
                key={k}
                role="gridcell"
                aria-selected={sel}
                aria-label={`${format(d, "d 'de' MMMM", { locale: ptBR })}${games.length ? `, ${games.length} jogo(s)` : ""}`}
                onClick={() => setSelected(d)}
                className={cx(
                  "flex min-h-16 flex-col items-stretch gap-1 rounded-xl border p-1 text-left transition-colors sm:min-h-24 sm:p-1.5",
                  sel ? "border-ink bg-surface-2" : "border-transparent hover:bg-surface-2",
                  out && "opacity-40",
                )}
              >
                <span
                  className={cx(
                    "grid size-7 place-items-center self-start rounded-full text-sm",
                    isToday(d) ? "bg-gold font-bold text-[#1a160e]" : "text-ink",
                  )}
                >
                  {format(d, "d")}
                </span>
                {games.slice(0, 2).map((g) => (
                  <span
                    key={g.id}
                    className={cx(
                      "truncate rounded-md px-1 py-0.5 text-[11px] font-semibold",
                      g.status === "cancelado" ? "bg-danger-bg text-danger line-through" : "bg-confirma-bg text-confirma",
                    )}
                  >
                    <span className="sm:hidden">⚽</span>
                    <span className="hidden sm:inline">{timeOf(g.starts_at)} {g.field?.name ?? g.title}</span>
                  </span>
                ))}
                {games.length > 2 && <span className="text-[11px] text-muted">+{games.length - 2}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-live="polite" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold capitalize">{format(selected, "EEEE, d 'de' MMMM", { locale: ptBR })}</h2>
        {loading && !data ? (
          <Skeleton className="h-40" />
        ) : dayGames.length === 0 ? (
          <EmptyState
            title="Sem jogo neste dia"
            action={
              selected >= startOfDay(new Date()) ? (
                isOrganizer ? (
                  <LinkButton href={`/agenda/novo?date=${format(selected, "yyyy-MM-dd")}`} variant="primary" size="sm">
                    <Plus className="size-4" aria-hidden /> Marcar jogo neste dia
                  </LinkButton>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => onSuggest(format(selected, "yyyy-MM-dd"))}>
                    <Plus className="size-4" aria-hidden /> Sugerir jogo neste dia
                  </Button>
                )
              ) : undefined
            }
          >
            {!isOrganizer && "Tem um horário bom? Sugira: quem também quer dá +1, e um organizador aprova."}
          </EmptyState>
        ) : (
          dayGames.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              rsvps={data!.rsvps}
              userId={profile!.id}
              onRsvp={(s) => setData((prev) => prev && { ...prev, rsvps: applyRsvp(prev.rsvps, g.id, profile!.id, s) })}
            />
          ))
        )}
      </section>
    </div>
  );
}

function ListView() {
  const { profile, isOrganizer } = useSession();
  const [showPast, setShowPast] = useState(false);
  const { data, error, loading, reload, setData } = useLoad(
    () =>
      showPast
        ? loadGames({ to: new Date(), ascending: false, limit: 30 })
        : loadGames({ from: new Date(Date.now() - 3 * 3_600_000), limit: 50 }),
    [showPast],
  );

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <div className="flex items-center gap-2">
        <Segmented
          label="Período"
          size="sm"
          value={showPast ? "passados" : "proximos"}
          onChange={(v) => setShowPast(v === "passados")}
          options={[
            { value: "proximos", label: "Próximos" },
            { value: "passados", label: "Já aconteceram" },
          ]}
        />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)
      ) : data!.games.length === 0 ? (
        <EmptyState
          icon="📅"
          title={showPast ? "Nenhum jogo passado" : "Nenhum jogo marcado"}
          action={isOrganizer && !showPast ? <LinkButton href="/agenda/novo" variant="primary">Marcar jogo</LinkButton> : undefined}
        >
          {!showPast && (isOrganizer ? "Marque um jogo ou abra uma votação para a galera escolher o dia." : "Fique de olho: quando marcarem, aparece aqui.")}
        </EmptyState>
      ) : (
        groupByWeek(data!.games).map(([label, games]) => (
          <div key={label} className="flex flex-col gap-3">
            <h2 className="mt-2 text-sm font-semibold uppercase tracking-wide text-muted">{label}</h2>
            {games.map((g) => (
              <GameCard
                key={g.id}
                game={g}
                rsvps={data!.rsvps}
                userId={profile!.id}
                onRsvp={(s) => setData((prev) => prev && { ...prev, rsvps: applyRsvp(prev.rsvps, g.id, profile!.id, s) })}
              />
            ))}
          </div>
        ))
      )}
      <HelpTip>
        <p>Toque em <strong>Vou</strong>, <strong>Talvez</strong> ou <strong>Não vou</strong>. Tocar de novo no mesmo botão tira sua resposta.</p>
        <p>Só organizadores marcam jogos oficiais. Qualquer um pode <strong>sugerir</strong> um jogo (campo, dia e horário) em Sugestões, e o organizador aprova.</p>
      </HelpTip>
    </div>
  );
}

function groupByWeek(games: GameWithField[]): [string, GameWithField[]][] {
  const now = new Date();
  const groups = new Map<string, GameWithField[]>();
  for (const g of games) {
    const d = new Date(g.starts_at);
    const ws = startOfWeek(d, { weekStartsOn: 0 });
    const label =
      isSameDay(ws, startOfWeek(now, { weekStartsOn: 0 }))
        ? "Esta semana"
        : `Semana de ${format(ws, "d 'de' MMM", { locale: ptBR })}`;
    groups.set(label, [...(groups.get(label) ?? []), g]);
  }
  return [...groups.entries()];
}


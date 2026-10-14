"use client";

import Link from "next/link";
import { useState } from "react";
import { SuggestDialog } from "@/components/suggest-dialog";
import { CalendarPlus, CheckCircle2, Circle, Lightbulb, MapPinPlus, UserPlus, Vote } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { must, useLoad, useSession } from "@/components/session";
import { GameCard } from "@/components/game-card";
import { Button, Card, EmptyState, ErrorState, LinkButton, Skeleton } from "@/components/ui";
import { applyRsvp, loadGames } from "@/lib/queries";
import { fromNow } from "@/lib/format";
import { pollIsOpen } from "@/lib/polls";
import type { Poll } from "@/lib/types";

export default function InicioPage() {
  const { profile, isOrganizer } = useSession();
  const [suggesting, setSuggesting] = useState(false);
  const { data, error, loading, reload, setData } = useLoad(async () => {
    const sb = supabase();
    const [games, polls, votes, counts] = await Promise.all([
      loadGames({ from: new Date(Date.now() - 2 * 3_600_000), limit: 4 }),
      sb.from("polls").select("*").eq("closed", false).order("created_at", { ascending: false }),
      sb.from("poll_votes").select("poll_id").eq("user_id", profile!.id),
      Promise.all([
        sb.from("fields").select("id", { count: "exact", head: true }),
        sb.from("profiles").select("id", { count: "exact", head: true }),
        sb.from("suggestions").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      ]),
    ]);
    return {
      ...games,
      polls: (must(polls) as Poll[]).filter(pollIsOpen),
      votedPolls: new Set((must(votes) as { poll_id: string }[]).map((v) => v.poll_id)),
      fieldCount: counts[0].count ?? 0,
      memberCount: counts[1].count ?? 0,
      pendingSuggestions: counts[2].count ?? 0,
    };
  }, []);

  const first = profile!.name.split(" ")[0] || "craque";
  const upcoming = data?.games.filter((g) => g.status !== "cancelado") ?? [];
  const next = upcoming[0];
  const pendingPolls = data?.polls.filter((p) => !data.votedPolls.has(p.id)) ?? [];
  const onRsvp = (gameId: string) => (s: Parameters<typeof applyRsvp>[3]) =>
    setData((prev) => prev && { ...prev, rsvps: applyRsvp(prev.rsvps, gameId, profile!.id, s) });

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-widest text-gold-ink">Futebol da Missão · Goiânia</p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl">E aí, {first}!</h1>
        <p className="mt-2 text-lg text-muted">
          {loading && !data
            ? "Carregando…"
            : next
              ? `Próximo jogo ${fromNow(next.starts_at)}.`
              : "Nenhum jogo marcado por enquanto."}
          {pendingPolls.length > 0 && ` ${pendingPolls.length === 1 ? "Uma votação espera" : `${pendingPolls.length} votações esperam`} seu voto.`}
        </p>
      </header>

      {error && <ErrorState message={error} onRetry={reload} />}

      {data && (isOrganizer ? (
        data.pendingSuggestions > 0 && (
          <Link href="/sugestoes" className="flex items-center gap-3 rounded-2xl border border-gold/60 bg-talvez-bg/60 p-4 hover:border-gold">
            <Lightbulb className="size-6 shrink-0 text-gold-ink" aria-hidden />
            <span className="flex-1">
              <strong>{data.pendingSuggestions} {data.pendingSuggestions === 1 ? "sugestão espera" : "sugestões esperam"} sua aprovação.</strong>
              <span className="block text-sm text-muted">Veja quais campos e horários a galera mais quer.</span>
            </span>
            <span className="text-sm font-semibold text-gold-ink">Ver →</span>
          </Link>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <Lightbulb className="size-6 shrink-0 text-gold-ink" aria-hidden />
          <span className="min-w-48 flex-1">
            <strong>Tem um campo ou horário bom?</strong>
            <span className="block text-sm text-muted">Sugira. Quem também quer dá +1, e um organizador aprova.</span>
          </span>
          <Button variant="primary" size="sm" onClick={() => setSuggesting(true)}>Sugerir jogo</Button>
          <LinkButton href="/sugestoes" size="sm" variant="ghost">Ver sugestões{data.pendingSuggestions ? ` (${data.pendingSuggestions})` : ""}</LinkButton>
        </div>
      ))}
      <SuggestDialog open={suggesting} onClose={() => setSuggesting(false)} onDone={reload} />

      {isOrganizer && data && (data.fieldCount === 0 || data.memberCount <= 1 || data.games.length === 0) && (
        <Card className="border-gold/60">
          <h2 className="text-lg font-bold">Comece por aqui</h2>
          <p className="mb-3 text-sm text-muted">Três passos para tirar o futebol do WhatsApp:</p>
          <ol className="flex flex-col gap-2">
            <Step done={data.fieldCount > 0} href="/campos/novo" icon={MapPinPlus}>Cadastre os campos que vocês costumam alugar</Step>
            <Step done={data.memberCount > 1} href="/pessoas" icon={UserPlus}>Convide a galera pelo email</Step>
            <Step done={data.games.length > 0} href="/votacoes/nova" icon={Vote}>Abra uma votação de dia ou marque o primeiro jogo</Step>
          </ol>
        </Card>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="proximo" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 id="proximo" className="text-xl font-bold">Próximos jogos</h2>
            <Link href="/agenda" className="text-sm font-medium text-gold-ink hover:underline">Ver agenda →</Link>
          </div>
          {loading && !data ? (
            <Skeleton className="h-44" />
          ) : data && data.games.length === 0 ? (
            <EmptyState
              icon="⚽"
              title="Nenhum jogo marcado"
              action={isOrganizer ? <LinkButton href="/agenda/novo" variant="primary"><CalendarPlus className="size-4" aria-hidden /> Marcar jogo</LinkButton> : undefined}
            >
              {isOrganizer ? "Marque um jogo ou abra uma votação para decidir o dia." : "Quando um organizador marcar, aparece aqui para você confirmar."}
            </EmptyState>
          ) : (
            data?.games.map((g) => <GameCard key={g.id} game={g} rsvps={data.rsvps} userId={profile!.id} onRsvp={onRsvp(g.id)} />)
          )}
        </section>

        <section aria-labelledby="votacoes" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 id="votacoes" className="text-xl font-bold">Votações abertas</h2>
            <Link href="/votacoes" className="text-sm font-medium text-gold-ink hover:underline">Ver todas →</Link>
          </div>
          {loading && !data ? (
            <Skeleton className="h-24" />
          ) : !data?.polls.length ? (
            <p className="rounded-2xl border border-dashed border-line p-5 text-muted">
              Nenhuma votação aberta.{isOrganizer && <> <Link className="underline" href="/votacoes/nova">Criar uma</Link>.</>}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.polls.map((p) => {
                const voted = data.votedPolls.has(p.id);
                return (
                  <li key={p.id}>
                    <Link href={`/votacoes/${p.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-ink/40">
                      {voted ? <CheckCircle2 className="size-5 shrink-0 text-confirma" aria-label="Você votou" /> : <Circle className="size-5 shrink-0 text-gold-ink" aria-label="Falta votar" />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{p.question}</span>
                        <span className="text-sm text-muted">{voted ? "Você já votou" : "Falta seu voto"}{p.closes_at && ` · encerra ${fromNow(p.closes_at)}`}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Step({ done, href, icon: Icon, children }: { done: boolean; href: string; icon: typeof Vote; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
        {done ? <CheckCircle2 className="size-5 text-confirma" aria-label="Feito" /> : <Icon className="size-5 text-muted" aria-hidden />}
        <span className={done ? "text-muted line-through" : "font-medium"}>{children}</span>
      </Link>
    </li>
  );
}

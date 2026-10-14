"use client";

import Link from "next/link";
import { CheckCircle2, Plus } from "lucide-react";
import { KIND_META, pollIsOpen } from "@/lib/polls";
import { FlowSteps } from "@/components/flow-steps";
import { supabase } from "@/lib/supabase/client";
import { must, useLoad, useSession } from "@/components/session";
import { Badge, EmptyState, ErrorState, HelpTip, LinkButton, PageHeader, Skeleton } from "@/components/ui";
import { fromNow } from "@/lib/format";
import type { Poll, PollVote } from "@/lib/types";

export default function VotacoesPage() {
  const { profile, isOrganizer } = useSession();
  const { data, error, loading, reload } = useLoad(async () => {
    const sb = supabase();
    const [polls, votes] = await Promise.all([
      sb.from("polls").select("*").order("created_at", { ascending: false }).limit(60),
      sb.from("poll_votes").select("poll_id,user_id"),
    ]);
    return { polls: must(polls) as Poll[], votes: must(votes) as Pick<PollVote, "poll_id" | "user_id">[] };
  }, []);

  const open = data?.polls.filter(pollIsOpen) ?? [];
  const closed = data?.polls.filter((p) => !pollIsOpen(p)) ?? [];

  return (
    <>
      <PageHeader
        title="Votações"
        subtitle="Quando tem dúvida de campo ou horário, a galera vota. O vencedor vira jogo oficial."
        actions={
          isOrganizer && (
            <LinkButton href="/votacoes/nova" variant="primary" title="Atalho: n">
              <Plus className="size-4" aria-hidden /> Nova votação
            </LinkButton>
          )
        }
      />
      <FlowSteps current="votacao" />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : data!.polls.length === 0 ? (
        <EmptyState
          icon="🗳️"
          title="Nenhuma votação ainda"
          action={isOrganizer ? <LinkButton href="/votacoes/nova" variant="primary">Criar a primeira</LinkButton> : undefined}
        >
          {isOrganizer ? "Pergunte qual dia ou qual campo a galera prefere." : "Quando um organizador abrir uma votação, aparece aqui."}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          <Section title={`Abertas (${open.length})`} polls={open} votes={data!.votes} me={profile!.id} empty="Nenhuma votação aberta agora." />
          {closed.length > 0 && <Section title="Encerradas" polls={closed} votes={data!.votes} me={profile!.id} />}
        </div>
      )}
      <div className="mt-8">
        <HelpTip>
          <p>Entre na votação e toque nas opções. Em algumas dá para escolher mais de uma (ex.: todos os dias que você pode).</p>
          <p>Mudou de ideia? Toque de novo para tirar o voto enquanto a votação estiver aberta.</p>
          <p>Quando encerrar, o organizador pode marcar o jogo direto com a opção vencedora.</p>
        </HelpTip>
      </div>
    </>
  );
}

function Section({
  title,
  polls,
  votes,
  me,
  empty,
}: {
  title: string;
  polls: Poll[];
  votes: Pick<PollVote, "poll_id" | "user_id">[];
  me: string;
  empty?: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {polls.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {polls.map((p) => {
            const pv = votes.filter((v) => v.poll_id === p.id);
            const voters = new Set(pv.map((v) => v.user_id)).size;
            const voted = pv.some((v) => v.user_id === me);
            const isOpen = pollIsOpen(p);
            const Icon = KIND_META[p.kind].icon;
            return (
              <li key={p.id}>
                <Link href={`/votacoes/${p.id}`} className="flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-ink/40">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>
                      <Icon className="size-3.5" aria-hidden /> {KIND_META[p.kind].label}
                    </Badge>
                    {isOpen && !voted && <Badge tone="gold">Falta seu voto</Badge>}
                    {voted && (
                      <Badge tone="green">
                        <CheckCircle2 className="size-3.5" aria-hidden /> Você votou
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold">{p.question}</h3>
                  <p className="mt-auto text-sm text-muted">
                    {voters} {voters === 1 ? "pessoa votou" : "pessoas votaram"} ·{" "}
                    {isOpen ? (p.closes_at ? `encerra ${fromNow(p.closes_at)}` : "aberta") : "encerrada"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

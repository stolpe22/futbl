"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase/client";
import { must, useLoad, useSession } from "@/components/session";
import { GameForm } from "@/components/game-form";
import { Button, EmptyState, ErrorState, PageHeader, Spinner } from "@/components/ui";
import { SuggestDialog } from "@/components/suggest-dialog";
import type { FieldRow, Game } from "@/lib/types";

export default function NovoJogoPage() {
  return (
    <>
      <PageHeader back={{ href: "/agenda", label: "Agenda" }} title="Marcar jogo" subtitle="A galera recebe na agenda e confirma presença." />
      <Suspense fallback={<Spinner />}>
        <NovoJogo />
      </Suspense>
    </>
  );
}

function NovoJogo() {
  const params = useSearchParams();
  const query = params.toString();
  // O Next guarda esta tela escondida na memória (Activity). Cada vez que ela aparece,
  // o efeito roda de novo: o formulário começa limpo e a lista é recarregada.
  const [visit, setVisit] = useState(0);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- conta cada vez que a tela aparece
  useEffect(() => setVisit((n) => n + 1), []);
  const { isOrganizer } = useSession();
  const [suggesting, setSuggesting] = useState(false);
  const { data, error, reload } = useLoad(async () => {
    const sb = supabase();
    const [fields, games] = await Promise.all([
      sb.from("fields").select("*").order("name"),
      sb.from("games").select("*").gte("starts_at", new Date(Date.now() - 86_400_000).toISOString()),
    ]);
    return { fields: must(fields) as FieldRow[], games: must(games) as Game[] };
  }, [query, visit]);

  if (!isOrganizer)
    return (
      <>
        <EmptyState
          icon="💡"
          title="Jogo oficial só o organizador marca"
          action={<Button variant="primary" onClick={() => setSuggesting(true)}>Sugerir este jogo</Button>}
        >
          Mas você pode sugerir: escolha campo, dia e horário. Quem também quer dá +1, e um organizador aprova.
        </EmptyState>
        <SuggestDialog
          open={suggesting}
          onClose={() => setSuggesting(false)}
          fieldId={params.get("field_id") ?? undefined}
          date={params.get("date") ?? undefined}
        />
      </>
    );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data || !visit) return <Spinner />;

  // vindo de uma votação: ?starts_at=ISO ; vindo de um campo: ?field_id=
  const startsAt = params.get("starts_at");
  const d = startsAt ? new Date(startsAt) : null;
  return (
    <GameForm
      key={`${query}#${visit}`}
      fields={data.fields}
      otherGames={data.games}
      prefill={{
        field_id: params.get("field_id") ?? undefined,
        suggestionId: params.get("sugestao") ?? undefined,
        date: d ? format(d, "yyyy-MM-dd") : (params.get("date") ?? undefined),
        time: d ? format(d, "HH:mm") : undefined,
      }}
    />
  );
}

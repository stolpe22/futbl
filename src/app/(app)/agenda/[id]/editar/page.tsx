"use client";

import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { must, useLoad, useSession } from "@/components/session";
import { GameForm } from "@/components/game-form";
import { ErrorState, PageHeader, Spinner } from "@/components/ui";
import type { FieldRow, Game } from "@/lib/types";

export default function EditarJogoPage() {
  const { id } = useParams<{ id: string }>();
  const { isOrganizer } = useSession();
  const { data, error, loading, reload } = useLoad(async () => {
    const sb = supabase();
    const [fields, game] = await Promise.all([
      sb.from("fields").select("*").order("name"),
      sb.from("games").select("*").eq("id", id).maybeSingle(),
    ]);
    const g = must(game) as Game | null;
    const others = g
      ? must(await sb.from("games").select("*").gte("starts_at", new Date(new Date(g.starts_at).getTime() - 86_400_000 * 2).toISOString()).lte("starts_at", new Date(new Date(g.starts_at).getTime() + 86_400_000 * 2).toISOString()))
      : [];
    return { fields: must(fields) as FieldRow[], game: g, others: others as Game[] };
  }, [id]);

  if (!isOrganizer) return <ErrorState message="Só organizadores podem editar jogos." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;
  if (!data?.game) return <ErrorState message="Esse jogo não existe mais. Ele pode ter sido apagado." />;

  return (
    <>
      <PageHeader back={{ href: `/agenda/${id}`, label: data.game.title }} title="Editar jogo" />
      <GameForm initial={data.game} fields={data.fields} otherGames={data.others} />
    </>
  );
}

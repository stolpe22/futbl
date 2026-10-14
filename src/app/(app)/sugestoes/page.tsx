"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, CalendarDays, Check, MapPin, Plus, ThumbsUp, Trophy, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { must, useLoad, useSession } from "@/components/session";
import { SuggestDialog } from "@/components/suggest-dialog";
import { FlowSteps } from "@/components/flow-steps";
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, HelpTip, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { brl, dateTimeShort, fromNow } from "@/lib/format";
import type { FieldRow, Profile, Suggestion, SuggestionSupport } from "@/lib/types";

type Data = {
  suggestions: Suggestion[];
  supports: SuggestionSupport[];
  fields: Pick<FieldRow, "id" | "name" | "address" | "price_per_hour">[];
  people: Pick<Profile, "id" | "name" | "email">[];
};

export default function SugestoesPage() {
  const router = useRouter();
  const { profile, isOrganizer } = useSession();
  const [tab, setTab] = useState<"pendentes" | "decididas">("pendentes");
  const [dialog, setDialog] = useState<null | "jogo" | "campo">(null);
  const [refusing, setRefusing] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rankKey, setRankKey] = useState(0);

  const { data, error, loading, reload, setData } = useLoad<Data>(async () => {
    const sb = supabase();
    const [s, sp, f, p] = await Promise.all([
      sb.from("suggestions").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("suggestion_supports").select("*"),
      sb.from("fields").select("id,name,address,price_per_hour"),
      sb.from("profiles").select("id,name,email"),
    ]);
    return { suggestions: must(s), supports: must(sp), fields: must(f), people: must(p) } as Data;
  }, []);

  // apoios ao vivo
  useEffect(() => {
    const sb = supabase();
    const ch = sb
      .channel("sugestoes")
      .on("postgres_changes", { event: "*", schema: "public", table: "suggestion_supports" }, () => {
        reload();
        setRankKey((k) => k + 1);
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [reload]);

  const me = profile!.id;
  const supportersOf = (id: string) => data?.supports.filter((s) => s.suggestion_id === id) ?? [];
  const nameOf = (uid: string | null) => data?.people.find((p) => p.id === uid)?.name || "Alguém";
  const fieldOf = (id: string) => data?.fields.find((f) => f.id === id);

  const pending = useMemo(
    () =>
      (data?.suggestions ?? [])
        .filter((s) => s.status === "pendente")
        .sort((a, b) => supportersOf(b.id).length - supportersOf(a.id).length || b.created_at.localeCompare(a.created_at)),
    [data], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const decided = (data?.suggestions ?? []).filter((s) => s.status !== "pendente");

  async function toggleSupport(s: Suggestion) {
    const sb = supabase();
    const mine = supportersOf(s.id).some((x) => x.user_id === me);
    const prev = data!.supports;
    setData((d) =>
      d && {
        ...d,
        supports: mine
          ? d.supports.filter((x) => !(x.suggestion_id === s.id && x.user_id === me))
          : [...d.supports, { suggestion_id: s.id, user_id: me, created_at: new Date().toISOString() }],
      },
    );
    const { error } = mine
      ? await sb.from("suggestion_supports").delete().eq("suggestion_id", s.id).eq("user_id", me)
      : await sb.from("suggestion_supports").insert({ suggestion_id: s.id });
    if (error) {
      setData((d) => d && { ...d, supports: prev });
      toast.error(friendlyError(error));
    }
    setRankKey((k) => k + 1);
  }

  async function approve(s: Suggestion) {
    // só o campo: o organizador escolhe dia e hora no "Marcar jogo"
    if (!s.starts_at) {
      router.push(`/agenda/novo?field_id=${s.field_id}&sugestao=${s.id}`);
      return;
    }
    setBusy(s.id);
    const sb = supabase();
    const { data: game, error } = await sb
      .from("games")
      .insert({ title: "Futebol", starts_at: s.starts_at, duration_min: s.duration_min, field_id: s.field_id })
      .select("id")
      .single();
    if (error) {
      setBusy(null);
      return toast.error(friendlyError(error));
    }
    const { error: e2 } = await sb
      .from("suggestions")
      .update({ status: "aprovada", game_id: game.id, decided_by: me, decided_at: new Date().toISOString() })
      .eq("id", s.id);
    setBusy(null);
    if (e2) return toast.error(friendlyError(e2));
    reload();
    toast.success("Aprovado! O jogo oficial já está na agenda e a galera pode confirmar presença.", {
      action: { label: "Ver jogo", onClick: () => router.push(`/agenda/${game.id}`) },
    });
  }

  async function refuse(s: Suggestion) {
    setBusy(s.id);
    const sb = supabase();
    const { error } = await sb
      .from("suggestions")
      .update({ status: "recusada", decided_by: me, decided_at: new Date().toISOString() })
      .eq("id", s.id);
    setBusy(null);
    setRefusing(null);
    if (error) return toast.error(friendlyError(error));
    reload();
    toast("Sugestão recusada.", {
      action: {
        label: "Desfazer",
        onClick: async () => {
          const { error } = await sb.from("suggestions").update({ status: "pendente", decided_by: null, decided_at: null }).eq("id", s.id);
          if (error) toast.error(friendlyError(error));
          reload();
        },
      },
    });
  }

  async function withdraw(s: Suggestion) {
    const { error } = await supabase().from("suggestions").delete().eq("id", s.id);
    if (error) return toast.error(friendlyError(error));
    reload();
    setRankKey((k) => k + 1);
    toast.success("Sugestão retirada.");
  }

  return (
    <>
      <PageHeader
        title="Sugestões"
        subtitle="Qualquer um sugere campo e horário. Quem também quer dá +1, e um organizador aprova: aí vira jogo oficial."
        actions={
          <>
            <Button variant="primary" onClick={() => setDialog("jogo")}>
              <Plus className="size-4" aria-hidden /> Sugerir jogo
            </Button>
            <Button onClick={() => setDialog("campo")}>
              <MapPin className="size-4" aria-hidden /> Sugerir campo
            </Button>
          </>
        }
      />

      <FlowSteps current="sugestao" />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <section className="flex min-w-0 flex-col gap-3" aria-label="Sugestões">
            <Segmented
              label="Quais sugestões"
              value={tab}
              onChange={setTab}
              options={[
                { value: "pendentes", label: `Esperando aprovação (${pending.length})` },
                { value: "decididas", label: "Decididas" },
              ]}
            />
            {loading && !data ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)
            ) : tab === "pendentes" ? (
              pending.length === 0 ? (
                <EmptyState
                  icon="💡"
                  title="Nenhuma sugestão esperando"
                  action={<Button variant="primary" onClick={() => setDialog("jogo")}>Sugerir um jogo</Button>}
                >
                  Tem um campo bom ou um horário que funciona pra você? Sugira e chame a galera pra dar +1.
                </EmptyState>
              ) : (
                pending.map((s) => {
                  const sup = supportersOf(s.id);
                  const mine = sup.some((x) => x.user_id === me);
                  const f = fieldOf(s.field_id);
                  return (
                    <Card key={s.id} className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {s.starts_at ? (
                              <Badge tone="green"><CalendarDays className="size-3.5" aria-hidden /> Jogo</Badge>
                            ) : (
                              <Badge><MapPin className="size-3.5" aria-hidden /> Só o campo</Badge>
                            )}
                            {s.starts_at && <span className="text-sm font-semibold capitalize">{dateTimeShort(s.starts_at)} · {s.duration_min} min</span>}
                          </div>
                          <h2 className="mt-1 text-lg font-semibold">
                            {f ? <Link href={`/campos/${f.id}`} className="hover:underline">{f.name}</Link> : "Campo apagado"}
                          </h2>
                          {f?.price_per_hour != null && <p className="text-sm text-muted">{brl(f.price_per_hour)}/h</p>}
                        </div>
                        <div className="shrink-0 text-center">
                          <p className="text-2xl font-bold leading-none">{sup.length}</p>
                          <p className="text-xs text-muted">{sup.length === 1 ? "quer" : "querem"}</p>
                        </div>
                      </div>
                      {s.note && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">“{s.note}”</p>}
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <span className="flex -space-x-1.5">
                          {sup.slice(0, 8).map((x) => <Avatar key={x.user_id} name={nameOf(x.user_id)} size={24} />)}
                        </span>
                        <span>Sugerido por {nameOf(s.created_by)} {fromNow(s.created_at)}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant={mine ? "secondary" : "primary"} onClick={() => toggleSupport(s)} aria-pressed={mine} title={mine ? "Toque de novo para tirar seu +1" : "Diga que você também quer esse jogo"}>
                          {mine ? <Check className="size-4" aria-hidden /> : <ThumbsUp className="size-4" aria-hidden />}
                          {mine ? "Você também quer" : "Eu também quero (+1)"}
                        </Button>
                        {isOrganizer && (
                          <>
                            <Button size="sm" variant="primary" onClick={() => approve(s)} loading={busy === s.id} className="bg-confirma text-white hover:bg-confirma hover:opacity-90">
                              <CalendarCheck className="size-4" aria-hidden /> {s.starts_at ? "Aprovar e marcar jogo" : "Aprovar e escolher horário"}
                            </Button>
                            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRefusing(s)}>
                              <X className="size-4" aria-hidden /> Recusar
                            </Button>
                          </>
                        )}
                        {!isOrganizer && s.created_by === me && (
                          <Button size="sm" variant="ghost" onClick={() => withdraw(s)}>Retirar minha sugestão</Button>
                        )}
                      </div>
                    </Card>
                  );
                })
              )
            ) : decided.length === 0 ? (
              <p className="text-muted">Nenhuma sugestão decidida ainda.</p>
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {decided.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 p-3.5">
                    <Badge tone={s.status === "aprovada" ? "green" : "red"}>{s.status === "aprovada" ? "Aprovada" : "Recusada"}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{fieldOf(s.field_id)?.name ?? "Campo apagado"}</p>
                      <p className="text-xs text-muted">
                        {s.starts_at ? dateTimeShort(s.starts_at) : "Só o campo"} · {supportersOf(s.id).length} queria(m) · decidida por {nameOf(s.decided_by)}
                      </p>
                    </div>
                    {s.game_id && <Link href={`/agenda/${s.game_id}`} className="text-sm font-semibold text-gold-ink hover:underline">Ver jogo →</Link>}
                  </li>
                ))}
              </ul>
            )}
            <HelpTip>
              <p><strong>Sugerir jogo:</strong> escolha campo, dia e horário. <strong>Sugerir campo:</strong> só diz que quer jogar naquele lugar.</p>
              <p>Se alguém já sugeriu a mesma coisa, sua sugestão vira um “eu também quero” (+1). Assim nada se repete.</p>
              <p>Um organizador aprova e o jogo vira <strong>oficial</strong> na Agenda, onde todo mundo confirma “Vou / Não vou”.</p>
            </HelpTip>
          </section>

          <aside>
            <FieldRanking refreshKey={rankKey} />
          </aside>
        </div>
      )}

      <SuggestDialog open={!!dialog} defaultKind={dialog ?? "jogo"} onClose={() => setDialog(null)} onDone={() => { reload(); setRankKey((k) => k + 1); }} />
      <ConfirmDialog
        open={!!refusing}
        title="Recusar esta sugestão?"
        message={`Ela sai da lista de pendentes${refusing ? ` (${supportersOf(refusing.id).length} pessoa(s) queriam)` : ""}. Dá para desfazer logo depois.`}
        confirmLabel="Recusar"
        onConfirm={() => refusing && refuse(refusing)}
        onCancel={() => setRefusing(null)}
        loading={!!refusing && busy === refusing.id}
      />
    </>
  );
}

/** Ranking dos campos mais sugeridos: uma série, barras horizontais, número escrito ao lado */
function FieldRanking({ refreshKey }: { refreshKey: number }) {
  const [days, setDays] = useState("90");
  const { data, error, loading, reload } = useLoad(
    async () =>
      must(await supabase().rpc("field_ranking", { p_days: Number(days) })) as {
        field_id: string;
        name: string;
        people: number;
        suggestions: number;
        last_at: string;
      }[],
    [days, refreshKey],
  );
  const max = Math.max(1, ...(data ?? []).map((r) => r.people));

  return (
    <Card className="lg:sticky lg:top-20">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Trophy className="size-5 text-gold-ink" aria-hidden /> Campos mais sugeridos
        </h2>
      </div>
      <p className="mb-3 text-sm text-muted">Pessoas diferentes que sugeriram ou deram +1 em cada campo.</p>
      <Segmented
        label="Período"
        size="sm"
        value={days}
        onChange={setDays}
        options={[
          { value: "30", label: "30 dias" },
          { value: "90", label: "90 dias" },
          { value: "365", label: "1 ano" },
        ]}
      />
      <div className="mt-4">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <Skeleton className="h-40" />
        ) : !data?.length ? (
          <p className="text-sm text-muted">Ninguém sugeriu campos nesse período ainda.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {data.map((r, i) => (
              <li
                key={r.field_id}
                className="group"
                title={`${r.name}: ${r.people} ${r.people === 1 ? "pessoa" : "pessoas"}, ${r.suggestions} ${r.suggestions === 1 ? "sugestão" : "sugestões"}, última ${fromNow(r.last_at)}`}
              >
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <Link href={`/campos/${r.field_id}`} className="min-w-0 truncate font-medium group-hover:underline">
                    <span className="mr-1.5 text-muted tabular-nums">{i + 1}.</span>
                    {r.name}
                  </Link>
                  <span className="shrink-0 tabular-nums text-muted">
                    <strong className="text-ink">{r.people}</strong> {r.people === 1 ? "pessoa" : "pessoas"}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-2" aria-hidden>
                  <div className="h-2 rounded-full bg-gold" style={{ width: `${(r.people / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

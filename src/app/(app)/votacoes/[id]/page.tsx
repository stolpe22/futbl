"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Camera, Check, ChevronRight, LocateFixed, Lock, MapPin, Navigation, Share2, Trash2, Trophy, Unlock } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { must, useLoad, useSession } from "@/components/session";
import { FieldsMap } from "@/components/map";
import { PlacePhoto, mapsPlaceUrl } from "@/components/field-photo";
import { Avatar, Badge, Button, Card, ConfirmDialog, ErrorState, LinkButton, PageHeader, Spinner, cx } from "@/components/ui";
import { brl, directionsUrl, fromNow, shareWhatsappUrl } from "@/lib/format";
import { KIND_META, groupIsSingle, groupOf, pollIsOpen } from "@/lib/polls";
import type { FieldRow, Poll, PollOption, PollVote, Profile } from "@/lib/types";

type Data = { poll: Poll; options: PollOption[]; votes: PollVote[]; members: Profile[]; fields: FieldRow[] };
type SummaryRow = { title: string; leaders: PollOption[]; votes: number; of: number };
type LatLng = { lat: number; lng: number };

/** Distância em linha reta, em km */
function km(a: LatLng, b: LatLng) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const kmLabel = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m de você` : `${d.toFixed(d < 10 ? 1 : 0).replace(".", ",")} km de você`);

export default function VotacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile, isOrganizer } = useSession();
  const [busyOption, setBusyOption] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "encerrar" | "apagar">(null);
  const [busy, setBusy] = useState(false);
  const [mapField, setMapField] = useState<string | null>(null);
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [savedHint, setSavedHint] = useState(false);

  const { data, error, loading, reload, setData } = useLoad<Data | null>(async () => {
    const sb = supabase();
    const poll = must(await sb.from("polls").select("*").eq("id", id).maybeSingle()) as Poll | null;
    if (!poll) return null;
    const [options, votes, members] = await Promise.all([
      sb.from("poll_options").select("*").eq("poll_id", id).order("position"),
      sb.from("poll_votes").select("*").eq("poll_id", id),
      sb.from("profiles").select("*").eq("active", true).order("name"),
    ]);
    const opts = must(options) as PollOption[];
    const fieldIds = opts.map((o) => o.field_id).filter((x): x is string => !!x);
    const fields = fieldIds.length ? (must(await sb.from("fields").select("*").in("id", fieldIds)) as FieldRow[]) : [];
    return { poll, options: opts, votes: must(votes) as PollVote[], members: must(members) as Profile[], fields };
  }, [id]);

  // votos ao vivo
  useEffect(() => {
    const sb = supabase();
    const ch = sb
      .channel(`votes-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "poll_votes", filter: `poll_id=eq.${id}` }, async () => {
        const { data: vs } = await sb.from("poll_votes").select("*").eq("poll_id", id);
        if (vs) setData((prev) => prev && { ...prev, votes: vs as PollVote[] });
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [id, setData]);

  const mapFields = useMemo(() => data?.fields ?? [], [data?.fields]);
  const fitTo = useMemo(() => (mapFields.length > 1 ? mapFields.map((f) => ({ lat: f.lat, lng: f.lng })) : null), [mapFields]);
  const focusField = mapFields.find((f) => f.id === mapField);
  const focus = useMemo(
    () => (focusField ? { lat: focusField.lat, lng: focusField.lng, zoom: 15 } : mapFields.length === 1 ? { lat: mapFields[0].lat, lng: mapFields[0].lng, zoom: 14 } : null),
    [focusField, mapFields],
  );

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorState message="Essa votação não existe mais. Ela pode ter sido apagada." />;

  const { poll, options, votes, members, fields } = data;
  const me = profile!.id;
  const open = pollIsOpen(poll);
  const voters = new Set(votes.map((v) => v.user_id));
  const myVotes = new Set(votes.filter((v) => v.user_id === me).map((v) => v.option_id));
  const counts = new Map(options.map((o) => [o.id, votes.filter((v) => v.option_id === o.id).length]));
  const pending = members.filter((m) => !voters.has(m.id));
  const nameOf = (uid: string) => members.find((m) => m.id === uid)?.name || "Alguém";
  const KindIcon = KIND_META[poll.kind].icon;

  const mainOpts = options.filter((o) => !o.question);
  const fieldOpts = mainOpts.filter((o) => o.field_id);
  const otherOpts = mainOpts.filter((o) => !o.field_id);
  // perguntas extras no fim, na ordem em que foram criadas
  const extras = [...new Set(options.filter((o) => o.question).map((o) => o.question!))].map((q) => ({
    question: q,
    options: options.filter((o) => o.question === q),
  }));
  const fieldOf = (o: PollOption) => fields.find((f) => f.id === o.field_id);
  // em "Campo e horário", pergunta com uma opção só já vem escolhida (não há o que decidir)
  const onlyField = poll.kind === "jogo" && fieldOpts.length === 1 ? fieldOpts[0] : null;
  const onlyTime = poll.kind === "jogo" && otherOpts.length === 1 ? otherOpts[0] : null;
  const pickedField = !!onlyField || fieldOpts.some((o) => myVotes.has(o.id));
  const needField = poll.kind === "jogo" && open && !pickedField;

  /** % dentro do grupo: entre quem votou naquela pergunta */
  const groupVoters = (list: PollOption[]) => new Set(votes.filter((v) => list.some((o) => o.id === v.option_id)).map((v) => v.user_id)).size;
  const winnersOf = (list: PollOption[]) => {
    const max = Math.max(0, ...list.map((o) => counts.get(o.id) ?? 0));
    return max > 0 ? list.filter((o) => counts.get(o.id) === max) : [];
  };
  const fieldWinners = winnersOf(fieldOpts);
  const otherWinners = winnersOf(otherOpts);

  // "Como está até agora": quem lidera em cada pergunta
  const summary: SummaryRow[] = [];
  if (fieldOpts.length) summary.push({ title: "Campo", leaders: fieldWinners, votes: (fieldWinners[0] && counts.get(fieldWinners[0].id)) || 0, of: groupVoters(fieldOpts) });
  if (otherOpts.length)
    summary.push({
      title: poll.kind === "jogo" ? "Horário" : poll.kind === "data" ? "Dia e horário" : poll.question,
      leaders: otherWinners,
      votes: (otherWinners[0] && counts.get(otherWinners[0].id)) || 0,
      of: groupVoters(otherOpts),
    });
  extras.forEach((x) => {
    const w = winnersOf(x.options);
    summary.push({ title: x.question, leaders: w, votes: (w[0] && counts.get(w[0].id)) || 0, of: groupVoters(x.options) });
  });

  async function toggle(opt: PollOption) {
    if (!open) return;
    if (poll.kind === "jogo" && !opt.question && !opt.field_id && !pickedField) {
      toast("Escolha o campo primeiro. Depois, os horários.");
      return;
    }
    // a opção única da outra pergunta entra junto (ex.: só um campo → escolher horário já vota nele)
    const companion =
      poll.kind === "jogo" && !opt.question
        ? opt.field_id
          ? onlyTime
          : onlyField
        : null;
    const had = myVotes.has(opt.id);
    // opção única não se desmarca: ela é a própria decisão
    if (had && (opt.id === onlyField?.id || opt.id === onlyTime?.id)) return;
    setBusyOption(opt.id);
    const sb = supabase();
    const prevVotes = votes;
    const group = groupOf(poll, opt);
    const single = groupIsSingle(poll, group);
    const sameGroup = (optionId: string) => {
      const o = options.find((x) => x.id === optionId);
      return !!o && groupOf(poll, o) === group;
    };
    const extra = !had && companion && !myVotes.has(companion.id) ? [companion] : [];
    const stamp = new Date().toISOString();
    // otimista
    setData((p) =>
      p && {
        ...p,
        votes: had
          ? p.votes.filter((v) => !(v.option_id === opt.id && v.user_id === me))
          : [
              ...p.votes.filter((v) => !(single && v.user_id === me && sameGroup(v.option_id))),
              ...[opt, ...extra].map((o) => ({ option_id: o.id, poll_id: poll.id, user_id: me, created_at: stamp })),
            ],
      },
    );
    let error: unknown = null;
    if (had) {
      ({ error } = await sb.from("poll_votes").delete().eq("option_id", opt.id).eq("user_id", me));
    } else {
      for (const o of [...extra, opt]) {
        ({ error } = await sb.from("poll_votes").insert({ option_id: o.id, poll_id: poll.id }));
        if (error) break;
      }
    }
    setBusyOption(null);
    if (error) {
      setData((p) => p && { ...p, votes: prevVotes });
      toast.error(friendlyError(error));
      return;
    }
    // avisa que já salvou (heurística 1): não existe botão "enviar"
    toast.success(had ? "Voto tirado. Já está salvo." : "Voto salvo.", {
      description: savedHint ? undefined : "Não precisa apertar mais nada: cada toque já salva. Pode voltar quando quiser.",
      duration: savedHint ? 1800 : 4500,
    });
    setSavedHint(true);
    if (!had && poll.kind === "jogo" && !opt.question && opt.field_id && !fieldOpts.some((o) => myVotes.has(o.id)) && !onlyTime) {
      setTimeout(() => document.getElementById("horarios")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }

  function locateMe() {
    if (!navigator.geolocation) return toast.error("Este aparelho não informa a localização.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        setLocating(false);
        toast.error("Não deu para pegar sua localização. Libere a permissão de localização no navegador e tente de novo.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  async function setClosed(closed: boolean) {
    setBusy(true);
    const patch = closed ? { closed: true } : { closed: false, closes_at: null };
    const { error } = await supabase().from("polls").update(patch).eq("id", poll.id);
    setBusy(false);
    setConfirm(null);
    if (error) return toast.error(friendlyError(error));
    setData((p) => p && { ...p, poll: { ...p.poll, ...patch } });
    toast.success(closed ? "Votação encerrada." : "Votação reaberta.", {
      action: closed ? { label: "Desfazer", onClick: () => setClosed(false) } : undefined,
    });
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase().from("polls").delete().eq("id", poll.id);
    setBusy(false);
    setConfirm(null);
    if (error) return toast.error(friendlyError(error));
    toast.success("Votação apagada.");
    router.push("/votacoes");
  }

  function gameHref(field?: PollOption, time?: PollOption) {
    const p = new URLSearchParams();
    const startsAt = time?.starts_at ?? field?.starts_at;
    if (startsAt) p.set("starts_at", startsAt);
    if (field?.field_id) p.set("field_id", field.field_id);
    return `/agenda/novo?${p}`;
  }

  // combinações vencedoras para "Marcar jogo" (com empate, mostra cada uma)
  type Combo = { key: string; label: string; href: string; startsAt?: string | null; fieldId?: string | null };
  const combos: Combo[] =
    poll.kind === "jogo"
      ? fieldWinners.flatMap((f) =>
          (otherWinners.length ? otherWinners : [undefined]).map((t) => ({
            key: `${f.id}-${t?.id ?? ""}`,
            label: t ? `${f.label}, ${t.label}` : f.label,
            href: gameHref(f, t),
            startsAt: t?.starts_at,
            fieldId: f.field_id,
          })),
        ).slice(0, 4)
      : poll.kind === "campo"
        ? fieldWinners.map((f) => ({ key: f.id, label: f.label, href: gameHref(f), fieldId: f.field_id }))
        : poll.kind === "data"
          ? otherWinners.map((t) => ({ key: t.id, label: t.label, href: gameHref(undefined, t), startsAt: t.starts_at }))
          : [];

  /** Vencedor com dia e hora: vira jogo oficial com um toque, e a votação encerra */
  async function makeGame(c: Combo) {
    if (!c.startsAt) return router.push(c.href);
    setBusy(true);
    const sb = supabase();
    const { data: game, error } = await sb
      .from("games")
      .insert({ title: "Futebol", starts_at: c.startsAt, duration_min: 60, field_id: c.fieldId ?? null })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      return toast.error(friendlyError(error));
    }
    const { error: e2 } = await sb.from("polls").update({ game_id: game.id, closed: true }).eq("id", poll.id);
    setBusy(false);
    if (e2) toast.error(friendlyError(e2));
    setData((p) => p && { ...p, poll: { ...p.poll, game_id: game.id, closed: true } });
    toast.success("Jogo oficial marcado! Agora cada um diz se vai.", {
      action: { label: "Ver quem vai", onClick: () => router.push(`/agenda/${game.id}`) },
    });
  }

  const shareText = [
    `🗳️ *${poll.question}*`,
    ...mainOpts.map((o) => `• ${o.label}`),
    ...extras.flatMap((x) => ["", `*${x.question}*`, ...x.options.map((o) => `• ${o.label}`)]),
    "",
    `Vote aqui: ${typeof window !== "undefined" ? window.location.href : ""}`,
  ].join("\n");

  const status = !open
    ? "Votação encerrada. Resultado final abaixo."
    : poll.kind === "jogo"
      ? onlyField
        ? `Só tem um campo nesta votação (${onlyField.label}). Marque os horários que você pode.`
        : pickedField
          ? "✓ Campo escolhido. Marque os horários que você pode. Toque de novo para desmarcar."
          : "Primeiro escolha o campo. Veja a foto e onde fica antes de votar."
      : myVotes.size
        ? "✓ Seu voto foi registrado. Toque de novo numa opção para tirar o voto."
        : poll.multiple
          ? "Toque em todas as opções que servem para você."
          : "Toque na sua opção.";

  return (
    <>
      <PageHeader
        back={{ href: "/votacoes", label: "Votações" }}
        title={poll.question}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge><KindIcon className="size-3.5" aria-hidden /> {KIND_META[poll.kind].label}</Badge>
            {open ? <Badge tone="green">Aberta</Badge> : <Badge tone="ink">Encerrada</Badge>}
            <span>
              {poll.kind === "jogo"
                ? `1 campo por pessoa · ${poll.multiple ? "pode marcar vários horários" : "1 horário por pessoa"}`
                : poll.multiple
                  ? "Pode marcar várias opções"
                  : "Uma opção por pessoa"}
              {open && poll.closes_at && ` · encerra ${fromNow(poll.closes_at)}`}
            </span>
          </span>
        }
      />

      {poll.game_id && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-confirma/40 bg-confirma/10 p-4" role="status">
          <Check className="size-5 shrink-0 text-confirma" aria-hidden />
          <p className="min-w-48 flex-1">
            <strong>Virou jogo oficial.</strong> <span className="text-muted">Agora é dizer se você vai.</span>
          </p>
          <LinkButton href={`/agenda/${poll.game_id}`} variant="primary" size="sm">Ver quem vai</LinkButton>
        </div>
      )}
      <Summary rows={summary} open={open} voters={voters.size} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <p className="text-sm text-muted" role="status">{status}</p>

          {fieldOpts.length > 0 && (
            <section aria-labelledby="campos-titulo" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="campos-titulo" className="text-lg font-bold">{poll.kind === "jogo" ? "1. Escolha o campo" : "Campos"}</h2>
                <Button size="sm" variant="ghost" onClick={locateMe} loading={locating}>
                  <LocateFixed className="size-4" aria-hidden /> {here ? "Atualizar distância" : "Ver distância de mim"}
                </Button>
              </div>
              {mapFields.length > 0 && (
                <FieldsMap
                  className="h-[240px] sm:h-[300px]"
                  fields={mapFields}
                  selectedId={mapField}
                  onSelect={(fid) => {
                    setMapField(fid);
                    document.getElementById(`opcao-${fid}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  }}
                  fitTo={fitTo}
                  focus={focus}
                  pick={here}
                  pickLabel="Você está aqui"
                />
              )}
              <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Campos">
                {fieldOpts.map((o) => (
                  <FieldOption
                    key={o.id}
                    option={o}
                    field={fieldOf(o)}
                    count={counts.get(o.id) ?? 0}
                    total={groupVoters(fieldOpts)}
                    mine={myVotes.has(o.id) || (open && o.id === onlyField?.id)}
                    only={o.id === onlyField?.id}
                    winner={!open && fieldWinners.some((w) => w.id === o.id)}
                    who={votes.filter((v) => v.option_id === o.id).map((v) => nameOf(v.user_id))}
                    open={open}
                    busy={busyOption === o.id}
                    distance={here && fieldOf(o) ? km(here, fieldOf(o)!) : null}
                    highlighted={mapField === o.field_id}
                    onVote={() => toggle(o)}
                    onShowMap={() => {
                      setMapField(o.field_id);
                      document.getElementById("campos-titulo")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  />
                ))}
              </ul>
            </section>
          )}

          {otherOpts.length > 0 && (
            <section id="horarios" aria-labelledby="outras-titulo" className="flex scroll-mt-24 flex-col gap-3">
              {poll.kind === "jogo" && (
                <h2 id="outras-titulo" className={cx("text-lg font-bold", needField && "text-muted")}>
                  2. {poll.multiple ? "Quais horários você pode?" : "Escolha o horário"}
                </h2>
              )}
              {needField && <p className="text-sm text-muted">Escolha o campo acima para liberar os horários.</p>}
              <ul
                className={cx("flex flex-col gap-2", needField && "pointer-events-none opacity-50")}
                role={groupIsSingle(poll, groupOf(poll, otherOpts[0])) ? "radiogroup" : "group"}
                aria-label={poll.kind === "jogo" ? "Horários" : "Opções"}
                aria-disabled={needField || undefined}
              >
                {otherOpts.map((o) => (
                  <ChoiceButton
                    key={o.id}
                    label={o.label}
                    count={counts.get(o.id) ?? 0}
                    total={groupVoters(otherOpts)}
                    mine={myVotes.has(o.id) || (open && pickedField && o.id === onlyTime?.id)}
                    only={o.id === onlyTime?.id}
                    single={groupIsSingle(poll, groupOf(poll, o))}
                    winner={!open && otherWinners.some((w) => w.id === o.id)}
                    who={votes.filter((v) => v.option_id === o.id).map((v) => nameOf(v.user_id))}
                    disabled={!open || busyOption === o.id || needField}
                    onClick={() => toggle(o)}
                  />
                ))}
              </ul>
            </section>
          )}

          {open && <SaveBar saving={!!busyOption} saved={myVotes.size > 0} />}

          {extras.map((x, i) => (
            <section key={x.question} aria-labelledby={`extra-${i}`} className="flex flex-col gap-3 border-t border-line pt-4">
              <h2 id={`extra-${i}`} className="text-lg font-bold">{x.question}</h2>
              <ul className="flex flex-col gap-2" role="radiogroup" aria-labelledby={`extra-${i}`}>
                {x.options.map((o) => (
                  <ChoiceButton
                    key={o.id}
                    label={o.label}
                    count={counts.get(o.id) ?? 0}
                    total={groupVoters(x.options)}
                    mine={myVotes.has(o.id)}
                    single
                    winner={!open && winnersOf(x.options).some((w) => w.id === o.id)}
                    who={votes.filter((v) => v.option_id === o.id).map((v) => nameOf(v.user_id))}
                    disabled={!open || busyOption === o.id}
                    onClick={() => toggle(o)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          {!poll.game_id && combos.length > 0 && isOrganizer && (
            <Card className="border-gold/60">
              <h2 className="flex items-center gap-2 font-bold">
                <CalendarPlus className="size-5 text-gold-ink" aria-hidden /> {open ? "Já dá para decidir?" : "Próximo passo: quem vai"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {combos.length > 1 ? "Está empatado. Escolha uma opção:" : `${open ? "Liderando" : "Venceu"}: ${combos[0].label}.`}{" "}
                Ao marcar, a votação encerra e o jogo vai para a Agenda, onde cada um diz se vai.
              </p>
              <div className="mt-3 flex flex-col items-start gap-2">
                {combos.map((c) => (
                  <div key={c.key} className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" size="sm" loading={busy} onClick={() => makeGame(c)}>
                      <CalendarPlus className="size-4" aria-hidden />
                      {c.startsAt ? "Marcar jogo oficial" : "Escolher horário e marcar"}
                      {combos.length > 1 ? `: ${c.label}` : ""}
                    </Button>
                    {c.startsAt && (
                      <Link href={c.href} className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
                        ajustar detalhes antes
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <h2 className="font-semibold">
              {voters.size} de {members.length} {members.length === 1 ? "pessoa votou" : "pessoas votaram"}
            </h2>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full bg-confirma" style={{ width: `${members.length ? (voters.size / members.length) * 100 : 0}%` }} />
            </div>
            {pending.length > 0 && open && (
              <>
                <p className="mt-3 text-sm text-muted">Faltam votar:</p>
                <p className="mt-1 text-sm">{pending.map((m) => m.name || m.email).join(", ")}</p>
              </>
            )}
          </Card>

          <div className="flex flex-wrap gap-2">
            <LinkButton href={shareWhatsappUrl(shareText)} external>
              <Share2 className="size-4" aria-hidden /> Mandar no WhatsApp
            </LinkButton>
            {isOrganizer &&
              (open ? (
                <Button onClick={() => setConfirm("encerrar")}>
                  <Lock className="size-4" aria-hidden /> Encerrar votação
                </Button>
              ) : (
                <Button onClick={() => setClosed(false)} loading={busy}>
                  <Unlock className="size-4" aria-hidden /> Reabrir
                </Button>
              ))}
            {isOrganizer && (
              <Button variant="ghost" className="text-danger" onClick={() => setConfirm("apagar")}>
                <Trash2 className="size-4" aria-hidden /> Apagar
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "encerrar"}
        danger={false}
        title="Encerrar a votação?"
        message={`Ninguém mais poderá votar. ${pending.length ? `${pending.length} pessoa(s) ainda não votaram. ` : ""}Você pode reabrir depois.`}
        confirmLabel="Encerrar"
        onConfirm={() => setClosed(true)}
        onCancel={() => setConfirm(null)}
        loading={busy}
      />
      <ConfirmDialog
        open={confirm === "apagar"}
        title="Apagar a votação?"
        message={`A votação e os ${votes.length} votos somem para sempre. Isso não pode ser desfeito.`}
        confirmLabel="Apagar votação"
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
        loading={busy}
      />
    </>
  );
}

function Voters({ who }: { who: string[] }) {
  if (!who.length) return null;
  return (
    <span className="mt-1 flex -space-x-1.5" title={who.join(", ")}>
      {who.slice(0, 8).map((n, i) => <Avatar key={i} name={n} size={22} />)}
      {who.length > 8 && <span className="pl-3 text-xs text-muted">+{who.length - 8}</span>}
    </span>
  );
}

function Tally({ count, total }: { count: number; total: number }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <span className="text-right">
      <span className="block text-lg font-bold">{count}</span>
      <span className="block text-xs text-muted">{pct}%</span>
    </span>
  );
}

function Mark({ on, single }: { on: boolean; single: boolean }) {
  return (
    <span
      aria-hidden
      className={cx("grid size-6 shrink-0 place-items-center border-2", single ? "rounded-full" : "rounded-md", on ? "border-ink bg-ink text-bg" : "border-line")}
    >
      {on && <Check className="size-4" />}
    </span>
  );
}

/** Opção simples (horário, dia ou texto) */
function ChoiceButton({
  label, count, total, mine, only = false, single, winner, who, disabled, onClick,
}: {
  label: string; count: number; total: number; mine: boolean; only?: boolean; single: boolean; winner: boolean; who: string[]; disabled: boolean; onClick: () => void;
}) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <li>
      <button
        type="button"
        role={single ? "radio" : "checkbox"}
        aria-checked={mine}
        disabled={disabled}
        onClick={onClick}
        className={cx(
          "relative w-full overflow-hidden rounded-2xl border bg-surface p-4 text-left transition-colors",
          mine ? "border-ink ring-1 ring-ink" : "border-line",
          disabled ? "cursor-default" : "hover:border-ink/60",
        )}
      >
        <span aria-hidden className={cx("absolute inset-y-0 left-0 transition-[width] duration-500", winner ? "bg-gold/30" : "bg-surface-2")} style={{ width: `${pct}%` }} />
        <span className="relative flex items-center gap-3">
          <Mark on={mine} single={single} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 font-semibold capitalize">
              {label}
              {winner && <Trophy className="size-4 text-gold-ink" aria-label="Mais votada" />}
              {only && <Badge>Única opção</Badge>}
            </span>
            <Voters who={who} />
          </span>
          <Tally count={count} total={total} />
        </span>
      </button>
    </li>
  );
}

/** Campo na votação: votar + foto, mapa, distância e como chegar (quem vota pode não conhecer o lugar) */
function FieldOption({
  option, field, count, total, mine, only = false, winner, who, open, busy, distance, highlighted, onVote, onShowMap,
}: {
  option: PollOption; field?: FieldRow; count: number; total: number; mine: boolean; only?: boolean; winner: boolean; who: string[];
  open: boolean; busy: boolean; distance: number | null; highlighted: boolean; onVote: () => void; onShowMap: () => void;
}) {
  const [photo, setPhoto] = useState(false);
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <li id={field ? `opcao-${field.id}` : undefined} className={cx("overflow-hidden rounded-2xl border bg-surface", mine ? "border-ink ring-1 ring-ink" : highlighted ? "border-gold" : "border-line")}>
      <button
        type="button"
        role="radio"
        aria-checked={mine}
        disabled={!open || busy}
        onClick={onVote}
        className={cx("relative w-full p-4 text-left", open ? "hover:bg-surface-2/50" : "cursor-default")}
      >
        <span aria-hidden className={cx("absolute inset-y-0 left-0 transition-[width] duration-500", winner ? "bg-gold/30" : "bg-surface-2")} style={{ width: `${pct}%` }} />
        <span className="relative flex items-center gap-3">
          <Mark on={mine} single />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 font-semibold">
              {field?.name ?? option.label}
              {winner && <Trophy className="size-4 text-gold-ink" aria-label="Mais votado" />}
              {only && <Badge>Única opção · já escolhido</Badge>}
            </span>
            {field ? (
              <span className="block text-sm text-muted">
                {field.price_per_hour != null ? `${brl(field.price_per_hour)}/h` : "sem preço"}
                {distance != null && <strong className="font-semibold text-ink"> · {kmLabel(distance)}</strong>}
                {field.address && <span className="block truncate">{field.address}</span>}
              </span>
            ) : (
              <span className="block text-sm text-muted">Este campo foi apagado do app.</span>
            )}
            <Voters who={who} />
          </span>
          <Tally count={count} total={total} />
        </span>
      </button>
      {field && (
        <div className="flex flex-col gap-2 border-t border-line px-4 py-2.5">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => setPhoto(!photo)} aria-expanded={photo}>
              <Camera className="size-4" aria-hidden /> {photo ? "Esconder foto" : "Ver foto"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onShowMap}>
              <MapPin className="size-4" aria-hidden /> Ver no mapa
            </Button>
            <LinkButton href={directionsUrl(field.lat, field.lng)} size="sm" variant="ghost" external>
              <Navigation className="size-4" aria-hidden /> Como chegar
            </LinkButton>
            <Link href={`/campos/${field.id}`} className="inline-flex min-h-9 items-center gap-1 px-2 text-sm font-medium text-gold-ink hover:underline">
              Detalhes <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
          {photo &&
            (field.google_place_id ? (
              <PlacePhoto placeId={field.google_place_id} name={field.name} mapsUrl={mapsPlaceUrl(field.name, field.google_place_id, field.maps_url)} auto className="max-w-md" />
            ) : (
              <a href={mapsPlaceUrl(field.name, null, field.maps_url)} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gold-ink hover:underline">
                Este campo não tem foto aqui. Ver fotos no Google Maps ↗
              </a>
            ))}
        </div>
      )}
    </li>
  );
}

/** Quem está ganhando em cada pergunta, ao vivo (heurística 1: estado sempre visível) */
function Summary({ rows, open, voters }: { rows: SummaryRow[]; open: boolean; voters: number }) {
  if (!rows.length) return null;
  return (
    <Card className={cx("mb-6", !open && "border-gold/60")}>
      <h2 className="flex items-center gap-2 font-bold">
        <Trophy className="size-5 text-gold-ink" aria-hidden />
        {open ? "Como está até agora" : "Resultado final"}
      </h2>
      {voters === 0 ? (
        <p className="mt-1 text-sm text-muted">Ninguém votou ainda. Seja o primeiro.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.title} className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{r.title}</dt>
              <dd className="mt-0.5">
                {r.leaders.length === 0 ? (
                  <span className="text-muted">Sem votos ainda</span>
                ) : (
                  <>
                    <span className="font-semibold capitalize">{r.leaders.map((l) => l.label).join(" ou ")}</span>
                    <span className="block text-sm text-muted">
                      {r.leaders.length > 1
                        ? `Empate com ${r.votes} ${r.votes === 1 ? "voto" : "votos"} cada`
                        : `${r.votes} de ${r.of} ${r.of === 1 ? "voto" : "votos"}${open ? " · liderando" : ""}`}
                    </span>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

/** Barra fixa: deixa claro que cada toque já salva e que dá para sair (heurísticas 1 e 3) */
function SaveBar({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (!saving && !saved) return null;
  return (
    <div className="sticky bottom-20 z-10 order-last flex flex-wrap items-center gap-3 rounded-2xl border border-confirma/40 bg-bg/95 p-3 backdrop-blur md:bottom-4" role="status" aria-live="polite">
      {saving ? (
        <span className="flex-1 text-sm text-muted">Salvando…</span>
      ) : (
        <span className="flex min-w-48 flex-1 items-center gap-2 text-sm">
          <Check className="size-4 shrink-0 text-confirma" aria-hidden />
          <span><strong>Tudo salvo.</strong> <span className="text-muted">Não precisa apertar mais nada. Dá para mudar até a votação encerrar.</span></span>
        </span>
      )}
      <LinkButton href="/votacoes" size="sm">Pronto, voltar</LinkButton>
    </div>
  );
}

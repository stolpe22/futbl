"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, CalendarPlus, Clock, MapPin, Pencil, RotateCcw, Share2, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { must, useLoad, useSession } from "@/components/session";
import { RsvpButtons } from "@/components/rsvp";
import { FieldLinks } from "@/components/field-links";
import { Avatar, Badge, Button, Card, ConfirmDialog, ErrorState, LinkButton, PageHeader, Spinner, cx } from "@/components/ui";
import { applyRsvp, countRsvps } from "@/lib/queries";
import { brl, dateLong, shareWhatsappUrl, timeOf } from "@/lib/format";
import { gameCost, hoursLabel, payingCount, share } from "@/lib/price";
import { RSVP_LABEL, type FieldRow, type Game, type Profile, type Rsvp, type RsvpStatus } from "@/lib/types";

type Data = { game: Game; field: FieldRow | null; rsvps: Rsvp[]; members: Profile[] };

export default function JogoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile, isOrganizer } = useSession();
  const [confirm, setConfirm] = useState<null | "cancelar" | "apagar">(null);
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload, setData } = useLoad<Data | null>(async () => {
    const sb = supabase();
    const game = must(await sb.from("games").select("*").eq("id", id).maybeSingle()) as Game | null;
    if (!game) return null;
    const [field, rsvps, members] = await Promise.all([
      game.field_id ? sb.from("fields").select("*").eq("id", game.field_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      sb.from("rsvps").select("*").eq("game_id", id),
      sb.from("profiles").select("*").eq("active", true).order("name"),
    ]);
    return {
      game,
      field: must(field) as FieldRow | null,
      rsvps: must(rsvps) as Rsvp[],
      members: must(members) as Profile[],
    };
  }, [id]);

  // Presença em tempo real: quando alguém responde, a lista atualiza sozinha (heurística 1)
  useEffect(() => {
    const sb = supabase();
    const ch = sb
      .channel(`rsvps-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rsvps", filter: `game_id=eq.${id}` }, async () => {
        const { data: rs } = await sb.from("rsvps").select("*").eq("game_id", id);
        if (rs) setData((prev) => prev && { ...prev, rsvps: rs as Rsvp[] });
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [id, setData]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;
  if (!data) return <ErrorState message="Esse jogo não existe mais. Ele pode ter sido apagado por um organizador." />;

  const { game, field, rsvps, members } = data;
  const start = new Date(game.starts_at);
  const end = new Date(start.getTime() + game.duration_min * 60_000);
  const cancelled = game.status === "cancelado";
  const past = end.getTime() < Date.now();
  const c = countRsvps(rsvps, game.id);
  const mine = rsvps.find((r) => r.user_id === profile!.id)?.status ?? null;
  const cost = gameCost(game, field);
  const paying = payingCount(c.vou, game.max_players);
  const perPerson = cost ? share(cost.total, paying) : null;
  const byStatus = (s: RsvpStatus) =>
    rsvps
      .filter((r) => r.status === s)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at)) // ordem de chegada define a lista de espera
      .map((r) => members.find((m) => m.id === r.user_id)).filter((m): m is Profile => !!m);
  const pending = members.filter((m) => !rsvps.some((r) => r.user_id === m.id));
  const url = typeof window !== "undefined" ? window.location.href : "";

  const shareText = [
    `⚽ *${game.title}*${cancelled ? " — CANCELADO" : ""}`,
    `🗓️ ${dateLong(game.starts_at)} às ${timeOf(game.starts_at)}`,
    `📍 ${field?.name ?? "Campo a definir"}`,
    `✅ ${c.vou} confirmados${game.max_players ? ` de ${game.max_players}` : ""}`,
    ...(cost && !cancelled ? [`💰 ${brl(cost.total)}${perPerson != null ? ` · ${brl(perPerson)} cada` : ""}`] : []),
    "",
    `Confirme aqui: ${url}`,
  ].join("\n");

  const gcal = (() => {
    const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const p = new URLSearchParams({
      action: "TEMPLATE",
      text: game.title,
      dates: `${f(start)}/${f(end)}`,
      location: field ? `${field.name}${field.address ? ", " + field.address : ""}` : "",
      details: url,
    });
    return `https://calendar.google.com/calendar/render?${p}`;
  })();

  async function setStatus(status: Game["status"]) {
    setBusy(true);
    const { error } = await supabase().from("games").update({ status }).eq("id", game.id);
    setBusy(false);
    setConfirm(null);
    if (error) return toast.error(friendlyError(error));
    setData((prev) => prev && { ...prev, game: { ...prev.game, status } });
    toast.success(status === "cancelado" ? "Jogo cancelado. Avise a galera no grupo." : "Jogo reativado.", {
      action: status === "cancelado" ? { label: "Desfazer", onClick: () => setStatus("marcado") } : undefined,
    });
  }

  async function remove() {
    setBusy(true);
    const sb = supabase();
    const { error } = await sb.from("games").delete().eq("id", game.id);
    setBusy(false);
    setConfirm(null);
    if (error) return toast.error(friendlyError(error));
    router.push("/agenda");
    toast(`“${game.title}” foi apagado.`, {
      duration: 10000,
      action: {
        label: "Desfazer",
        onClick: async () => {
          const { error } = await sb.from("games").insert(game);
          if (error) return toast.error(friendlyError(error));
          if (rsvps.length) {
            // só dá para restaurar a própria presença (cada um mexe só na sua)
            const own = rsvps.filter((r) => r.user_id === profile!.id);
            if (own.length) await sb.from("rsvps").insert(own);
          }
          toast.success("Jogo restaurado.");
          router.push(`/agenda/${game.id}`);
        },
      },
    });
  }

  return (
    <>
      <PageHeader
        back={{ href: "/agenda", label: "Agenda" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className={cx(cancelled && "line-through")}>{game.title}</span>
            {cancelled && <Badge tone="red">Cancelado</Badge>}
            {!cancelled && past && <Badge>Já aconteceu</Badge>}
          </span>
        }
        subtitle={<span className="capitalize">{dateLong(game.starts_at)} · {timeOf(game.starts_at)} às {timeOf(end.toISOString())}</span>}
        actions={
          isOrganizer && (
            <LinkButton href={`/agenda/${game.id}/editar`}>
              <Pencil className="size-4" aria-hidden /> Editar
            </LinkButton>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-4">
          {!cancelled && !past && (
            <Card className="border-gold/60">
              <h2 className="mb-1 text-lg font-bold">Você vai?</h2>
              <p className="mb-3 text-sm text-muted">
                {mine ? <>Sua resposta: <strong className="text-ink">{RSVP_LABEL[mine]}</strong>. Pode mudar quando quiser.</> : "Responda para o organizador saber quantos times montar."}
              </p>
              <RsvpButtons
                size="lg"
                gameId={game.id}
                userId={profile!.id}
                value={mine}
                onChange={(s) => setData((prev) => prev && { ...prev, rsvps: applyRsvp(prev.rsvps, game.id, profile!.id, s) })}
              />
              {game.max_players != null && c.vou >= game.max_players && mine !== "vou" && (
                <p className="mt-3 text-sm font-medium text-gold-ink" role="status">
                  Já tem {c.vou} confirmados para {game.max_players} vagas. Se confirmar, fica na lista de espera.
                </p>
              )}
            </Card>
          )}

          <Card className="flex flex-col gap-3">
            <InfoRow icon={Clock} label="Horário">
              {timeOf(game.starts_at)} às {timeOf(end.toISOString())} ({game.duration_min} min)
            </InfoRow>
            <InfoRow icon={MapPin} label="Campo">
              {field ? (
                <Link href={`/campos/${field.id}`} className="font-semibold underline-offset-4 hover:underline">
                  {field.name}
                </Link>
              ) : (
                <span className="text-muted">A definir{isOrganizer && " — edite o jogo ou abra uma votação"}</span>
              )}
              {field?.address && <span className="block text-sm text-muted">{field.address}</span>}
            </InfoRow>
            {cost && (
              <InfoRow icon={Wallet} label="Valor">
                <SplitBox cost={cost} paying={paying} maxPlayers={game.max_players} cancelled={cancelled} />
              </InfoRow>
            )}
            {field && <FieldLinks field={field} compact />}
            {game.notes && (
              <p className="whitespace-pre-line rounded-xl bg-surface-2 px-3.5 py-3 text-sm">
                <span className="font-semibold">Recado: </span>
                {game.notes}
              </p>
            )}
          </Card>

          <div className="flex flex-wrap gap-2">
            <LinkButton href={shareWhatsappUrl(shareText)} external>
              <Share2 className="size-4" aria-hidden /> Mandar no WhatsApp
            </LinkButton>
            {!cancelled && (
              <LinkButton href={gcal} external>
                <CalendarPlus className="size-4" aria-hidden /> Pôr na minha agenda
              </LinkButton>
            )}
          </div>

          {isOrganizer && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {cancelled ? (
                <Button onClick={() => setStatus("marcado")} loading={busy}>
                  <RotateCcw className="size-4" aria-hidden /> Reativar jogo
                </Button>
              ) : (
                !past && (
                  <Button variant="danger" onClick={() => setConfirm("cancelar")}>
                    <Ban className="size-4" aria-hidden /> Cancelar jogo
                  </Button>
                )
              )}
              <Button variant="ghost" className="text-danger" onClick={() => setConfirm("apagar")}>
                <Trash2 className="size-4" aria-hidden /> Apagar
              </Button>
            </div>
          )}
        </div>

        <Card>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Lista de presença</h2>
            <span className="flex items-center gap-1.5 text-xs text-muted" title="Atualiza sozinha quando alguém responde">
              <span className="size-2 animate-pulse rounded-full bg-confirma" aria-hidden /> ao vivo
            </span>
          </div>
          <PeopleGroup title="Vão" tone="text-confirma" people={byStatus("vou")} max={game.max_players} me={profile!.id} />
          <PeopleGroup title="Talvez" tone="text-gold-ink" people={byStatus("talvez")} me={profile!.id} />
          <PeopleGroup title="Não vão" tone="text-danger" people={byStatus("nao_vou")} me={profile!.id} />
          <PeopleGroup title="Ainda não responderam" tone="text-muted" people={pending} me={profile!.id} muted />
        </Card>
      </div>

      <ConfirmDialog
        open={confirm === "cancelar"}
        title="Cancelar este jogo?"
        message="O jogo continua na agenda, riscado, para todo mundo ver que não vai rolar. Dá para reativar depois."
        confirmLabel="Cancelar jogo"
        onConfirm={() => setStatus("cancelado")}
        onCancel={() => setConfirm(null)}
        loading={busy}
      />
      <ConfirmDialog
        open={confirm === "apagar"}
        title="Apagar este jogo?"
        message={
          <>
            Ele some da agenda junto com a lista de presença ({rsvps.length} {rsvps.length === 1 ? "resposta" : "respostas"}).
            Se a ideia é avisar que não vai rolar, prefira <strong className="text-ink">Cancelar jogo</strong>.
          </>
        }
        confirmLabel="Apagar jogo"
        onConfirm={remove}
        onCancel={() => setConfirm(null)}
        loading={busy}
      />
    </>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        <div>{children}</div>
      </div>
    </div>
  );
}

function PeopleGroup({
  title,
  tone,
  people,
  max,
  me,
  muted,
}: {
  title: string;
  tone: string;
  people: Profile[];
  max?: number | null;
  me: string;
  muted?: boolean;
}) {
  if (!people.length && muted) return null;
  return (
    <section className="border-t border-line py-3 first-of-type:border-t-0 first-of-type:pt-0">
      <h3 className={cx("mb-2 text-sm font-semibold", tone)}>
        {title} · {people.length}
        {max ? ` de ${max}` : ""}
      </h3>
      {people.length === 0 ? (
        <p className="text-sm text-muted">Ninguém ainda.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {people.map((p, i) => (
            <li
              key={p.id}
              className={cx(
                "flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-sm",
                muted && "opacity-70",
                p.id === me && "border-ink font-semibold",
              )}
            >
              <Avatar name={p.name || p.email} size={24} />
              {p.name || p.email}
              {p.id === me && " (você)"}
              {max != null && i >= max && <Badge tone="gold">espera</Badge>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Racha: total do aluguel e quanto fica para cada confirmado, atualizando conforme a galera confirma */
function SplitBox({
  cost, paying, maxPlayers, cancelled,
}: {
  cost: NonNullable<ReturnType<typeof gameCost>>; paying: number; maxPlayers: number | null; cancelled: boolean;
}) {
  const each = share(cost.total, paying);
  const nextEach = !maxPlayers || paying < maxPlayers ? share(cost.total, paying + 1) : null;
  const fullEach = maxPlayers && paying < maxPlayers ? share(cost.total, maxPlayers) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <p>
        <strong className="text-lg">{brl(cost.total)}</strong> no total
        <span className="block text-sm text-muted">
          {cost.source === "campo"
            ? `${brl(cost.perHour)}/h do campo × ${hoursLabel(cost.hours * 60)}`
            : `valor combinado pelo organizador${cost.perHour != null ? ` (campo: ${brl(cost.perHour)}/h)` : ""}`}
        </span>
      </p>
      {!cancelled &&
        (each != null ? (
          <div className="rounded-xl bg-confirma-bg px-3 py-2">
            <p>
              <strong className="text-xl text-confirma">{brl(each)}</strong> <span className="font-medium">para cada um</span>
            </p>
            <p className="text-sm text-muted">
              dividido entre {paying} confirmado{paying === 1 ? "" : "s"}
              {nextEach != null && ` · se mais 1 confirmar: ${brl(nextEach)}`}
              {fullEach != null && ` · com ${maxPlayers}: ${brl(fullEach)}`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Ninguém confirmou ainda.
            {maxPlayers ? ` Com ${maxPlayers} confirmados fica ${brl(share(cost.total, maxPlayers))} para cada um.` : " O valor é dividido entre quem confirmar."}
          </p>
        ))}
    </div>
  );
}

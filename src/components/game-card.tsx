"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MapPin, Users } from "lucide-react";
import { countRsvps } from "@/lib/queries";
import { useNow } from "@/lib/hooks";
import { timeOf } from "@/lib/format";
import type { GameWithField, Rsvp, RsvpStatus } from "@/lib/types";
import { RsvpButtons } from "./rsvp";
import { Badge, cx } from "./ui";

export function GameCard({
  game,
  rsvps,
  userId,
  onRsvp,
}: {
  game: GameWithField;
  rsvps: Rsvp[];
  userId: string;
  onRsvp: (status: RsvpStatus | null) => void;
}) {
  const now = useNow();
  const d = new Date(game.starts_at);
  const c = countRsvps(rsvps, game.id);
  const mine = rsvps.find((r) => r.game_id === game.id && r.user_id === userId)?.status ?? null;
  const cancelled = game.status === "cancelado";
  const past = d.getTime() + game.duration_min * 60_000 < now;
  const full = game.max_players != null && c.vou >= game.max_players;

  return (
    <article className={cx("rounded-2xl border border-line bg-surface p-4 sm:p-5", (cancelled || past) && "opacity-70")}>
      <Link href={`/agenda/${game.id}`} className="group flex gap-4">
        <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-2 py-2 text-center">
          <span className="text-xs font-semibold uppercase text-muted">{format(d, "EEE", { locale: ptBR })}</span>
          <span className="text-2xl font-bold leading-none">{format(d, "dd")}</span>
          <span className="text-xs uppercase text-muted">{format(d, "MMM", { locale: ptBR })}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cx("text-lg font-semibold group-hover:underline", cancelled && "line-through")}>{game.title}</h3>
            {cancelled && <Badge tone="red">Cancelado</Badge>}
            {!cancelled && past && <Badge>Já aconteceu</Badge>}
            {!cancelled && !past && full && <Badge tone="gold">Lotado</Badge>}
          </div>
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{timeOf(game.starts_at)}</span> · {game.duration_min} min
          </p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {game.field?.name ?? "Campo a definir"}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
            <Users className="size-3.5 shrink-0" aria-hidden />
            <span className="font-semibold text-confirma">{c.vou} vão</span>
            {game.max_players ? ` de ${game.max_players}` : ""} · {c.talvez} talvez
          </p>
        </div>
      </Link>
      {!cancelled && !past && (
        <div className="mt-4">
          <RsvpButtons gameId={game.id} userId={userId} value={mine} onChange={onRsvp} />
        </div>
      )}
    </article>
  );
}

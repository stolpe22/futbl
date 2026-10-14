import { supabase } from "./supabase/client";
import type { GameWithField, Rsvp, RsvpStatus } from "./types";

const GAME_SELECT = "*, field:fields(id,name,address,lat,lng,price_per_hour)";

export async function loadGames(opts: { from?: Date; to?: Date; limit?: number; ascending?: boolean }) {
  const sb = supabase();
  let q = sb.from("games").select(GAME_SELECT).order("starts_at", { ascending: opts.ascending ?? true });
  if (opts.from) q = q.gte("starts_at", opts.from.toISOString());
  if (opts.to) q = q.lt("starts_at", opts.to.toISOString());
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  const games = (data ?? []) as GameWithField[];
  const rsvps = games.length
    ? await sb.from("rsvps").select("*").in("game_id", games.map((g) => g.id))
    : { data: [], error: null };
  if (rsvps.error) throw rsvps.error;
  return { games, rsvps: (rsvps.data ?? []) as Rsvp[] };
}

export function countRsvps(rsvps: Rsvp[], gameId: string) {
  const c: Record<RsvpStatus, number> = { vou: 0, talvez: 0, nao_vou: 0 };
  for (const r of rsvps) if (r.game_id === gameId) c[r.status]++;
  return c;
}

/** Atualiza a lista local de presenças após o usuário responder */
export function applyRsvp(rsvps: Rsvp[], gameId: string, userId: string, status: RsvpStatus | null): Rsvp[] {
  const rest = rsvps.filter((r) => !(r.game_id === gameId && r.user_id === userId));
  return status ? [...rest, { game_id: gameId, user_id: userId, status, updated_at: new Date().toISOString() }] : rest;
}

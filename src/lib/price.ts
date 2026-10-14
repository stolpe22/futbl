import type { Game } from "./types";

export type GameCost = {
  total: number;
  /** de onde veio o total: digitado no jogo ou calculado pelo preço/hora do campo */
  source: "jogo" | "campo";
  perHour: number | null;
  hours: number;
};

/** Duração em texto curto: 60 → "1h", 90 → "1h30" */
export function hoursLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
}

/**
 * Quanto custa o jogo: o valor digitado pelo organizador ou, se não tiver,
 * preço por hora do campo × duração. Sem nenhum dos dois, não dá para calcular.
 */
export function gameCost(
  game: Pick<Game, "price_total" | "duration_min">,
  field?: { price_per_hour: number | null } | null,
): GameCost | null {
  const hours = game.duration_min / 60;
  const perHour = field?.price_per_hour ?? null;
  if (game.price_total != null) return { total: Number(game.price_total), source: "jogo", perHour, hours };
  if (perHour != null) return { total: Number(perHour) * hours, source: "campo", perHour: Number(perHour), hours };
  return null;
}

/** Quem paga: os confirmados, sem contar a lista de espera (quem passou do máximo não joga) */
export function payingCount(confirmed: number, maxPlayers: number | null) {
  return maxPlayers ? Math.min(confirmed, maxPlayers) : confirmed;
}

/** Valor para cada um, arredondado para cima no centavo (para não faltar no total) */
export function share(total: number, people: number) {
  return people > 0 ? Math.ceil((total / people) * 100) / 100 : null;
}

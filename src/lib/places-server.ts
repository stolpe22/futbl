import "server-only";
import { serverSupabase } from "./supabase/server";

export const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;

export type QuotaSku = "text_search" | "details_enterprise" | "photo";

/**
 * Reserva 1 uso da cota do mês no banco. Só retorna true se ainda estiver
 * abaixo do limite grátis — o Google só é chamado depois disso.
 */
export async function reserveQuota(sku: QuotaSku): Promise<"ok" | "esgotada" | "sem-login"> {
  const sb = await serverSupabase();
  const { data: claims } = await sb.auth.getClaims();
  if (!claims?.claims) return "sem-login";
  const { data, error } = await sb.rpc("use_quota", { p_sku: sku });
  // na dúvida (erro no banco), não arrisca gastar: trata como esgotada
  if (error || data !== true) return "esgotada";
  return "ok";
}

export async function isLoggedIn() {
  const sb = await serverSupabase();
  const { data } = await sb.auth.getClaims();
  return !!data?.claims;
}

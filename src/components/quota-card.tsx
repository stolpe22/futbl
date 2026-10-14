"use client";

import { supabase } from "@/lib/supabase/client";
import { must, useLoad } from "./session";
import { Card, Skeleton, cx } from "./ui";

const LABEL: Record<string, string> = {
  text_search: "Buscas de campos novos (com pino no mapa)",
  details_enterprise: "Telefone e site do campo escolhido",
  photo: "Fotos dos campos (1 por foto mostrada)",
};

/** Mostra ao admin quanto da cota grátis do Google já foi usada no mês */
export function QuotaCard() {
  const { data, error } = useLoad(
    async () => must(await supabase().rpc("quota_status")) as { sku: string; used: number; quota: number }[],
    [],
  );

  return (
    <Card>
      <h2 className="font-semibold">Uso do Google este mês</h2>
      <p className="mb-3 text-sm text-muted">
        Limites abaixo da cota grátis. Ao chegar no limite, o app para de chamar o Google até o mês que vem: a busca passa para o OpenStreetMap, as fotos mostram um aviso e nada é cobrado.
      </p>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !data ? (
        <Skeleton className="h-24" />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((q) => {
            const pct = q.quota ? Math.min(100, (q.used / q.quota) * 100) : 0;
            return (
              <li key={q.sku}>
                <div className="flex justify-between text-sm">
                  <span>{LABEL[q.sku] ?? q.sku}</span>
                  <span className="tabular-nums text-muted">
                    {q.used.toLocaleString("pt-BR")} / {q.quota.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <div className={cx("h-full", pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-gold" : "bg-confirma")} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { must, useLoad, useSession } from "@/components/session";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, cx } from "@/components/ui";

/** O que cada cobrança do Google significa, o limite do app e a cota grátis do Google */
const SKUS: { sku: string; label: string; help: string; free: number }[] = [
  { sku: "text_search", label: "Buscas de campos", help: "Cada busca de campo novo no mapa", free: 5000 },
  { sku: "details_enterprise", label: "Telefone e site", help: "Ao escolher um campo achado na busca", free: 1000 },
  { sku: "photo", label: "Fotos", help: "1 por foto de campo mostrada", free: 1000 },
];

/** Mês de cobrança do Google (fuso do Pacífico), no formato YYYY-MM */
function billingMonth(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { key: `${get("year")}-${String(get("month")).padStart(2, "0")}`, year: get("year"), month: get("month"), day: get("day") };
}

const monthName = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 15).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

export default function AdminPage() {
  const { isAdmin } = useSession();
  if (!isAdmin)
    return (
      <EmptyState icon={<Lock className="size-6" />} title="Só para o admin">
        Esta tela mostra o uso do Google e a limpeza de campos.
      </EmptyState>
    );
  return (
    <>
      <PageHeader title="Painel" subtitle="Uso do Google e limpeza de campos. Só o admin vê esta tela." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <GoogleUsage />
        <FieldsCleanup />
      </div>
    </>
  );
}

function GoogleUsage() {
  const { data, error, reload } = useLoad(async () => {
    const sb = supabase();
    const [status, history] = await Promise.all([
      sb.rpc("quota_status"),
      sb.from("api_usage").select("month, sku, count").order("month", { ascending: false }).limit(60),
    ]);
    return {
      status: must(status) as { sku: string; used: number; quota: number }[],
      history: (must(history) ?? []) as { month: string; sku: string; count: number }[],
    };
  }, []);

  if (error) return <ErrorState message={error} onRetry={reload} />;

  const now = billingMonth();
  const daysInMonth = new Date(now.year, now.month, 0).getDate();
  const resetsOn = new Date(now.year, now.month, 1).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  const pastMonths = data ? [...new Set(data.history.map((h) => h.month))].filter((m) => m !== now.key).slice(0, 6) : [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Google este mês</h2>
          <span className="text-sm text-muted capitalize">{monthName(now.key)} · zera em {resetsOn}</span>
        </div>
        <p className="mb-4 mt-1 text-sm text-muted">
          O app para de chamar o Google ao chegar no limite dele, abaixo da cota grátis. Aí a busca usa o OpenStreetMap e as fotos
          mostram um aviso. <strong className="text-ink">Nada é cobrado.</strong>
        </p>
        {!data ? (
          <Skeleton className="h-40" />
        ) : (
          <ul className="flex flex-col gap-5">
            {SKUS.map((s) => {
              const row = data.status.find((q) => q.sku === s.sku);
              const used = row?.used ?? 0;
              const limit = row?.quota ?? 0;
              const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
              // no ritmo atual, quanto vai dar no fim do mês
              const projected = Math.round((used / Math.max(1, now.day)) * daysInMonth);
              return (
                <li key={s.sku}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{s.label}</span>
                    <span className="tabular-nums">
                      <strong>{used.toLocaleString("pt-BR")}</strong>
                      <span className="text-muted"> / {limit.toLocaleString("pt-BR")}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <div
                      className={cx("h-full rounded-full", pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-gold" : "bg-confirma")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted">
                    <span>{s.help}</span>
                    <span>
                      {pct >= 100
                        ? "Limite atingido: pausado até o mês que vem"
                        : `No ritmo atual: ~${projected.toLocaleString("pt-BR")} no mês`}
                      {" · "}grátis do Google: {s.free.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Meses anteriores</h2>
        {!data ? (
          <Skeleton className="h-20" />
        ) : pastMonths.length === 0 ? (
          <p className="text-sm text-muted">Ainda não tem histórico. Os meses aparecem aqui conforme o app for usado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1.5 pr-3 font-medium">Mês</th>
                  {SKUS.map((s) => (
                    <th key={s.sku} className="py-1.5 pl-3 text-right font-medium">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pastMonths.map((m) => (
                  <tr key={m} className="border-t border-line">
                    <td className="py-2 pr-3 capitalize">{monthName(m)}</td>
                    {SKUS.map((s) => (
                      <td key={s.sku} className="py-2 pl-3 text-right tabular-nums">
                        {(data.history.find((h) => h.month === m && h.sku === s.sku)?.count ?? 0).toLocaleString("pt-BR")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

type FieldUse = { id: string; name: string; address: string | null; games: number; suggestions: number };

function FieldsCleanup() {
  const [confirm, setConfirm] = useState<FieldUse | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error, reload, setData } = useLoad(async () => {
    const sb = supabase();
    const [fields, games, suggestions] = await Promise.all([
      sb.from("fields").select("id, name, address").order("name"),
      sb.from("games").select("field_id").not("field_id", "is", null).neq("status", "cancelado"),
      sb.from("suggestions").select("field_id"),
    ]);
    const count = (rows: { field_id: string | null }[], id: string) => rows.filter((r) => r.field_id === id).length;
    const g = (must(games) ?? []) as { field_id: string | null }[];
    const sg = (must(suggestions) ?? []) as { field_id: string | null }[];
    return ((must(fields) ?? []) as { id: string; name: string; address: string | null }[]).map((f) => ({
      ...f,
      games: count(g, f.id),
      suggestions: count(sg, f.id),
    }));
  }, []);

  async function remove(f: FieldUse) {
    setBusy(true);
    const { error } = await supabase().from("fields").delete().eq("id", f.id);
    setBusy(false);
    setConfirm(null);
    if (error) return toast.error(friendlyError(error));
    setData((list) => list?.filter((x) => x.id !== f.id) ?? list);
    toast.success(`“${f.name}” foi apagado.`);
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <Card>
      <h2 className="font-semibold">Campos</h2>
      <p className="mb-3 mt-1 text-sm text-muted">
        Campo com jogo marcado não pode ser apagado. Cancele ou troque o campo do jogo antes.
      </p>
      {!data ? (
        <Skeleton className="h-60" />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted">Nenhum campo cadastrado.</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/campos/${f.id}`} className="block truncate font-medium hover:text-gold-ink">
                  {f.name}
                </Link>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {f.games > 0 ? (
                    <Badge tone="gold">{f.games === 1 ? "1 jogo" : `${f.games} jogos`}</Badge>
                  ) : (
                    <Badge>Sem jogos</Badge>
                  )}
                  {f.suggestions > 0 && <Badge>{f.suggestions === 1 ? "1 sugestão" : `${f.suggestions} sugestões`}</Badge>}
                </div>
              </div>
              {f.games > 0 ? (
                <span className="flex items-center gap-1 text-xs text-muted" title="Tem jogo marcado neste campo">
                  <Lock className="size-3.5" aria-hidden /> Tem jogo
                </span>
              ) : (
                <Button size="sm" variant="danger" onClick={() => setConfirm(f)} aria-label={`Apagar ${f.name}`}>
                  <Trash2 className="size-4" aria-hidden /> Apagar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!confirm}
        title="Apagar este campo?"
        message={
          confirm && (
            <>
              <strong className="text-ink">{confirm.name}</strong> sai do mapa e da lista.
              {confirm.suggestions > 0 &&
                ` ${confirm.suggestions === 1 ? "A sugestão feita para ele também é apagada" : `As ${confirm.suggestions} sugestões feitas para ele também são apagadas`}.`}{" "}
              Não dá para desfazer.
            </>
          )
        }
        confirmLabel="Apagar campo"
        onConfirm={() => confirm && remove(confirm)}
        onCancel={() => setConfirm(null)}
        loading={busy}
      />
    </Card>
  );
}

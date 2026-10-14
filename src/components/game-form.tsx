"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { addWeeks, format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { brl, dateTimeShort } from "@/lib/format";
import { useNow, useSubmitShortcut, useUnsavedGuard } from "@/lib/hooks";
import type { FieldRow, Game } from "@/lib/types";
import { Button, Card, FormField, Input, Kbd, Select, Textarea } from "./ui";

export type GamePrefill = { field_id?: string; date?: string; time?: string; /** sugestão sendo aprovada */ suggestionId?: string };

export function GameForm({
  initial,
  prefill,
  fields,
  otherGames,
}: {
  initial?: Game;
  prefill?: GamePrefill;
  fields: FieldRow[];
  otherGames: Game[];
}) {
  const router = useRouter();
  const editing = !!initial;
  const startDate = initial ? new Date(initial.starts_at) : null;

  const [title, setTitle] = useState(initial?.title ?? "Futebol");
  const [date, setDate] = useState(startDate ? format(startDate, "yyyy-MM-dd") : (prefill?.date ?? ""));
  const [time, setTime] = useState(startDate ? format(startDate, "HH:mm") : (prefill?.time ?? "20:00"));
  const [duration, setDuration] = useState(String(initial?.duration_min ?? 60));
  const [fieldId, setFieldId] = useState(initial?.field_id ?? prefill?.field_id ?? "");
  const [maxPlayers, setMaxPlayers] = useState(initial?.max_players ? String(initial.max_players) : "");
  const [price, setPrice] = useState(initial?.price_total != null ? String(initial.price_total) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [repeat, setRepeat] = useState("0");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useUnsavedGuard(dirty && !saving);
  useSubmitShortcut("game-form");
  const touch = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setDirty(true);
  };

  const field = fields.find((f) => f.id === fieldId);
  const suggestedPrice = field?.price_per_hour != null ? (field.price_per_hour * Number(duration)) / 60 : null;
  const now = useNow();
  const startsAt = useMemo(() => (date && time ? new Date(`${date}T${time}`) : null), [date, time]);
  const isPast = startsAt ? startsAt.getTime() < now : false;

  // Prevenção de erro: outro jogo no mesmo dia
  const sameDay = useMemo(
    () =>
      startsAt
        ? otherGames.filter(
            (g) => g.id !== initial?.id && g.status !== "cancelado" && format(new Date(g.starts_at), "yyyy-MM-dd") === date,
          )
        : [],
    [otherGames, date, startsAt, initial?.id],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Dê um nome, tipo “Futebol de quinta”.";
    if (!date) errs.date = "Escolha o dia.";
    if (!time) errs.time = "Escolha o horário.";
    if (maxPlayers && (!/^\d+$/.test(maxPlayers) || Number(maxPlayers) < 2)) errs.maxPlayers = "Use um número a partir de 2.";
    if (price && isNaN(Number(price.replace(",", ".")))) errs.price = "Use só números, tipo 240.";
    setErrors(errs);
    if (Object.keys(errs).length || !startsAt) return;

    setSaving(true);
    const base = {
      title: title.trim(),
      duration_min: Number(duration),
      field_id: fieldId || null,
      max_players: maxPlayers ? Number(maxPlayers) : null,
      price_total: price ? Number(price.replace(",", ".")) : null,
      notes: notes.trim() || null,
    };
    const sb = supabase();
    let res;
    if (editing) {
      res = await sb.from("games").update({ ...base, starts_at: startsAt.toISOString() }).eq("id", initial!.id).select("id");
    } else {
      const rows = Array.from({ length: Number(repeat) + 1 }, (_, i) => ({ ...base, starts_at: addWeeks(startsAt, i).toISOString() }));
      res = await sb.from("games").insert(rows).select("id");
    }
    setSaving(false);
    if (res.error) return toast.error(friendlyError(res.error));
    // veio de uma sugestão: marca como aprovada e liga ao jogo criado
    if (!editing && prefill?.suggestionId) {
      const { data: auth } = await sb.auth.getUser();
      await sb
        .from("suggestions")
        .update({ status: "aprovada", game_id: res.data![0].id, decided_by: auth.user?.id ?? null, decided_at: new Date().toISOString() })
        .eq("id", prefill.suggestionId);
    }
    setDirty(false);
    const n = res.data?.length ?? 1;
    toast.success(editing ? "Jogo atualizado." : n > 1 ? `${n} jogos marcados, um por semana.` : "Jogo marcado! A galera já pode confirmar presença.");
    router.push(`/agenda/${res.data![0].id}`);
  }

  return (
    <form id="game-form" onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <FormField label="Nome do jogo" htmlFor="g-title" error={errors.title}>
          <Input id="g-title" value={title} onChange={(e) => touch(setTitle)(e.target.value)} aria-invalid={!!errors.title} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Dia" htmlFor="g-date" error={errors.date}>
            <Input id="g-date" type="date" value={date} onChange={(e) => touch(setDate)(e.target.value)} aria-invalid={!!errors.date} />
          </FormField>
          <FormField label="Horário" htmlFor="g-time" error={errors.time}>
            <Input id="g-time" type="time" step={900} value={time} onChange={(e) => touch(setTime)(e.target.value)} aria-invalid={!!errors.time} />
          </FormField>
          <FormField label="Duração" htmlFor="g-duration">
            <Select id="g-duration" value={duration} onChange={(e) => touch(setDuration)(e.target.value)}>
              <option value="60">1 hora</option>
              <option value="90">1h30</option>
              <option value="120">2 horas</option>
              <option value="180">3 horas</option>
            </Select>
          </FormField>
        </div>

        {isPast && (
          <p className="flex items-center gap-2 text-sm font-medium text-gold-ink" role="status">
            <AlertTriangle className="size-4" aria-hidden /> Essa data já passou. Confira se é isso mesmo.
          </p>
        )}
        {sameDay.length > 0 && (
          <p className="flex items-start gap-2 text-sm font-medium text-gold-ink" role="status">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Já existe jogo nesse dia:{" "}
              {sameDay.map((g, i) => (
                <span key={g.id}>
                  {i > 0 && ", "}
                  <Link className="underline" href={`/agenda/${g.id}`}>{g.title} ({dateTimeShort(g.starts_at)})</Link>
                </span>
              ))}
              .
            </span>
          </p>
        )}

        {!editing && (
          <FormField label="Repetir" htmlFor="g-repeat" hint="Cria um jogo por semana no mesmo dia e horário. Cada um pode ser editado depois.">
            <Select id="g-repeat" value={repeat} onChange={(e) => touch(setRepeat)(e.target.value)}>
              <option value="0">Não repetir</option>
              <option value="3">Toda semana, por 4 semanas</option>
              <option value="7">Toda semana, por 8 semanas</option>
            </Select>
          </FormField>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <FormField
          label="Campo"
          htmlFor="g-field"
          hint={
            fields.length === 0 ? (
              <>Nenhum campo cadastrado. <Link className="underline" href="/campos/novo">Cadastre um</Link> ou deixe para decidir depois.</>
            ) : (
              "Pode deixar para depois e decidir numa votação."
            )
          }
        >
          <Select id="g-field" value={fieldId} onChange={(e) => touch(setFieldId)(e.target.value)}>
            <option value="">Ainda não definido</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.price_per_hour != null ? ` — ${brl(f.price_per_hour)}/h` : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Máximo de jogadores" htmlFor="g-max" optional error={errors.maxPlayers} hint="Ex.: 14 para dois times de 7.">
            <Input id="g-max" inputMode="numeric" value={maxPlayers} onChange={(e) => touch(setMaxPlayers)(e.target.value.replace(/\D/g, ""))} aria-invalid={!!errors.maxPlayers} />
          </FormField>
          <FormField
            label="Valor total do aluguel (R$)"
            htmlFor="g-price"
            optional
            error={errors.price}
            hint={
              suggestedPrice != null && !price ? (
                <button type="button" className="underline" onClick={() => touch(setPrice)(String(suggestedPrice))}>
                  Usar {brl(suggestedPrice)} (preço do campo)
                </button>
              ) : (
                "Dividimos pelo número de confirmados."
              )
            }
          >
            <Input id="g-price" inputMode="decimal" value={price} onChange={(e) => touch(setPrice)(e.target.value.replace(/[^\d,.]/g, ""))} aria-invalid={!!errors.price} />
          </FormField>
        </div>
        <FormField label="Recado para a galera" htmlFor="g-notes" optional hint="Ex.: levar colete escuro, pix para fulano.">
          <Textarea id="g-notes" value={notes} onChange={(e) => touch(setNotes)(e.target.value)} />
        </FormField>
      </Card>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-line bg-bg/95 p-3 backdrop-blur md:bottom-4">
        <span className="mr-auto hidden text-sm text-muted sm:block">
          <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> salva
        </span>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {editing ? "Salvar alterações" : Number(repeat) > 0 ? `Marcar ${Number(repeat) + 1} jogos` : "Marcar jogo"}
        </Button>
      </div>
    </form>
  );
}

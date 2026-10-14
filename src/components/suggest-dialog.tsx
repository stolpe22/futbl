"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { brl } from "@/lib/format";
import type { FieldRow } from "@/lib/types";
import { Button, Dialog, FormField, Input, Segmented, Select, Textarea } from "./ui";

type Kind = "campo" | "jogo";

/**
 * Sugerir um campo (ou um jogo: campo + dia + horário).
 * Se alguém já sugeriu igual, a pessoa vira apoiadora em vez de duplicar.
 */
export function SuggestDialog({
  open,
  onClose,
  fieldId,
  date,
  defaultKind = "jogo",
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  fieldId?: string;
  date?: string;
  defaultKind?: Kind;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<FieldRow[] | null>(null);
  const [kind, setKind] = useState<Kind>(defaultKind);
  const [field, setField] = useState(fieldId ?? "");
  const [day, setDay] = useState(date ?? "");
  const [time, setTime] = useState("20:00");
  const [duration, setDuration] = useState("60");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // recomeça limpo a cada abertura
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- reinicia o formulário ao abrir */
    setKind(defaultKind);
    setField(fieldId ?? "");
    setDay(date ?? "");
    setNote("");
    setErrors({});
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!fields)
      supabase()
        .from("fields")
        .select("*")
        .order("name")
        .then(({ data }: { data: FieldRow[] | null }) => setFields(data ?? []));
  }, [open, fieldId, date, defaultKind, fields]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    if (!field) errs.field = "Escolha o campo.";
    let startsAt: string | null = null;
    if (kind === "jogo") {
      if (!day) errs.day = "Escolha o dia.";
      if (!time) errs.time = "Escolha o horário.";
      if (day && time) {
        const d = new Date(`${day}T${time}`);
        if (d < new Date()) errs.day = "Esse dia e horário já passaram.";
        startsAt = d.toISOString();
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    const sb = supabase();
    // já existe igual? então vira apoio
    let existed = false;
    let q = sb.from("suggestions").select("id").eq("field_id", field).eq("status", "pendente");
    q = startsAt ? q.eq("starts_at", startsAt) : q.is("starts_at", null);
    const { data: same } = await q.maybeSingle();
    existed = !!same;
    const { error } = await sb.rpc("suggest", {
      p_field_id: field,
      p_starts_at: startsAt,
      p_duration: Number(duration),
      p_note: note,
    });
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    toast.success(
      existed
        ? "Alguém já tinha sugerido isso. Você entrou como apoio (+1)."
        : "Sugestão enviada! A galera pode apoiar e um organizador aprova.",
      { action: { label: "Ver sugestões", onClick: () => router.push("/sugestoes") } },
    );
    onDone?.();
    onClose();
  }

  const selected = fields?.find((f) => f.id === field);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={kind === "jogo" ? "Sugerir jogo" : "Sugerir campo"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => submit()} loading={saving}>Enviar sugestão</Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4 text-ink" noValidate>
        <p className="text-sm text-muted">
          Sua sugestão aparece para todos. Quanto mais gente apoiar, mais fácil o organizador aprovar.
        </p>
        <Segmented<Kind>
          label="O que sugerir"
          value={kind}
          onChange={setKind}
          options={[
            { value: "jogo", label: "Jogo (campo + dia)" },
            { value: "campo", label: "Só o campo" },
          ]}
        />
        <FormField
          label="Campo"
          htmlFor="sg-field"
          error={errors.field}
          hint={
            fields?.length === 0 ? (
              <>Nenhum campo cadastrado. <Link className="underline" href="/campos/novo">Cadastre um</Link> primeiro.</>
            ) : selected?.price_per_hour != null ? (
              `${brl(selected.price_per_hour)} por hora`
            ) : undefined
          }
        >
          <Select id="sg-field" value={field} onChange={(e) => setField(e.target.value)} aria-invalid={!!errors.field}>
            <option value="">{fields ? "Escolha…" : "Carregando…"}</option>
            {fields?.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </Select>
        </FormField>
        {kind === "jogo" && (
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Dia" htmlFor="sg-day" error={errors.day}>
              <Input id="sg-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-invalid={!!errors.day} />
            </FormField>
            <FormField label="Horário" htmlFor="sg-time" error={errors.time}>
              <Input id="sg-time" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />
            </FormField>
            <FormField label="Duração" htmlFor="sg-dur">
              <Select id="sg-dur" value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="60">1h</option>
                <option value="90">1h30</option>
                <option value="120">2h</option>
              </Select>
            </FormField>
          </div>
        )}
        <FormField label="Recado" htmlFor="sg-note" optional hint="Ex.: tem churrasqueira, preço bom à noite.">
          <Textarea id="sg-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
        </FormField>
      </form>
    </Dialog>
  );
}

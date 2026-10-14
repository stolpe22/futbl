"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { addDays, setHours, setMinutes, startOfDay } from "date-fns";
import { Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { must, useLoad, useSession } from "@/components/session";
import { Button, Card, ErrorState, FormField, HelpTip, Input, Kbd, PageHeader, Segmented, Spinner, cx } from "@/components/ui";
import { brl, dateTimeShort, toLocalInput } from "@/lib/format";
import { EXTRA_DEFAULT_OPTIONS, EXTRA_IDEAS, KIND_META } from "@/lib/polls";
import { useSubmitShortcut, useUnsavedGuard } from "@/lib/hooks";
import type { FieldRow, PollKind } from "@/lib/types";

type Extra = { question: string; options: string[] };

const DEFAULT_QUESTION: Record<PollKind, string> = {
  jogo: "Onde e quando vai ser o próximo jogo?",
  data: "Qual dia fica melhor para o futebol?",
  campo: "Qual campo vamos alugar?",
  livre: "",
};

function defaultDates() {
  const base = startOfDay(new Date());
  return [1, 2, 3].map((d) => toLocalInput(setMinutes(setHours(addDays(base, d), 20), 0)));
}

export default function NovaVotacaoPage() {
  const router = useRouter();
  const { isOrganizer } = useSession();
  const { data: fields, error: loadError, reload } = useLoad(
    async () => must(await supabase().from("fields").select("*").order("name")) as FieldRow[],
    [],
  );

  const [kind, setKind] = useState<PollKind>("jogo");
  const [question, setQuestion] = useState(DEFAULT_QUESTION.jogo);
  const [dates, setDates] = useState<string[]>(defaultDates);
  const [texts, setTexts] = useState<string[]>(["", ""]);
  const [fieldIds, setFieldIds] = useState<string[]>([]);
  const [multiple, setMultiple] = useState(true);
  const [closesAt, setClosesAt] = useState("");
  const [extras, setExtras] = useState<Extra[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard(dirty && !saving);
  useSubmitShortcut("poll-form");

  function changeKind(k: PollKind) {
    // troca a pergunta padrão só se a pessoa não tiver escrito a dela
    if (Object.values(DEFAULT_QUESTION).includes(question)) setQuestion(DEFAULT_QUESTION[k]);
    setMultiple(k === "data" || k === "jogo");
    setKind(k);
    setErrors({});
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!question.trim()) errs.question = "Escreva a pergunta.";
    let options: { label: string; starts_at?: string; field_id?: string }[] = [];
    const validDates = [...new Set(dates.filter(Boolean))].sort();
    const dateOptions = validDates.map((d) => ({ label: dateTimeShort(new Date(d).toISOString()), starts_at: new Date(d).toISOString() }));
    const fieldOptions = fieldIds.map((id) => ({ label: fields!.find((f) => f.id === id)!.name, field_id: id }));
    if ((kind === "data" || kind === "jogo") && validDates.some((d) => new Date(d) < new Date()))
      errs.options = "Tem horário que já passou.";
    if (kind === "data") options = dateOptions;
    else if (kind === "campo") options = fieldOptions;
    else if (kind === "jogo") {
      options = [...fieldOptions, ...dateOptions];
      if (fieldOptions.length < 1) errs.fields = "Escolha pelo menos 1 campo.";
      if (dateOptions.length < 1 && !errs.options) errs.options = "Coloque pelo menos 1 horário.";
      if (fieldOptions.length === 1 && dateOptions.length === 1 && !errs.fields)
        errs.fields = "Com 1 campo e 1 horário não há o que votar: coloque mais campos ou mais horários.";
    } else {
      options = [...new Set(texts.map((t) => t.trim()).filter(Boolean))].map((label) => ({ label }));
    }
    if (kind !== "jogo" && options.length < 2 && !errs.options) errs.options = "Coloque pelo menos 2 opções diferentes.";

    // perguntas extras no fim ("Bora de churras depois?")
    const extraOptions: { label: string; question: string }[] = [];
    const seen = new Set<string>();
    extras.forEach((x, i) => {
      const q = x.question.trim();
      const opts = [...new Set(x.options.map((o) => o.trim()).filter(Boolean))];
      if (!q) return void (errs[`extra-${i}`] = "Escreva a pergunta ou remova ela.");
      if (seen.has(q.toLowerCase())) return void (errs[`extra-${i}`] = "Essa pergunta já está na votação.");
      if (opts.length < 2) return void (errs[`extra-${i}`] = "Coloque pelo menos 2 respostas diferentes.");
      seen.add(q.toLowerCase());
      opts.forEach((label) => extraOptions.push({ label, question: q }));
    });
    options = [...options, ...extraOptions];
    if (closesAt && new Date(closesAt) < new Date()) errs.closesAt = "O prazo precisa ser no futuro.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    const sb = supabase();
    const { data: poll, error } = await sb
      .from("polls")
      .insert({ question: question.trim(), kind, multiple, closes_at: closesAt ? new Date(closesAt).toISOString() : null })
      .select("id")
      .single();
    if (error) {
      setSaving(false);
      return toast.error(friendlyError(error));
    }
    const { error: optErr } = await sb.from("poll_options").insert(options.map((o, i) => ({ ...o, poll_id: poll.id, position: i })));
    setSaving(false);
    if (optErr) {
      await sb.from("polls").delete().eq("id", poll.id);
      return toast.error(friendlyError(optErr));
    }
    setDirty(false);
    toast.success("Votação aberta! Mande o link no grupo para a galera votar.");
    router.push(`/votacoes/${poll.id}`);
  }

  if (!isOrganizer) return <ErrorState message="Só organizadores abrem votações. Quer sugerir uma? Fale com um deles." />;
  if (loadError) return <ErrorState message={loadError} onRetry={reload} />;
  if (!fields) return <Spinner />;

  const mark = () => setDirty(true);

  return (
    <>
      <PageHeader back={{ href: "/votacoes", label: "Votações" }} title="Nova votação" subtitle="Substitui a enquete do WhatsApp, com resultado sempre à vista." />
      <form id="poll-form" onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <FormField label="O que vocês vão decidir?">
            <Segmented
              label="Tipo de votação"
              value={kind}
              onChange={(k) => { changeKind(k); mark(); }}
              options={(Object.keys(KIND_META) as PollKind[]).map((k) => {
                const Icon = KIND_META[k].icon;
                return { value: k, label: <><Icon className="size-4" aria-hidden /> {KIND_META[k].label}</> };
              })}
            />
          </FormField>
          <FormField label="Pergunta" htmlFor="p-q" error={errors.question}>
            <Input id="p-q" value={question} onChange={(e) => { setQuestion(e.target.value); mark(); }} aria-invalid={!!errors.question} placeholder="Ex.: Vamos fazer churrasco depois?" />
          </FormField>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">Opções</h2>
          {kind === "data" && (
            <>
              {dates.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <Input type="datetime-local" aria-label={`Opção ${i + 1}`} value={d} step={900} onChange={(e) => { setDates(dates.map((x, j) => (j === i ? e.target.value : x))); mark(); }} />
                  <RemoveBtn disabled={dates.length <= 2} onClick={() => setDates(dates.filter((_, j) => j !== i))} />
                </div>
              ))}
              <AddBtn onClick={() => setDates([...dates, dates.at(-1) ? toLocalInput(addDays(new Date(dates.at(-1)!), 1)) : ""])}>Adicionar dia</AddBtn>
            </>
          )}

          {(kind === "campo" || kind === "jogo") && (
            <>
              {kind === "jogo" && <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">1. Campos</h3>}
              <FieldPicker
                fields={fields}
                selected={fieldIds}
                min={kind === "jogo" ? 1 : 2}
                onChange={(ids) => { setFieldIds(ids); mark(); }}
              />
              {errors.fields && <p className="text-sm font-medium text-danger" role="alert">{errors.fields}</p>}
            </>
          )}

          {kind === "jogo" && (
            <>
              <h3 className="mt-2 text-sm font-semibold uppercase tracking-wide text-muted">2. Horários</h3>
              {dates.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <Input type="datetime-local" aria-label={`Horário ${i + 1}`} value={d} step={900} onChange={(e) => { setDates(dates.map((x, j) => (j === i ? e.target.value : x))); mark(); }} />
                  <RemoveBtn disabled={dates.length <= 1} onClick={() => setDates(dates.filter((_, j) => j !== i))} />
                </div>
              ))}
              <AddBtn onClick={() => setDates([...dates, dates.at(-1) ? toLocalInput(addDays(new Date(dates.at(-1)!), 1)) : ""])}>Adicionar horário</AddBtn>
            </>
          )}

          {kind === "livre" && (
            <>
              {texts.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <Input aria-label={`Opção ${i + 1}`} placeholder={`Opção ${i + 1}`} value={t} onChange={(e) => { setTexts(texts.map((x, j) => (j === i ? e.target.value : x))); mark(); }} />
                  <RemoveBtn disabled={texts.length <= 2} onClick={() => setTexts(texts.filter((_, j) => j !== i))} />
                </div>
              ))}
              <AddBtn onClick={() => setTexts([...texts, ""])}>Adicionar opção</AddBtn>
            </>
          )}
          {errors.options && <p className="text-sm font-medium text-danger" role="alert">{errors.options}</p>}
        </Card>

        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="font-semibold">Perguntas extras <span className="font-normal text-muted">(opcional)</span></h2>
            <p className="text-sm text-muted">Aparecem no fim da votação. Cada uma vale um voto por pessoa.</p>
          </div>
          {extras.map((x, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <div className="flex gap-2">
                <Input
                  aria-label={`Pergunta extra ${i + 1}`}
                  placeholder="Ex.: Bora de churras depois?"
                  value={x.question}
                  onChange={(e) => { setExtras(extras.map((y, j) => (j === i ? { ...y, question: e.target.value } : y))); mark(); }}
                  aria-invalid={!!errors[`extra-${i}`]}
                />
                <Button type="button" variant="ghost" onClick={() => { setExtras(extras.filter((_, j) => j !== i)); mark(); }} aria-label="Remover pergunta" title="Remover pergunta">
                  <X className="size-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-1">
                <span className="text-sm text-muted">Respostas:</span>
                {x.options.map((o, k) => (
                  <span key={k} className="flex items-center gap-1">
                    <Input
                      aria-label={`Resposta ${k + 1} da pergunta ${i + 1}`}
                      value={o}
                      onChange={(e) => { setExtras(extras.map((y, j) => (j === i ? { ...y, options: y.options.map((z, w) => (w === k ? e.target.value : z)) } : y))); mark(); }}
                      className="min-h-9 w-36 text-sm"
                    />
                    {x.options.length > 2 && (
                      <button type="button" className="text-muted hover:text-ink" aria-label="Remover resposta" onClick={() => setExtras(extras.map((y, j) => (j === i ? { ...y, options: y.options.filter((_, w) => w !== k) } : y)))}>
                        <X className="size-3.5" />
                      </button>
                    )}
                  </span>
                ))}
                <Button type="button" size="sm" variant="ghost" onClick={() => setExtras(extras.map((y, j) => (j === i ? { ...y, options: [...y.options, ""] } : y)))}>
                  <Plus className="size-4" aria-hidden /> Resposta
                </Button>
              </div>
              {errors[`extra-${i}`] && <p className="text-sm font-medium text-danger" role="alert">{errors[`extra-${i}`]}</p>}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <AddBtn onClick={() => { setExtras([...extras, { question: "", options: [...EXTRA_DEFAULT_OPTIONS] }]); mark(); }}>Adicionar pergunta</AddBtn>
            {EXTRA_IDEAS.filter((q) => !extras.some((x) => x.question === q)).map((q) => (
              <button
                key={q}
                type="button"
                className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:border-ink/40 hover:text-ink"
                onClick={() => { setExtras([...extras, { question: q, options: [...EXTRA_DEFAULT_OPTIONS] }]); mark(); }}
              >
                + {q}
              </button>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 size-4 accent-[var(--gold-deep)]" checked={multiple} onChange={(e) => { setMultiple(e.target.checked); mark(); }} />
            <span>
              <span className="block font-medium">{kind === "jogo" ? "Cada um pode marcar mais de um horário" : "Cada um pode marcar mais de uma opção"}</span>
              <span className="text-sm text-muted">
                {kind === "jogo"
                  ? "Recomendado: cada um marca todos os horários que pode. O campo é sempre um voto por pessoa."
                  : "Bom para “quais dias você pode?”. Desmarcado, vale um voto por pessoa."}
              </span>
            </span>
          </label>
          <FormField label="Encerrar automaticamente em" htmlFor="p-close" optional error={errors.closesAt} hint="Sem prazo, fica aberta até você encerrar.">
            <Input id="p-close" type="datetime-local" value={closesAt} onChange={(e) => { setClosesAt(e.target.value); mark(); }} aria-invalid={!!errors.closesAt} />
          </FormField>
        </Card>

        <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-line bg-bg/95 p-3 backdrop-blur md:bottom-4">
          <span className="mr-auto hidden text-sm text-muted sm:block">
            <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> abre a votação
          </span>
          <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={saving}>Abrir votação</Button>
        </div>
        <HelpTip title="Dica">
          <p>Para decidir campo <em>e</em> horário de uma vez, use <strong>Campo e horário</strong>: cada um escolhe o campo (vendo a foto e onde fica) e depois os horários que pode.</p>
        </HelpTip>
      </form>
    </>
  );
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant="ghost" className="self-start" onClick={onClick}>
      <Plus className="size-4" aria-hidden /> {children}
    </Button>
  );
}

function RemoveBtn({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button type="button" variant="ghost" onClick={onClick} disabled={disabled} aria-label="Remover opção" title={disabled ? "Precisa de pelo menos 2 opções" : "Remover opção"}>
      <X className="size-4" />
    </Button>
  );
}

const normName = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Campos para marcar. Avisa nome repetido (provável campo cadastrado duas vezes) e não deixa marcar os dois. */
function FieldPicker({ fields, selected, min, onChange }: { fields: FieldRow[]; selected: string[]; min: number; onChange: (ids: string[]) => void }) {
  if (fields.length < min)
    return (
      <p className="text-muted">
        Precisa de pelo menos {min} {min > 1 ? "campos cadastrados" : "campo cadastrado"}. <Link className="underline" href="/campos/novo">Cadastrar campo</Link>
      </p>
    );
  const names = fields.map((f) => normName(f.name));
  const repeated = new Set(names.filter((n, i) => names.indexOf(n) !== i));
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
      {fields.map((f) => {
        const on = selected.includes(f.id);
        const twin = !on && selected.some((id) => normName(fields.find((x) => x.id === id)?.name ?? "") === normName(f.name));
        return (
          <li key={f.id}>
            <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-3", on ? "border-ink bg-surface-2" : "border-line", twin && "opacity-50")}>
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--gold-deep)]"
                checked={on}
                disabled={twin}
                onChange={() => onChange(on ? selected.filter((x) => x !== f.id) : [...selected, f.id])}
              />
              <span className="min-w-0">
                <span className="block font-medium">{f.name}</span>
                <span className="block truncate text-sm text-muted">
                  {f.price_per_hour != null ? `${brl(f.price_per_hour)}/h` : "sem preço"}
                  {f.address && ` · ${f.address}`}
                </span>
                {repeated.has(normName(f.name)) && (
                  <span className="mt-1 block text-xs font-medium text-gold-ink">
                    Tem outro campo com esse nome; pode estar cadastrado duas vezes.{" "}
                    <Link href={`/campos/${f.id}`} className="underline">Conferir</Link>
                  </span>
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

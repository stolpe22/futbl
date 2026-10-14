"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, Link2, MapPin, MousePointerClick, Search, Undo2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { phoneMask } from "@/lib/format";
import {
  googleMapsSearchUrl,
  inGoiania,
  isGoogleMapsUrl,
  resolveGoogleMapsUrl,
  reverseGeocode,
  googleContact,
  searchNewPlaces,
  type PlaceResult,
  type SearchOutcome,
} from "@/lib/geo";
import { useSubmitShortcut, useUnsavedGuard } from "@/lib/hooks";
import { SURFACE_LABEL, type FieldRow, type Surface } from "@/lib/types";
import { FieldsMap, type LatLng } from "./map";
import { PlacePhoto, mapsPlaceUrl } from "./field-photo";
import { Button, Card, FormField, HelpTip, Input, Kbd, Notice, Segmented, Select, Textarea } from "./ui";

export type FieldValues = Values;

type Values = {
  name: string;
  address: string;
  surface: Surface;
  price_per_hour: string;
  price_notes: string;
  phone: string;
  website: string;
  instagram: string;
  other_social: string;
  maps_url: string;
  notes: string;
};

const EMPTY: Values = {
  name: "",
  address: "",
  surface: "society",
  price_per_hour: "",
  price_notes: "",
  phone: "",
  website: "",
  instagram: "",
  other_social: "",
  maps_url: "",
  notes: "",
};

type LocateMode = "buscar" | "link" | "mapa";

export function FieldForm({
  initial,
  prefill,
  existing,
}: {
  initial?: FieldRow;
  prefill?: Partial<Values> & { lat?: number; lng?: number; googleId?: string };
  existing: FieldRow[];
}) {
  const router = useRouter();
  const editing = !!initial;
  const start: Values = initial
    ? {
        ...EMPTY,
        ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v == null ? "" : String(v)])),
        surface: initial.surface,
      }
    : { ...EMPTY, ...prefill, phone: prefill?.phone ? phoneMask(prefill.phone) : "" };

  const [v, setV] = useState<Values>(start);
  const [pos, setPos] = useState<LatLng | null>(
    initial ? { lat: initial.lat, lng: initial.lng } : prefill?.lat != null && prefill?.lng != null ? { lat: prefill.lat, lng: prefill.lng } : null,
  );
  // de onde o pino veio (busca, link ou o já salvo): dá para voltar se arrastar sem querer
  const [origin, setOrigin] = useState<(LatLng & { from: string }) | null>(
    initial
      ? { lat: initial.lat, lng: initial.lng, from: "salvo" }
      : prefill?.lat != null && prefill?.lng != null
        ? { lat: prefill.lat, lng: prefill.lng, from: "da busca" }
        : null,
  );
  // ID do lugar no Google: o único dado do Google que pode ser guardado. Serve para a foto.
  const [googleId, setGoogleId] = useState<string | null>(initial?.google_place_id ?? prefill?.googleId ?? null);
  // foto do lugar escolhido agora (não na edição, para não gastar foto a cada vez que abre)
  const [photoFor, setPhotoFor] = useState<string | null>(prefill?.googleId ?? null);
  const [focus, setFocus] = useState<(LatLng & { zoom?: number }) | null>(pos ? { ...pos, zoom: 16 } : null);
  const [mode, setMode] = useState<LocateMode>("buscar");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [engine, setEngine] = useState<Pick<SearchOutcome, "engine" | "reason"> | null>(null);
  const [fitTo, setFitTo] = useState<LatLng[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useUnsavedGuard(dirty && !saving);
  useSubmitShortcut("field-form");

  const set = <K extends keyof Values>(k: K, val: Values[K]) => {
    setV((s) => ({ ...s, [k]: val }));
    setDirty(true);
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  async function choosePosition(p: LatLng, opts?: { address?: string; name?: string; fly?: boolean }) {
    setPos(p);
    setDirty(true);
    setErrors((e) => ({ ...e, pos: "" }));
    if (opts?.fly !== false) setFocus({ ...p, zoom: 17 });
    if (opts?.name && !v.name) setV((s) => ({ ...s, name: opts.name! }));
    if (opts?.address) setV((s) => ({ ...s, address: opts.address! }));
    else if (!v.address) {
      const addr = await reverseGeocode(p.lat, p.lng);
      if (addr) setV((s) => (s.address ? s : { ...s, address: addr }));
    }
  }

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    if (query.trim().length < 3) return setSearchMsg("Digite pelo menos 3 letras.");
    setSearching(true);
    setSearchMsg(null);
    try {
      const out = await searchNewPlaces(query.trim());
      setResults(out.results);
      setEngine(out);
      if (!out.results.length)
        setSearchMsg("Nada encontrado em Goiânia com esse nome. Tente o endereço, ou cole o link do Google Maps.");
      else setFitTo(out.results.map((r) => ({ lat: r.lat, lng: r.lng })));
    } catch (err) {
      setSearchMsg(friendlyError(err));
    } finally {
      setSearching(false);
    }
  }

  /** Busca telefone e site no Google (só preenche o que estiver vazio) */
  async function fillContact(googleId: string) {
    const c = await googleContact(googleId);
    if (c === "limit") {
      toast.info("O telefone e o site do Google pausaram até o mês que vem (limite grátis). Preencha à mão, se souber.", { duration: 8000 });
      return false;
    }
    if (!c || (!c.phone && !c.website)) return false;
    setV((s) => ({
      ...s,
      phone: s.phone || (c.phone ? phoneMask(c.phone) : ""),
      website: s.website || c.website || "",
    }));
    return true;
  }

  // veio da página de Campos com um lugar do Google já escolhido
  const prefilledContact = useRef(false);
  useEffect(() => {
    if (prefill?.googleId && !prefilledContact.current) {
      prefilledContact.current = true;
      fillContact(prefill.googleId);
    }
  }, [prefill?.googleId]);

  async function pickResult(place: PlaceResult) {
    setOrigin({ lat: place.lat, lng: place.lng, from: "da busca" });
    choosePosition({ lat: place.lat, lng: place.lng }, { address: place.address, name: place.name });
    setV((s) => ({
      ...s,
      name: s.name || place.name,
      phone: s.phone || (place.phone ? phoneMask(place.phone) : ""),
      website: s.website || place.website || "",
      instagram: s.instagram || place.instagram || "",
      maps_url: s.maps_url || place.mapsUrl || "",
    }));
    setResults([]);
    setFitTo(null);
    setGoogleId(place.source === "google" ? place.id : null);
    setPhotoFor(place.source === "google" ? place.id : null);
    const gotContact = place.source === "google" ? await fillContact(place.id) : !!(place.phone || place.website);
    toast.success(
      gotContact ? "Local marcado e contato preenchido. Confira os dados abaixo." : "Local marcado no mapa. Agora complete os dados abaixo.",
    );
  }

  async function applyLink() {
    setLinkMsg(null);
    if (!isGoogleMapsUrl(link)) return setLinkMsg("Isso não parece um link do Google Maps. Ele começa com maps.app.goo.gl ou google.com/maps.");
    setSearching(true);
    const r = await resolveGoogleMapsUrl(link).catch(() => null);
    setSearching(false);
    if (!r) return setLinkMsg("Não consegui ler a posição desse link. Abra o lugar no Google Maps, toque em Compartilhar → Copiar link e cole de novo.");
    if (!inGoiania(r.lat, r.lng)) return setLinkMsg("Esse lugar fica fora da região de Goiânia. Confira se copiou o link certo.");
    setV((s) => ({ ...s, maps_url: link.trim(), name: s.name || r.name || "" }));
    setGoogleId(null);
    setPhotoFor(null);
    setOrigin({ lat: r.lat, lng: r.lng, from: "do link" });
    choosePosition({ lat: r.lat, lng: r.lng }, { name: r.name });
    toast.success("Pegamos a posição do link. Confira o pino no mapa.");
  }

  // Prevenção de erro: campo parecido já cadastrado
  const duplicate = useMemo(() => {
    const others = existing.filter((f) => f.id !== initial?.id);
    const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
    return others.find(
      (f) =>
        (v.name.trim().length > 3 && norm(f.name) === norm(v.name)) ||
        (pos && Math.abs(f.lat - pos.lat) < 0.0007 && Math.abs(f.lng - pos.lng) < 0.0007),
    );
  }, [existing, v.name, pos, initial?.id]);

  function validate() {
    const e: Record<string, string> = {};
    if (!v.name.trim()) e.name = "Dê um nome para o campo.";
    if (!pos) e.pos = "Marque onde fica o campo: busque, cole o link do Google Maps ou clique no mapa.";
    else if (!inGoiania(pos.lat, pos.lng)) e.pos = "O ponto está fora da região de Goiânia.";
    if (v.price_per_hour && (isNaN(Number(v.price_per_hour.replace(",", "."))) || Number(v.price_per_hour.replace(",", ".")) < 0))
      e.price_per_hour = "Use só números, tipo 180 ou 180,50.";
    const digits = v.phone.replace(/\D/g, "");
    if (v.phone && (digits.length < 10 || digits.length > 11)) e.phone = "Telefone com DDD, tipo (62) 99999-0000.";
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(e.pos ? "local" : "f-" + Object.keys(e)[0])?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return Object.keys(e).length === 0;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!validate() || !pos) return;
    setSaving(true);
    const row = {
      name: v.name.trim(),
      address: v.address.trim() || null,
      lat: pos.lat,
      lng: pos.lng,
      surface: v.surface,
      price_per_hour: v.price_per_hour ? Number(v.price_per_hour.replace(",", ".")) : null,
      price_notes: v.price_notes.trim() || null,
      phone: v.phone.trim() || null,
      website: v.website.trim() || null,
      instagram: v.instagram.trim() || null,
      other_social: v.other_social.trim() || null,
      maps_url: v.maps_url.trim() || null,
      google_place_id: googleId,
      notes: v.notes.trim() || null,
    };
    const sb = supabase();
    const save = (r: Partial<typeof row>) =>
      editing
        ? sb.from("fields").update({ ...r, updated_at: new Date().toISOString() }).eq("id", initial!.id).select("id").single()
        : sb.from("fields").insert(r).select("id").single();
    let res = await save(row);
    // banco ainda sem a coluna google_place_id (schema.sql antigo): salva sem ela
    if (res.error && /google_place_id/.test(res.error.message ?? "")) {
      const { google_place_id: _, ...rest } = row;
      res = await save(rest);
    }
    setSaving(false);
    if (res.error) return toast.error(friendlyError(res.error));
    setDirty(false);
    toast.success(editing ? "Campo atualizado." : "Campo cadastrado! Já aparece no mapa.");
    router.push(`/campos/${res.data.id}`);
  }

  return (
    <form id="field-form" onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      {/* ---------------- Onde fica ---------------- */}
      <section id="local" className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start" aria-labelledby="local-title">
        <div>
          <h2 id="local-title" className="text-xl font-bold">1. Onde fica?</h2>
          <p className="text-sm text-muted">Escolha um jeito de marcar o local. Dá para arrastar o pino depois.</p>
        </div>
        <Segmented<LocateMode>
          label="Como marcar o local"
          value={mode}
          onChange={setMode}
          options={[
            { value: "buscar", label: <><Search className="size-4" aria-hidden /> Buscar</> },
            { value: "link", label: <><Link2 className="size-4" aria-hidden /> Link do Google</> },
            { value: "mapa", label: <><MousePointerClick className="size-4" aria-hidden /> No mapa</> },
          ]}
        />

        {mode === "buscar" && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                aria-label="Buscar lugar ou endereço em Goiânia"
                placeholder="Nome do campo ou endereço"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch(e)}
              />
              <Button type="button" onClick={() => runSearch()} loading={searching}>
                Buscar
              </Button>
            </div>
            {searchMsg && <p className="text-sm text-muted" role="status">{searchMsg}</p>}
            {engine && results.length > 0 && (
              <p className="text-xs text-muted" role="status">
                {engine.engine === "google" ? "Resultados do Google, marcados em verde no mapa. Ao escolher, trazemos telefone e site." : "Resultados da busca gratuita (OpenStreetMap), marcados em verde no mapa."}
              </p>
            )}
            {engine?.reason && (
              <Notice>
                {engine.reason} <Link href="/ajuda#google" className="underline">Entenda</Link>
              </Notice>
            )}
            {results.length > 0 && (
              <ul className="max-h-56 divide-y divide-line overflow-auto rounded-xl border border-line bg-surface">
                {results.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => pickResult(r)} className="w-full px-3.5 py-2.5 text-left hover:bg-surface-2">
                      <span className="block font-medium">{r.name}</span>
                      <span className="block truncate text-sm text-muted">{r.address}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-muted">
              Não achou? Procure no{" "}
              <a className="font-medium text-gold-ink underline" href={googleMapsSearchUrl(query || "campo society")} target="_blank" rel="noopener noreferrer">
                Google Maps <ExternalLink className="inline size-3.5" aria-hidden />
              </a>{" "}
              e use a opção “Link do Google”.
            </p>
          </div>
        )}

        {mode === "link" && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                aria-label="Link do Google Maps"
                placeholder="https://maps.app.goo.gl/…"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  }
                }}
              />
              <Button type="button" onClick={applyLink} loading={searching}>
                Usar
              </Button>
            </div>
            {linkMsg && (
              <p className="flex items-start gap-1.5 text-sm font-medium text-danger" role="alert">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {linkMsg}
              </p>
            )}
            <HelpTip title="Como pegar o link no Google Maps?">
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  Abra o{" "}
                  <a className="underline" href={googleMapsSearchUrl("campo society")} target="_blank" rel="noopener noreferrer">
                    Google Maps
                  </a>{" "}
                  e procure o campo.
                </li>
                <li>Toque no lugar e depois em <strong>Compartilhar</strong>.</li>
                <li>Escolha <strong>Copiar link</strong> e cole aqui.</li>
              </ol>
            </HelpTip>
          </div>
        )}

        {mode === "mapa" && (
          <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-muted">
            <MapPin className="size-4 shrink-0" aria-hidden /> Clique no mapa onde fica o campo. Dê zoom para acertar.
          </p>
        )}

        <FieldsMap
          className="h-[340px] lg:h-[460px]"
          fields={existing.filter((f) => f.id !== initial?.id)}
          searchResults={results}
          fitTo={fitTo}
          onPlaceChoose={pickResult}
          pick={pos}
          onPick={(p) => choosePosition(p, { fly: false })}
          focus={focus}
        />
        {errors.pos ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-danger" role="alert">
            <AlertTriangle className="size-4 shrink-0" aria-hidden /> {errors.pos}
          </p>
        ) : pos ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-sm text-confirma" role="status">✓ Local marcado. Arraste o pino verde se precisar ajustar.</p>
            {origin && (Math.abs(origin.lat - pos.lat) > 0.00001 || Math.abs(origin.lng - pos.lng) > 0.00001) && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPos({ lat: origin.lat, lng: origin.lng });
                  setFocus({ lat: origin.lat, lng: origin.lng, zoom: 17 });
                  toast.success("Pino de volta no lugar original.");
                }}
              >
                <Undo2 className="size-4" aria-hidden /> Voltar o pino para o lugar {origin.from === "salvo" ? "salvo" : `original (${origin.from})`}
              </Button>
            )}
          </div>
        ) : null}
        {photoFor && (
          <div className="max-w-md">
            <p className="mb-1.5 text-sm font-medium">É este o lugar?</p>
            <PlacePhoto key={photoFor} placeId={photoFor} name={v.name || "o campo"} mapsUrl={mapsPlaceUrl(v.name, photoFor)} auto />
          </div>
        )}
      </section>

      {/* ---------------- Dados ---------------- */}
      <section className="flex flex-col gap-5" aria-labelledby="dados-title">
        <h2 id="dados-title" className="text-xl font-bold">2. Dados do campo</h2>

        {duplicate && (
          <div className="flex items-start gap-2 rounded-xl border border-gold/50 bg-talvez-bg px-3.5 py-3 text-sm" role="status">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-ink" aria-hidden />
            <p>
              Parece que esse campo já está cadastrado:{" "}
              <Link href={`/campos/${duplicate.id}`} className="font-semibold underline">
                {duplicate.name}
              </Link>
              . Confira antes de salvar para não duplicar.
            </p>
          </div>
        )}

        <Card className="flex flex-col gap-4">
          <FormField label="Nome do campo" htmlFor="f-name" error={errors.name}>
            <Input id="f-name" value={v.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} placeholder="Ex.: Arena Society Jardim Goiás" />
          </FormField>
          <FormField label="Endereço" htmlFor="f-address" optional hint="Preenchemos sozinho quando você marca no mapa.">
            <Input id="f-address" value={v.address} onChange={(e) => set("address", e.target.value)} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Tipo de piso" htmlFor="f-surface">
              <Select id="f-surface" value={v.surface} onChange={(e) => set("surface", e.target.value as Surface)}>
                {Object.entries(SURFACE_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Preço por hora (R$)" htmlFor="f-price_per_hour" optional error={errors.price_per_hour}>
              <Input
                id="f-price_per_hour"
                inputMode="decimal"
                placeholder="Ex.: 200"
                value={v.price_per_hour}
                onChange={(e) => set("price_per_hour", e.target.value.replace(/[^\d,.]/g, ""))}
                aria-invalid={!!errors.price_per_hour}
              />
            </FormField>
          </div>
          <FormField label="Observações sobre preço" htmlFor="f-price_notes" optional hint="Ex.: R$ 250 depois das 19h, mensalista paga menos.">
            <Input id="f-price_notes" value={v.price_notes} onChange={(e) => set("price_notes", e.target.value)} />
          </FormField>
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="font-semibold">Contato e redes</h3>
          <FormField label="Telefone / WhatsApp" htmlFor="f-phone" optional error={errors.phone} hint="Vira um botão de WhatsApp na página do campo.">
            <Input id="f-phone" type="tel" inputMode="tel" placeholder="(62) 99999-0000" value={v.phone} onChange={(e) => set("phone", phoneMask(e.target.value))} aria-invalid={!!errors.phone} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Instagram" htmlFor="f-instagram" optional hint="Pode ser @perfil ou o link.">
              <Input id="f-instagram" placeholder="@arenasociety" value={v.instagram} onChange={(e) => set("instagram", e.target.value)} />
            </FormField>
            <FormField label="Site" htmlFor="f-website" optional>
              <Input id="f-website" inputMode="url" placeholder="arenasociety.com.br" value={v.website} onChange={(e) => set("website", e.target.value)} />
            </FormField>
          </div>
          <FormField label="Outra rede social" htmlFor="f-other_social" optional hint="Facebook, TikTok, link de agendamento…">
            <Input id="f-other_social" inputMode="url" value={v.other_social} onChange={(e) => set("other_social", e.target.value)} />
          </FormField>
          <FormField label="Link do Google Maps" htmlFor="f-maps_url" optional>
            <Input id="f-maps_url" inputMode="url" value={v.maps_url} onChange={(e) => set("maps_url", e.target.value)} />
          </FormField>
          <FormField label="Anotações" htmlFor="f-notes" optional hint="Estacionamento, vestiário, churrasqueira, iluminação…">
            <Textarea id="f-notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} />
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
            {editing ? "Salvar alterações" : "Cadastrar campo"}
          </Button>
        </div>
      </section>
    </form>
  );
}

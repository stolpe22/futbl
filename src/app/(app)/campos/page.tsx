"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Lightbulb, Loader2, Navigation, Plus, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { must, useLoad } from "@/components/session";
import { FieldsMap } from "@/components/map";
import { FieldLinks } from "@/components/field-links";
import { SuggestDialog } from "@/components/suggest-dialog";
import { PlacePhoto, mapsPlaceUrl } from "@/components/field-photo";
import { Badge, Button, EmptyState, ErrorState, HelpTip, Input, LinkButton, Notice, Segmented, Select, Skeleton, cx } from "@/components/ui";
import { categorize, searchNewPlaces, type Bbox, type PlaceResult, type SearchOutcome } from "@/lib/geo";
import { brl, directionsUrl } from "@/lib/format";
import { SURFACE_LABEL, type FieldRow, type Surface } from "@/lib/types";

const PRICE_FILTERS = [
  { value: "", label: "Qualquer preço" },
  { value: "150", label: "Até R$ 150/h" },
  { value: "200", label: "Até R$ 200/h" },
  { value: "300", label: "Até R$ 300/h" },
];

type Tab = "grupo" | "encontrados";
type Found = SearchOutcome & { label: string; area?: Bbox; auto?: boolean };
type Selected = { kind: Tab; id: string } | null;

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.abs(a.lat - b.lat) < 0.0008 && Math.abs(a.lng - b.lng) < 0.0008; // ≈ 80 m

export default function CamposPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useLoad(
    async () => must(await supabase().from("fields").select("*").order("name")) as FieldRow[],
    [],
  );
  const [q, setQ] = useState("");
  const [surface, setSurface] = useState<"" | Surface>("");
  const [maxPrice, setMaxPrice] = useState("");
  const [tab, setTab] = useState<Tab>("grupo");
  const [selected, setSelected] = useState<Selected>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [area, setArea] = useState<Bbox | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [searching, setSearching] = useState(false);
  const [suggestField, setSuggestField] = useState<string | null>(null);

  // ---------------- campos do grupo (filtrados) ----------------
  const fields = useMemo(
    () =>
      (data ?? []).filter(
        (f) =>
          (!q || norm(`${f.name} ${f.address ?? ""}`).includes(norm(q))) &&
          (!surface || f.surface === surface) &&
          (!maxPrice || (f.price_per_hour != null && f.price_per_hour <= Number(maxPrice))),
      ),
    [data, q, surface, maxPrice],
  );
  const filtersOn = !!(q || surface || maxPrice);

  // ---------------- encontrados (numerados igual no mapa e na lista) ----------------
  const foundItems = useMemo(
    () =>
      (found?.results ?? []).map((p, i) => ({
        ...p,
        n: i + 1,
        saved: data?.find((f) => near(f, p)),
        cats: categorize(p.name),
      })),
    [found, data],
  );
  const newPins = useMemo(() => foundItems.filter((p) => !p.saved), [foundItems]);

  // mapa enquadra o resultado: busca nova, ou campos do grupo filtrados pelo texto
  const fitKey = found && !found.auto ? "f:" + foundItems.map((p) => p.id).join() : q.trim().length >= 2 ? "g:" + fields.map((f) => f.id).join() : "";
  const fitTo = useMemo(() => {
    if (fitKey.startsWith("f:")) return foundItems.length ? foundItems.map((p) => ({ lat: p.lat, lng: p.lng })) : null;
    if (fitKey.startsWith("g:")) return fields.length ? fields.map((f) => ({ lat: f.lat, lng: f.lng })) : null;
    return null;
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // o mapa mexeu desde a última busca? então destaca "buscar nesta área"
  const areaChanged =
    !!area &&
    (!found?.area ||
      Math.abs(area.north - found.area.north) +
        Math.abs(area.south - found.area.south) +
        Math.abs(area.east - found.area.east) +
        Math.abs(area.west - found.area.west) >
        0.01);

  async function search(opts: { useArea: boolean; auto?: boolean }) {
    const term = opts.auto ? "" : q.trim();
    if (!opts.useArea && term.length < 3) return;
    setSearching(true);
    try {
      const out = await searchNewPlaces(term, opts.useArea && area ? area : undefined);
      setFound({
        ...out,
        auto: opts.auto,
        area: opts.useArea && area ? area : undefined,
        label: term ? `“${term}”${opts.useArea ? " nesta área" : " em Goiânia"}` : "campos nesta área",
      });
      // na carga automática, só troca de aba se o grupo ainda não tem campos
      if (!opts.auto || (data && data.length === 0)) setTab("encontrados");
      setSelected(null);
    } finally {
      setSearching(false);
    }
  }

  // ao abrir a página, já busca os campos da área do mapa (usa o cache de 1 h, então
  // abrir várias vezes não gasta cota do Google)
  const autoLoaded = useRef(false);
  useEffect(() => {
    if (area && data && !autoLoaded.current) {
      autoLoaded.current = true;
      search({ useArea: true, auto: true });
    }
  }, [area, data]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectItem(kind: Tab, id: string, at: { lat: number; lng: number }, fromMap = false) {
    setSelected({ kind, id });
    setTab(kind);
    if (fromMap) setTimeout(() => document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    else setFocus({ ...at, zoom: 16 });
  }

  function register(p: PlaceResult) {
    const params = new URLSearchParams({ name: p.name, lat: String(p.lat), lng: String(p.lng) });
    if (p.address) params.set("address", p.address);
    if (p.mapsUrl) params.set("maps_url", p.mapsUrl);
    if (p.source === "google") params.set("gid", p.id);
    router.push(`/campos/novo?${params}`);
  }

  function clearAll() {
    setQ("");
    setSurface("");
    setMaxPrice("");
    setFound(null);
    setTab("grupo");
    setSelected(null);
  }

  // Esc fecha os resultados encontrados (saída rápida)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && found && !document.querySelector("dialog[open]")) {
        setFound(null);
        setTab("grupo");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [found]);

  const mapOverlay = (
    <button
      type="button"
      onClick={() => search({ useArea: true })}
      disabled={searching}
      className={cx(
        "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-lg transition-colors disabled:opacity-70",
        areaChanged || !found
          ? "border-transparent bg-gold text-[#1a160e] hover:bg-gold-deep hover:text-white"
          : "border-line bg-surface text-ink hover:bg-surface-2",
      )}
    >
      {searching ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
      {searching ? "Buscando…" : q.trim() ? `Buscar “${q.trim()}” nesta área` : "Buscar campos nesta área"}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Campos</h1>
          <p className="mt-1 text-muted">
            {data ? `${data.length} ${data.length === 1 ? "campo do grupo" : "campos do grupo"} em Goiânia e região` : "Lugares para alugar em Goiânia"}
          </p>
        </div>
        <LinkButton href="/campos/novo" variant="primary" title="Atalho: n">
          <Plus className="size-4" aria-hidden /> Adicionar campo
        </LinkButton>
      </header>

      {/* Busca e filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            data-search
            aria-label="Buscar campo por nome ou bairro"
            placeholder="Nome ou bairro. Enter procura em Goiânia  ( / )"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search({ useArea: false })}
            className="pl-9 pr-9"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-ink"
              aria-label="Limpar busca"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
        <Select aria-label="Tipo de piso" value={surface} onChange={(e) => setSurface(e.target.value as Surface | "")} className="w-0 flex-1 sm:w-auto sm:flex-none">
          <option value="">Todos os pisos</option>
          {Object.entries(SURFACE_LABEL).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </Select>
        <Select aria-label="Preço máximo por hora" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-0 flex-1 sm:w-auto sm:flex-none">
          {PRICE_FILTERS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </Select>
        </div>
        {(filtersOn || found) && (
          <button type="button" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline" onClick={clearAll}>
            Limpar tudo
          </button>
        )}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(300px,360px)_1fr] lg:grid-cols-[400px_1fr]">
          {/* Mapa: em cima no celular, à direita no computador */}
          <div className="min-w-0 md:order-2">
            <FieldsMap
              className="h-[42vh] min-h-[300px] md:sticky md:top-20 md:h-[calc(100dvh-14rem)] md:min-h-[480px]"
              fields={fields}
              selectedId={selected?.kind === "grupo" ? selected.id : null}
              onSelect={(id) => {
                const f = fields.find((x) => x.id === id);
                if (f) selectItem("grupo", id, f, true);
              }}
              searchResults={newPins}
              selectedPlaceId={selected?.kind === "encontrados" ? selected.id : null}
              onPlaceSelect={(p) => selectItem("encontrados", p.id, p, true)}
              onPlaceChoose={register}
              placeActionLabel="Cadastrar este campo"
              focus={focus}
              fitTo={fitTo}
              onBoundsChange={setArea}
              overlay={mapOverlay}
            />
          </div>

          {/* Lista: embaixo no celular, à esquerda no computador */}
          <section aria-label="Lista de campos" className="flex min-w-0 flex-col gap-3 md:order-1 md:h-[calc(100dvh-14rem)] md:min-h-[480px]">
            <Segmented<Tab>
              label="O que mostrar na lista"
              value={tab}
              onChange={setTab}
              options={[
                { value: "grupo", label: <>Do grupo <CountPill n={fields.length} /></> },
                { value: "encontrados", label: <>Encontrados <CountPill n={found ? foundItems.length : 0} /></> },
              ]}
            />

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
              {tab === "grupo" ? (
                loading && !data ? (
                  Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 shrink-0" />)
                ) : fields.length === 0 ? (
                  filtersOn ? (
                    <EmptyState icon="🔍" title="Nenhum campo do grupo com esses filtros">
                      {q.trim().length >= 3 ? (
                        <Button variant="primary" size="sm" className="mt-1" onClick={() => search({ useArea: false })} loading={searching}>
                          Procurar “{q.trim()}” em Goiânia
                        </Button>
                      ) : (
                        <>
                          Tente outro nome ou <button className="underline" onClick={clearAll}>limpe os filtros</button>.
                        </>
                      )}
                    </EmptyState>
                  ) : (
                    <EmptyState icon="🏟️" title="Nenhum campo cadastrado ainda">
                      Mova o mapa até o bairro onde vocês jogam e toque em <strong>Buscar campos nesta área</strong>.
                    </EmptyState>
                  )
                ) : (
                  fields.map((f) => (
                    <SavedItem
                      key={f.id}
                      field={f}
                      selected={selected?.kind === "grupo" && selected.id === f.id}
                      onSelect={() => selectItem("grupo", f.id, f)}
                      onSuggest={() => setSuggestField(f.id)}
                    />
                  ))
                )
              ) : !found ? (
                <EmptyState icon="🧭" title="Procure campos novos">
                  Mova o mapa até a região que você quer e toque em <strong>Buscar campos nesta área</strong>. Ou digite um nome e aperte Enter.
                </EmptyState>
              ) : (
                <>
                  {found.reason && (
                    <Notice>
                      {found.reason} <Link href="/ajuda#google" className="underline">Entenda</Link>
                    </Notice>
                  )}
                  <div className="flex items-start justify-between gap-2 px-1">
                    <p className="text-sm text-muted" role="status">
                      <strong className="text-ink">{foundItems.length}</strong> {foundItems.length === 1 ? "resultado" : "resultados"} para {found.label}
                      <span className="block text-xs">
                        {found.engine === "google" ? "Fonte: Google" : "Fonte: OpenStreetMap"}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setFound(null);
                        setTab("grupo");
                      }}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
                      aria-label="Fechar resultados (Esc)"
                      title="Fechar resultados (Esc)"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  {foundItems.length === 0 ? (
                    <EmptyState icon="🤷" title="Nada encontrado aqui">
                      Diminua o zoom ou mova o mapa e busque de novo.
                    </EmptyState>
                  ) : (
                    foundItems.map((p) => (
                      <FoundItem
                        key={p.id}
                        item={p}
                        selected={selected?.kind === "encontrados" && selected.id === p.id}
                        onSelect={() => (p.saved ? selectItem("grupo", p.saved.id, p.saved) : selectItem("encontrados", p.id, p))}
                        onRegister={() => register(p)}
                      />
                    ))
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}

      <SuggestDialog open={!!suggestField} fieldId={suggestField ?? undefined} onClose={() => setSuggestField(null)} />

      <HelpTip>
        <p>⚽ <strong>Pinos amarelos</strong> são os campos do grupo. Digitar na busca filtra a lista e o mapa.</p>
        <p>🟢 <strong>Pinos verdes numerados</strong> são lugares encontrados que ainda não são do grupo. O número do pino é o mesmo da lista.</p>
        <p>Mova o mapa até um bairro e toque em <strong>Buscar campos nesta área</strong>. Achou um bom? Toque em <strong>Cadastrar</strong>.</p>
        <p>📷 Toque num lugar encontrado para ver a foto dele. Cada lugar aberto gasta 1 foto da cota grátis do mês.</p>
      </HelpTip>
    </div>
  );
}

function CountPill({ n }: { n: number }) {
  return <span className="ml-1 rounded-full bg-surface-2 px-1.5 text-xs font-semibold text-muted">{n}</span>;
}

function SavedItem({
  field,
  selected,
  onSelect,
  onSuggest,
}: {
  field: FieldRow;
  selected: boolean;
  onSelect: () => void;
  onSuggest: () => void;
}) {
  return (
    <article
      id={`item-${field.id}`}
      className={cx(
        "shrink-0 cursor-pointer rounded-2xl border bg-surface p-3.5 transition-colors hover:border-ink/40",
        selected ? "border-gold ring-2 ring-gold/40" : "border-line",
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-gold text-sm" aria-hidden>
          ⚽
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{field.name}</h2>
          {field.address && <p className="truncate text-sm text-muted">{field.address}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge>{SURFACE_LABEL[field.surface]}</Badge>
            <span className="text-sm font-semibold">
              {field.price_per_hour != null ? `${brl(field.price_per_hour)}/h` : <span className="font-normal text-muted">sem preço</span>}
            </span>
          </div>
        </div>
      </div>
      {selected && (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3" onClick={(e) => e.stopPropagation()}>
          <FieldLinks field={field} compact />
          <Button size="sm" variant="primary" className="self-start" onClick={onSuggest}>
            <Lightbulb className="size-4" aria-hidden /> Sugerir jogo aqui
          </Button>
          <Link href={`/campos/${field.id}`} className="inline-flex items-center gap-1 self-start text-sm font-semibold text-gold-ink hover:underline">
            Ver detalhes, preço e jogos <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}
    </article>
  );
}

function FoundItem({
  item,
  selected,
  onSelect,
  onRegister,
}: {
  item: PlaceResult & { n: number; saved?: FieldRow; cats: { id: string; label: string }[] };
  selected: boolean;
  onSelect: () => void;
  onRegister: () => void;
}) {
  return (
    <article
      id={`item-${item.id}`}
      className={cx(
        "shrink-0 cursor-pointer rounded-2xl border bg-surface p-3.5 transition-colors hover:border-ink/40",
        selected ? "border-confirma ring-2 ring-confirma/30" : "border-line",
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold",
            item.saved ? "bg-gold text-[#1a160e]" : "bg-confirma text-white",
          )}
          aria-label={item.saved ? "Já é campo do grupo" : `Pino ${item.n} no mapa`}
        >
          {item.saved ? "⚽" : item.n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-snug">{item.name}</h2>
          {item.address && <p className="truncate text-sm text-muted">{item.address}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.saved ? (
              <Badge tone="gold">Já é campo do grupo</Badge>
            ) : (
              item.cats.map((c) => (
                <Badge key={c.id} tone={c.id === "nao-identificado" ? "neutral" : "green"}>
                  {c.label}
                </Badge>
              ))
            )}
          </div>
        </div>
      </div>
      {/* foto só do lugar escolhido: 1 foto da cota por lugar aberto */}
      {selected && !item.saved && (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          {item.source === "google" ? (
            <PlacePhoto placeId={item.id} name={item.name} mapsUrl={mapsPlaceUrl(item.name, item.id, item.mapsUrl)} auto />
          ) : (
            <a href={mapsPlaceUrl(item.name, null, item.mapsUrl)} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gold-ink hover:underline">
              Ver fotos no Google Maps ↗
            </a>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        {item.saved ? (
          <LinkButton href={`/campos/${item.saved.id}`} size="sm">
            Ver no grupo <ChevronRight className="size-4" aria-hidden />
          </LinkButton>
        ) : (
          <Button size="sm" variant="primary" onClick={onRegister}>
            <Plus className="size-4" aria-hidden /> Cadastrar
          </Button>
        )}
        <LinkButton href={directionsUrl(item.lat, item.lng)} size="sm" variant="ghost" external>
          <Navigation className="size-4" aria-hidden /> Como chegar
        </LinkButton>
      </div>
    </article>
  );
}

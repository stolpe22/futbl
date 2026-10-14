"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Camera, ExternalLink } from "lucide-react";
import { Button, Card, Notice, Skeleton, cx } from "./ui";
import { googlePhoto, type PhotoOutcome } from "@/lib/geo";
import type { FieldRow } from "@/lib/types";

/** Link para o lugar no Google Maps da pessoa (grátis, não usa cota) */
export function mapsPlaceUrl(name: string, placeId?: string | null, fallback?: string | null) {
  if (placeId) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${placeId}`;
  return fallback || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} Goiânia`)}`;
}

// Mesmo lugar aberto de novo nesta visita não gasta outra foto. Fica só na memória da aba,
// por pouco tempo (o endereço da imagem expira e os termos do Google não deixam guardar).
const recent = new Map<string, { at: number; out: Promise<PhotoOutcome> }>();
const KEEP_MS = 10 * 60_000;

function fetchPhoto(placeId: string) {
  const hit = recent.get(placeId);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.out;
  const out = googlePhoto(placeId).then((r) => {
    if ("error" in r || "limit" in r) recent.delete(placeId); // pode tentar de novo depois
    return r;
  });
  recent.set(placeId, { at: Date.now(), out });
  return out;
}

/**
 * Foto de capa de um lugar do Google. Cada foto mostrada gasta 1 da cota grátis
 * (o servidor para antes de passar do limite). Com `auto`, carrega sozinha depois de
 * a pessoa ficar ~0,6 s no lugar, para não gastar foto ao passar rápido pela lista.
 */
export function PlacePhoto({
  placeId,
  name,
  mapsUrl,
  auto = false,
  className,
}: {
  placeId: string;
  name: string;
  mapsUrl: string;
  auto?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | PhotoOutcome>("idle");

  async function load() {
    setState("loading");
    setState(await fetchPhoto(placeId));
  }

  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(load, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, placeId]);

  const mapsLink = (
    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-gold-ink hover:underline">
      Ver fotos no Google Maps <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {state === "idle" ? (
        auto ? (
          <Skeleton className="aspect-video w-full" />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={load}>
              <Camera className="size-4" aria-hidden /> Mostrar foto
            </Button>
            {mapsLink}
          </div>
        )
      ) : state === "loading" ? (
        <Skeleton className="aspect-video w-full" />
      ) : "photo" in state ? (
        <figure className="flex flex-col gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Google, não pode passar pelo otimizador nem ser guardada */}
          <img src={state.photo.uri} alt={`Foto de ${name}`} referrerPolicy="no-referrer" className="aspect-video w-full rounded-xl bg-surface-2 object-cover" />
          <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>
              Foto{state.photo.authors.length > 0 && ": "}
              {state.photo.authors.map((a, i) => (
                <span key={i}>
                  {i > 0 && ", "}
                  {a.uri ? <a href={a.uri} target="_blank" rel="noopener noreferrer" className="underline">{a.name}</a> : a.name}
                </span>
              ))}{" "}
              · Google Maps
            </span>
            {mapsLink}
          </figcaption>
        </figure>
      ) : "limit" in state ? (
        <>
          <Notice>
            <strong>As fotos do Google pausaram até o mês que vem.</strong> O grupo usou todas as fotos grátis deste mês, e o app
            para antes de qualquer cobrança. <Link href="/ajuda#google" className="underline">Entenda</Link>
          </Notice>
          {mapsLink}
        </>
      ) : "none" in state ? (
        <>
          <p className="text-sm text-muted">O Google não tem foto deste lugar.</p>
          {mapsLink}
        </>
      ) : (
        <>
          <p className="text-sm text-muted">O Google não respondeu agora. Tente de novo daqui a pouco.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={load}>Tentar de novo</Button>
            {mapsLink}
          </div>
        </>
      )}
    </div>
  );
}

/** Cartão "Foto do local" da página do campo (carrega só ao tocar) */
export function FieldPhoto({ field }: { field: FieldRow }) {
  const mapsUrl = mapsPlaceUrl(field.name, field.google_place_id, field.maps_url);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-semibold">
        <Camera className="size-5" aria-hidden /> Foto do local
      </h2>
      {field.google_place_id ? (
        <PlacePhoto placeId={field.google_place_id} name={field.name} mapsUrl={mapsUrl} />
      ) : (
        <>
          <p className="text-sm text-muted">Este campo não foi cadastrado pela busca do Google, então não temos a foto aqui.</p>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-gold-ink hover:underline">
            Ver fotos no Google Maps <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </>
      )}
    </Card>
  );
}

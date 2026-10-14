"use client";

import { AtSign, Globe, MapPin, MessageCircle, Navigation, Share2 } from "lucide-react";
import type { FieldRow } from "@/lib/types";
import { directionsUrl, instagramHandle, instagramUrl, webUrl, whatsappUrl } from "@/lib/format";
import { cx } from "./ui";

const chip =
  "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 min-h-9 text-sm hover:bg-surface-2 transition-colors";

/** Atalhos de contato do campo: WhatsApp, Instagram, site, rota */
export function FieldLinks({ field, compact }: { field: FieldRow; compact?: boolean }) {
  const wa = whatsappUrl(field.phone, `Olá! Vi o ${field.name} e queria saber sobre horários para alugar.`);
  const ig = instagramUrl(field.instagram);
  const site = webUrl(field.website);
  const other = webUrl(field.other_social);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className="flex flex-wrap gap-2">
      {wa && (
        <a className={cx(chip, "text-confirma")} href={wa} target="_blank" rel="noopener noreferrer" onClick={stop}>
          <MessageCircle className="size-4" aria-hidden /> WhatsApp
        </a>
      )}
      {ig && (
        <a className={chip} href={ig} target="_blank" rel="noopener noreferrer" onClick={stop}>
          <AtSign className="size-4" aria-hidden /> {compact ? "Instagram" : instagramHandle(field.instagram)}
        </a>
      )}
      {site && (
        <a className={chip} href={site} target="_blank" rel="noopener noreferrer" onClick={stop}>
          <Globe className="size-4" aria-hidden /> Site
        </a>
      )}
      {!compact && other && (
        <a className={chip} href={other} target="_blank" rel="noopener noreferrer" onClick={stop}>
          <Share2 className="size-4" aria-hidden /> Outra rede
        </a>
      )}
      {!compact && field.maps_url && (
        <a className={chip} href={field.maps_url} target="_blank" rel="noopener noreferrer" onClick={stop}>
          <MapPin className="size-4" aria-hidden /> Google Maps
        </a>
      )}
      <a className={chip} href={directionsUrl(field.lat, field.lng)} target="_blank" rel="noopener noreferrer" onClick={stop}>
        <Navigation className="size-4" aria-hidden /> Como chegar
      </a>
    </div>
  );
}

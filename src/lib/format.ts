import { format, formatDistanceToNowStrict, isToday, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function dateLong(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return "Hoje, " + format(d, "d 'de' MMM", { locale: ptBR });
  if (isTomorrow(d)) return "Amanhã, " + format(d, "d 'de' MMM", { locale: ptBR });
  return format(d, "EEEE, d 'de' MMM", { locale: ptBR });
}

export const timeOf = (iso: string) => format(new Date(iso), "HH:mm");
export const dateTimeShort = (iso: string) =>
  format(new Date(iso), "EEE dd/MM 'às' HH:mm", { locale: ptBR });
export const fromNow = (iso: string) =>
  formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true });

/** Valor para <input type="datetime-local"> no fuso local */
export function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

/** "@campo", "campo" ou "instagram.com/campo" viram URL */
export function instagramUrl(v: string | null) {
  if (!v) return null;
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/instagram\.com/i.test(s)) return "https://" + s.replace(/^\/+/, "");
  return "https://instagram.com/" + s.replace(/^@/, "");
}

export function instagramHandle(v: string | null) {
  if (!v) return null;
  const m = v.match(/instagram\.com\/([^/?#]+)/i);
  return "@" + (m ? m[1] : v.trim().replace(/^@/, ""));
}

export function webUrl(v: string | null) {
  if (!v) return null;
  const s = v.trim();
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}

/** Telefone BR vira link de WhatsApp */
export function whatsappUrl(phone: string | null, text?: string) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length <= 11) digits = "55" + digits;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export const shareWhatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export function phoneMask(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

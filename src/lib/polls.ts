import { CalendarDays, MapPin, MapPinned, MessageSquare } from "lucide-react";
import type { Poll, PollKind, PollOption } from "./types";

export const KIND_META: Record<PollKind, { label: string; icon: typeof MapPin }> = {
  jogo: { label: "Campo e horário", icon: MapPinned },
  data: { label: "Dia e horário", icon: CalendarDays },
  campo: { label: "Campo", icon: MapPin },
  livre: { label: "Pergunta", icon: MessageSquare },
};

export const pollIsOpen = (p: Poll) => !p.closed && (!p.closes_at || new Date(p.closes_at) > new Date());

/**
 * Cada votação pode ter várias perguntas. Em "Campo e horário" a principal se divide em
 * campo (sempre um só) e horário. Perguntas extras no fim ("Bora de churras depois?")
 * são um grupo cada, com um voto por pessoa.
 */
export type OptionGroup = "campo" | "hora" | "todas" | `extra:${string}`;
export const groupOf = (poll: Poll, o: PollOption): OptionGroup =>
  o.question ? `extra:${o.question}` : poll.kind === "jogo" ? (o.field_id ? "campo" : "hora") : "todas";
export const groupIsSingle = (poll: Poll, g: OptionGroup) =>
  g.startsWith("extra:") || (g === "campo" && poll.kind === "jogo") || !poll.multiple;

/** Sugestões para pergunta extra */
export const EXTRA_IDEAS = ["Bora de churras depois?", "Bora de after?", "Quem leva a bola?"];
export const EXTRA_DEFAULT_OPTIONS = ["Bora!", "Não vou"];

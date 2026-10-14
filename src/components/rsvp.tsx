"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, HelpCircle, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { RSVP_LABEL, type RsvpStatus } from "@/lib/types";
import { cx } from "./ui";

const STYLE: Record<RsvpStatus, { on: string; icon: typeof Check }> = {
  vou: { on: "bg-confirma text-white border-confirma", icon: Check },
  talvez: { on: "bg-gold text-[#1a160e] border-gold", icon: HelpCircle },
  nao_vou: { on: "bg-danger text-white border-danger", icon: X },
};

/**
 * Botões de presença. Atualiza na hora (otimista) e desfaz se o servidor recusar.
 * Clicar de novo no status marcado remove a resposta.
 */
export function RsvpButtons({
  gameId,
  userId,
  value,
  onChange,
  size = "md",
  disabled,
}: {
  gameId: string;
  userId: string;
  value: RsvpStatus | null;
  onChange: (v: RsvpStatus | null) => void;
  size?: "md" | "lg";
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function set(next: RsvpStatus) {
    const prev = value;
    const target = prev === next ? null : next;
    onChange(target);
    setBusy(true);
    const sb = supabase();
    const { error } =
      target === null
        ? await sb.from("rsvps").delete().eq("game_id", gameId).eq("user_id", userId)
        : await sb.from("rsvps").upsert({ game_id: gameId, user_id: userId, status: target, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) {
      onChange(prev);
      toast.error(friendlyError(error));
      return;
    }
    toast.success(target === null ? "Resposta removida." : `Presença: ${RSVP_LABEL[target]}.`, {
      duration: 2500,
      id: `rsvp-${gameId}`,
    });
  }

  return (
    <div role="group" aria-label="Sua presença" className={cx("grid grid-cols-3 gap-2", size === "lg" && "gap-3")}>
      {(Object.keys(STYLE) as RsvpStatus[]).map((s) => {
        const Icon = STYLE[s].icon;
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            disabled={disabled || busy}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              set(s);
            }}
            className={cx(
              "inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors disabled:opacity-60",
              size === "lg" ? "min-h-14 text-base" : "min-h-10 text-sm",
              on ? STYLE[s].on : "border-line bg-surface text-ink hover:bg-surface-2",
            )}
            title={on ? "Clique de novo para tirar sua resposta" : undefined}
          >
            <Icon className="size-4" aria-hidden /> {RSVP_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

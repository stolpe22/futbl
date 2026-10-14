"use client";

import { useEffect, useState } from "react";

/** Avisa antes de fechar/recarregar a aba com alterações não salvas (heurísticas 3 e 5) */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

/** Atalho Ctrl/Cmd+Enter para salvar formulários */
export function useSubmitShortcut(formId: string) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        const form = document.getElementById(formId) as HTMLFormElement | null;
        if (form) {
          e.preventDefault();
          form.requestSubmit();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formId]);
}

/** Hora atual que se atualiza a cada minuto (mantém a renderização pura) */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

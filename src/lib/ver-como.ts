"use client";

/**
 * "Ver como": o admin navega pelo app como outra pessoa (jogador ou organizador),
 * sem senha e sem chave secreta. Fica guardado só o id de quem está sendo simulado;
 * ele só vale se quem está logado for admin (conferido no SessionProvider).
 * A conta usada no banco continua sendo a do admin, por isso a simulação é só para ver:
 * o cliente do Supabase bloqueia gravações enquanto ela está ligada (lib/supabase/client.ts).
 */

const KEY = "ver-como";

export function simulatedId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function set(id: string | null) {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // modo privado sem storage: a simulação só não liga
  }
}

/** Começa a simular e recarrega o app inteiro, sem sobrar nada da tela anterior */
export function startViewAs(id: string) {
  set(id);
  window.location.href = "/";
}

/** Volta para a própria conta */
export function stopViewAs() {
  set(null);
  window.location.href = "/pessoas";
}

export const clearViewAs = () => set(null);

"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { setSimulating, supabase } from "@/lib/supabase/client";
import { clearViewAs, simulatedId } from "@/lib/ver-como";
import { friendlyError } from "@/lib/errors";
import type { Profile } from "@/lib/types";

type Session = {
  /** Quem a tela representa (no "Ver como", a pessoa simulada) */
  profile: Profile | null;
  /** Quem está logado de verdade */
  real: Profile | null;
  /** true quando o admin está vendo como outra pessoa (só leitura) */
  simulating: boolean;
  loading: boolean;
  error: string | null;
  isOrganizer: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [real, setReal] = useState<Profile | null>(null);
  const [simulated, setSimulated] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sb = supabase();
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) {
      window.location.href = "/login";
      return;
    }
    const { data, error } = await sb.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
    if (error) setError(friendlyError(error));
    else setError(null);
    const me = (data as Profile) ?? null;

    // "Ver como": só vale para admin ativo, e não simula outro admin
    let target: Profile | null = null;
    const id = simulatedId();
    if (id && me?.role === "admin" && me.active && id !== me.id) {
      const { data: t } = await sb.from("profiles").select("*").eq("id", id).maybeSingle();
      if (t && (t as Profile).role !== "admin") target = t as Profile;
    }
    if (id && !target) clearViewAs();
    setSimulating(!!target);
    setReal(me);
    setSimulated(target);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial da sessão
    refresh();
    const { data: sub } = supabase().auth.onAuthStateChange((event: string) => {
      if (event === "SIGNED_OUT") window.location.href = "/login";
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const profile = simulated ?? real;
  const role = profile?.active ? profile.role : null;
  return (
    <Ctx.Provider
      value={{
        profile,
        real,
        simulating: !!simulated,
        loading,
        error,
        isOrganizer: role === "admin" || role === "organizador",
        isAdmin: role === "admin",
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession fora do SessionProvider");
  return s;
}

/** Carrega dados com estado de carregando/erro e permite recarregar (heurísticas 1 e 9) */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mostra carregando ao recarregar
    setLoading(true);
    fn()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e) => alive && setError(friendlyError(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/** Lança o erro do Supabase para cair no catch do useLoad */
export function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

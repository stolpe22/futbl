"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Eye, Gauge, HelpCircle, Home, Lightbulb, Map, UserRound, Users, Vote } from "lucide-react";
import { SessionProvider, useSession } from "./session";
import { Avatar, Button, Dialog, ErrorState, Kbd, Spinner, cx } from "./ui";
import { supabase } from "@/lib/supabase/client";
import { ROLE_LABEL } from "@/lib/types";
import { clearViewAs, stopViewAs } from "@/lib/ver-como";

const NAV = [
  { href: "/", label: "Início", icon: Home, key: "i" },
  { href: "/agenda", label: "Agenda", icon: CalendarDays, key: "a" },
  { href: "/campos", label: "Campos", icon: Map, key: "c" },
  { href: "/sugestoes", label: "Sugestões", icon: Lightbulb, key: "s" },
  { href: "/votacoes", label: "Votações", icon: Vote, key: "v" },
  { href: "/pessoas", label: "Pessoas", icon: Users, key: "p" },
];

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["g", "i"], label: "Ir para Início" },
  { keys: ["g", "a"], label: "Ir para Agenda" },
  { keys: ["g", "c"], label: "Ir para Campos" },
  { keys: ["g", "v"], label: "Ir para Votações" },
  { keys: ["g", "s"], label: "Ir para Sugestões" },
  { keys: ["g", "p"], label: "Ir para Pessoas" },
  { keys: ["g", "e"], label: "Ir para Meu perfil" },
  { keys: ["n"], label: "Novo (jogo, campo ou votação, conforme a tela)" },
  { keys: ["/"], label: "Buscar na tela atual" },
  { keys: ["?"], label: "Mostrar estes atalhos" },
  { keys: ["Esc"], label: "Fechar janela / cancelar" },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { profile, loading, error, refresh, isOrganizer, isAdmin } = useSession();
  const [helpOpen, setHelpOpen] = useState(false);
  const badges = useNavBadges(profile?.id, isOrganizer, isAdmin, path);
  useShortcuts(() => setHelpOpen(true));

  let body: ReactNode = children;
  if (loading) body = <Spinner label="Entrando…" />;
  else if (error) body = <ErrorState message={error} onRetry={refresh} />;
  else if (!profile || !profile.active)
    body = (
      <ErrorState
        message={
          !profile
            ? "Sua conta existe, mas o perfil não foi criado. Peça para o admin conferir se o banco foi configurado (supabase/schema.sql)."
            : "Seu acesso foi desativado por um administrador. Fale com ele se achar que é engano."
        }
      />
    );

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-gold focus:px-3 focus:py-2 focus:text-[#1a160e]">
        Pular para o conteúdo
      </a>
      <header className="sticky top-0 z-[1000] border-b border-line bg-bg/90 backdrop-blur">
        <ViewAsBanner />
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-baseline gap-1.5 text-xl font-bold tracking-tight" aria-label="Futebol da Missão, início">
            <span>Missão</span>
            <span className="font-medium text-muted">Futebol</span>
            <span aria-hidden className="text-base">⚽</span>
          </Link>
          <nav aria-label="Principal" className="hidden flex-1 items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(path, n.href) ? "page" : undefined}
                className={cx(
                  "rounded-lg px-3 py-2 text-[15px] transition-colors",
                  isActive(path, n.href) ? "bg-ink font-semibold text-bg" : "text-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {n.label}
                <NavBadge badge={badges[n.href]} />
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {isAdmin && (
              <Link
                href="/admin"
                className={cx("grid size-10 place-items-center rounded-lg hover:bg-surface-2", isActive(path, "/admin") ? "text-ink" : "text-muted")}
                title="Painel do admin"
                aria-label="Painel do admin"
              >
                <Gauge className="size-5" />
              </Link>
            )}
            <Link
              href="/ajuda"
              className={cx("grid size-10 place-items-center rounded-lg hover:bg-surface-2", isActive(path, "/ajuda") ? "text-ink" : "text-muted")}
              title="Ajuda"
              aria-label="Ajuda"
            >
              <HelpCircle className="size-5" />
            </Link>
            {profile && (
              <Link href="/perfil" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2" title="Meu perfil">
                <Avatar name={profile.name || profile.email} size={30} />
                <span className="hidden text-left leading-tight lg:block">
                  <span className="block text-sm font-semibold">{profile.name.split(" ")[0]}</span>
                  <span className="block text-xs text-muted">{ROLE_LABEL[profile.role]}</span>
                </span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:pb-12">
        {body}
      </main>

      {/* Navegação inferior no celular */}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-[1000] border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-6">
          {[...NAV.slice(0, 5), { href: "/perfil", label: "Perfil", icon: UserRound, key: "e" }].map((n) => {
            const active = isActive(path, n.href) || (n.href === "/perfil" && (path.startsWith("/pessoas") || path.startsWith("/ajuda") || path.startsWith("/admin")));
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cx("flex flex-col items-center gap-0.5 py-2 text-[10px]", active ? "font-semibold text-ink" : "text-muted")}
                >
                  <span className={cx("relative grid h-7 w-11 place-items-center rounded-full", active && "bg-gold text-[#1a160e]")}>
                    <n.icon className="size-5" aria-hidden />
                    <NavBadge badge={badges[n.href]} floating />
                  </span>
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

/** Faixa fixa enquanto o admin está vendo como outra pessoa (heurísticas 1 e 3) */
function ViewAsBanner() {
  const { profile, simulating } = useSession();
  if (!simulating || !profile) return null;
  return (
    <div role="status" className="border-b border-gold/40 bg-[#1b2333] text-[#faf7f0]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <Eye className="size-4 shrink-0 text-gold" aria-hidden />
        <span className="font-semibold">
          Vendo como {profile.name || profile.email} · {ROLE_LABEL[profile.role]}
        </span>
        <span className="hidden text-[#faf7f0]/75 sm:inline">· só para ver: nada é salvo</span>
        <button
          type="button"
          onClick={stopViewAs}
          className="ml-auto rounded-lg bg-gold px-3 py-1.5 font-semibold text-[#1a160e] hover:brightness-95"
        >
          Sair da simulação
        </button>
      </div>
    </div>
  );
}

type NavCount = { n: number; label: string } | undefined;
const SEEN_SUGGESTIONS = "visto:sugestoes";

function lastSeenSuggestions() {
  try {
    return localStorage.getItem(SEEN_SUGGESTIONS) ?? new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

/**
 * Avisos no menu (heurística 1): o que espera uma resposta sua.
 * Agenda: jogos marcados sem a sua presença. Votações: abertas sem o seu voto.
 * Sugestões: para organizador, as que esperam aprovação; para jogador, as novas desde a última visita.
 */
function useNavBadges(me: string | undefined, isOrganizer: boolean, isAdmin: boolean, path: string) {
  const [badges, setBadges] = useState<Record<string, NavCount>>({});
  const [tick, setTick] = useState(0);

  // reconta a cada minuto e quando a aba volta a ficar visível
  useEffect(() => {
    const bump = () => document.visibilityState === "visible" && setTick((t) => t + 1);
    const id = setInterval(bump, 60_000);
    document.addEventListener("visibilitychange", bump);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    const now = new Date();
    if (path.startsWith("/sugestoes")) {
      try {
        localStorage.setItem(SEEN_SUGGESTIONS, now.toISOString());
      } catch {
        // sem storage: só não lembra da última visita
      }
    }
    const sb = supabase();
    const pendingSuggestions = sb.from("suggestions").select("id", { count: "exact", head: true }).eq("status", "pendente");
    Promise.all([
      sb.from("games").select("id").gte("starts_at", now.toISOString()).neq("status", "cancelado").limit(100),
      sb.from("rsvps").select("game_id").eq("user_id", me),
      sb.from("polls").select("id, closes_at").eq("closed", false),
      sb.from("poll_votes").select("poll_id").eq("user_id", me),
      isOrganizer ? pendingSuggestions : pendingSuggestions.neq("created_by", me).gt("created_at", lastSeenSuggestions()),
      isAdmin
        ? sb.from("access_requests").select("id", { count: "exact", head: true }).eq("status", "pendente")
        : Promise.resolve({ count: 0 }),
    ]).then(([games, myRsvps, polls, myVotes, suggestions, requests]) => {
      if (!alive) return;
      const answered = new Set(((myRsvps.data ?? []) as { game_id: string }[]).map((r) => r.game_id));
      const voted = new Set(((myVotes.data ?? []) as { poll_id: string }[]).map((v) => v.poll_id));
      const noAnswer = ((games.data ?? []) as { id: string }[]).filter((g) => !answered.has(g.id)).length;
      const noVote = ((polls.data ?? []) as { id: string; closes_at: string | null }[]).filter(
        (p) => !voted.has(p.id) && (!p.closes_at || new Date(p.closes_at) > now),
      ).length;
      const sug = suggestions.count ?? 0;
      const req = requests.count ?? 0;
      const reqBadge = req ? { n: req, label: `${req} pedido(s) de acesso esperando você` } : undefined;
      setBadges({
        "/agenda": noAnswer ? { n: noAnswer, label: `${noAnswer} jogo(s) esperando você dizer se vai` } : undefined,
        "/votacoes": noVote ? { n: noVote, label: `${noVote} votação(ões) esperando seu voto` } : undefined,
        "/sugestoes": sug
          ? { n: sug, label: isOrganizer ? `${sug} sugestão(ões) esperando aprovação` : `${sug} sugestão(ões) nova(s)` }
          : undefined,
        "/pessoas": reqBadge,
        "/perfil": reqBadge,
      });
    });
    return () => {
      alive = false;
    };
  }, [me, isOrganizer, isAdmin, path, tick]);

  return badges;
}

function NavBadge({ badge, floating }: { badge: NavCount; floating?: boolean }) {
  if (!badge) return null;
  return (
    <span
      className={cx(
        "inline-grid min-w-5 place-items-center rounded-full bg-gold px-1 text-[11px] font-bold leading-5 text-[#1a160e]",
        floating ? "absolute -right-1 -top-1" : "ml-1.5",
      )}
      title={badge.label}
      aria-label={badge.label}
    >
      {badge.n > 9 ? "9+" : badge.n}
    </span>
  );
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Atalhos de teclado" footer={<Button onClick={onClose}>Fechar</Button>}>
      <ul className="space-y-2">
        {SHORTCUTS.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4 text-ink">
            <span>{s.label}</span>
            <span className="flex gap-1">
              {s.keys.map((k, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-xs text-muted">depois</span>}
                  <Kbd>{k}</Kbd>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Atalhos para quem usa muito (heurística 7) */
function useShortcuts(openHelp: () => void) {
  const router = useRouter();
  const path = usePathname();
  const { isOrganizer } = useSession();
  const pendingG = useRef(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]") || document.querySelector("dialog[open]")) return;

      if (pendingG.current && Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        const dest = { i: "/", a: "/agenda", c: "/campos", s: "/sugestoes", v: "/votacoes", p: "/pessoas", e: "/perfil", h: "/ajuda" }[e.key];
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        return;
      }
      if (e.key === "g") {
        pendingG.current = Date.now();
      } else if (e.key === "?") {
        e.preventDefault();
        openHelp();
      } else if (e.key === "/") {
        const s = document.querySelector<HTMLInputElement>("[data-search]");
        if (s) {
          e.preventDefault();
          s.focus();
        }
      } else if (e.key === "n") {
        const dest = path.startsWith("/campos")
          ? "/campos/novo"
          : path.startsWith("/votacoes") && isOrganizer
            ? "/votacoes/nova"
            : path.startsWith("/agenda") && isOrganizer
              ? "/agenda/novo"
              : null;
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, path, isOrganizer, openHelp]);
}

export async function signOut() {
  clearViewAs();
  await supabase().auth.signOut();
  window.location.href = "/login";
}

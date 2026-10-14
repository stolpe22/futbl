"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Copy, Eye, MessageCircle, Search, Trash2, UserPlus } from "lucide-react";
import { startViewAs } from "@/lib/ver-como";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { must, useLoad, useSession } from "@/components/session";
import { Avatar, Badge, Button, Card, ConfirmDialog, ErrorState, FormField, HelpTip, Input, PageHeader, Select, Skeleton, Textarea, cx } from "@/components/ui";
import { fromNow, isValidEmail, shareWhatsappUrl, whatsappUrl } from "@/lib/format";
import { ROLE_HELP, ROLE_LABEL, type Invite, type Profile, type Role } from "@/lib/types";

export default function PessoasPage() {
  const { profile, isOrganizer, isAdmin, refresh } = useSession();
  const [q, setQ] = useState("");
  const [viewAs, setViewAs] = useState<Profile | null>(null);
  const { data, error, loading, reload, setData } = useLoad(async () => {
    const sb = supabase();
    const [profiles, invites] = await Promise.all([
      sb.from("profiles").select("*").order("name"),
      isOrganizer ? sb.from("invites").select("*").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);
    return { profiles: must(profiles) as Profile[], invites: must(invites) as Invite[] };
  }, [isOrganizer]);

  const pending = useMemo(
    () => (data ? data.invites.filter((i) => !data.profiles.some((p) => p.email === i.email)) : []),
    [data],
  );
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const people = (data?.profiles ?? []).filter((p) => !q || norm(`${p.name} ${p.email}`).includes(norm(q)));

  async function changeRole(p: Profile, role: Role) {
    const prev = p.role;
    setData((d) => d && { ...d, profiles: d.profiles.map((x) => (x.id === p.id ? { ...x, role } : x)) });
    const sb = supabase();
    const { error } = await sb.from("profiles").update({ role }).eq("id", p.id);
    if (error) {
      setData((d) => d && { ...d, profiles: d.profiles.map((x) => (x.id === p.id ? { ...x, role: prev } : x)) });
      return toast.error(friendlyError(error));
    }
    await sb.from("invites").update({ role }).eq("email", p.email);
    if (p.id === profile?.id) refresh();
    toast.success(`${p.name} agora é ${ROLE_LABEL[role]}.`, {
      action: { label: "Desfazer", onClick: () => changeRole({ ...p, role }, prev) },
    });
  }

  async function setActive(p: Profile, active: boolean) {
    const { error } = await supabase().from("profiles").update({ active }).eq("id", p.id);
    if (error) return toast.error(friendlyError(error));
    setData((d) => d && { ...d, profiles: d.profiles.map((x) => (x.id === p.id ? { ...x, active } : x)) });
    toast.success(active ? `${p.name} pode entrar de novo.` : `${p.name} não consegue mais acessar.`, {
      action: { label: "Desfazer", onClick: () => setActive({ ...p, active }, !active) },
    });
  }

  async function removeInvite(inv: Invite) {
    const sb = supabase();
    const { error } = await sb.from("invites").delete().eq("email", inv.email);
    if (error) return toast.error(friendlyError(error));
    setData((d) => d && { ...d, invites: d.invites.filter((i) => i.email !== inv.email) });
    toast(`Convite de ${inv.email} removido.`, {
      action: {
        label: "Desfazer",
        onClick: async () => {
          const { error } = await sb.from("invites").insert(inv);
          if (error) return toast.error(friendlyError(error));
          setData((d) => d && { ...d, invites: [inv, ...d.invites] });
        },
      },
    });
  }

  return (
    <>
      <PageHeader title="Pessoas" subtitle={data ? `${data.profiles.filter((p) => p.active).length} no grupo${pending.length ? ` · ${pending.length} convite(s) pendente(s)` : ""}` : "Quem joga com a gente"} />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <section className="flex flex-col gap-3" aria-labelledby="membros">
            <div className="flex items-center justify-between gap-3">
              <h2 id="membros" className="text-xl font-bold">Membros</h2>
              <div className="relative w-60">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input data-search aria-label="Buscar pessoa" placeholder="Buscar  ( / )" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-10 pl-9" />
              </div>
            </div>
            {loading && !data ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)
            ) : people.length === 0 ? (
              <p className="text-muted">Ninguém encontrado com “{q}”.</p>
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {people.map((p) => (
                  <li key={p.id} className={cx("flex flex-wrap items-center gap-3 p-3 sm:p-4", !p.active && "opacity-60")}>
                    <Avatar name={p.name || p.email} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {p.name || "Sem nome"}
                        {p.id === profile?.id && <span className="text-sm font-normal text-muted">(você)</span>}
                        {!p.active && <Badge tone="red">Desativado</Badge>}
                      </p>
                      <p className="truncate text-sm text-muted">{isOrganizer ? p.email : ROLE_LABEL[p.role]}</p>
                    </div>
                    {p.phone && (
                      <a href={whatsappUrl(p.phone)!} target="_blank" rel="noopener noreferrer" className="grid size-10 place-items-center rounded-lg text-confirma hover:bg-surface-2" title={`WhatsApp de ${p.name}`} aria-label={`WhatsApp de ${p.name}`}>
                        <MessageCircle className="size-5" />
                      </a>
                    )}
                    {isAdmin && p.id !== profile?.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {p.role !== "admin" && (
                          <Button size="sm" variant="secondary" onClick={() => setViewAs(p)} title={`Ver o app como ${p.name} vê`}>
                            <Eye className="size-4" aria-hidden /> Ver como
                          </Button>
                        )}
                        <Select aria-label={`Papel de ${p.name}`} value={p.role} onChange={(e) => changeRole(p, e.target.value as Role)} className="min-h-10 w-auto text-sm">
                          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                          ))}
                        </Select>
                        <Button size="sm" variant={p.active ? "ghost" : "secondary"} onClick={() => setActive(p, !p.active)}>
                          {p.active ? "Desativar" : "Reativar"}
                        </Button>
                      </div>
                    ) : (
                      isOrganizer && <Badge tone={p.role === "jogador" ? "neutral" : "gold"}>{ROLE_LABEL[p.role]}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <HelpTip title="O que cada papel pode fazer?">
              {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
                <p key={r}><strong className="text-ink">{ROLE_LABEL[r]}:</strong> {ROLE_HELP[r]}</p>
              ))}
            </HelpTip>
          </section>

          <ConfirmDialog
            open={!!viewAs}
            danger={false}
            title={`Ver o app como ${viewAs?.name || viewAs?.email}?`}
            message={`Você vê as telas, os botões e as respostas de ${viewAs?.name || "essa pessoa"} (${viewAs ? ROLE_LABEL[viewAs.role] : ""}). É só para ver: nada é salvo enquanto estiver simulando. Para voltar, use “Sair da simulação” na faixa do topo.`}
            confirmLabel="Começar"
            onConfirm={() => viewAs && startViewAs(viewAs.id)}
            onCancel={() => setViewAs(null)}
          />

          {isOrganizer && (
            <aside className="flex flex-col gap-4">
              <InviteForm
                isAdmin={isAdmin}
                existing={new Set([...(data?.invites.map((i) => i.email) ?? []), ...(data?.profiles.map((p) => p.email) ?? [])])}
                onInvited={(added) => setData((d) => d && { ...d, invites: [...added, ...d.invites] })}
              />
              <Card>
                <h2 className="mb-1 font-semibold">Convites pendentes</h2>
                <p className="mb-3 text-sm text-muted">Já podem criar conta, mas ainda não entraram.</p>
                {pending.length === 0 ? (
                  <p className="text-sm text-muted">Nenhum. Todo mundo convidado já entrou. 🎉</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {pending.map((i) => (
                      <li key={i.email} className="flex items-center gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{i.email}</p>
                          <p className="text-xs text-muted">{ROLE_LABEL[i.role]} · convidado {fromNow(i.created_at)}</p>
                        </div>
                        {(i.role === "jogador" || isAdmin) && (
                          <Button size="sm" variant="ghost" onClick={() => removeInvite(i)} aria-label={`Remover convite de ${i.email}`} title="Remover convite">
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </aside>
          )}
        </div>
      )}
    </>
  );
}

function InviteForm({ isAdmin, existing, onInvited }: { isAdmin: boolean; existing: Set<string>; onInvited: (i: Invite[]) => void }) {
  const [raw, setRaw] = useState("");
  const [role, setRole] = useState<Role>("jogador");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);
  const [confirmRole, setConfirmRole] = useState(false);

  const parsed = useMemo(() => {
    const list = [...new Set(raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
    return {
      valid: list.filter((e) => isValidEmail(e) && !existing.has(e)),
      invalid: list.filter((e) => !isValidEmail(e)),
      repeated: list.filter((e) => isValidEmail(e) && existing.has(e)),
    };
  }, [raw, existing]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!parsed.valid.length) return;
    if (role !== "jogador" && !confirmRole) return setConfirmRole(true);
    setConfirmRole(false);
    setSaving(true);
    const rows = parsed.valid.map((email) => ({ email, role }));
    const { data, error } = await supabase().from("invites").insert(rows).select("*");
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    onInvited(data as Invite[]);
    setDone(parsed.valid);
    setRaw("");
    toast.success(parsed.valid.length === 1 ? "Pessoa convidada." : `${parsed.valid.length} pessoas convidadas.`);
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const message = `⚽ Você foi convidado para o *Futebol da Missão*!\n\n1. Entre em ${origin}/login\n2. Toque em *Primeiro acesso*\n3. Use o seu email${done?.length === 1 ? ` (${done[0]})` : ""} e crie uma senha\n\nLá você vê a agenda, vota no dia e no campo e confirma presença.`;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><UserPlus className="size-5" aria-hidden /> Convidar pessoas</h2>
        <p className="text-sm text-muted">Só quem estiver nesta lista consegue criar conta.</p>
      </div>
      {done ? (
        <div className="flex flex-col gap-3" role="status">
          <p className="text-sm">
            <strong className="text-confirma">✓ Pronto!</strong> Agora mande o convite para {done.length === 1 ? done[0] : `as ${done.length} pessoas`}:
          </p>
          <pre className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-sm">{message}</pre>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { navigator.clipboard.writeText(message); toast.success("Mensagem copiada."); }}>
              <Copy className="size-4" aria-hidden /> Copiar mensagem
            </Button>
            <a className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-line px-3 text-sm text-confirma hover:bg-surface-2" href={shareWhatsappUrl(message)} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" aria-hidden /> Mandar no WhatsApp
            </a>
            <Button size="sm" variant="ghost" onClick={() => setDone(null)}>Convidar mais</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField label="Emails" htmlFor="inv-emails" hint="Pode colar vários de uma vez, separados por vírgula ou um por linha.">
            <Textarea id="inv-emails" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"joao@gmail.com\nmaria@hotmail.com"} className="min-h-20" />
          </FormField>
          {(parsed.invalid.length > 0 || parsed.repeated.length > 0) && (
            <div className="space-y-1 text-sm" role="status">
              {parsed.invalid.length > 0 && <p className="font-medium text-danger">Email inválido, confira: {parsed.invalid.join(", ")}</p>}
              {parsed.repeated.length > 0 && <p className="text-muted">Já estão na lista (serão ignorados): {parsed.repeated.join(", ")}</p>}
            </div>
          )}
          <FormField label="Papel" htmlFor="inv-role" hint={ROLE_HELP[role]}>
            <Select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="jogador">Jogador</option>
              {isAdmin && <option value="organizador">Organizador</option>}
              {isAdmin && <option value="admin">Admin</option>}
            </Select>
          </FormField>
          <Button type="submit" variant="primary" loading={saving} disabled={!parsed.valid.length}>
            {parsed.valid.length > 1 ? `Convidar ${parsed.valid.length} pessoas` : "Convidar"}
          </Button>
        </form>
      )}
      <ConfirmDialog
        open={confirmRole}
        danger={false}
        title={`Convidar como ${ROLE_LABEL[role]}?`}
        message={`${ROLE_LABEL[role]}: ${ROLE_HELP[role]}`}
        confirmLabel="Sim, convidar"
        onConfirm={() => submit()}
        onCancel={() => setConfirmRole(false)}
      />
    </Card>
  );
}

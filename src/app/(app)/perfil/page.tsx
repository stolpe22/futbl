"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChevronRight, Gauge, HelpCircle, LogOut, Monitor, Moon, Sun, Users } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { useSession } from "@/components/session";
import { signOut } from "@/components/app-shell";
import { Avatar, Badge, Button, Card, FormField, Input, PageHeader, Segmented } from "@/components/ui";
import { phoneMask } from "@/lib/format";
import { ROLE_HELP, ROLE_LABEL } from "@/lib/types";

type Theme = "auto" | "light" | "dark";

export default function PerfilPage() {
  const { profile, refresh, isAdmin } = useSession();
  const [name, setName] = useState(profile?.name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [passError, setPassError] = useState<string | null>(null);
  const [savingPass, setSavingPass] = useState(false);
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    try {
      const t = localStorage.getItem("tema");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferência salva no aparelho
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
  }, []);

  function applyTheme(t: Theme) {
    setTheme(t);
    try {
      if (t === "auto") localStorage.removeItem("tema");
      else localStorage.setItem("tema", t);
    } catch {}
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setNameError("Coloque seu nome, como a galera te chama.");
    setNameError(null);
    setSaving(true);
    const { error } = await supabase().from("profiles").update({ name: name.trim(), phone: phone.trim() || null }).eq("id", profile!.id);
    setSaving(false);
    if (error) return toast.error(friendlyError(error));
    await refresh();
    toast.success("Perfil salvo.");
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (pass.length < 8) return setPassError("Use pelo menos 8 caracteres.");
    setPassError(null);
    setSavingPass(true);
    const { error } = await supabase().auth.updateUser({ password: pass });
    setSavingPass(false);
    if (error) return setPassError(friendlyError(error));
    setPass("");
    toast.success("Senha alterada.");
  }

  if (!profile) return null;
  const dirty = name !== profile.name || (phone || "") !== (profile.phone || "");

  return (
    <>
      <PageHeader title="Meu perfil" />
      <div className="grid grid-cols-[minmax(0,1fr)] max-w-4xl gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card className="flex items-center gap-4">
            <Avatar name={profile.name || profile.email} size={56} />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{profile.name}</p>
              <p className="truncate text-sm text-muted">{profile.email}</p>
              <Badge tone={profile.role === "jogador" ? "neutral" : "gold"} className="mt-1">{ROLE_LABEL[profile.role]}</Badge>
            </div>
          </Card>
          <p className="text-sm text-muted">{ROLE_HELP[profile.role]}</p>

          <Card>
            <form onSubmit={saveProfile} className="flex flex-col gap-4" noValidate>
              <FormField label="Nome" htmlFor="pf-name" error={nameError} hint="Aparece na lista de presença e nas votações.">
                <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!nameError} />
              </FormField>
              <FormField label="WhatsApp" htmlFor="pf-phone" optional hint="Para os organizadores te chamarem direto.">
                <Input id="pf-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(phoneMask(e.target.value))} placeholder="(62) 99999-0000" />
              </FormField>
              <div className="flex justify-end gap-2">
                {dirty && <Button type="button" variant="ghost" onClick={() => { setName(profile.name); setPhone(profile.phone ?? ""); }}>Descartar</Button>}
                <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>Salvar</Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-3 font-semibold">Aparência</h2>
            <Segmented<Theme>
              label="Tema"
              value={theme}
              onChange={applyTheme}
              options={[
                { value: "auto", label: <><Monitor className="size-4" aria-hidden /> Automático</> },
                { value: "light", label: <><Sun className="size-4" aria-hidden /> Claro</> },
                { value: "dark", label: <><Moon className="size-4" aria-hidden /> Escuro</> },
              ]}
            />
            <p className="mt-2 text-sm text-muted">Automático segue o tema do seu celular ou computador.</p>
          </Card>

          {isAdmin && (
            <Link href="/admin" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-ink/40">
              <Gauge className="size-5 text-gold-ink" aria-hidden />
              <span>
                <span className="block font-semibold">Painel do admin</span>
                <span className="block text-sm text-muted">Uso do Google e limpeza de campos</span>
              </span>
              <ChevronRight className="ml-auto size-4 text-muted" aria-hidden />
            </Link>
          )}

          <Card>
            <form onSubmit={savePassword} className="flex flex-col gap-4" noValidate>
              <h2 className="font-semibold">Trocar senha</h2>
              <FormField label="Nova senha" htmlFor="pf-pass" error={passError} hint="Mínimo de 8 caracteres.">
                <Input id="pf-pass" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} aria-invalid={!!passError} />
              </FormField>
              <Button type="submit" loading={savingPass} disabled={!pass} className="self-end">Trocar senha</Button>
            </form>
          </Card>

          <nav aria-label="Mais opções" className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface md:hidden">
            <Link href="/pessoas" className="flex items-center gap-3 p-4"><Users className="size-5 text-muted" aria-hidden /> Pessoas do grupo <ChevronRight className="ml-auto size-4 text-muted" aria-hidden /></Link>
            <Link href="/ajuda" className="flex items-center gap-3 p-4"><HelpCircle className="size-5 text-muted" aria-hidden /> Ajuda e atalhos <ChevronRight className="ml-auto size-4 text-muted" aria-hidden /></Link>
          </nav>

          <Button variant="danger" onClick={signOut} className="self-start">
            <LogOut className="size-4" aria-hidden /> Sair da conta
          </Button>
        </div>
      </div>
    </>
  );
}

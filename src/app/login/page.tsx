"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { isValidEmail } from "@/lib/format";
import { Button, FormField, Input, Segmented } from "@/components/ui";

type Mode = "entrar" | "criar" | "link" | "esqueci";

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#1b2333] p-10 text-[#f7f4ec] lg:flex">
        <div className="flex items-baseline gap-1.5 text-xl font-bold">
          Missão <span className="font-medium text-[#979083]">Futebol</span>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-[#fdb72d]">Goiânia · Grupo MBL / Missão</p>
          <h1 className="mt-3 text-5xl font-bold leading-[1.05] tracking-tight">
            Chega de enquete
            <br />
            perdida no grupo.
          </h1>
          <p className="mt-4 max-w-md text-lg text-[#c9c3b5]">
            Marque o jogo, escolha o campo e confirme presença num lugar só.
          </p>
        </div>
        <p className="text-sm text-[#979083]">Acesso só para quem foi convidado pelo grupo.</p>
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 size-96 rounded-full border-[40px] border-[#fdb72d]/15" />
      </aside>
      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="text-xl font-bold">
              Missão <span className="font-medium text-muted">Futebol</span> ⚽
            </div>
            <p className="mt-1 text-muted">Agenda, campos e votações do futebol do grupo.</p>
          </div>
          <Suspense>
            <LoginForms />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function LoginForms() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<null | { kind: "confirmar" | "link" | "senha"; email: string }>(null);

  useEffect(() => {
    if (params.get("erro") === "link")
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mensagem vinda do link do email
      setError(
        "Não deu para entrar por esse link (ele expira, só vale uma vez e precisa abrir no mesmo aparelho). Peça um novo ou entre com email e senha.",
      );
  }, [params]);

  const redirectTo = (flow?: string) =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}${flow ? `&flow=${flow}` : ""}`;

  function validate() {
    const errs: Record<string, string> = {};
    if (!isValidEmail(email)) errs.email = "Digite um email válido, tipo nome@gmail.com";
    if (mode === "entrar" && !password) errs.password = "Digite sua senha";
    if (mode === "criar") {
      if (name.trim().length < 2) errs.name = "Como a galera te chama?";
      if (password.length < 8) errs.password = "Use pelo menos 8 caracteres";
      else if (password !== password2) errs.password2 = "As senhas não são iguais";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function checkInvited(): Promise<boolean> {
    const { data, error } = await supabase().rpc("is_email_invited", { p_email: email.trim() });
    if (error) return true; // não bloqueia se a checagem falhar; o servidor valida de novo
    if (!data) {
      setError("Esse email não está na lista do grupo. Peça para um organizador te cadastrar e tente de novo.");
      return false;
    }
    return true;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setBusy(true);
    const sb = supabase();
    const mail = email.trim().toLowerCase();
    try {
      if (mode === "entrar") {
        const { error } = await sb.auth.signInWithPassword({ email: mail, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
        return;
      }
      if (!(await checkInvited())) return;
      if (mode === "criar") {
        const { data, error } = await sb.auth.signUp({
          email: mail,
          password,
          options: { data: { name: name.trim() }, emailRedirectTo: redirectTo() },
        });
        if (error) throw error;
        // Supabase devolve usuário sem identidades quando o email já tem conta
        if (data.user && data.user.identities?.length === 0) throw new Error("User already registered");
        if (data.session) {
          // sem confirmação por email: já entra direto
          toast.success(`Conta criada. Bem-vindo, ${name.trim().split(" ")[0]}!`);
          router.replace(next);
          router.refresh();
          return;
        }
        // só acontece se "Confirm email" ainda estiver ligado no Supabase
        setSent({ kind: "confirmar", email: mail });
      } else if (mode === "link") {
        const { error } = await sb.auth.signInWithOtp({
          email: mail,
          options: { shouldCreateUser: false, emailRedirectTo: redirectTo() },
        });
        if (error) throw error;
        setSent({ kind: "link", email: mail });
      } else if (mode === "esqueci") {
        const { error } = await sb.auth.resetPasswordForEmail(mail, { redirectTo: redirectTo("recovery") });
        if (error) throw error;
        setSent({ kind: "senha", email: mail });
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!sent) return;
    setBusy(true);
    setError(null);
    const sb = supabase();
    const { error } =
      sent.kind === "confirmar"
        ? await sb.auth.resend({ type: "signup", email: sent.email, options: { emailRedirectTo: redirectTo() } })
        : sent.kind === "link"
          ? await sb.auth.signInWithOtp({ email: sent.email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo() } })
          : await sb.auth.resetPasswordForEmail(sent.email, { redirectTo: redirectTo("recovery") });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else setError(null);
  }

  if (sent) {
    const text = {
      confirmar: "Para ter certeza que é você mesmo, mandamos um link de confirmação. Clique nele para ativar sua conta.",
      link: "Mandamos um link de acesso. Abra no mesmo aparelho para entrar direto.",
      senha: "Mandamos um link para você criar uma senha nova.",
    }[sent.kind];
    return (
      <div className="flex flex-col gap-4" role="status">
        <MailCheck className="size-10 text-confirma" aria-hidden />
        <h2 className="text-2xl font-bold">Confira seu email</h2>
        <p className="text-muted">
          {text} Enviado para <strong className="text-ink">{sent.email}</strong>.
        </p>
        <p className="text-sm text-muted">Não chegou em 2 minutos? Olhe a caixa de spam ou promoções.</p>
        {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={resend} loading={busy}>
            Reenviar email
          </Button>
          <Button variant="ghost" onClick={() => { setSent(null); setMode("entrar"); }}>
            Voltar para entrar
          </Button>
        </div>
      </div>
    );
  }

  const titles: Record<Mode, string> = {
    entrar: "Entrar",
    criar: "Criar minha conta",
    link: "Entrar sem senha",
    esqueci: "Recuperar senha",
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {(mode === "entrar" || mode === "criar") && (
        <Segmented
          label="Tipo de acesso"
          value={mode}
          onChange={(m) => { setMode(m); setError(null); setFieldErrors({}); }}
          options={[
            { value: "entrar", label: "Já tenho conta" },
            { value: "criar", label: "Primeiro acesso" },
          ]}
        />
      )}
      <div>
        <h2 className="text-2xl font-bold">{titles[mode]}</h2>
        <p className="mt-1 text-sm text-muted">
          {mode === "criar" && "Use o email que você passou para o organizador e crie uma senha. Você já entra direto."}
          {mode === "entrar" && "Use o email cadastrado no grupo."}
          {mode === "link" && "Mandamos um link para o seu email e você entra com um clique."}
          {mode === "esqueci" && "Mandamos um link para você criar uma senha nova."}
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-danger/40 bg-danger-bg px-3.5 py-3 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {mode === "criar" && (
        <FormField label="Seu nome" htmlFor="name" error={fieldErrors.name} hint="Como aparece na lista de presença.">
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!fieldErrors.name} placeholder="Ex.: João Silva" />
        </FormField>
      )}

      <FormField label="Email" htmlFor="email" error={fieldErrors.email}>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!fieldErrors.email}
          placeholder="nome@gmail.com"
        />
      </FormField>

      {(mode === "entrar" || mode === "criar") && (
        <FormField
          label={mode === "criar" ? "Crie uma senha" : "Senha"}
          htmlFor="password"
          error={fieldErrors.password}
          hint={mode === "criar" ? "Mínimo de 8 caracteres." : undefined}
        >
          <div className="relative">
            <Input
              id="password"
              type={showPass ? "text" : "password"}
              autoComplete={mode === "criar" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErrors.password}
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink"
              aria-label={showPass ? "Esconder senha" : "Mostrar senha"}
              aria-pressed={showPass}
            >
              {showPass ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
        </FormField>
      )}

      {mode === "criar" && (
        <FormField label="Repita a senha" htmlFor="password2" error={fieldErrors.password2}>
          <Input id="password2" type={showPass ? "text" : "password"} autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} aria-invalid={!!fieldErrors.password2} />
        </FormField>
      )}

      <Button type="submit" variant="primary" loading={busy} className="w-full">
        {{ entrar: "Entrar", criar: "Criar conta", link: "Enviar link de acesso", esqueci: "Enviar link" }[mode]}
      </Button>

      <div className="flex flex-col items-start gap-2 text-sm">
        {mode === "entrar" && (
          <>
            <button type="button" className="text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => { setMode("esqueci"); setError(null); }}>
              Esqueci a senha
            </button>
            <button type="button" className="text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => { setMode("link"); setError(null); }}>
              Entrar sem senha, com link no email
            </button>
          </>
        )}
        {(mode === "link" || mode === "esqueci") && (
          <button type="button" className="text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => { setMode("entrar"); setError(null); }}>
            ← Voltar para entrar com senha
          </button>
        )}
      </div>
    </form>
  );
}

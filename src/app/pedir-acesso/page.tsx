"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { isValidEmail, phoneMask } from "@/lib/format";
import { Button, FormField, Input, Textarea } from "@/components/ui";
import { LedTicker, StadiumScene } from "@/components/login-stage";

type Result = "ok" | "ja_convidado";

/** Página aberta: quem quer entrar no grupo deixa nome e email, e o admin aprova */
export default function PedirAcessoPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden text-[#f7f4ec]">
      <StadiumScene />
      <div className="relative z-10 mx-auto grid min-h-dvh max-w-6xl content-center grid-cols-[minmax(0,1fr)] gap-6 px-4 pb-20 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:gap-16">
        <header>
          <div className="lg-rise flex items-center gap-3" style={{ "--d": "0s" } as React.CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ícone SVG do próprio app */}
            <img src="/icon.svg" alt="" className="size-11 rounded-xl shadow-[0_0_30px_rgb(253_183_45/0.35)]" />
            <div className="leading-tight">
              <p className="text-lg font-bold">Futebol da Missão</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fdb72d]">Goiânia · MBL / Missão</p>
            </div>
          </div>
          <p className="lg-rise lg-shimmer mt-4 text-2xl font-black tracking-tight lg:mt-10 lg:text-6xl" style={{ "--d": "0.2s" } as React.CSSProperties}>
            Quer jogar com a gente?
          </p>
          <p className="lg-rise mt-1 max-w-md text-sm text-[#c9c3b5] lg:mt-4 lg:text-xl" style={{ "--d": "0.35s" } as React.CSSProperties}>
            Deixe seu nome e email. Quando aprovarem, você cria sua senha e já entra.
          </p>
        </header>
        <main className="lg-rise" style={{ "--d": "0.5s" } as React.CSSProperties}>
          <div className="lg-ring">
            <div className="rounded-[calc(1.75rem-1.5px)] bg-surface p-6 text-ink sm:p-8 lg:bg-surface/95 lg:backdrop-blur-xl">
              <RequestForm />
            </div>
          </div>
          <p className="mt-4 text-center text-sm text-[#979083]">
            Já tem conta?{" "}
            <Link href="/login" className="font-semibold text-[#fdb72d] underline-offset-4 hover:underline">
              Entrar
            </Link>
          </p>
        </main>
      </div>
      <LedTicker />
    </div>
  );
}

function RequestForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [trap, setTrap] = useState(""); // campo invisível: robô preenche, gente não
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Como a galera te chama?";
    if (!isValidEmail(email)) errs.email = "Digite um email válido, tipo nome@gmail.com";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    if (trap) return setResult("ok");
    setBusy(true);
    const { data, error } = await supabase().rpc("request_access", {
      p_name: name.trim(),
      p_email: email.trim(),
      p_phone: phone || null,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    if (data === "ok" || data === "ja_convidado") return setResult(data);
    setError(
      data === "lotado"
        ? "Tem muitos pedidos esperando agora. Tente de novo mais tarde ou fale com um organizador."
        : "Confira o nome e o email e tente de novo.",
    );
  }

  if (result === "ja_convidado")
    return (
      <div className="flex flex-col gap-4" role="status">
        <MailCheck className="size-10 text-confirma" aria-hidden />
        <h2 className="text-2xl font-bold">Você já está na lista!</h2>
        <p className="text-muted">
          Esse email já foi convidado. É só entrar em <strong className="text-ink">Primeiro acesso</strong> e criar sua senha.
        </p>
        <Link href="/login" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-4 font-semibold text-[#1a160e]">
          Ir para o login
        </Link>
      </div>
    );

  if (result === "ok")
    return (
      <div className="flex flex-col gap-4" role="status">
        <CheckCircle2 className="size-10 text-confirma" aria-hidden />
        <h2 className="text-2xl font-bold">Pedido enviado!</h2>
        <p className="text-muted">
          Agora é com a organização. Quando aprovarem, entre em <strong className="text-ink">Primeiro acesso</strong> no login com o
          email <strong className="text-ink">{email.trim().toLowerCase()}</strong> e crie sua senha.
        </p>
        <p className="text-sm text-muted">Pode avisar no grupo que você pediu, para agilizar.</p>
        <Link href="/login" className="text-sm font-semibold text-gold-ink underline-offset-4 hover:underline">
          Ir para o login
        </Link>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold">Pedir acesso</h2>
        <p className="mt-1 text-sm text-muted">Leva 30 segundos. Ninguém além da organização vê seus dados.</p>
      </div>

      {error && (
        <p className="rounded-xl border border-danger/40 bg-danger-bg px-3.5 py-3 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <FormField label="Seu nome" htmlFor="r-name" error={fieldErrors.name}>
        <Input id="r-name" autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!fieldErrors.name} placeholder="Ex.: João Silva" maxLength={80} />
      </FormField>
      <FormField label="Email" htmlFor="r-email" error={fieldErrors.email} hint="É com ele que você vai entrar.">
        <Input id="r-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fieldErrors.email} placeholder="nome@gmail.com" maxLength={200} />
      </FormField>
      <FormField label="WhatsApp" htmlFor="r-phone" optional hint="Para avisarem quando aprovarem.">
        <Input id="r-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(phoneMask(e.target.value))} placeholder="(62) 99999-9999" />
      </FormField>
      <FormField label="Recado" htmlFor="r-note" optional hint="Ex.: quem te indicou.">
        <Textarea id="r-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="min-h-16" />
      </FormField>
      <input type="text" name="site" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} className="hidden" aria-hidden />

      <Button type="submit" variant="primary" loading={busy} className="w-full">
        Enviar pedido
      </Button>
    </form>
  );
}

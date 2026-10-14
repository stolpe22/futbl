"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { Button, FormField, Input } from "@/components/ui";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use pelo menos 8 caracteres.");
    if (password !== password2) return setError("As senhas não são iguais.");
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    toast.success("Senha alterada. Você já está dentro.");
    router.replace("/");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} noValidate className="flex w-full max-w-sm flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold">Criar senha nova</h1>
          <p className="mt-1 text-sm text-muted">Escolha uma senha com pelo menos 8 caracteres.</p>
        </div>
        {error && (
          <p className="rounded-xl border border-danger/40 bg-danger-bg px-3.5 py-3 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}
        <FormField label="Nova senha" htmlFor="p1">
          <Input id="p1" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <FormField label="Repita a nova senha" htmlFor="p2">
          <Input id="p2" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
        </FormField>
        <Button type="submit" variant="primary" loading={busy}>
          Salvar senha
        </Button>
        <a href="/login" className="text-sm text-muted hover:text-ink">← Voltar para entrar</a>
      </form>
    </main>
  );
}

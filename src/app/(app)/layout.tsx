import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Spinner } from "@/components/ui";

// A área logada carrega os dados no navegador depois de conferir o login, então a
// navegação aqui não é "instantânea" no sentido do Next. Isso desliga o aviso de
// validação (só aparece em desenvolvimento) para todas as páginas abaixo.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<Spinner label="Abrindo…" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

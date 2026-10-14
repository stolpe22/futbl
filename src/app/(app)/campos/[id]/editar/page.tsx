"use client";

import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { must, useLoad, useSession } from "@/components/session";
import { FieldForm } from "@/components/field-form";
import { ErrorState, PageHeader, Spinner } from "@/components/ui";
import type { FieldRow } from "@/lib/types";

export default function EditarCampoPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, isOrganizer } = useSession();
  const { data, error, reload } = useLoad(
    async () => must(await supabase().from("fields").select("*")) as FieldRow[],
    [],
  );
  const field = data?.find((f) => f.id === id);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Spinner />;
  if (!field) return <ErrorState message="Esse campo não existe mais. Ele pode ter sido apagado." />;
  if (!isOrganizer && field.created_by !== profile?.id)
    return <ErrorState message="Só quem cadastrou este campo ou um organizador pode editar." />;

  return (
    <>
      <PageHeader back={{ href: `/campos/${id}`, label: field.name }} title="Editar campo" />
      <FieldForm initial={field} existing={data} />
    </>
  );
}

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { must, useLoad } from "@/components/session";
import { FieldForm } from "@/components/field-form";
import { ErrorState, PageHeader, Spinner } from "@/components/ui";
import type { FieldRow } from "@/lib/types";

export default function NovoCampoPage() {
  return (
    <>
      <PageHeader
        back={{ href: "/campos", label: "Campos" }}
        title="Adicionar campo"
        subtitle="Marque no mapa e preencha o que souber. Dá para completar depois."
      />
      <Suspense fallback={<Spinner />}>
        <NovoCampo />
      </Suspense>
    </>
  );
}

function NovoCampo() {
  const params = useSearchParams();
  const query = params.toString();
  // O Next guarda esta tela escondida na memória (Activity). Cada vez que ela aparece,
  // o efeito roda de novo: o formulário começa limpo e a lista é recarregada.
  const [visit, setVisit] = useState(0);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- conta cada vez que a tela aparece
  useEffect(() => setVisit((n) => n + 1), []);
  const { data, error, reload } = useLoad(
    async () => must(await supabase().from("fields").select("*")) as FieldRow[],
    [query, visit],
  );
  const prefill = useMemo(() => {
    const lat = params.get("lat");
    const lng = params.get("lng");
    return {
      name: params.get("name") ?? "",
      address: params.get("address") ?? "",
      phone: params.get("phone") ?? "",
      website: params.get("website") ?? "",
      instagram: params.get("instagram") ?? "",
      maps_url: params.get("maps_url") ?? "",
      googleId: params.get("gid") ?? undefined,
      lat: lat ? Number(lat) : undefined,
      lng: lng ? Number(lng) : undefined,
    };
  }, [params]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data || !visit) return <Spinner />;
  return <FieldForm key={`${query}#${visit}`} prefill={prefill} existing={data} />;
}

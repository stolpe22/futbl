"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Lightbulb, Pencil, Trash2 } from "lucide-react";
import { SuggestDialog } from "@/components/suggest-dialog";
import { supabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { must, useLoad, useSession } from "@/components/session";
import { FieldsMap } from "@/components/map";
import { FieldLinks } from "@/components/field-links";
import { FieldPhoto } from "@/components/field-photo";
import { Badge, Button, Card, ConfirmDialog, ErrorState, LinkButton, PageHeader, Spinner } from "@/components/ui";
import { brl, dateLong, fromNow, timeOf } from "@/lib/format";
import { SURFACE_LABEL, type FieldRow, type Game, type Profile } from "@/lib/types";

export default function CampoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile, isOrganizer } = useSession();
  const [confirm, setConfirm] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data, error, loading, reload } = useLoad(async () => {
    const sb = supabase();
    const field = must(await sb.from("fields").select("*").eq("id", id).maybeSingle()) as FieldRow | null;
    if (!field) return null;
    const [games, author, linked, suggestions] = await Promise.all([
      sb.from("games").select("*").eq("field_id", id).gte("starts_at", new Date().toISOString()).neq("status", "cancelado").order("starts_at").limit(5),
      field.created_by ? sb.from("profiles").select("name").eq("id", field.created_by).maybeSingle() : Promise.resolve({ data: null }),
      // jogos (passados ou futuros) que travam o apagar
      sb.from("games").select("id", { count: "exact", head: true }).eq("field_id", id).neq("status", "cancelado"),
      sb.from("suggestions").select("id", { count: "exact", head: true }).eq("field_id", id),
    ]);
    return {
      field,
      games: (games.data ?? []) as Game[],
      author: (author.data as Pick<Profile, "name"> | null)?.name,
      linkedGames: linked.count ?? 0,
      suggestionCount: suggestions.count ?? 0,
    };
  }, [id]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;
  if (!data) return <NotFound />;

  const { field, games, author, linkedGames, suggestionCount } = data;
  const canEdit = isOrganizer || field.created_by === profile?.id;

  async function remove() {
    setDeleting(true);
    const sb = supabase();
    const { error } = await sb.from("fields").delete().eq("id", field.id);
    setDeleting(false);
    setConfirm(false);
    if (error) return toast.error(friendlyError(error));
    router.push("/campos");
    toast(`“${field.name}” foi apagado.`, {
      duration: 10000,
      action: {
        label: "Desfazer",
        onClick: async () => {
          const { error } = await sb.from("fields").insert(field);
          if (error) return toast.error(friendlyError(error));
          toast.success("Campo restaurado.");
          router.push(`/campos/${field.id}`);
        },
      },
    });
  }

  return (
    <>
      <PageHeader
        back={{ href: "/campos", label: "Campos" }}
        title={field.name}
        subtitle={field.address}
        actions={
          <>
            {isOrganizer && (
              <LinkButton href={`/agenda/novo?field_id=${field.id}`} variant="primary">
                <CalendarPlus className="size-4" aria-hidden /> Marcar jogo aqui
              </LinkButton>
            )}
            <Button variant={isOrganizer ? "secondary" : "primary"} onClick={() => setSuggesting(true)}>
              <Lightbulb className="size-4" aria-hidden /> Sugerir jogo aqui
            </Button>
            {canEdit && (
              <LinkButton href={`/campos/${field.id}/editar`}>
                <Pencil className="size-4" aria-hidden /> Editar
              </LinkButton>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <FieldsMap className="h-[360px] lg:h-[480px]" fields={[field]} selectedId={field.id} focus={{ lat: field.lat, lng: field.lng, zoom: 16 }} />

        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm text-muted">Preço</p>
                <p className="text-3xl font-bold">
                  {field.price_per_hour != null ? brl(field.price_per_hour) : "Não informado"}
                  {field.price_per_hour != null && <span className="text-base font-medium text-muted"> /hora</span>}
                </p>
              </div>
              <Badge>{SURFACE_LABEL[field.surface]}</Badge>
            </div>
            {field.price_notes && <p className="mt-2 text-sm text-muted">{field.price_notes}</p>}
          </Card>

          <FieldPhoto field={field} />

          <Card>
            <h2 className="mb-3 font-semibold">Contato</h2>
            <FieldLinks field={field} />
            {field.phone && <p className="mt-3 text-sm text-muted">Telefone: {field.phone}</p>}
            {!field.phone && !field.instagram && !field.website && (
              <p className="mt-3 text-sm text-muted">
                Ninguém adicionou contato ainda.{canEdit && <> <Link className="underline" href={`/campos/${field.id}/editar`}>Adicionar</Link>.</>}
              </p>
            )}
          </Card>

          {field.notes && (
            <Card>
              <h2 className="mb-1 font-semibold">Anotações</h2>
              <p className="whitespace-pre-line text-muted">{field.notes}</p>
            </Card>
          )}

          <Card>
            <h2 className="mb-2 font-semibold">Próximos jogos aqui</h2>
            {games.length === 0 ? (
              <p className="text-sm text-muted">Nenhum jogo marcado neste campo.</p>
            ) : (
              <ul className="divide-y divide-line">
                {games.map((g) => (
                  <li key={g.id}>
                    <Link href={`/agenda/${g.id}`} className="flex justify-between gap-2 py-2 hover:text-gold-ink">
                      <span className="capitalize">{dateLong(g.starts_at)}</span>
                      <span className="font-semibold">{timeOf(g.starts_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span>
              Cadastrado {author ? `por ${author} ` : ""}
              {fromNow(field.created_at)}
            </span>
            {canEdit &&
              (linkedGames > 0 ? (
                <span className="flex items-center gap-1.5" title="Cancele ou troque o campo desses jogos para poder apagar.">
                  <Trash2 className="size-4" aria-hidden />
                  Não dá para apagar: {linkedGames === 1 ? "tem 1 jogo marcado aqui" : `tem ${linkedGames} jogos marcados aqui`}.
                </span>
              ) : (
                <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
                  <Trash2 className="size-4" aria-hidden /> Apagar campo
                </Button>
              ))}
          </div>
        </div>
      </div>

      <SuggestDialog open={suggesting} onClose={() => setSuggesting(false)} fieldId={field.id} />
      <ConfirmDialog
        open={confirm}
        title="Apagar este campo?"
        message={
          <>
            <strong className="text-ink">{field.name}</strong> sai do mapa e da lista.
            {suggestionCount > 0 &&
              ` ${suggestionCount === 1 ? "A sugestão feita para ele também é apagada" : `As ${suggestionCount} sugestões feitas para ele também são apagadas`}.`}{" "}
            Dá para desfazer o campo por alguns segundos{suggestionCount > 0 ? ", mas as sugestões não voltam" : ""}.
          </>
        }
        confirmLabel="Apagar campo"
        onConfirm={remove}
        onCancel={() => setConfirm(false)}
        loading={deleting}
      />
    </>
  );
}

function NotFound() {
  return (
    <ErrorState message="Esse campo não existe mais. Ele pode ter sido apagado por alguém do grupo." />
  );
}

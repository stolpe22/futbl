"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { SHORTCUTS } from "@/components/app-shell";
import { Card, Input, Kbd, PageHeader } from "@/components/ui";
import { ROLE_HELP, ROLE_LABEL, type Role } from "@/lib/types";

type Topic = { q: string; a: React.ReactNode; tags: string };

const TOPICS: { group: string; id?: string; items: Topic[] }[] = [
  {
    group: "Jogos e presença",
    items: [
      {
        q: "Como confirmo que vou no jogo?",
        tags: "presença confirmar vou talvez rsvp",
        a: <>Na <Link className="underline" href="/">Início</Link> ou na <Link className="underline" href="/agenda">Agenda</Link>, toque em <strong>Vou</strong>, <strong>Talvez</strong> ou <strong>Não vou</strong>. Tocar de novo no mesmo botão tira sua resposta.</>,
      },
      {
        q: "O jogo lotou. E agora?",
        tags: "lotado vagas espera máximo",
        a: "Você ainda pode confirmar. Quem confirmou depois de preencher as vagas aparece como “espera” na lista de presença, na ordem de chegada.",
      },
      {
        q: "Quanto eu pago?",
        tags: "valor preço dividir pix",
        a: "Na página do jogo aparece o valor total do aluguel e quanto dá por pessoa, dividindo pelo número de confirmados. O recado do organizador costuma dizer para quem mandar o pix.",
      },
      {
        q: "Como marco um jogo? (organizadores)",
        tags: "marcar criar jogo agenda novo repetir semanal",
        a: <>Em <Link className="underline" href="/agenda/novo">Agenda → Marcar jogo</Link>. Escolha dia, horário e campo. Dá para repetir toda semana. Atalho: <Kbd>n</Kbd> na Agenda.</>,
      },
      {
        q: "Cancelar ou apagar um jogo?",
        tags: "cancelar apagar excluir desfazer",
        a: "Prefira Cancelar: o jogo fica riscado na agenda e todo mundo vê que não vai rolar. Apagar some com o jogo e com a lista de presença. Os dois podem ser desfeitos logo depois, pelo aviso que aparece no topo da tela.",
      },
    ],
  },
  {
    group: "Sugestões",
    items: [
      {
        q: "Pra que serve sugestão, votação e jogo? Como uma ideia vira jogo?",
        tags: "sugestão votação jogo oficial fluxo caminho etapa quem vai diferença serve",
        a: (
          <ol className="list-decimal space-y-1 pl-5">
            <li><strong>Sugestão</strong> (qualquer um): “quero jogar no campo X, quinta 20h”. Quem também quer dá +1. O organizador aprova e ela vira jogo oficial.</li>
            <li><strong>Votação</strong> (organizador, só se precisar): quando há dúvida entre campos ou horários. O vencedor vira jogo oficial com um toque.</li>
            <li><strong>Jogo oficial</strong> (organizador): fica na Agenda e cada um responde Vou, Talvez ou Não vou. O organizador também pode marcar direto, sem sugestão nem votação.</li>
          </ol>
        ),
      },
      {
        q: "O que são as bolinhas com número no menu?",
        tags: "aviso bolinha número menu notificação novo",
        a: "Coisas esperando você: na Agenda, jogos em que você ainda não disse se vai; em Votações, votações abertas sem o seu voto; em Sugestões, as novas desde a sua última visita (para organizadores, as que esperam aprovação).",
      },
      {
        q: "Como sugiro um jogo ou um campo?",
        tags: "sugerir sugestão jogo campo horário dia jogador",
        a: <>Em <Link className="underline" href="/sugestoes">Sugestões</Link>, toque em <strong>Sugerir jogo</strong> (campo, dia e horário) ou <strong>Sugerir campo</strong>. Também dá para sugerir pela página de um campo ou por um dia vazio na Agenda.</>,
      },
      {
        q: "O que é “Eu também quero (+1)”?",
        tags: "apoiar apoio mais um +1 ranking repetido",
        a: "É dizer “eu também quero”. Se você sugerir uma coisa igual à de outra pessoa, sua sugestão vira um +1 automático. O ranking “Campos mais sugeridos” conta quantas pessoas diferentes sugeriram ou deram +1 em cada campo.",
      },
      {
        q: "Quem aprova as sugestões?",
        tags: "aprovar recusar organizador oficial",
        a: "Os organizadores. Ao aprovar uma sugestão de jogo, ela vira um jogo oficial na Agenda e todo mundo confirma “Vou / Não vou”. Se a sugestão era só o campo, o organizador escolhe o dia e o horário.",
      },
    ],
  },
  {
    group: "Votações",
    items: [
      {
        q: "Como voto?",
        tags: "votar enquete votação",
        a: "Abra a votação e toque nas opções. Se a votação permite várias, marque todas que servem. Para tirar o voto, toque de novo.",
      },
      {
        q: "Não conheço o campo da votação. Como sei onde fica?",
        tags: "onde fica perto longe distância mapa foto como chegar votação campo",
        a: "Cada campo da votação tem “Ver foto”, “Ver no mapa” e “Como chegar”. Toque em “Ver distância de mim” para ver a quantos km cada um fica de você (o app pede sua localização só nessa hora e não guarda).",
      },
      {
        q: "Dá para perguntar “bora de churras depois?” na mesma votação?",
        tags: "pergunta extra churras after churrasco bar depois votação",
        a: "Dá. Ao criar a votação, em “Perguntas extras”, toque numa sugestão ou em “Adicionar pergunta”. Ela aparece no fim, com respostas como “Bora!” e “Não vou”, e cada um vota uma vez nela.",
      },
      {
        q: "Na votação de campo e horário, por que os horários estão apagados?",
        tags: "horário bloqueado apagado campo primeiro votação",
        a: "Primeiro você escolhe o campo (um só). Aí os horários liberam e você marca todos os que pode.",
      },
      {
        q: "Como crio uma votação? (organizadores)",
        tags: "criar votação enquete dia campo",
        a: <>Em <Link className="underline" href="/votacoes/nova">Votações → Nova votação</Link>. Escolha o tipo: <strong>campo e horário</strong> (decide os dois de uma vez), dia e horário, campo ou pergunta livre. Ao encerrar, aparece o botão para marcar o jogo com o campo e o horário vencedores.</>,
      },
    ],
  },
  {
    group: "Campos",
    items: [
      {
        q: "Como cadastro um campo novo?",
        tags: "cadastrar campo adicionar novo google maps link",
        a: <>Em <Link className="underline" href="/campos/novo">Campos → Adicionar campo</Link>. Você pode buscar pelo nome, colar o link do Google Maps ou clicar no mapa. Depois preencha preço, WhatsApp, Instagram e site.</>,
      },
      {
        q: "Como pego o link de um lugar no Google Maps?",
        tags: "google maps link compartilhar copiar",
        a: "No Google Maps, abra o lugar, toque em Compartilhar e depois em Copiar link. Cole na opção “Link do Google” ao cadastrar o campo.",
      },
      {
        q: "Como acho campos novos perto de um bairro?",
        tags: "buscar nesta área descobrir encontrar novo pinos verdes numerados mapa",
        a: "Em Campos, mova o mapa até o bairro e toque em “Buscar campos nesta área”. Os lugares aparecem como pinos verdes numerados, com o mesmo número na lista (aba Encontrados). Toque em Cadastrar no que quiser.",
      },
      {
        q: "Quem pode editar um campo?",
        tags: "editar campo permissão",
        a: "Quem cadastrou o campo e os organizadores.",
      },
    ],
  },
  {
    group: "Google: busca, contato e fotos",
    id: "google",
    items: [
      {
        q: "A busca, o telefone ou a foto do Google pararam. Por quê?",
        tags: "google limite cota parou pausou foto busca telefone site cobrança grátis",
        a: (
          <>
            <p>
              O Google cobra por uso, mas dá uma quantidade grátis por mês. O app conta cada uso no banco <strong>antes</strong> de chamar o
              Google e para sozinho antes de chegar na parte paga. Os limites do app, todos abaixo do grátis:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Busca de campos novos:</strong> 3.500 por mês (o Google dá 5.000 grátis).</li>
              <li><strong>Telefone e site</strong> trazidos ao cadastrar: 900 por mês (grátis: 1.000).</li>
              <li><strong>Fotos:</strong> 800 por mês, 1 por foto mostrada (grátis: 1.000).</li>
            </ul>
            <p className="mt-2">Quando um limite chega, aparece um aviso amarelo dizendo isso. Nada é cobrado.</p>
          </>
        ),
      },
      {
        q: "Quando volta a funcionar?",
        tags: "volta mês que vem dia 1 virada reinicia",
        a: "No dia 1º do mês seguinte, de madrugada (por volta das 4h ou 5h de Brasília, porque o Google vira o mês no horário da Califórnia).",
      },
      {
        q: "O que continua funcionando enquanto isso?",
        tags: "openstreetmap alternativa gratuita sem google",
        a: "Tudo do grupo continua normal: agenda, campos cadastrados, mapa, sugestões e votações. A busca de campos novos passa a usar o OpenStreetMap (grátis, com menos lugares). Telefone e site podem ser preenchidos à mão. As fotos continuam no botão “Ver fotos no Google Maps”, que abre o seu Google Maps e não gasta nada.",
      },
      {
        q: "Como vejo a foto de um lugar na busca?",
        tags: "foto busca encontrados pino verde ver foto",
        a: "Em Campos, toque num lugar encontrado (na lista ou no pino verde): a foto aparece no item. Só o lugar que você abre carrega foto, para não gastar a cota com a lista inteira. Abrir o mesmo lugar de novo logo depois não gasta outra.",
      },
      {
        q: "Por que o campo não tem foto?",
        tags: "foto sem foto campo cadastrado",
        a: "Na página de um campo do grupo, a foto só aparece para campos cadastrados pela busca do Google (pino verde → Cadastrar, ou escolhendo um resultado do Google). Campos marcados clicando no mapa ou pelo link não têm o ID do Google; use “Ver fotos no Google Maps”. A foto também só carrega quando você toca em “Mostrar foto”, para economizar.",
      },
      {
        q: "Apareceu “o Google não respondeu agora”",
        tags: "erro google não respondeu",
        a: "Aí não é o limite: foi uma falha passageira do Google ou da internet. Tente de novo em alguns minutos.",
      },
    ],
  },
  {
    group: "Conta e acesso",
    items: [
      {
        q: "Não consigo criar conta: “email não está na lista”",
        tags: "criar conta convite email lista erro",
        a: "Só entra quem foi convidado. Peça para um organizador colocar seu email em Pessoas → Convidar. Use exatamente o mesmo email.",
      },
      {
        q: "Esqueci minha senha",
        tags: "senha esqueci recuperar",
        a: "Na tela de entrar, toque em “Esqueci a senha”. Ou entre sem senha usando o link mágico no email.",
      },
      {
        q: "Como convido alguém? (organizadores)",
        tags: "convidar pessoa email cadastrar",
        a: <>Em <Link className="underline" href="/pessoas">Pessoas</Link>, cole os emails e toque em Convidar. Depois copie a mensagem pronta e mande no WhatsApp.</>,
      },
    ],
  },
];

export default function AjudaPage() {
  const [q, setQ] = useState("");
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const filtered = useMemo(
    () =>
      TOPICS.map((g) => ({
        ...g,
        items: g.items.filter((t) => !q || norm(`${t.q} ${t.tags} ${typeof t.a === "string" ? t.a : ""}`).includes(norm(q))),
      })).filter((g) => g.items.length),
    [q],
  );

  return (
    <>
      <PageHeader title="Ajuda" subtitle="Respostas rápidas para as dúvidas mais comuns." />
      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input data-search autoFocus aria-label="Buscar na ajuda" placeholder="Busque: senha, votar, campo, pix…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          {filtered.length === 0 ? (
            <p className="text-muted">Nada encontrado para “{q}”. Tente outra palavra, ou fale com um organizador no grupo.</p>
          ) : (
            filtered.map((g) => (
              <section key={g.group} id={g.id} className="scroll-mt-24">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{g.group}</h2>
                <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
                  {g.items.map((t) => (
                    <details key={t.q} className="group p-4" open={!!q}>
                      <summary className="cursor-pointer list-none font-medium marker:hidden">
                        <span className="mr-2 inline-block text-muted transition-transform group-open:rotate-90">›</span>
                        {t.q}
                      </summary>
                      <div className="mt-2 pl-5 text-muted">{t.a}</div>
                    </details>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-3 font-semibold">Papéis</h2>
            <ul className="space-y-2 text-sm">
              {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
                <li key={r}><strong>{ROLE_LABEL[r]}:</strong> <span className="text-muted">{ROLE_HELP[r]}</span></li>
              ))}
            </ul>
          </Card>
          <Card className="hidden md:block">
            <h2 className="mb-3 font-semibold">Atalhos de teclado</h2>
            <ul className="space-y-2 text-sm">
              {SHORTCUTS.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3">
                  <span className="text-muted">{s.label}</span>
                  <span className="flex shrink-0 gap-1">{s.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}

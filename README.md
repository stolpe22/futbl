# Futebol da Missão ⚽

App para organizar o futebol do grupo (MBL / Missão) em Goiânia: **agenda com presença**, **campos no mapa** e **votações**. Substitui as enquetes do WhatsApp.

Stack: Next.js 16 · Supabase (auth + Postgres + RLS + realtime) · Leaflet + MapLibre com mapa da [OpenFreeMap](https://openfreemap.org) (grátis, sem chave) · Tailwind 4.
O visual segue o site [candidatos.missao.org.br](https://candidatos.missao.org.br/): fundo creme `#faf7f0`, tinta `#1a160e`, dourado `#fdb72d`, azul-marinho `#1b2333`, verde "confirma" e a fonte Bricolage Grotesque, com modo escuro.

## Configurar (uma vez só)

1. **Banco:** no Supabase, abra **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e rode.
   Isso cria as tabelas, as regras de acesso e o convite de admin para `stolpe02@gmail.com`.
2. **URLs de autenticação:** em **Authentication → URL Configuration**:
   - *Site URL*: `http://localhost:3000` (depois troque pela URL de produção)
   - *Redirect URLs*: `http://localhost:3000/auth/callback` (e `https://SEU-DOMINIO/auth/callback`)
3. **Desligar a confirmação de email:** em **Authentication → Sign In / Providers → Email**, desligue **Confirm email** e salve. Assim quem foi convidado cria a conta e já entra direto.
   (Os emails de "esqueci a senha" e de link mágico continuam funcionando. O SMTP padrão do Supabase manda poucos por hora; se precisar, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**.)
4. **Rodar:**
   ```bash
   npm install
   npm run dev
   ```
   Abra http://localhost:3000, toque em **Primeiro acesso** e crie sua conta com `stolpe02@gmail.com`. Você entra direto.

As chaves ficam em `.env.local` (veja `.env.example`).

## Papéis

| Papel | Pode |
|---|---|
| **Admin** | Tudo, inclusive mudar papéis e desativar pessoas |
| **Organizador** | Marcar jogos oficiais; aprovar ou recusar sugestões; abrir e encerrar votações; convidar jogadores |
| **Jogador** | Confirmar presença, votar, cadastrar campos (e editar os que cadastrou), sugerir jogos e campos, apoiar sugestões |

Só entra quem está na lista de convites (`invites`). Um trigger no banco recusa o cadastro de qualquer outro email.

### Ver como (só admin)

Em **Pessoas**, o admin toca em **Ver como** ao lado de um jogador ou organizador e passa a ver o app como essa pessoa: os menus, os botões do papel dela e as respostas dela (presenças, votos, apoios). Uma faixa no topo avisa e tem **Sair da simulação**.

- Não precisa de senha nem de chave secreta: fica guardado no navegador só o id de quem está sendo simulado, e ele só vale se quem está logado for admin (`src/components/session.tsx`). Não dá para simular outro admin.
- No banco, você continua logado como admin. Por isso a simulação é **só para ver**: enquanto ela está ligada, o cliente do Supabase barra inserir, editar, apagar e sugerir (`src/lib/supabase/client.ts`) e mostra um aviso.
- "Sair" da conta também encerra a simulação.

## Sugestões

- Qualquer pessoa **sugere um jogo** (campo + dia + horário) ou **só um campo**. Isso pode ser feito em Sugestões, na página de um campo, na lista de Campos ou num dia vazio da Agenda.
- Sugestão igual a uma pendente vira **apoio (+1)**, sem duplicar (função `suggest` no banco).
- **Campos mais sugeridos** (`field_ranking`): ranking por pessoas diferentes que sugeriram ou apoiaram, em 30 dias, 90 dias ou 1 ano.
- O **organizador aprova**. Sugestão com horário vira jogo oficial na Agenda na hora; sugestão só de campo abre "Marcar jogo" com o campo escolhido e é marcada como aprovada ao salvar. Ou **recusa**, e dá para desfazer.
- No menu, o organizador vê quantas sugestões esperam aprovação.

## Votações

- Tipos: **Campo e horário** (padrão), dia e horário, campo e pergunta livre.
- **Campo e horário** são duas perguntas na mesma votação: cada um escolhe **1 campo** e depois marca os **horários** que pode (ou um só, se a votação for de voto único). O trigger `single_choice_vote` no banco garante 1 campo por pessoa.
- Nas votações com campos, cada campo mostra preço, endereço, **foto** (ao tocar), **Ver no mapa** (mapa com todos os campos da votação), **Como chegar** e, com "Ver distância de mim", a distância em linha reta (a localização não é guardada).
- Ao encerrar, o organizador marca o jogo com o campo e o horário vencedores (empates mostram cada combinação).
- **Perguntas extras** no fim de qualquer votação ("Bora de churras depois?", "Bora de after?"): cada uma tem respostas próprias (padrão "Bora!" / "Não vou") e vale um voto por pessoa. No banco são opções com `poll_options.question` preenchido.
- Ao criar, o app não deixa marcar dois campos com o mesmo nome e avisa que podem estar cadastrados duas vezes.

## Campos e mapa

- O mapa fica travado na região de Goiânia (inclui Aparecida, Senador Canedo e Trindade).
- Para cadastrar um campo: **buscar** por nome ou endereço (OpenStreetMap), **colar o link do Google Maps** (links curtos `maps.app.goo.gl` também funcionam) ou **clicar no mapa**.
- Ao abrir **Campos**, os lugares da área do mapa já aparecem sozinhos. A mesma busca na mesma área fica em cache por 1 hora, então abrir de novo não gasta cota.
- A página **Campos** mostra lista e mapa lado a lado (no celular, mapa em cima e lista embaixo). Clicar num item dá zoom no pino; clicar num pino destaca o item.
- **Buscar campos nesta área** procura lugares na parte visível do mapa. Eles aparecem como pinos verdes numerados, com o mesmo número na aba "Encontrados", e cada um tem uma categoria (Society, Futsal, Futebol, Areia ou Não identificado) tirada do nome por regex (`CATEGORY_RULES` em `src/lib/geo.ts`). Sem cota do Google, a busca usa os campos com nome mapeados no OpenStreetMap.
- Cada campo guarda preço por hora, WhatsApp, Instagram, site, outra rede social e anotações.

## Busca do Google (opcional, sem custo)

A busca de campos usa o Google Places quando existe a variável `GOOGLE_MAPS_API_KEY` no servidor. Sem ela, usa a busca gratuita do OpenStreetMap.

- A chave fica **só no servidor** (rotas `/api/places/*`) e só responde para quem está logado.
- Cada chamada passa antes pela função `use_quota` no banco, que conta por mês e **recusa quando chega no limite**:
  - 3.500 buscas de campos novos, que viram pinos no mapa (Text Search Pro; grátis: 5.000)
  - 900 consultas de telefone e site do lugar escolhido (Place Details Enterprise; grátis: 1.000)
  - 800 fotos (Place Photos, cobrado como "Place Details Photos" por foto pedida; grátis: 1.000)
- Quando a busca chega no limite, ela passa a usar o OpenStreetMap, que também mostra pinos. Quando o telefone e site chegam no limite, o campo é cadastrado sem esses dados. O mapa é sempre o OpenFreeMap, que é grátis.
- Na página **Campos**, digitar filtra os campos salvos (lista e mapa). **Procurar campos novos** (ou Enter) busca no Google e mostra pinos verdes com “Cadastrar”.
- **Fotos:** na busca, a foto aparece quando a pessoa abre um lugar encontrado (só esse lugar, depois de ~0,6 s nele); no cadastro, aparece a do lugar escolhido ("É este o lugar?"); na página do campo, **Mostrar foto** traz só a capa. O mesmo lugar reaberto em até 10 min reaproveita a foto da memória da aba, sem gastar outra. Primeiro pega a lista de fotos do lugar (Place Details só com `photos`, faixa "Essentials IDs Only", grátis e ilimitada), depois reserva 1 na cota e só então pede a imagem (`/api/places/photo`). O nome e o endereço da foto não são guardados, porque os termos do Google não deixam. Só campos com `google_place_id` (cadastrados por um resultado do Google) têm foto; os outros mostram **Ver fotos no Google Maps**, que é grátis.
- A cota conta pelo mês do Google (fuso do Pacífico), então volta no dia 1º por volta das 4h–5h de Brasília. Quando um limite chega, o app mostra um aviso amarelo e a ajuda (**/ajuda#google**) explica o motivo.
- A trava vale para o que passa pelo app. Por isso a chave fica só no servidor e não deve ser usada em outro sistema.
- O admin vê o uso do mês em **Meu perfil**.

## As 10 heurísticas de Nielsen

1. **Visibilidade do estado do sistema:** carregamentos com skeleton ou spinner, botões com "carregando", avisos de sucesso e erro, presença e votos **ao vivo** (realtime), selos "Falta seu voto", "Lotado", "Cancelado" e "Já aconteceu", e item do menu ativo destacado.
2. **Correspondência com o mundo real:** linguagem da galera ("Vou / Talvez / Não vou", "Marcar jogo", "Mandar no WhatsApp"), calendário começando no domingo, valores em R$ e datas em pt-BR.
3. **Controle e liberdade:** "Desfazer" depois de apagar um campo, jogo ou convite, cancelar jogo, encerrar votação e mudar papel. Botão Cancelar em todo formulário, "Voltar" no topo, tocar de novo para tirar o voto ou a presença, "Ver Goiânia toda" no mapa.
4. **Consistência e padrões:** mesmos componentes e cores em todo o app (dourado = ação principal, verde = vou, vermelho = perigo), navegação no topo no computador e embaixo no celular.
5. **Prevenção de erros:** confirmação antes de ações destrutivas, aviso de **campo duplicado** e de **jogo no mesmo dia**, aviso de data no passado, validação na hora, emails convidados checados antes do cadastro e aviso ao sair com alterações não salvas.
6. **Reconhecer em vez de lembrar:** escolher campo de uma lista com preço, opções de votação com quem votou (avatares), "faltam votar: …", "ainda não responderam" e preço por pessoa já calculado.
7. **Flexibilidade e eficiência:** atalhos de teclado (`g a`, `g c`, `n`, `/`, `?`, `Ctrl+Enter`), jogo **semanal recorrente**, convite de vários emails de uma vez, entrar com senha **ou** link mágico, três jeitos de marcar o local, preferência de tema e de visualização da agenda salvas no aparelho.
8. **Estético e minimalista:** uma ação principal por tela, ajuda recolhida por padrão e só os dados essenciais nos cards.
9. **Reconhecer e recuperar erros:** mensagens em português claro com o que fazer (`src/lib/errors.ts`), destaque vermelho com ícone, botão "Tentar de novo" e foco no campo com erro.
10. **Ajuda e documentação:** página **/ajuda** com busca, dicas "Como funciona?" em cada tela, passo a passo de como copiar o link do Google Maps e checklist "Comece por aqui" para o organizador.

## Estrutura

```
supabase/schema.sql        banco, RLS, triggers (rode no SQL Editor)
src/proxy.ts               protege rotas e renova a sessão
src/app/login              entrar, primeiro acesso, link mágico, esqueci a senha
src/app/auth/callback      recebe os links do email
src/app/(app)/             telas logadas: início, agenda, campos, votações, pessoas, perfil, ajuda
src/app/api/osm-campos     campos do OpenStreetMap (Overpass, com cache)
src/app/api/resolve-maps   abre links curtos do Google Maps
src/components/            UI, mapa, formulários
```

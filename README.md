# VEXO

Plataforma proprietária da **M8 Growth** para social selling automatizado em
clínicas de saúde (dermatologistas, dentistas, medicina estética e afins).
Substitui o uso do GoHighLevel. Ver a especificação completa do produto na
descrição do projeto — este README cobre a implementação técnica.

## Stack

- **Next.js 14 (App Router) + TypeScript** — aplicação web (CRM interno +
  painel do cliente + APIs/webhooks), deploy como serviço `web` no Railway.
- **Prisma + PostgreSQL** — modelo de dados multi-tenant (`prisma/schema.prisma`).
- **NextAuth (Credentials)** — login por e-mail/senha, sem expiração de
  sessão para o painel do cliente; papéis `INTERNAL_ADMIN`, `INTERNAL_STAFF`,
  `CLIENT`.
- **Anthropic SDK (Claude)** — Sonnet para a conversa com o lead (com
  ferramentas de agenda), Haiku para classificação/bastidor.
- **googleapis** — OAuth + disponibilidade/criação de eventos no Google
  Calendar, por clínica.
- **Meta Graph API (Instagram Messaging)** — OAuth + webhook + envio de
  mensagens/vídeo.
- **Evolution API** — envio de WhatsApp (lembretes de agendamento e resumo
  semanal).
- **node-cron** — worker de background (`src/worker/index.ts`), deploy como
  serviço `worker` separado no Railway, compartilhando o mesmo Postgres.

## Estrutura

```
src/
  app/
    login/                       login (e-mail + senha)
    crm/                         CRM interno (Mauro/equipe) — não paginado ao cliente
      clinicas/                  lista, criação, configuração por clínica
      conversas/[id]/            histórico de conversa, escalonamento, resposta manual
      follow-up/                 duas sequências de follow-up (parou de responder / não compareceu)
    dashboard/                   painel do cliente (somente leitura, escopado por clinicId)
    api/
      auth/[...nextauth]/        NextAuth
      webhooks/instagram/        recebe mensagens do Instagram (Meta)
      oauth/instagram/*          conecta Instagram por clínica (apenas equipe interna)
      oauth/google-calendar/*    conecta Google Calendar por clínica
  lib/
    anthropic.ts                 Sonnet (conversa + tools de agenda) / Haiku (bastidor)
    conversation-pipeline.ts     orquestra: inbound -> classificação -> resposta -> agendamento
    scheduler.ts                 timing adaptativo de resposta (delay fixo + espelhamento)
    dispatch.ts                  envia mensagens PENDING cujo horário chegou
    reminders.ts                 lembretes configuráveis (padrão 24h/3h antes)
    follow-up.ts                 gatilho automático "parou de responder" (antes do agendamento)
    appointments.ts               marca comparecimento (botão manual, sem detecção automática)
    weekly-summary.ts            resumo semanal via WhatsApp (sextas-feiras)
    instagram.ts / google-calendar.ts / whatsapp.ts   wrappers de integração
    crypto.ts                    criptografia (AES-256-GCM) de tokens OAuth em repouso
  worker/index.ts                processo de cron do serviço `worker`
prisma/schema.prisma             modelo de dados
```

## Rodando localmente

```bash
cp .env.example .env    # preencha as credenciais (ver abaixo quais são obrigatórias)
npm install
npm run prisma:migrate:dev
npm run prisma:seed      # cria o usuário interno admin (SEED_ADMIN_EMAIL/PASSWORD)
npm run dev              # app web em http://localhost:3000
npm run worker           # em outro terminal — processa mensagens/lembretes/follow-up
```

## Deploy (Railway)

Dois serviços apontando para o mesmo repositório, compartilhando o mesmo
Postgres:

1. **`web`** — usa `railway.json` (build Nixpacks, `npm run prisma:migrate && npm run start`).
2. **`worker`** — mesmo repo, start command customizado: `npm run prisma:generate && npm run worker`.

### Criando o primeiro admin sem Railway CLI

Em vez de `railway run npm run prisma:seed`, dá pra criar o primeiro usuário
interno admin direto pela interface:

1. Configure `ADMIN_SETUP_TOKEN` (qualquer valor aleatório, ex:
   `openssl rand -hex 32`) nas variáveis do serviço `web` e faça redeploy.
2. Acesse `https://<seu-domínio>/setup` e preencha nome/e-mail/senha + o
   token.
3. A tela se desabilita sozinha assim que o admin é criado (checa se já
   existe um `INTERNAL_ADMIN` no banco). Depois disso, pode remover
   `ADMIN_SETUP_TOKEN` das variáveis.

Configure as variáveis de ambiente (ver `.env.example`) em ambos os serviços.
`DATABASE_URL` deve apontar para o plugin Postgres do projeto Railway.

## O que precisa ser preenchido antes de operar uma clínica real

Nada disso é "mockado" no código — são pontos de configuração reais que a
plataforma foi desenhada para receber via CRM interno ou variáveis de
ambiente, e que ainda dependem de você:

1. **Prompt de conversação por clínica** — cadastrado em
   `/crm/clinicas/[id]` (`Clinic.aiSystemPrompt`). Até ser preenchido, o
   sistema usa um prompt de fallback genérico (`src/lib/default-prompt.ts`)
   apenas para não quebrar — **não é o prompt final**.
2. **App da Meta aprovado** com os escopos `instagram_basic`,
   `instagram_manage_messages`, `pages_show_list`, `pages_manage_metadata`,
   `business_management` (App Review da Meta é obrigatório para produção).
3. **Credenciais Google OAuth** (Console do Google Cloud) com a Calendar API
   habilitada.
4. **Evolution API** self-hosted rodando (só `EVOLUTION_API_URL` e
   `EVOLUTION_API_KEY` são globais). Cada clínica pareia seu próprio número
   de WhatsApp via QR code em `/crm/clinicas/[id]/whatsapp` (ou pelo próprio
   painel da clínica, em `/dashboard/whatsapp`) — não existe mais uma
   instância única compartilhada.
5. **Vídeo de confirmação de agendamento** de cada clínica, hospedado em uma
   URL pública (`Clinic.confirmationVideoUrl`), gravado uma única vez pelo
   médico — enviado automaticamente pelo Instagram assim que um
   agendamento é confirmado na conversa, pra reforçar o comparecimento.
6. Conectar Instagram e Google Calendar de cada clínica pelo botão em
   `/crm/clinicas/[id]` (fluxo OAuth oficial — nenhuma senha é armazenada).

## Segurança / limites deliberados (ver especificação)

- Nenhum campo armazena senha do Instagram — apenas token OAuth,
  criptografado em repouso (`src/lib/crypto.ts`).
- A primeira mensagem a cada lead é sempre enviada manualmente por Mauro,
  fora da plataforma — não há disparo em massa automatizado nem lógica de
  variação/randomização para evadir detecção de bot.
- O timing adaptativo de resposta é só agendamento de envio (delay), não
  altera o conteúdo da mensagem nem tenta mascarar automação.

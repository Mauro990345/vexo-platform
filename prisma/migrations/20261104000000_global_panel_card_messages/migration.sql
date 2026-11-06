-- Textos da Reativação e do Quente passam a ser GLOBAIS (pedido
-- explícito), em vez de por clínica. Puramente aditivo: 2 tabelas novas
-- (ReactivationMessagesConfig/HotLeadMessagesConfig, singleton, mesmo
-- padrão de NoShowCardSettings/NeverScheduledCardSettings), NENHUMA
-- coluna existente alterada ou removida — ReactivationConfig.message1-5 e
-- HotLeadConfig.stepXMessageY continuam intactas (pedido explícito: "não
-- apague as colunas ou dados por clínica"), só pararam de ser lidas pelo
-- app a partir desta migration (ver reactivation.ts/hot-lead-cards.ts).
--
-- A linha singleton de cada tabela nova nasce com os textos que estavam
-- salvos na Clínica Demo VEXO (id abaixo, mesmo id de DEMO_CLINIC_ID em
-- src/lib/demo-clinic.ts) — pedido explícito "crie os campos globais
-- usando como base os textos hoje salvos na Clínica Demo". Os subselects
-- escalares abaixo sempre inserem exatamente 1 linha (NULL quando a
-- Clínica Demo não tiver ReactivationConfig/HotLeadConfig ainda, nunca
-- zero linhas) — equivalente a "nenhum texto customizado", mesmo
-- comportamento de antes (cai pros textos padrão).

-- CreateTable
CREATE TABLE "ReactivationMessagesConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "message1" TEXT,
    "message2" TEXT,
    "message3" TEXT,
    "message4" TEXT,
    "message5" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReactivationMessagesConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotLeadMessagesConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "step1Message1" TEXT,
    "step1Message2" TEXT,
    "step1Message3" TEXT,
    "step2Message1" TEXT,
    "step2Message2" TEXT,
    "step2Message3" TEXT,
    "step3Message1" TEXT,
    "step3Message2" TEXT,
    "step3Message3" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotLeadMessagesConfig_pkey" PRIMARY KEY ("id")
);

-- Seed: textos da Reativação da Clínica Demo VEXO.
INSERT INTO "ReactivationMessagesConfig" (id, message1, message2, message3, message4, message5, "updatedAt")
VALUES (
    'singleton',
    (SELECT message1 FROM "ReactivationConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    (SELECT message2 FROM "ReactivationConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    (SELECT message3 FROM "ReactivationConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    (SELECT message4 FROM "ReactivationConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    (SELECT message5 FROM "ReactivationConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;

-- Seed: textos do Quente da Clínica Demo VEXO.
INSERT INTO "HotLeadMessagesConfig" (
    id, "step1Message1", "step1Message2", "step1Message3",
    "step2Message1", "step2Message2", "step2Message3",
    "step3Message1", "step3Message2", "step3Message3",
    "updatedAt"
)
VALUES (
    'singleton',
    (SELECT "step1Message1" FROM "HotLeadConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    (SELECT "step1Message2" FROM "HotLeadConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    (SELECT "step1Message3" FROM "HotLeadConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    (SELECT "step2Message1" FROM "HotLeadConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    (SELECT "step2Message2" FROM "HotLeadConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    (SELECT "step2Message3" FROM "HotLeadConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    (SELECT "step3Message1" FROM "HotLeadConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    (SELECT "step3Message2" FROM "HotLeadConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    (SELECT "step3Message3" FROM "HotLeadConfig" WHERE "clinicId" = 'cmthv55880000qrhxwstrvglp'),
    CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;

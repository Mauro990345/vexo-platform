import { PrismaClient } from "@prisma/client";
import { DEMO_CLINIC_ID } from "./clean-no-photo-demo-data-logic";

const prisma = new PrismaClient();

// Script de DIAGNÓSTICO, 100% leitura — nenhum INSERT/UPDATE/DELETE em
// lugar nenhum.
//
// Contexto: a migration 20261104000000_global_panel_card_messages criou
// ReactivationMessagesConfig/HotLeadMessagesConfig (textos GLOBAIS,
// pedido explícito — "unificar os textos... numa única tela GLOBAL"),
// semeados com os textos que estavam salvos em ReactivationConfig/
// HotLeadConfig da Clínica Demo VEXO. As colunas antigas (por clínica)
// continuam intactas em TODAS as clínicas — nada foi apagado — só
// pararam de ser lidas pelo app.
//
// Este script responde "alguma OUTRA clínica (além da Demo) tinha texto
// customizado aí, que ficou parado?" — pedido explícito: "Se houver
// textos preenchidos em outras clínicas, me avise quais e como estão
// antes de qualquer remoção." Nenhuma remoção acontece aqui nem em
// nenhum outro lugar desta mudança — é só o levantamento.
//
// Uso:
//   npx tsx prisma/diagnose-panel-card-global-messages.ts

function truncate(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

async function main(): Promise<void> {
  const [reactivationConfigs, hotLeadConfigs] = await Promise.all([
    prisma.reactivationConfig.findMany({
      where: {
        OR: [{ message1: { not: null } }, { message2: { not: null } }, { message3: { not: null } }, { message4: { not: null } }, { message5: { not: null } }],
      },
      select: { clinicId: true, clinic: { select: { name: true } }, message1: true, message2: true, message3: true, message4: true, message5: true },
    }),
    prisma.hotLeadConfig.findMany({
      where: {
        OR: [
          { step1Message1: { not: null } }, { step1Message2: { not: null } }, { step1Message3: { not: null } },
          { step2Message1: { not: null } }, { step2Message2: { not: null } }, { step2Message3: { not: null } },
          { step3Message1: { not: null } }, { step3Message2: { not: null } }, { step3Message3: { not: null } },
        ],
      },
      select: {
        clinicId: true,
        clinic: { select: { name: true } },
        step1Message1: true, step1Message2: true, step1Message3: true,
        step2Message1: true, step2Message2: true, step2Message3: true,
        step3Message1: true, step3Message2: true, step3Message3: true,
      },
    }),
  ]);

  console.log("=== Reativação — ReactivationConfig.message1-5 (por clínica, agora inativas) ===\n");
  const otherReactivation = reactivationConfigs.filter((c) => c.clinicId !== DEMO_CLINIC_ID);
  if (otherReactivation.length === 0) {
    console.log("Nenhuma clínica, além da Clínica Demo VEXO, tem texto preenchido aqui.\n");
  } else {
    for (const c of otherReactivation) {
      console.log(`Clínica: ${c.clinic.name} (${c.clinicId})`);
      for (const n of [1, 2, 3, 4, 5] as const) {
        const value = c[`message${n}` as const];
        if (value) console.log(`  message${n}: "${truncate(value)}"`);
      }
      console.log("");
    }
  }

  const demoReactivation = reactivationConfigs.find((c) => c.clinicId === DEMO_CLINIC_ID);
  console.log(`Clínica Demo VEXO (já usada como base dos textos globais): ${demoReactivation ? "tinha texto preenchido" : "nada preenchido"}.\n`);

  console.log("=== Quente — HotLeadConfig.stepXMessageY (por clínica, agora inativas) ===\n");
  const otherHotLead = hotLeadConfigs.filter((c) => c.clinicId !== DEMO_CLINIC_ID);
  if (otherHotLead.length === 0) {
    console.log("Nenhuma clínica, além da Clínica Demo VEXO, tem texto preenchido aqui.\n");
  } else {
    for (const c of otherHotLead) {
      console.log(`Clínica: ${c.clinic.name} (${c.clinicId})`);
      for (const step of [1, 2, 3] as const) {
        for (const n of [1, 2, 3] as const) {
          const value = c[`step${step}Message${n}` as const];
          if (value) console.log(`  step${step}Message${n}: "${truncate(value)}"`);
        }
      }
      console.log("");
    }
  }

  const demoHotLead = hotLeadConfigs.find((c) => c.clinicId === DEMO_CLINIC_ID);
  console.log(`Clínica Demo VEXO (já usada como base dos textos globais): ${demoHotLead ? "tinha texto preenchido" : "nada preenchido"}.\n`);

  console.log(
    "Nada foi apagado. Se alguma clínica acima tinha texto próprio que valeria a pena levar pro\n" +
      "texto GLOBAL (ReactivationMessagesConfig/HotLeadMessagesConfig, editados em Follow-up →\n" +
      '"Cards do Painel"), é uma decisão manual — isso não acontece sozinho.'
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

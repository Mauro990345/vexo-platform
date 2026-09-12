import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/instagram";
import { handleInboundInstagramMessage } from "@/lib/conversation-pipeline";
import { prisma } from "@/lib/prisma";

// Webhook do Instagram Messaging (Meta). GET = handshake de verificação;
// POST = eventos de mensagem recebida.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// Todo campo literalmente chamado "id" nesse payload (entry.id,
// messaging[].sender.id, messaging[].recipient.id) é um identificador
// opaco do Instagram — nunca deveria virar Number em etapa nenhuma. Mas
// esse mesmo produto (Instagram API with Instagram Login) já mostrou,
// em pelo menos 3 endpoints diferentes ao longo dessa integração
// (api.instagram.com/oauth/access_token, graph.instagram.com/me, e
// aparentemente aqui também), que manda esses campos como NÚMERO no
// JSON (sem aspas) em vez de string — e um JSON.parse(rawBody) direto,
// como estava aqui, deixa o parser nativo do V8 arredondar qualquer um
// desses valores que passe de Number.MAX_SAFE_INTEGER (17 dígitos vs.
// ~16 seguros) ANTES de qualquer `as {...}` do TypeScript entrar em
// cena — sem gerar erro nenhum, só corrompendo o valor em silêncio.
//
// Suspeita concreta motivada por um erro real em produção: "The action
// is invalid since it's not the thread owner" (IGApiException, subcode
// 2534037) ao enviar a resposta da IA — sempre no envio final, nunca na
// geração. sender.id (a pessoa que mandou a mensagem) vira
// Lead.igScopedId sem proteção nenhuma; se corrompido mesmo que por 1
// dígito, o "recipient.id" que a gente manda de volta pro Instagram
// não corresponde a nenhuma thread de verdade — Meta rejeita como "não
// é dono dessa thread". entry.id (usado pra achar a InstagramAccount)
// sobreviveu ilhado nos testes desta sessão por coincidência (o valor
// específico usado era representável em float64), o que mascarou esse
// mesmo problema nos outros dois campos.
//
// Substitui qualquer `"id":<dígitos>` (sem aspas) por `"id":"<dígitos>"`
// no texto CRU, antes de JSON.parse — preserva a precisão sem tocar em
// mais nada da estrutura do payload. Seguro mesmo se a Meta já mandar
// esses campos como string (vira um no-op nesse caso).
function quoteNumericIds(rawJson: string): string {
  return rawJson.replace(/"id"\s*:\s*(\d+)(?=[,}\s])/g, '"id":"$1"');
}

type MetaMessagingEntry = {
  id: string; // igUserId da conta que recebeu o evento
  messaging?: {
    sender: { id: string };
    recipient: { id: string };
    timestamp: number;
    message?: { mid: string; text?: string; is_echo?: boolean };
    // Estrutura análoga à do Messenger Platform (infra compartilhada com
    // o Instagram Messaging — mesma razão dos dois namespaces de ID
    // documentada em exchangeInstagramCode) pra notificação de mensagem
    // editada: chave "message_edit" paralela a "message", em vez de um
    // "message" com alguma flag de edição. NÃO CONFIRMADO contra um
    // payload real do Instagram ainda — ver /crm/webhook-logs pra pegar o
    // corpo bruto de um evento "message_edit" de verdade e confirmar (ou
    // corrigir) os nomes dos campos aqui.
    message_edit?: { mid: string; text?: string };
  }[];
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const signatureValid = verifyWebhookSignature(rawBody, signature);

  // Diagnóstico temporário (sem acesso a logs do Railway): grava TODA
  // requisição que chega aqui, mesmo com assinatura inválida ou payload
  // que não vai nem parsear como JSON — é o que permite confirmar, pela
  // própria interface do VEXO, se a Meta está de fato tentando entregar
  // alguma coisa nessa rota (e o quê, exatamente), sem depender de log
  // externo nenhum. ANTES de qualquer validação, e nunca deixa uma falha
  // ao gravar esse log derrubar o processamento normal do webhook.
  // Guarda o id da linha criada (quando a gravação funciona) pra
  // handleInboundInstagramMessage anotar nela o motivo, se descartar o
  // evento por não achar a conta — ver conversation-pipeline.ts.
  const webhookLog = await prisma.webhookLog
    .create({ data: { method: "POST", rawBody, signatureValid } })
    .catch((err) => {
      console.error("[vexo] Falha ao gravar log de diagnóstico do webhook:", err);
      return null;
    });

  if (!signatureValid) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: { entry?: MetaMessagingEntry[] };
  try {
    payload = JSON.parse(quoteNumericIds(rawBody)) as { entry?: MetaMessagingEntry[] };
  } catch (err) {
    console.error("[vexo] Payload do webhook do Instagram não é JSON válido:", err);
    return NextResponse.json({ received: true });
  }

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      // Ignora eco de mensagens enviadas pela própria página (nossas
      // próprias respostas) — "is_echo" só existe em "message", nunca em
      // "message_edit" (não tem eco de edição). Trata o texto final de
      // uma mensagem editada igual a uma mensagem nova: é o que o lead
      // disse de verdade agora, independente de ter sido digitado ou
      // corrigido depois.
      const inbound = event.message?.is_echo ? undefined : event.message ?? event.message_edit;
      if (!inbound?.text) continue;

      try {
        await handleInboundInstagramMessage(
          {
            igUserId: event.recipient.id,
            leadIgScopedId: event.sender.id,
            leadText: inbound.text,
            timestamp: new Date(event.timestamp),
            igMessageId: inbound.mid,
          },
          webhookLog?.id
        );
      } catch (err) {
        console.error("[vexo] Erro ao processar mensagem do Instagram:", err);
        // Mesmo espírito do matchFailureReason (conversation-pipeline.ts):
        // sem isso, uma exceção aqui (conta encontrada, mas algo quebrou
        // depois — classificação, geração de resposta da IA, criação de
        // lead/conversa/mensagem) só existia no console do Railway, sem
        // acesso. Grava na MESMA linha de WebhookLog dessa requisição pra
        // dar pra ver direto em /crm/webhook-logs.
        if (webhookLog?.id) {
          const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
          await prisma.webhookLog
            .update({ where: { id: webhookLog.id }, data: { processingError: detail.slice(0, 4000) } })
            .catch((updateErr) =>
              console.error("[vexo] Falha ao gravar erro de processamento no WebhookLog:", updateErr)
            );
        }
      }
    }
  }

  // A Meta espera 200 rápido; processamento pesado já ocorreu acima de forma síncrona,
  // mas erros individuais não devem derrubar o handshake do webhook.
  return NextResponse.json({ received: true });
}

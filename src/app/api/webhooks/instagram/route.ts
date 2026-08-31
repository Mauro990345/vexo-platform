import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/instagram";
import { handleInboundInstagramMessage } from "@/lib/conversation-pipeline";

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

type MetaMessagingEntry = {
  id: string; // igUserId da conta que recebeu o evento
  messaging?: {
    sender: { id: string };
    recipient: { id: string };
    timestamp: number;
    message?: { mid: string; text?: string; is_echo?: boolean };
  }[];
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody) as { entry?: MetaMessagingEntry[] };

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      // Ignora eco de mensagens enviadas pela própria página (nossas próprias respostas).
      if (!event.message || event.message.is_echo || !event.message.text) continue;

      try {
        await handleInboundInstagramMessage({
          igUserId: event.recipient.id,
          leadIgScopedId: event.sender.id,
          leadText: event.message.text,
          timestamp: new Date(event.timestamp),
          igMessageId: event.message.mid,
        });
      } catch (err) {
        console.error("[vexo] Erro ao processar mensagem do Instagram:", err);
      }
    }
  }

  // A Meta espera 200 rápido; processamento pesado já ocorreu acima de forma síncrona,
  // mas erros individuais não devem derrubar o handshake do webhook.
  return NextResponse.json({ received: true });
}

-- AlterTable: Appointment.conversationId/leadId tornam-se opcionais —
-- agendamento pode vir do sync de leitura do Google Calendar sem Lead/
-- Conversation vinculados (paciente conhecido, agendado manualmente).
ALTER TABLE "Appointment" ALTER COLUMN "conversationId" DROP NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "leadId" DROP NOT NULL;

-- AlterTable: Conversation.previousStatus guarda o status anterior à
-- entrada em FOLLOW_UP por não-comparecimento, pra permitir desfazer.
ALTER TABLE "Conversation" ADD COLUMN "previousStatus" "ConversationStatus";

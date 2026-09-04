-- CreateIndex: cobrem as queries de getClinicMetrics (Painel do cliente e
-- admin) que filtram por clinicId + createdAt — antes só existiam índices
-- por clinicId+status (Conversation) e clinicId+scheduledAt (Appointment),
-- nenhum cobrindo createdAt.
CREATE INDEX "Conversation_clinicId_createdAt_idx" ON "Conversation"("clinicId", "createdAt");
CREATE INDEX "Appointment_clinicId_createdAt_idx" ON "Appointment"("clinicId", "createdAt");

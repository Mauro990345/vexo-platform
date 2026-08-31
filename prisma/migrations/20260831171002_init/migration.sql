-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('INTERNAL_ADMIN', 'INTERNAL_STAFF', 'CLIENT');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('NEW', 'IN_CONVERSATION', 'SCHEDULED', 'FOLLOW_UP', 'LOST', 'NEEDS_HUMAN');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('LEAD', 'AI', 'HUMAN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pilotStartedAt" TIMESTAMP(3),
    "pilotEndsAt" TIMESTAMP(3),
    "notifyWhatsappNumber" TEXT,
    "clientWhatsappNumber" TEXT,
    "aiSystemPrompt" TEXT,
    "welcomeVideoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "clinicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramAccount" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "igUserId" TEXT NOT NULL,
    "igUsername" TEXT,
    "facebookPageId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleCalendarAccount" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "googleAccountEmail" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "igScopedId" TEXT NOT NULL,
    "igUsername" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'NEW',
    "needsHumanReason" TEXT,
    "lastLeadMessageAt" TIMESTAMP(3),
    "lastAiMessageAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "igMessageId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "googleEventId" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "welcomeVideoSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "hoursBefore" INTEGER[] DEFAULT ARRAY[24, 3]::INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "hoursBefore" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL DEFAULT 'instagram',

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpLog" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "FollowUpLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApproachLog" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "loggedDate" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApproachLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklySummary" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "approachedCount" INTEGER NOT NULL,
    "respondedCount" INTEGER NOT NULL,
    "scheduledCount" INTEGER NOT NULL,
    "noShowCount" INTEGER NOT NULL,
    "completedCount" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sendError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_slug_key" ON "Clinic"("slug");

-- CreateIndex
CREATE INDEX "Clinic_active_idx" ON "Clinic"("active");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clinicId_idx" ON "User"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_clinicId_key" ON "InstagramAccount"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarAccount_clinicId_key" ON "GoogleCalendarAccount"("clinicId");

-- CreateIndex
CREATE INDEX "Lead_clinicId_idx" ON "Lead"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_clinicId_igScopedId_key" ON "Lead"("clinicId", "igScopedId");

-- CreateIndex
CREATE INDEX "Conversation_clinicId_status_idx" ON "Conversation"("clinicId", "status");

-- CreateIndex
CREATE INDEX "Conversation_leadId_idx" ON "Conversation"("leadId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_status_scheduledFor_idx" ON "Message"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_scheduledAt_idx" ON "Appointment"("clinicId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderConfig_clinicId_key" ON "ReminderConfig"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_appointmentId_hoursBefore_key" ON "ReminderLog"("appointmentId", "hoursBefore");

-- CreateIndex
CREATE INDEX "FollowUpLog_conversationId_idx" ON "FollowUpLog"("conversationId");

-- CreateIndex
CREATE INDEX "ApproachLog_clinicId_loggedDate_idx" ON "ApproachLog"("clinicId", "loggedDate");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySummary_clinicId_weekStart_key" ON "WeeklySummary"("clinicId", "weekStart");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramAccount" ADD CONSTRAINT "InstagramAccount_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleCalendarAccount" ADD CONSTRAINT "GoogleCalendarAccount_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderConfig" ADD CONSTRAINT "ReminderConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpLog" ADD CONSTRAINT "FollowUpLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproachLog" ADD CONSTRAINT "ApproachLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySummary" ADD CONSTRAINT "WeeklySummary_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

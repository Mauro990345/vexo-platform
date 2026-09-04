-- AddColumn
ALTER TABLE "ConnectionLink" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'google-calendar';
ALTER TABLE "ConnectionLink" ALTER COLUMN "channel" DROP DEFAULT;

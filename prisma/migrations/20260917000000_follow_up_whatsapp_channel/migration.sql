-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('INSTAGRAM', 'WHATSAPP');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "channel" "MessageChannel" NOT NULL DEFAULT 'INSTAGRAM';

-- AlterTable
ALTER TABLE "FollowUpStep" ADD COLUMN     "channel" "MessageChannel" NOT NULL DEFAULT 'INSTAGRAM';

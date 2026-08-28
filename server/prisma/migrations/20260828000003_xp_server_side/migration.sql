-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "xpAwarded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

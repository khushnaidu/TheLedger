-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "time" TEXT,
ADD COLUMN     "timeIsUtc" BOOLEAN NOT NULL DEFAULT false;

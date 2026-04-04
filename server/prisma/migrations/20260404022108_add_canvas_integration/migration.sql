-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "canvasAssignmentId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "canvasCourseId" TEXT;

-- CreateTable
CREATE TABLE "CanvasIntegration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "baseUrl" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Ticket_canvasAssignmentId_idx" ON "Ticket"("canvasAssignmentId");

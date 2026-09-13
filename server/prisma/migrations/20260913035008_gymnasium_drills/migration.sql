-- CreateTable
CREATE TABLE "Drill" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "brief" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Drill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Drill_userId_updatedAt_idx" ON "Drill"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Drill" ADD CONSTRAINT "Drill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

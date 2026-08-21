-- CreateTable
CREATE TABLE "TvChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "src" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TvChannel_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TvChannel" ADD CONSTRAINT "TvChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

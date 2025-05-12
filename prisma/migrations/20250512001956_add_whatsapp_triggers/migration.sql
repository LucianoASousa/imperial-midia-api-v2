-- CreateTable
CREATE TABLE "WhatsappTrigger" (
    "id" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL DEFAULT 'default',
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappTrigger_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WhatsappTrigger" ADD CONSTRAINT "WhatsappTrigger_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "WhatsappFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

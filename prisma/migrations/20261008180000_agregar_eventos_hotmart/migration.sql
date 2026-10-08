-- CreateTable
CREATE TABLE "HotmartEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "event" TEXT NOT NULL,
    "transaction" TEXT,
    "buyerEmail" TEXT,
    "subscriberCode" TEXT,
    "productId" TEXT,
    "offerCode" TEXT,
    "tenantId" TEXT,
    "commercialPlanId" TEXT,
    "outcome" TEXT NOT NULL,
    "needsAttention" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "summary" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendedAt" TIMESTAMP(3),
    "attendedBy" TEXT,

    CONSTRAINT "HotmartEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotmartEvent_eventId_key" ON "HotmartEvent"("eventId");

-- CreateIndex
CREATE INDEX "HotmartEvent_needsAttention_attendedAt_idx" ON "HotmartEvent"("needsAttention", "attendedAt");

-- CreateIndex
CREATE INDEX "HotmartEvent_receivedAt_idx" ON "HotmartEvent"("receivedAt");

-- CreateIndex
CREATE INDEX "HotmartEvent_transaction_idx" ON "HotmartEvent"("transaction");

-- Seguridad: Supabase da permisos por defecto a los roles públicos (anon /
-- authenticated) sobre toda tabla nueva. Con RLS activo y SIN políticas
-- nadie público puede leer ni escribir; el servidor (Prisma) sigue
-- funcionando porque su rol se salta RLS.
ALTER TABLE "HotmartEvent" ENABLE ROW LEVEL SECURITY;

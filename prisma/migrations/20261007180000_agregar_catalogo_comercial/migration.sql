-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "commercialPlanId" TEXT;

-- CreateTable
CREATE TABLE "CommercialPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MENSUAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialFeature" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "moduleCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialPlanFeature" (
    "planId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,

    CONSTRAINT "CommercialPlanFeature_pkey" PRIMARY KEY ("planId","featureId")
);

-- CreateTable
CREATE TABLE "CommercialLimit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "scope" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialPlanLimit" (
    "planId" TEXT NOT NULL,
    "limitId" TEXT NOT NULL,
    "value" DECIMAL(12,2),
    "isUnlimited" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CommercialPlanLimit_pkey" PRIMARY KEY ("planId","limitId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommercialPlan_code_key" ON "CommercialPlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialFeature_code_key" ON "CommercialFeature"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialLimit_code_key" ON "CommercialLimit"("code");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_commercialPlanId_fkey" FOREIGN KEY ("commercialPlanId") REFERENCES "CommercialPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialPlanFeature" ADD CONSTRAINT "CommercialPlanFeature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommercialPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialPlanFeature" ADD CONSTRAINT "CommercialPlanFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "CommercialFeature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialPlanLimit" ADD CONSTRAINT "CommercialPlanLimit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CommercialPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialPlanLimit" ADD CONSTRAINT "CommercialPlanLimit_limitId_fkey" FOREIGN KEY ("limitId") REFERENCES "CommercialLimit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

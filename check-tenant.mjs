import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const tenant = await prisma.tenant.findUnique({
  where: { slug: "difussion-barberia" },
  include: {
    branches: true,
    users: { include: { role: { include: { role: true } } } },
    subscription: true,
    modules: { include: { module: true } },
  },
});

console.dir(tenant, { depth: null });
await prisma.$disconnect();
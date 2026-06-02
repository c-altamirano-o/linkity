import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: "postgresql://postgres.jwyksmofwxwzuxwoinvm:A1015426010b@aws-1-us-east-2.pooler.supabase.com:5432/postgres",
  },
});
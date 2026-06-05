import type { Metadata } from "next";
import TenantShell from "@/components/tenant/TenantShell";

export const metadata: Metadata = {
  title: "Linkity",
};

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  return <TenantShell tenant={tenant}>{children}</TenantShell>;
}
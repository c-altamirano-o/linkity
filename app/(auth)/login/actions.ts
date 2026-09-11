"use server";

import { prisma } from "@/lib/prisma";

export async function getTenantSlugBySupabaseId(
  supabaseId: string
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { supabaseId },
    include: { tenant: true },
  });
  return user?.tenant.slug ?? null;
}
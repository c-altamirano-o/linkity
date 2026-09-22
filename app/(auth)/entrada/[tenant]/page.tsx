import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Building2, User } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { THEME_PRESETS, TENANT_THEME_ROOT_ID } from "@/lib/theme-presets";

/**
 * 2026-09-21, a petición de Carlos: esta pantalla dejó de mostrar
 * directamente la lista de personal (eso ahora vive en
 * /entrada/[tenant]/[branch], una URL por sucursal — ver el comentario en
 * ese page.tsx). Esta es solo un selector:
 *
 * - Negocio de 1 sola sucursal: redirige de inmediato a su única sucursal,
 *   así que para ese caso (el más común: autoempleado o negocio chico) el
 *   link sigue siendo tan simple como antes — nadie nota el cambio.
 * - Negocio de varias sucursales: pide "¿en qué sucursal estás?" antes de
 *   mostrar personal — así un dueño con 15 sucursales puede dar este MISMO
 *   link genérico a cualquiera sin tener que acordarse cuál es cuál, y cada
 *   tablet ve solo el personal de su propia sucursal una vez que la elige.
 *   El link directo por sucursal (sin este paso extra) se copia desde
 *   /[tenant]/sucursales, pensado para dejarlo fijo en cada mostrador.
 */
export default async function EntradaSelectorPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      themePreset: true,
      branches: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  if (!tenant) notFound();

  if (tenant.branches.length === 1) {
    redirect(`/entrada/${tenantSlug}/${tenant.branches[0].id}`);
  }

  const activePreset = THEME_PRESETS[tenant.themePreset as keyof typeof THEME_PRESETS] || THEME_PRESETS.NEUTRAL_TECH;

  return (
    <div id={TENANT_THEME_ROOT_ID} style={activePreset as React.CSSProperties}>
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <p className="text-xs text-muted-foreground tracking-widest uppercase mb-1">{tenant.name}</p>
            <h1 className="text-xl font-semibold text-foreground">¿En qué sucursal estás?</h1>
            <p className="text-sm text-muted-foreground mt-1">Toca tu sucursal para continuar</p>
          </div>

          {tenant.branches.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              Este negocio todavía no tiene sucursales activas.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {tenant.branches.map((b) => (
                <Link
                  key={b.id}
                  href={`/entrada/${tenantSlug}/${b.id}`}
                  className="flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{b.name}</p>
                </Link>
              ))}
            </div>
          )}

          <div className="text-center mt-8">
            <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <User className="w-3 h-3" /> ¿Eres el administrador? Inicia sesión con tu correo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

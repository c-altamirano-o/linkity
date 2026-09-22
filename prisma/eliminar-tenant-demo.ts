import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Borra POR COMPLETO un negocio demo (Tenant + absolutamente todo lo que
 * cuelga de él) — 2026-09-22, a petición de Carlos: necesitaba recrear
 * "Demo Taller de Celulares" con la nueva estructura de sucursales, y el
 * Panel Maestro NO tiene una función de "eliminar negocio" (el botón
 * "Suspender" solo cambia Subscription.status a SUSPENDED — el tenant y
 * todos sus datos se quedan intactos, ver alternarSuscripcionAction en
 * app/(admin)/maestro/dashboard/actions.ts). Tampoco existe una manera
 * simple de hacerlo con `prisma.tenant.delete()`: ninguna relación del
 * schema tiene `onDelete: Cascade` (ver prisma/schema.prisma, no hay un
 * solo `onDelete` en todo el archivo), así que el default de Prisma para
 * una relación obligatoria es Restrict — borrar el Tenant directo truena
 * con una violación de llave foránea en cuanto hay una sola Branch/Sale/
 * Repair/etc. que lo referencie. Por eso este script borra TODO lo que
 * cuelga del tenant, en el orden exacto que exigen las llaves foráneas
 * (hijo antes que padre), y hasta el final borra el Tenant mismo.
 *
 * SOLO sirve para negocios DEMO a propósito (ver el guard de slug abajo):
 * es un borrado irreversible y sin confirmación intermedia, así que no
 * tiene sentido (ni es seguro) dejarlo apuntar a un negocio real. Si algún
 * día hace falta borrar un tenant real, eso merece su propia conversación
 * y su propio cuidado — no reutilizar este script para eso.
 *
 * Cómo correrlo:
 *   npx tsx prisma/eliminar-tenant-demo.ts --slug=demo-reparacion-celulares
 *
 * No borra el usuario de Supabase Auth del dueño (correo
 * demo_<emailLocal>@linkitysoluciones.com) — no hace falta: cuando
 * prisma/seed-demo.ts vuelva a crear el tenant, obtenerOCrearUsuarioAuth ya
 * sabe reutilizar ese mismo Auth user si el alta directa falla por "ya
 * existe" (lo busca por correo), así que no hay necesidad de borrarlo
 * primero ni riesgo de dejarlo huérfano.
 */

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

const argSlug = process.argv.find((a) => a.startsWith("--slug="));
const slug = argSlug?.slice("--slug=".length).trim();

async function main() {
  if (!slug) {
    console.error("❌ Falta --slug=<slug-del-negocio-demo>. Ejemplo:\n   npx tsx prisma/eliminar-tenant-demo.ts --slug=demo-reparacion-celulares");
    process.exit(1);
  }
  // Guard de seguridad: este script solo puede apuntar a negocios demo
  // (slug que empieza con "demo-", el mismo prefijo que usan los 20 de
  // prisma/seed-demo.ts) — nunca a un negocio real, para que un typo de
  // slug no borre a un cliente de verdad.
  if (!slug.startsWith("demo-")) {
    console.error(`❌ "${slug}" no empieza con "demo-" — este script se niega a borrar cualquier cosa que no sea un negocio demo.`);
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (!tenant) {
    console.error(`❌ No existe ningún tenant con slug "${slug}".`);
    process.exit(1);
  }

  console.log(`🗑️  Borrando "${tenant.name}" (${tenant.slug}) y TODOS sus datos...`);
  const tenantId = tenant.id;

  await prisma.$transaction(async (tx) => {
    const saleIds = (await tx.sale.findMany({ where: { tenantId }, select: { id: true } })).map((s) => s.id);
    const repairIds = (await tx.repair.findMany({ where: { tenantId }, select: { id: true } })).map((r) => r.id);
    const cashSessionIds = (await tx.cashSession.findMany({ where: { tenantId }, select: { id: true } })).map((c) => c.id);
    const purchaseIds = (await tx.purchase.findMany({ where: { tenantId }, select: { id: true } })).map((p) => p.id);
    const staffIds = (await tx.staff.findMany({ where: { tenantId }, select: { id: true } })).map((s) => s.id);
    const roleIds = (await tx.role.findMany({ where: { tenantId }, select: { id: true } })).map((r) => r.id);
    const userIds = (await tx.user.findMany({ where: { tenantId }, select: { id: true } })).map((u) => u.id);
    const branchIds = (await tx.branch.findMany({ where: { tenantId }, select: { id: true } })).map((b) => b.id);
    const productIds = (await tx.product.findMany({ where: { tenantId }, select: { id: true } })).map((p) => p.id);
    const supportTicketIds = (await tx.supportTicket.findMany({ where: { tenantId }, select: { id: true } })).map((t) => t.id);
    const treatmentPlanIds = (await tx.treatmentPlan.findMany({ where: { tenantId }, select: { id: true } })).map((t) => t.id);

    // ── Fase 1: hojas (nada más las referencia) ──────────────────────────
    await tx.saleMixedPayment.deleteMany({ where: { saleId: { in: saleIds } } });
    await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
    await tx.repairItem.deleteMany({ where: { repairId: { in: repairIds } } });
    await tx.repairHistory.deleteMany({ where: { repairId: { in: repairIds } } });
    await tx.cashMovement.deleteMany({ where: { cashSessionId: { in: cashSessionIds } } });
    await tx.attendance.deleteMany({ where: { staffId: { in: staffIds } } });
    await tx.staffPayment.deleteMany({ where: { staffId: { in: staffIds } } });
    await tx.staffLoginSession.deleteMany({ where: { tenantId } });
    await tx.purchaseItem.deleteMany({ where: { purchaseId: { in: purchaseIds } } });
    await tx.supportTicketMessage.deleteMany({ where: { ticketId: { in: supportTicketIds } } });
    await tx.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await tx.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await tx.inventory.deleteMany({ where: { branchId: { in: branchIds } } });
    // InformedConsent referencia TreatmentPlanItem (opcional) — se borra
    // ANTES que TreatmentPlanItem por esa llave foránea.
    await tx.informedConsent.deleteMany({ where: { tenantId } });
    await tx.odontogramaTooth.deleteMany({ where: { tenantId } });
    await tx.clinicalNote.deleteMany({ where: { tenantId } });
    await tx.patientRecord.deleteMany({ where: { tenantId } });
    await tx.prescription.deleteMany({ where: { tenantId } });
    await tx.appointment.deleteMany({ where: { tenantId } });
    // Invoice referencia Sale (opcional) — se borra ANTES que Sale.
    await tx.invoice.deleteMany({ where: { tenantId } });

    // ── Fase 2: dependen de que la fase 1 ya esté vacía ──────────────────
    await tx.treatmentPlanItem.deleteMany({ where: { treatmentPlanId: { in: treatmentPlanIds } } });
    await tx.sale.deleteMany({ where: { tenantId } });
    // Repair.assignedToStaffId apunta a Staff — Repair se borra antes que
    // Staff (no al revés) para no chocar con esa llave foránea.
    await tx.repair.deleteMany({ where: { tenantId } });
    await tx.cashSession.deleteMany({ where: { tenantId } });
    await tx.purchase.deleteMany({ where: { tenantId } });
    await tx.supportTicket.deleteMany({ where: { tenantId } });
    await tx.treatmentPlan.deleteMany({ where: { tenantId } });

    // ── Fase 3: Staff y Customer (ya sin nada que los referencie) ────────
    await tx.staff.deleteMany({ where: { tenantId } });
    await tx.customer.deleteMany({ where: { tenantId } });

    // ── Fase 4: User y Role (ya sin Staff/UserRole/tickets/etc. que los
    // referencien) ────────────────────────────────────────────────────────
    await tx.user.deleteMany({ where: { tenantId } });
    await tx.role.deleteMany({ where: { tenantId } });

    // ── Fase 5: catálogo y proveedor ──────────────────────────────────────
    await tx.product.deleteMany({ where: { tenantId } });
    // Category es un árbol (parentId auto-referenciado) — se desconectan los
    // padres primero para poder borrar todas las filas en un solo deleteMany
    // sin importar el orden hijo/padre real.
    await tx.category.updateMany({ where: { tenantId }, data: { parentId: null } });
    await tx.category.deleteMany({ where: { tenantId } });
    await tx.supplier.deleteMany({ where: { tenantId } });

    // ── Fase 6: Branch y configuración de tenant ──────────────────────────
    await tx.branch.deleteMany({ where: { tenantId } });
    await tx.tenantModule.deleteMany({ where: { tenantId } });
    await tx.subscription.deleteMany({ where: { tenantId } });
    await tx.tenantLabel.deleteMany({ where: { tenantId } });

    // ── Fase 7: el tenant mismo ────────────────────────────────────────────
    await tx.tenant.delete({ where: { id: tenantId } });
  }, { timeout: 30000 });

  console.log(`✅ "${tenant.name}" (${tenant.slug}) y todos sus datos fueron borrados.`);
  console.log(`   Ahora puedes recrearlo con:\n   npx tsx prisma/seed-demo.ts --solo=${tenant.slug}`);
}

main()
  .catch((e) => {
    console.error("❌ Error borrando el tenant:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

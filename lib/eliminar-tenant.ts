import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Borra un negocio REAL por completo (Tenant + absolutamente todo lo que
 * cuelga de él) — 2026-09-22, a petición de Carlos: el paso final del
 * ciclo de vida de suscripción (ver lib/ciclo-suscripcion.ts) es que él
 * mismo confirme el borrado desde Panel Maestro cuando un negocio lleva
 * 90+ días bloqueado sin responder. Usado por eliminarTenantAction
 * (maestro/tenants/actions.ts).
 *
 * MISMO orden de borrado (hijo antes que padre) que
 * prisma/eliminar-tenant-demo.ts — es una copia deliberada, no una
 * refactorización para compartir código: ese script corre por fuera del
 * runtime de Next vía `tsx` directo (ver su propio comentario de cabecera
 * y el de prisma/seed-demo.ts: "no importa nada de lib/*.ts... se duplica
 * aquí en su forma mínima"), así que no puede importar este archivo
 * (usa "server-only" y el cliente Prisma de la app). Si el día de mañana
 * cambia el orden de borrado aquí por un cambio de schema, hay que
 * replicar el cambio también en prisma/eliminar-tenant-demo.ts.
 *
 * Ninguna de las dos rutas borra el usuario de Supabase Auth del dueño —
 * no aplica aquí: a diferencia del demo (que se vuelve a crear con el
 * mismo correo sintético), un negocio real borrado no se re-crea solo, así
 * que no hace falta reutilizar ese Auth user después. Si Carlos algún día
 * quiere borrar también la cuenta de Supabase Auth, es un paso aparte
 * (fuera de esta función a propósito, para no atar un borrado de datos de
 * negocio a un borrado de credenciales de acceso).
 */
export async function eliminarTenantPorCompleto(tenantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const saleIds = (await tx.sale.findMany({ where: { tenantId }, select: { id: true } })).map((s) => s.id);
    const repairIds = (await tx.repair.findMany({ where: { tenantId }, select: { id: true } })).map((r) => r.id);
    const cashSessionIds = (await tx.cashSession.findMany({ where: { tenantId }, select: { id: true } })).map((c) => c.id);
    const purchaseIds = (await tx.purchase.findMany({ where: { tenantId }, select: { id: true } })).map((p) => p.id);
    const staffIds = (await tx.staff.findMany({ where: { tenantId }, select: { id: true } })).map((s) => s.id);
    const roleIds = (await tx.role.findMany({ where: { tenantId }, select: { id: true } })).map((r) => r.id);
    const userIds = (await tx.user.findMany({ where: { tenantId }, select: { id: true } })).map((u) => u.id);
    const branchIds = (await tx.branch.findMany({ where: { tenantId }, select: { id: true } })).map((b) => b.id);
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
    await tx.informedConsent.deleteMany({ where: { tenantId } });
    await tx.odontogramaTooth.deleteMany({ where: { tenantId } });
    await tx.clinicalNote.deleteMany({ where: { tenantId } });
    await tx.patientRecord.deleteMany({ where: { tenantId } });
    await tx.prescription.deleteMany({ where: { tenantId } });
    await tx.appointment.deleteMany({ where: { tenantId } });
    await tx.invoice.deleteMany({ where: { tenantId } });

    // ── Fase 2: dependen de que la fase 1 ya esté vacía ──────────────────
    await tx.treatmentPlanItem.deleteMany({ where: { treatmentPlanId: { in: treatmentPlanIds } } });
    await tx.sale.deleteMany({ where: { tenantId } });
    await tx.repair.deleteMany({ where: { tenantId } });
    await tx.cashSession.deleteMany({ where: { tenantId } });
    await tx.purchase.deleteMany({ where: { tenantId } });
    await tx.supportTicket.deleteMany({ where: { tenantId } });
    await tx.treatmentPlan.deleteMany({ where: { tenantId } });

    // ── Fase 3: Staff y Customer ──────────────────────────────────────────
    await tx.staff.deleteMany({ where: { tenantId } });
    await tx.customer.deleteMany({ where: { tenantId } });

    // ── Fase 4: User y Role ────────────────────────────────────────────────
    await tx.user.deleteMany({ where: { tenantId } });
    await tx.role.deleteMany({ where: { tenantId } });

    // ── Fase 5: catálogo y proveedor ──────────────────────────────────────
    await tx.product.deleteMany({ where: { tenantId } });
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
}

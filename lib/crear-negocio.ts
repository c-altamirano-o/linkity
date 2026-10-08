import "server-only";

import type { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MODULE_CATALOG, ALL_MODULE_CODES } from "@/lib/modules-catalog";
import { modulosRecomendadosOff } from "@/lib/modulos-rubro";
import { asegurarRolesRubro } from "@/lib/roles-server";
import { slugify } from "@/lib/slug";

/**
 * Alta de un negocio nuevo: la ÚNICA pieza que crea el negocio y todo lo que
 * necesita para funcionar (sucursal principal, usuario dueño, rol
 * Administrador, suscripción y módulos). Antes vivía dentro del formulario de
 * auto-registro (app/(auth)/register/actions.ts); se sacó aquí (2026-10-08)
 * para que también la use el webhook de Hotmart cuando alguien se suscribe
 * desde el checkout y todavía no tiene cuenta.
 *
 * Esta función NO crea la cuenta de Supabase Auth ni manda correos: quien la
 * llama ya tiene el `authUserId` y decide qué hacer si algo sale mal después
 * (el formulario deshace todo si el correo no sale; el webhook de Hotmart NO
 * deshace nada porque el cliente ya pagó).
 *
 * `businessType` puede ser null: así llegan los negocios creados desde Hotmart
 * (el checkout no pregunta el giro; se pide en el primer acceso, y para eso se
 * marcan con `datosPendientes: true`). Sin giro
 * todos los módulos quedan activos y no se crean roles de rubro todavía.
 */

export interface DatosSuscripcionInicial {
  plan: string;
  status: SubscriptionStatus;
  price: number;
  endDate: Date;
  commercialPlanId?: string | null;
  autoRenew?: boolean;
  hotmartSubscriberCode?: string | null;
  hotmartLastTransaction?: string | null;
}

export interface CrearNegocioParams {
  businessName: string;
  /** Slug ya validado/único (ver generarSlugUnico). */
  slug: string;
  businessType: string | null;
  /** true = el dueño aún debe capturar nombre real y giro en su primer acceso (negocios de Hotmart). */
  datosPendientes?: boolean;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string | null;
  authUserId: string;
  suscripcion: DatosSuscripcionInicial;
  /** Si viene, deja constancia (en la misma transacción) de que este correo ya usó su prueba. */
  pruebaUsada?: { emailCanonico: string; emailOriginal: string } | null;
}

export interface NegocioCreado {
  id: string;
  slug: string;
  userId: string;
}

export async function crearNegocio(p: CrearNegocioParams): Promise<NegocioCreado> {
  const resultado = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: p.businessName.trim(),
        slug: p.slug,
        businessType: p.businessType,
        datosPendientes: p.datosPendientes ?? false,
        email: p.ownerEmail.trim(),
        phone: p.ownerPhone?.trim() || null,
      },
    });

    // Misma transacción: si el alta falla, tampoco se "gasta" la prueba.
    if (p.pruebaUsada) {
      await tx.pruebaGratisUsada.create({
        data: { emailCanonico: p.pruebaUsada.emailCanonico, emailOriginal: p.pruebaUsada.emailOriginal, tenantSlug: tenant.slug },
      });
    }

    const branch = await tx.branch.create({
      data: { tenantId: tenant.id, name: "Sucursal Principal" },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        email: p.ownerEmail.trim(),
        name: p.ownerName.trim(),
        supabaseId: p.authUserId,
      },
    });

    const role = await tx.role.create({
      data: { tenantId: tenant.id, name: "Administrador", description: "Acceso completo", isSystem: true },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });

    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        plan: p.suscripcion.plan,
        status: p.suscripcion.status,
        price: p.suscripcion.price,
        endDate: p.suscripcion.endDate,
        ...(p.suscripcion.commercialPlanId ? { commercialPlanId: p.suscripcion.commercialPlanId } : {}),
        ...(p.suscripcion.autoRenew !== undefined ? { autoRenew: p.suscripcion.autoRenew } : {}),
        ...(p.suscripcion.hotmartSubscriberCode ? { hotmartSubscriberCode: p.suscripcion.hotmartSubscriberCode } : {}),
        ...(p.suscripcion.hotmartLastTransaction ? { hotmartLastTransaction: p.suscripcion.hotmartLastTransaction } : {}),
      },
    });

    const recomendadosOff = new Set(p.businessType ? modulosRecomendadosOff(p.businessType) : []);
    for (const code of ALL_MODULE_CODES) {
      const info = MODULE_CATALOG[code];
      const mod = await tx.module.upsert({
        where: { code },
        update: {},
        create: { code, name: info.name, isCore: info.isCore },
      });
      await tx.tenantModule.create({
        data: { tenantId: tenant.id, moduleId: mod.id, isActive: !recomendadosOff.has(code) },
      });
    }

    return { id: tenant.id, slug: tenant.slug, userId: user.id };
  });

  // Roles con jerarquía y permisos del rubro: fuera de la transacción a
  // propósito. Si fallara, el negocio igual queda creado y "Roles y permisos"
  // los crea solo al abrirse (ver listarRolesTenant en lib/roles-server.ts).
  if (p.businessType) {
    try {
      await asegurarRolesRubro(resultado.id, p.businessType);
    } catch (err) {
      console.error("No se pudieron crear los roles del rubro (se crearán al abrir Roles y permisos):", err);
    }
  }

  return resultado;
}

/**
 * Slug libre a partir de un nombre: "mi-negocio", y si ya existe,
 * "mi-negocio-2", "mi-negocio-3"… Se usa cuando nadie está tecleando el nombre
 * (negocios creados desde Hotmart); el formulario de registro, en cambio,
 * rechaza un nombre repetido.
 */
export async function generarSlugUnico(base: string): Promise<string> {
  const limpio = slugify(base) || "negocio";
  const existentes = await prisma.tenant.findMany({
    where: { slug: { startsWith: limpio } },
    select: { slug: true },
  });
  const usados = new Set(existentes.map((t) => t.slug));
  if (!usados.has(limpio)) return limpio;
  for (let n = 2; n < 1000; n++) {
    const candidato = `${limpio}-${n}`;
    if (!usados.has(candidato)) return candidato;
  }
  return `${limpio}-${Date.now().toString(36)}`;
}

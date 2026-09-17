import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString = process.env.DATABASE_URL;

const adapter = new PrismaPg({ connectionString });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// ============================================
// EXTENSIÓN DE SEGURIDAD MULTI-TENANT
// ============================================
//
// Estándar del proyecto: cualquier código que consulte o modifique un
// modelo con tenantId propio (ver la lista de abajo) debe pasar por
// getTenantPrisma(tenantId), nunca por el `prisma` a secas — así nunca
// depende de que alguien se acuerde de escribir `where: { tenantId }` a
// mano en cada query nueva. Ya migrados: dashboard-data.ts,
// catalogo-data.ts, inventario-data.ts, labels-server.ts,
// inventario-actions.ts y customer.ts.
//
// Excepción intencional: operaciones sobre el propio modelo Tenant (ej.
// updateThemePreset/updateBusinessType en app/actions/tenant.ts) siguen
// usando `prisma` directo — Tenant es la entidad raíz, no tiene sentido
// "escoparlo a sí mismo".
//
// Nota importante: esto es aislamiento a nivel de APLICACIÓN, no RLS real
// de Postgres — protege solo las queries que efectivamente pasan por
// getTenantPrisma(...). Un RLS real de Postgres (ENABLE ROW LEVEL
// SECURITY + políticas) protegería a nivel de base de datos sin importar
// qué cliente se use. Esta extensión es una capa extra útil, no un
// reemplazo de eso.
//
// Dos límites a tener presentes:
// - Solo actúa sobre operaciones de PRIMER NIVEL en un modelo de la
//   lista. Un filtro anidado por relación (ej. prisma.saleItem.findMany
//   con `where: { sale: { tenantId } }`) NO pasa por aquí — SaleItem no
//   tiene tenantId propio, así que ese filtro se sigue escribiendo a
//   mano. Tampoco intercepta escrituras anidadas (crear un Sale con un
//   `customer: { create: {...} } }` anidado no inyecta tenantId al
//   Customer anidado).
// - La validación de ownership en update/delete/upsert es "revisar y
//   luego actuar" (dos queries separadas), no una condición atómica en
//   el mismo where — suficiente para el patrón de tráfico de esta app,
//   pero no una garantía a nivel de base de datos.

export const getTenantPrisma = (tenantId: string) => {
  // Lista exacta de los modelos en tu esquema que tienen el campo tenantId
  const tenantModels = [
    "TenantLabel", "Branch", "User", "Role", "TenantModule", "Subscription",
    "Category", "Product", "Customer", "Sale", "Repair", "CashSession",
    "Staff", "Supplier", "Purchase", "Invoice", "SupportTicket", "StaffLoginSession"
  ];

  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (tenantModels.includes(model)) {
            // Dentro de $allOperations, `args` está tipado como la unión de
            // TODOS los tipos de argumento posibles de TODOS los
            // modelos/operaciones (TenantFindUniqueArgs | ... |
            // PurchaseItemCountArgs | ...). TypeScript no puede angostar esa
            // unión a partir de un chequeo en tiempo de ejecución como
            // `array.includes(operation)`, así que dentro de cada rama de
            // abajo el tipo declarado de `args` no garantiza que `.where`,
            // `.data` o `.create` existan — aunque en la práctica sí existen
            // porque cada rama solo corre para las operaciones correctas.
            // Se usa `a` (mismo objeto, casteado a any) para leer/mutar esos
            // campos; como es la misma referencia, la mutación se refleja
            // en `args` cuando se llama a `query(args)` al final.
            const a: any = args;

            // 1. Inyección automática en listas y conteos
            const safeWhereOperations = ["findFirst", "findFirstOrThrow", "findMany", "updateMany", "deleteMany", "count", "aggregate", "groupBy"];
            if (safeWhereOperations.includes(operation)) {
              a.where = { ...a.where, tenantId };
            }

            // 2. Inyección automática al crear registros
            if (operation === "create" && a.data) {
              a.data = { ...a.data, tenantId };
            }
            if (operation === "createMany" && Array.isArray(a.data)) {
              a.data = a.data.map((item: any) => ({ ...item, tenantId }));
            }

            // 2.5 upsert: no cae en ninguna de las listas de arriba, así que
            // sin este bloque quedaba completamente SIN protección (ni
            // inyección de tenantId en el create, ni verificación de
            // ownership del registro existente). Se fuerza tenantId en la
            // rama create, y si ya existe un registro que matchea el
            // where, se verifica que sea de este tenant antes de permitir
            // que upsert lo actualice.
            if (operation === "upsert") {
              if (a.create) {
                a.create = { ...a.create, tenantId };
              }
              const existing = await (prisma as any)[model]
                .findUnique({ where: a.where, select: { tenantId: true } })
                .catch(() => null);
              if (existing && existing.tenantId !== tenantId) {
                throw new Error(`Acceso denegado: Intento de upsert en registro ajeno de ${model}.`);
              }
              return query(args);
            }

            // 3. Validación estricta para lectura o mutación por ID único
            if (["findUnique", "findUniqueOrThrow", "update", "delete"].includes(operation)) {

              // Bug real encontrado al construir el checkout de POS: si el
              // caller pide un `select` específico sin incluir tenantId
              // (ej. `select: { id: true }`, como hacía ajustarStock en
              // inventario-actions.ts), la validación de ownership de abajo
              // compara `result.tenantId` — que sale `undefined` porque
              // nunca se seleccionó — contra el tenantId real, y como
              // `undefined !== tenantId` siempre es true, TRUENA "Acceso
              // denegado" incluso para un registro que sí pertenece a este
              // tenant. Se fuerza tenantId dentro del select para que la
              // validación tenga algo que comparar; esto no cambia el tipo
              // que ve TypeScript en el sitio de la llamada (ese tipo se
              // infiere del `select` ORIGINAL tal como se escribió ahí, no
              // de este objeto mutado en runtime) — solo agrega un campo
              // extra e inofensivo al objeto que regresa en tiempo de
              // ejecución.
              if (["findUnique", "findUniqueOrThrow"].includes(operation) && a.select && !a.select.tenantId) {
                a.select = { ...a.select, tenantId: true };
              }

              // Para actualizar o eliminar, verificamos a quién pertenece ANTES de tocar la base de datos
              if (["update", "delete"].includes(operation)) {
                const record = await (prisma as any)[model].findUnique({
                  where: a.where,
                  select: { tenantId: true }
                });
                if (record && record.tenantId !== tenantId) {
                  throw new Error(`Acceso denegado: Intento de mutación en registro ajeno de ${model}.`);
                }
              }

              const result = await query(args);

              // Para consultas únicas, verificamos que el resultado corresponda al negocio actual
              if (["findUnique", "findUniqueOrThrow"].includes(operation)) {
                if (result && (result as any).tenantId !== tenantId) {
                  throw new Error(`Acceso denegado: Intento de lectura ajena en ${model}.`);
                }
              }

              return result;
            }
          }
          
          return query(args);
        },
      },
    },
  });
};
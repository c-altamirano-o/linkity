import "dotenv/config";
import {
  PrismaClient, ProductType, CategoryType,
  RepairStatus, Priority, PaymentMethod,
  SaleStatus, MovementType, CashSessionStatus,
  MixedPaymentMethod, PaymentScheme, CommissionBase,
  PaymentFrequency, StaffPaymentStatus, PurchaseStatus,
  InvoiceStatus,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Usamos DIRECT_URL (conexión directa, sin pgbouncer) para el seed,
// igual que hace `prisma db push`, para evitar problemas del pooler
// en modo transacción con las transacciones/queries del seed.
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Iniciando seed de Cell Express...\n");

  const supabaseUserId = process.env.SUPABASE_USER_ID!;

  // ── 1. TENANT ──────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where:  { slug: "cell-express" },
    update: {},
    create: {
      name: "Cell Express", slug: "cell-express",
      phone: "614 100 2030", email: "admin@cellexpress.mx",
      address: "Av. Juárez 1500, Centro",
      city: "Chihuahua", state: "Chihuahua", isActive: true,
    },
  });
  console.log("✅ Tenant:", tenant.name);

  // ── 2. SUCURSALES ───────────────────────────────────────
  const branchPrincipal = await prisma.branch.upsert({
    where: { id: "branch-principal" }, update: {},
    create: { id: "branch-principal", tenantId: tenant.id, name: "Sucursal Principal", address: "Av. Juárez 1500", phone: "614 100 2030", isActive: true },
  });
  const branchNorte = await prisma.branch.upsert({
    where: { id: "branch-norte" }, update: {},
    create: { id: "branch-norte", tenantId: tenant.id, name: "Sucursal Norte", address: "Blvd. Ortiz Mena 2400", phone: "614 200 3040", isActive: true },
  });
  const branchPlaza = await prisma.branch.upsert({
    where: { id: "branch-plaza" }, update: {},
    create: { id: "branch-plaza", tenantId: tenant.id, name: "Sucursal Plaza", address: "Plaza Mayor Local 45", phone: "614 300 4050", isActive: true },
  });
  console.log("✅ Sucursales: 3");

  // ── 3. USUARIO ──────────────────────────────────────────
  const user = await prisma.user.upsert({
    where:  { supabaseId: supabaseUserId },
    update: {},
    create: {
      tenantId: tenant.id, branchId: branchPrincipal.id,
      email: "admin@linkity.mx", name: "Juan Pérez",
      supabaseId: supabaseUserId, isActive: true,
    },
  });
  console.log("✅ Usuario:", user.name);

  // ── 4. ROL ──────────────────────────────────────────────
  const adminRole = await prisma.role.upsert({
    where:  { tenantId_name: { tenantId: tenant.id, name: "Administrador" } },
    update: {},
    create: { tenantId: tenant.id, name: "Administrador", description: "Acceso completo", isSystem: true },
  });
  await prisma.userRole.upsert({
    where: { userId: user.id }, update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });
  console.log("✅ Rol: Administrador");

  // ── 5. CATEGORÍAS ───────────────────────────────────────
  const cats = await Promise.all([
    prisma.category.upsert({ where:{ id:"cat-celulares"    }, update:{}, create:{ id:"cat-celulares",    tenantId:tenant.id, name:"Celulares",    type:CategoryType.PRODUCT,  color:"#4F46E5" } }),
    prisma.category.upsert({ where:{ id:"cat-accesorios"   }, update:{}, create:{ id:"cat-accesorios",   tenantId:tenant.id, name:"Accesorios",   type:CategoryType.PRODUCT,  color:"#06B6D4" } }),
    prisma.category.upsert({ where:{ id:"cat-tablets"      }, update:{}, create:{ id:"cat-tablets",      tenantId:tenant.id, name:"Tablets",      type:CategoryType.PRODUCT,  color:"#8B5CF6" } }),
    prisma.category.upsert({ where:{ id:"cat-pantallas"    }, update:{}, create:{ id:"cat-pantallas",    tenantId:tenant.id, name:"Pantallas",    type:CategoryType.PART,     color:"#F97316" } }),
    prisma.category.upsert({ where:{ id:"cat-baterias"     }, update:{}, create:{ id:"cat-baterias",     tenantId:tenant.id, name:"Baterías",     type:CategoryType.PART,     color:"#F59E0B" } }),
    prisma.category.upsert({ where:{ id:"cat-conectores"   }, update:{}, create:{ id:"cat-conectores",   tenantId:tenant.id, name:"Conectores",   type:CategoryType.PART,     color:"#14B8A6" } }),
    prisma.category.upsert({ where:{ id:"cat-reparaciones" }, update:{}, create:{ id:"cat-reparaciones", tenantId:tenant.id, name:"Reparaciones", type:CategoryType.SERVICE,  color:"#10B981" } }),
    prisma.category.upsert({ where:{ id:"cat-diagnosticos" }, update:{}, create:{ id:"cat-diagnosticos", tenantId:tenant.id, name:"Diagnósticos", type:CategoryType.SERVICE,  color:"#EC4899" } }),
  ]);
  console.log("✅ Categorías: 8");

  // ── 6. PRODUCTOS ────────────────────────────────────────
  const productsData = [
    { id:"prod-ip14",     catIdx:0, name:"iPhone 14 128GB Negro",      sku:"APL-IP14-128-BK", type:ProductType.PRODUCT, price:12500, cost:10000, emoji:"📱" },
    { id:"prod-s23",      catIdx:0, name:"Samsung Galaxy S23",          sku:"SAM-S23-256-WH",  type:ProductType.PRODUCT, price:10800, cost:8500,  emoji:"📱" },
    { id:"prod-ip13p",    catIdx:0, name:"iPhone 13 Pro 256GB",         sku:"APL-IP13P-256",   type:ProductType.PRODUCT, price:14200, cost:11500, emoji:"📱" },
    { id:"prod-xia",      catIdx:0, name:"Xiaomi Redmi Note 12",        sku:"XIA-RN12-128",    type:ProductType.PRODUCT, price:3800,  cost:2900,  emoji:"📱" },
    { id:"prod-app2",     catIdx:1, name:"AirPods Pro 2da Gen",         sku:"APL-APP2-WH",     type:ProductType.PRODUCT, price:4200,  cost:3200,  emoji:"🎧" },
    { id:"prod-chg",      catIdx:1, name:"Cargador USB-C 20W",          sku:"ACC-CHG-20W",     type:ProductType.PRODUCT, price:280,   cost:150,   emoji:"🔌" },
    { id:"prod-case",     catIdx:1, name:"Funda iPhone 14 MagSafe",     sku:"ACC-CASE-IP14",   type:ProductType.PRODUCT, price:350,   cost:180,   emoji:"📱" },
    { id:"prod-cable",    catIdx:1, name:"Cable Lightning 2m",          sku:"ACC-LTG-2M",      type:ProductType.PRODUCT, price:180,   cost:80,    emoji:"🔌" },
    { id:"prod-scr-ip13", catIdx:3, name:"Pantalla iPhone 13 Original", sku:"REF-SCR-IP13",    type:ProductType.PART,    price:1800,  cost:1200,  emoji:"🖥️" },
    { id:"prod-bat-ip12", catIdx:4, name:"Batería iPhone 12",           sku:"REF-BAT-IP12",    type:ProductType.PART,    price:450,   cost:280,   emoji:"🔋" },
    { id:"prod-bat-s22",  catIdx:4, name:"Batería Samsung S22",         sku:"REF-BAT-S22",     type:ProductType.PART,    price:380,   cost:220,   emoji:"🔋" },
    { id:"prod-con",      catIdx:5, name:"Conector carga iPhone",       sku:"REF-CON-IPHG",    type:ProductType.PART,    price:320,   cost:180,   emoji:"🔌" },
    { id:"prod-srv-scr",  catIdx:6, name:"Cambio de pantalla",          sku:"SRV-SCR-001",     type:ProductType.SERVICE, price:800,   cost:0,     emoji:"🔧" },
    { id:"prod-srv-bat",  catIdx:6, name:"Cambio de batería",           sku:"SRV-BAT-001",     type:ProductType.SERVICE, price:350,   cost:0,     emoji:"🔧" },
    { id:"prod-srv-diag", catIdx:7, name:"Diagnóstico general",         sku:"SRV-DIAG-001",    type:ProductType.SERVICE, price:150,   cost:0,     emoji:"🔍" },
  ];
  for (const p of productsData) {
    await prisma.product.upsert({
      where: { id: p.id }, update: {},
      create: {
        id: p.id, tenantId: tenant.id, categoryId: cats[p.catIdx].id,
        name: p.name, sku: p.sku, type: p.type,
        price: p.price, cost: p.cost > 0 ? p.cost : null,
        emoji: p.emoji, isActive: true,
      },
    });
  }
  console.log("✅ Productos:", productsData.length);

  // ── 7. INVENTARIO ───────────────────────────────────────
  const invData = [
    { pid:"prod-ip14",    stock:3,  min:2 },
    { pid:"prod-s23",     stock:5,  min:2 },
    { pid:"prod-ip13p",   stock:1,  min:3 },
    { pid:"prod-xia",     stock:0,  min:2 },
    { pid:"prod-app2",    stock:8,  min:3 },
    { pid:"prod-chg",     stock:24, min:5 },
    { pid:"prod-case",    stock:12, min:4 },
    { pid:"prod-cable",   stock:30, min:5 },
    { pid:"prod-scr-ip13",stock:4,  min:2 },
    { pid:"prod-bat-ip12",stock:6,  min:3 },
    { pid:"prod-bat-s22", stock:0,  min:3 },
    { pid:"prod-con",     stock:2,  min:4 },
  ];
  for (const inv of invData) {
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId: inv.pid, branchId: branchPrincipal.id } },
      update: { stock: inv.stock, minStock: inv.min },
      create: { productId: inv.pid, branchId: branchPrincipal.id, stock: inv.stock, minStock: inv.min },
    });
    await prisma.inventory.upsert({
      where: { productId_branchId: { productId: inv.pid, branchId: branchNorte.id } },
      update: {},
      create: { productId: inv.pid, branchId: branchNorte.id, stock: Math.floor(inv.stock * 0.6), minStock: inv.min },
    });
  }
  console.log("✅ Inventario configurado");

  // ── 8. CLIENTES ─────────────────────────────────────────
  const customersData = [
    { id:"cust-cm", name:"Carlos Mendoza",  phone:"614 123 4567" },
    { id:"cust-mg", name:"María González",  phone:"614 234 5678" },
    { id:"cust-rd", name:"Roberto Díaz",    phone:"614 345 6789" },
    { id:"cust-al", name:"Ana López",       phone:"614 456 7890" },
    { id:"cust-jp", name:"Jorge Pérez",     phone:"614 567 8901" },
    { id:"cust-ls", name:"Laura Soto",      phone:"614 678 9012" },
  ];
  for (const c of customersData) {
    await prisma.customer.upsert({
      where: { id: c.id }, update: {},
      create: { id: c.id, tenantId: tenant.id, name: c.name, phone: c.phone },
    });
  }
  console.log("✅ Clientes:", customersData.length);

  // ── 9. REPARACIONES ─────────────────────────────────────
  // Anotado explícitamente como RepairStatus (no el union literal que TS
  // infiere de los valores usados) para que la comparación de abajo
  // contra WORKSHOP_RETURN no truene con "no overlap" solo porque esta
  // muestra fija de datos no incluye ese estatus en particular.
  const repairsData: {
    id: string; folio: string; cid: string; brand: string; model: string;
    issue: string; status: RepairStatus; priority: Priority;
    est: number; final: number | null; partId: string | null; srvId: string | null;
  }[] = [
    { id:"rep-0042", folio:"REP-0042", cid:"cust-cm", brand:"Apple",   model:"iPhone 13 Pro", issue:"Pantalla rota",     status:RepairStatus.SHOP_READY,    priority:Priority.HIGH,   est:1800, final:1800, partId:"prod-scr-ip13", srvId:"prod-srv-scr" },
    { id:"rep-0041", folio:"REP-0041", cid:"cust-mg", brand:"Samsung", model:"S22",           issue:"No enciende",       status:RepairStatus.WORKSHOP_READY, priority:Priority.NORMAL, est:950,  final:950,  partId:"prod-bat-s22",  srvId:"prod-srv-bat" },
    { id:"rep-0040", folio:"REP-0040", cid:"cust-rd", brand:"Apple",   model:"iPhone 12",     issue:"Batería",           status:RepairStatus.SHOP_READY,    priority:Priority.NORMAL, est:650,  final:650,  partId:"prod-bat-ip12", srvId:"prod-srv-bat" },
    { id:"rep-0039", folio:"REP-0039", cid:"cust-al", brand:"Xiaomi",  model:"11T",           issue:"Conector de carga", status:RepairStatus.SHOP_RETURN,   priority:Priority.LOW,    est:0,    final:0,    partId:null,            srvId:null },
    { id:"rep-0038", folio:"REP-0038", cid:"cust-jp", brand:"Apple",   model:"iPhone 14",     issue:"Sin señal",         status:RepairStatus.IN_REPAIR,     priority:Priority.HIGH,   est:1200, final:null, partId:null, srvId:null },
  ];
  for (const r of repairsData) {
    const repair = await prisma.repair.upsert({
      where: { id: r.id }, update: {},
      create: {
        id: r.id, tenantId: tenant.id, branchId: branchPrincipal.id,
        customerId: r.cid, userId: user.id, folio: r.folio,
        deviceBrand: r.brand, deviceModel: r.model,
        issueDesc: r.issue, status: r.status, priority: r.priority,
        estimatedCost: r.est > 0 ? r.est : null,
        finalCost: r.final,
        deliveredAt: r.status === RepairStatus.SHOP_RETURN || r.status === RepairStatus.WORKSHOP_RETURN ? new Date() : null,
      },
    });

    if (r.partId) {
      await prisma.repairItem.upsert({
        where: { id: `${r.id}-part` }, update: {},
        create: { id: `${r.id}-part`, repairId: repair.id, productId: r.partId, quantity: 1, price: r.final ?? r.est },
      });
    }
    if (r.srvId) {
      await prisma.repairItem.upsert({
        where: { id: `${r.id}-srv` }, update: {},
        create: { id: `${r.id}-srv`, repairId: repair.id, productId: r.srvId, quantity: 1, price: 0 },
      });
    }

    await prisma.repairHistory.upsert({
      where: { id: `${r.id}-hist-received` }, update: {},
      create: { id: `${r.id}-hist-received`, repairId: repair.id, status: RepairStatus.RECEIVED, notes: "Equipo recibido" },
    });
    await prisma.repairHistory.upsert({
      where: { id: `${r.id}-hist-current` }, update: {},
      create: { id: `${r.id}-hist-current`, repairId: repair.id, status: r.status, notes: null },
    });
  }
  console.log("✅ Reparaciones:", repairsData.length);

  // ── 10. PERSONAL ────────────────────────────────────────
  const staffData = [
    { id:"staff-luis",   branchId: branchPrincipal.id, name:"Luis Ramírez",   position:"Técnico en jefe", phone:"614 111 2233", scheme:PaymentScheme.MIXTO,   base:6000, rate:5,  commBase:CommissionBase.REPARACIONES, freq:PaymentFrequency.QUINCENAL, clabe:"014027123456789012" },
    { id:"staff-vane",   branchId: branchPrincipal.id, name:"Vanessa Ortiz",  position:"Vendedora",       phone:"614 222 3344", scheme:PaymentScheme.MIXTO,   base:4500, rate:3,  commBase:CommissionBase.VENTAS,       freq:PaymentFrequency.QUINCENAL, clabe:"014027234567890123" },
    { id:"staff-hugo",   branchId: branchNorte.id,     name:"Hugo Delgado",   position:"Técnico",         phone:"614 333 4455", scheme:PaymentScheme.FIJO,    base:5500, rate:0,  commBase:CommissionBase.REPARACIONES, freq:PaymentFrequency.QUINCENAL, clabe:null },
    { id:"staff-diana",  branchId: branchPlaza.id,     name:"Diana Fuentes",  position:"Encargada",       phone:"614 444 5566", scheme:PaymentScheme.COMISION,base:0,    rate:8,  commBase:CommissionBase.UTILIDAD,     freq:PaymentFrequency.MENSUAL,   clabe:"014027345678901234" },
  ];
  for (const s of staffData) {
    await prisma.staff.upsert({
      where: { id: s.id }, update: {},
      create: {
        id: s.id, tenantId: tenant.id, branchId: s.branchId,
        name: s.name, phone: s.phone, position: s.position,
        paymentScheme: s.scheme, baseSalary: s.base,
        commissionRate: s.rate, commissionBase: s.commBase,
        paymentFrequency: s.freq, clabe: s.clabe, isActive: true,
      },
    });
  }
  console.log("✅ Personal:", staffData.length);

  await prisma.staffPayment.upsert({
    where: { id: "pay-luis-q1" }, update: {},
    create: {
      id: "pay-luis-q1", staffId: "staff-luis",
      periodStart: new Date("2026-08-16"), periodEnd: new Date("2026-08-31"),
      baseAmount: 3000, commissionAmount: 875, total: 3875,
      status: StaffPaymentStatus.PAID, paidAt: new Date("2026-09-01"),
    },
  });
  await prisma.staffPayment.upsert({
    where: { id: "pay-vane-q1" }, update: {},
    create: {
      id: "pay-vane-q1", staffId: "staff-vane",
      periodStart: new Date("2026-08-16"), periodEnd: new Date("2026-08-31"),
      baseAmount: 2250, commissionAmount: 540, total: 2790,
      status: StaffPaymentStatus.PENDING,
    },
  });
  console.log("✅ Pagos de nómina registrados");

  // ── 11. CAJA ────────────────────────────────────────────
  const cashSession = await prisma.cashSession.upsert({
    where: { id: "cash-principal-hoy" }, update: {},
    create: {
      id: "cash-principal-hoy", tenantId: tenant.id, branchId: branchPrincipal.id,
      userId: user.id, openingCash: 2000, status: CashSessionStatus.OPEN,
    },
  });
  await prisma.cashMovement.upsert({
    where: { id: "mov-1" }, update: {},
    create: { id: "mov-1", cashSessionId: cashSession.id, type: MovementType.INCOME, amount: 350, concept: "Venta mostrador" },
  });
  await prisma.cashMovement.upsert({
    where: { id: "mov-2" }, update: {},
    create: { id: "mov-2", cashSessionId: cashSession.id, type: MovementType.EXPENSE, amount: 180, concept: "Compra de insumos de limpieza" },
  });
  console.log("✅ Caja: sesión abierta con movimientos");

  // ── 12. VENTAS ──────────────────────────────────────────
  const sale1 = await prisma.sale.upsert({
    where: { tenantId_folio: { tenantId: tenant.id, folio: "V-1001" } }, update: {},
    create: {
      tenantId: tenant.id, branchId: branchPrincipal.id, customerId: "cust-cm", userId: user.id,
      folio: "V-1001", subtotal: 4200, tax: 672, discount: 0, total: 4872,
      paymentMethod: PaymentMethod.CARD, status: SaleStatus.COMPLETED,
    },
  });
  await prisma.saleItem.upsert({
    where: { id: "si-1001-1" }, update: {},
    create: { id: "si-1001-1", saleId: sale1.id, productId: "prod-app2", quantity: 1, price: 4200, subtotal: 4200 },
  });

  const sale2 = await prisma.sale.upsert({
    where: { tenantId_folio: { tenantId: tenant.id, folio: "V-1002" } }, update: {},
    create: {
      tenantId: tenant.id, branchId: branchPrincipal.id, customerId: "cust-mg", userId: user.id,
      folio: "V-1002", subtotal: 630, tax: 100.8, discount: 0, total: 730.8,
      paymentMethod: PaymentMethod.MIXED, status: SaleStatus.COMPLETED,
    },
  });
  await prisma.saleItem.upsert({
    where: { id: "si-1002-1" }, update: {},
    create: { id: "si-1002-1", saleId: sale2.id, productId: "prod-chg", quantity: 1, price: 280, subtotal: 280 },
  });
  await prisma.saleItem.upsert({
    where: { id: "si-1002-2" }, update: {},
    create: { id: "si-1002-2", saleId: sale2.id, productId: "prod-case", quantity: 1, price: 350, subtotal: 350 },
  });
  await prisma.saleMixedPayment.upsert({
    where: { id: "smp-1002-cash" }, update: {},
    create: { id: "smp-1002-cash", saleId: sale2.id, method: MixedPaymentMethod.CASH, amount: 400 },
  });
  await prisma.saleMixedPayment.upsert({
    where: { id: "smp-1002-card" }, update: {},
    create: { id: "smp-1002-card", saleId: sale2.id, method: MixedPaymentMethod.CARD, amount: 330.8 },
  });
  console.log("✅ Ventas: 2 (una con pago mixto)");

  // ── 13. FACTURACIÓN CFDI ────────────────────────────────
  await prisma.invoice.upsert({
    where: { tenantId_folio: { tenantId: tenant.id, folio: "F-0001" } }, update: {},
    create: {
      tenantId: tenant.id, customerId: "cust-cm", saleId: sale1.id,
      folio: "F-0001", status: InvoiceStatus.STAMPED, total: 4872,
    },
  });
  console.log("✅ Facturas CFDI: 1");

  // ── 14. PROVEEDORES Y COMPRAS ───────────────────────────
  const supplier = await prisma.supplier.upsert({
    where: { id: "sup-refaccionaria" }, update: {},
    create: {
      id: "sup-refaccionaria", tenantId: tenant.id, name: "Refaccionaria del Norte",
      phone: "614 900 1122", email: "ventas@refaccionaria.mx", isActive: true,
    },
  });
  const purchase = await prisma.purchase.upsert({
    where: { tenantId_folio: { tenantId: tenant.id, folio: "C-0001" } }, update: {},
    create: {
      tenantId: tenant.id, supplierId: supplier.id, folio: "C-0001",
      total: 6000, status: PurchaseStatus.RECEIVED,
    },
  });
  await prisma.purchaseItem.upsert({
    where: { id: "pi-0001-1" }, update: {},
    create: { id: "pi-0001-1", purchaseId: purchase.id, productId: "prod-scr-ip13", quantity: 5, cost: 1200, subtotal: 6000 },
  });
  console.log("✅ Proveedores y compras registrados");

  // ── 15. LABELS PERSONALIZADOS (ejemplo) ─────────────────
  // Cell Express es "reparacion_celulares", así que el default del rubro
  // ya le queda bien (ver lib/labels.ts). Aquí solo mostramos que un
  // tenant puede sobreescribir una key puntual sin tocar nada más.
  await prisma.tenantLabel.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: "module.staff.name" } },
    update: {},
    create: { tenantId: tenant.id, key: "module.staff.name", value: "Mi Equipo" },
  });
  console.log("✅ Labels personalizados: 1 (module.staff.name → \"Mi Equipo\")");

  console.log("\n🎉 Seed completado con éxito.");
}

main()
  .catch((e) => {
    console.error("❌ Error en el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

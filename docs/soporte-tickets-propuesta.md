# Propuesta: Soporte (tickets) en Panel Maestro

Estado: **sin aplicar**. Este documento describe el cambio que falta para que
`/maestro/soporte` deje de ser una pantalla-aviso y se vuelva una bandeja de
tickets real. No se tocó `prisma/schema.prisma` — un cambio de schema en
producción se revisa contigo antes de aplicarlo, no se hace sin supervisión.

## Por qué no existe todavía

Hoy no hay ningún modelo en la base de datos para tickets de soporte. Todo lo
demás que se construyó en Panel Maestro (Negocios, Usuarios, Módulos,
Suscripciones, Reportes) reutiliza tablas que ya existían (`Tenant`, `User`,
`Subscription`, etc.); Soporte es el único que necesita una tabla nueva.

## Modelo propuesto (para agregar a `schema.prisma`)

```prisma
model SupportTicket {
  id          String             @id @default(cuid())
  tenantId    String
  userId      String             // quién lo abrió (User del negocio)
  subject     String
  status      SupportTicketStatus @default(OPEN)
  priority    Priority           @default(NORMAL) // reutiliza el enum que ya existe (M9)
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  closedAt    DateTime?

  tenant   Tenant                @relation(fields: [tenantId], references: [id])
  user     User                  @relation(fields: [userId], references: [id])
  messages SupportTicketMessage[]
}

model SupportTicketMessage {
  id        String   @id @default(cuid())
  ticketId  String
  // Quién escribió el mensaje: o un User de negocio, o el SuperAdmin (Carlos).
  // Ambos son opcionales porque un mensaje viene de uno u otro, nunca de los dos.
  userId       String?
  superAdminId String?
  body      String
  createdAt DateTime @default(now())

  ticket     SupportTicket @relation(fields: [ticketId], references: [id])
  user       User?         @relation(fields: [userId], references: [id])
  superAdmin SuperAdmin?   @relation(fields: [superAdminId], references: [id])
}

enum SupportTicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}
```

También hay que agregar las relaciones inversas `supportTickets` /
`supportMessages` en `Tenant`, `User` y `SuperAdmin` (Prisma lo pide del lado
del modelo referenciado).

## Qué se construiría encima de eso

1. **Lado del negocio** (`app/(tenant)/[tenant]/soporte/`, nuevo): un formulario
   sencillo para abrir un ticket (asunto + mensaje) y ver el hilo de los suyos.
2. **Lado de Panel Maestro** (`/maestro/soporte`, ya tiene la pantalla-aviso
   lista para reemplazarse): bandeja con todos los tickets de todos los
   negocios, filtro por estado, y poder responder/cerrar cada uno.
3. Server Actions para crear ticket, responder, y cambiar status — mismo
   patrón `requireSuperAdmin()` / verificación de tenant que ya se usa en el
   resto de Panel Maestro.

## Cómo aplicarlo cuando estés listo

1. Agregar el bloque de arriba a `prisma/schema.prisma` (yo puedo redactarlo
   ya directamente en el archivo si me confirmas que sigue así).
2. Correr `npx prisma migrate dev --name add_support_tickets` (o el flujo que
   uses normalmente) para generar y aplicar la migración contra la base de
   producción, y regenerar el cliente de Prisma.
3. Recién ahí construyo las pantallas — antes de ese paso, cualquier código
   que use `prisma.supportTicket` no compilaría.

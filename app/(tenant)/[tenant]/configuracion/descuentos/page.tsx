import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { listarDescuentosAction, obtenerCatalogoParaDescuentosAction } from "@/app/actions/discounts";
import DescuentosClient from "./DescuentosClient";

export default async function DescuentosPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (!tenant) notFound();

  // Las dos acciones ya revalidan por su cuenta que quien pide esto tiene
  // acceso al módulo "configuracion" (resolverActor) — si no, DescuentosClient
  // recibe listas vacías y el mensaje de error se muestra ahí mismo, mismo
  // patrón que el resto de pantallas de este proyecto (la pantalla no truena,
  // solo no deja ver nada útil).
  const [descuentosResult, catalogoResult] = await Promise.all([
    listarDescuentosAction(tenantSlug),
    obtenerCatalogoParaDescuentosAction(tenantSlug),
  ]);

  return (
    <DescuentosClient
      tenantSlug={tenantSlug}
      descuentosIniciales={descuentosResult.ok ? descuentosResult.descuentos : []}
      errorInicial={!descuentosResult.ok ? descuentosResult.error : null}
      productos={catalogoResult.ok ? catalogoResult.productos : []}
      categorias={catalogoResult.ok ? catalogoResult.categorias : []}
      clientes={catalogoResult.ok ? catalogoResult.clientes : []}
    />
  );
}

import type { CatalogKind, Organization, Prisma, Product } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type ProductRecord = Product & { organization: Organization | null };

const productInclude = { organization: true } as const;

export async function findProductById(id: string): Promise<ProductRecord | null> {
  return prisma.product.findUnique({
    where: { id },
    include: productInclude,
  });
}

export async function findProductByOrganizationAndSku(
  organizationId: string,
  sku: string,
  excludeId?: string,
): Promise<ProductRecord | null> {
  return prisma.product.findFirst({
    where: {
      organizationId,
      sku,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: productInclude,
  });
}

export async function listProducts(query: {
  search?: string;
  isActive?: boolean;
  kind?: CatalogKind;
  organizationId?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: ProductRecord[]; total: number }> {
  const where: Prisma.ProductWhereInput = {
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { description: { contains: query.search, mode: "insensitive" } },
            { sku: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { items, total };
}

export async function createProduct(data: {
  organizationId: string;
  kind: CatalogKind;
  name: string;
  description?: string | null;
  sku?: string | null;
  unit?: string | null;
  unitPrice: number;
  currency?: string;
  taxRate?: number | null;
  isActive?: boolean;
}): Promise<ProductRecord> {
  return prisma.product.create({
    data: {
      organizationId: data.organizationId,
      kind: data.kind,
      name: data.name,
      description: data.description ?? null,
      sku: data.sku ?? null,
      unit: data.unit ?? null,
      unitPrice: data.unitPrice,
      currency: data.currency ?? "USD",
      taxRate: data.taxRate ?? null,
      isActive: data.isActive ?? true,
    },
    include: productInclude,
  });
}

export async function updateProduct(
  id: string,
  data: {
    kind?: CatalogKind;
    name?: string;
    description?: string | null;
    sku?: string | null;
    unit?: string | null;
    unitPrice?: number;
    currency?: string;
    taxRate?: number | null;
    isActive?: boolean;
  },
): Promise<ProductRecord> {
  return prisma.product.update({
    where: { id },
    data,
    include: productInclude,
  });
}

export async function deleteProduct(id: string): Promise<void> {
  await prisma.product.delete({ where: { id } });
}

export async function countProductDocuments(id: string): Promise<number> {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      _count: { select: { invoiceItems: true, quoteItems: true } },
    },
  });
  if (!product) {
    return 0;
  }
  return product._count.invoiceItems + product._count.quoteItems;
}

import type { CatalogKind } from "@prisma/client";
import { Permissions } from "../config/permissions.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors.js";
import { toProductView } from "../lib/product-view.js";
import { findOrganizationById } from "../repositories/organization.repository.js";
import {
  countProductDocuments,
  createProduct,
  deleteProduct,
  findProductById,
  findProductByOrganizationAndSku,
  listProducts,
  updateProduct,
} from "../repositories/product.repository.js";
import type { AuthUser, ProductView } from "../types/auth.js";
import {
  assertOrganizationAccess,
  resolveManagedOrganizationId,
  scopedTenantOrganizationId,
} from "../utils/organization-scope.js";
import { recordAudit } from "./audit.service.js";

function canManageProducts(actor: AuthUser): boolean {
  return (
    actor.permissions.includes(Permissions.PRODUCTS_CREATE) ||
    actor.permissions.includes(Permissions.PRODUCTS_UPDATE)
  );
}

export async function listProductAccounts(
  actor: AuthUser,
  query: {
    search?: string;
    status?: "ACTIVE" | "INACTIVE";
    kind?: CatalogKind;
    organizationId?: string;
    page: number;
    pageSize: number;
  },
): Promise<{ items: ProductView[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const organizationId = await scopedTenantOrganizationId(actor, query.organizationId);
  const { items, total } = await listProducts({
    search: query.search,
    isActive: query.status === undefined ? undefined : query.status === "ACTIVE",
    kind: query.kind,
    organizationId,
    page: query.page,
    pageSize: query.pageSize,
  });

  return {
    items: items.map(toProductView),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getProductAccount(actor: AuthUser, id: string): Promise<ProductView> {
  const product = await findProductById(id);
  if (!product) {
    throw new NotFoundError("Product not found");
  }
  assertOrganizationAccess(actor, product.organizationId);
  return toProductView(product);
}

export async function createProductAccount(
  actor: AuthUser,
  input: {
    name: string;
    kind: CatalogKind;
    description?: string;
    sku?: string;
    unit?: string;
    unitPrice: number;
    currency?: string;
    taxRate?: number;
    organizationId?: string;
    isActive?: boolean;
  },
): Promise<ProductView> {
  if (!canManageProducts(actor)) {
    throw new ForbiddenError("You cannot create products");
  }

  const organizationId = await resolveManagedOrganizationId(actor, input.organizationId);
  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

  if (input.sku) {
    const duplicate = await findProductByOrganizationAndSku(organizationId, input.sku);
    if (duplicate) {
      throw new ConflictError("A catalog item with this SKU already exists in the organization");
    }
  }

  const product = await createProduct({
    organizationId,
    kind: input.kind,
    name: input.name,
    description: input.description,
    sku: input.sku,
    unit: input.unit,
    unitPrice: input.unitPrice,
    currency: input.currency,
    taxRate: input.taxRate,
    isActive: input.isActive,
  });

  await recordAudit({
    actorId: actor.id,
    action: "PRODUCT_CREATED",
    entity: "Product",
    entityId: product.id,
    organizationId,
    metadata: { name: product.name, kind: product.kind },
  });

  return toProductView(product);
}

export async function updateProductAccount(
  actor: AuthUser,
  id: string,
  input: {
    name?: string;
    kind?: CatalogKind;
    description?: string | null;
    sku?: string | null;
    unit?: string | null;
    unitPrice?: number;
    currency?: string;
    taxRate?: number | null;
    isActive?: boolean;
  },
): Promise<ProductView> {
  if (!canManageProducts(actor)) {
    throw new ForbiddenError("You cannot update products");
  }

  const product = await findProductById(id);
  if (!product) {
    throw new NotFoundError("Product not found");
  }
  assertOrganizationAccess(actor, product.organizationId);

  if (input.sku) {
    const duplicate = await findProductByOrganizationAndSku(
      product.organizationId,
      input.sku,
      product.id,
    );
    if (duplicate) {
      throw new ConflictError("A catalog item with this SKU already exists in the organization");
    }
  }

  const updated = await updateProduct(product.id, input);

  await recordAudit({
    actorId: actor.id,
    action: "PRODUCT_UPDATED",
    entity: "Product",
    entityId: updated.id,
    organizationId: updated.organizationId,
    metadata: { name: updated.name, kind: updated.kind },
  });

  return toProductView(updated);
}

export async function deleteProductAccount(actor: AuthUser, id: string): Promise<void> {
  if (!canManageProducts(actor)) {
    throw new ForbiddenError("You cannot delete products");
  }

  const product = await findProductById(id);
  if (!product) {
    throw new NotFoundError("Product not found");
  }
  assertOrganizationAccess(actor, product.organizationId);

  const documents = await countProductDocuments(product.id);
  if (documents > 0) {
    throw new ConflictError("Catalog item cannot be deleted because it is used on invoices or quotes");
  }

  await deleteProduct(product.id);

  await recordAudit({
    actorId: actor.id,
    action: "PRODUCT_DELETED",
    entity: "Product",
    entityId: product.id,
    organizationId: product.organizationId,
    metadata: { name: product.name, kind: product.kind },
  });
}

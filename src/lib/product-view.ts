import type { Organization, Product } from "@prisma/client";
import type { OrganizationSummary, ProductView } from "../types/auth.js";
import { toMoneyNumber } from "./money.js";

function toOrganizationSummary(organization: Organization | null): OrganizationSummary | null {
  if (!organization) {
    return null;
  }
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    isActive: organization.isActive,
  };
}

export function toProductView(
  product: Product & { organization: Organization | null },
): ProductView {
  return {
    id: product.id,
    organizationId: product.organizationId,
    kind: product.kind,
    name: product.name,
    description: product.description,
    sku: product.sku,
    unit: product.unit,
    unitPrice: toMoneyNumber(product.unitPrice) ?? 0,
    currency: product.currency,
    taxRate: toMoneyNumber(product.taxRate),
    isActive: product.isActive,
    organization: toOrganizationSummary(product.organization),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

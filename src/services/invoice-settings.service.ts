import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors.js";
import {
  getOrganizationSettingsMap,
  upsertOrganizationSettings,
} from "../repositories/organization-setting.repository.js";
import {
  findOrganizationById,
  getDefaultOrganizationId,
} from "../repositories/organization.repository.js";
import type { AuthUser } from "../types/auth.js";
import { assertOrganizationAccess } from "../utils/organization-scope.js";
import { getOrganizationLogoUrl } from "./organization-logo.service.js";
import { recordAudit } from "./audit.service.js";

const KEYS = {
  companyName: "invoice.companyName",
  currency: "invoice.currency",
  language: "invoice.language",
  addressLine1: "invoice.address.line1",
  addressLine2: "invoice.address.line2",
  addressCity: "invoice.address.city",
  addressRegion: "invoice.address.region",
  addressPostalCode: "invoice.address.postalCode",
  addressCountry: "invoice.address.country",
  unpaidSubject: "email.template.unpaid.subject",
  unpaidBody: "email.template.unpaid.body",
  paidSubject: "email.template.paid.subject",
  paidBody: "email.template.paid.body",
} as const;

export type InvoiceAddressSettings = {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type InvoiceSettingsView = {
  organizationId: string;
  organizationName: string;
  companyName: string;
  logoUrl: string | null;
  hasLogo: boolean;
  currency: string;
  language: string;
  address: InvoiceAddressSettings;
};

export type EmailTemplateSettingsView = {
  unpaid: { subject: string; body: string };
  paid: { subject: string; body: string };
};

async function resolveSettingsOrganizationId(actor: AuthUser): Promise<string> {
  if (actor.role !== "SUPER_ADMIN" && actor.role !== "ADMIN") {
    throw new ForbiddenError("You cannot manage invoice settings");
  }

  let id = actor.organizationId;
  if (!id && actor.role === "SUPER_ADMIN") {
    id = await getDefaultOrganizationId();
  }
  if (!id) {
    throw new ValidationError("No organization is available for settings");
  }
  assertOrganizationAccess(actor, id);
  const organization = await findOrganizationById(id);
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }
  return organization.id;
}

export async function getInvoiceSettings(actor: AuthUser): Promise<InvoiceSettingsView> {
  const organizationId = await resolveSettingsOrganizationId(actor);
  const organization = await findOrganizationById(organizationId);
  if (!organization) {
    throw new NotFoundError("Organization not found");
  }

  const map = await getOrganizationSettingsMap(organizationId, [
    KEYS.companyName,
    KEYS.currency,
    KEYS.language,
    KEYS.addressLine1,
    KEYS.addressLine2,
    KEYS.addressCity,
    KEYS.addressRegion,
    KEYS.addressPostalCode,
    KEYS.addressCountry,
  ]);

  const logoUrl = await getOrganizationLogoUrl(organizationId, { expiresInSeconds: 60 * 30 });

  return {
    organizationId,
    organizationName: organization.name,
    companyName: map[KEYS.companyName] ?? organization.name,
    logoUrl,
    hasLogo: Boolean(organization.logoObjectKey),
    currency: map[KEYS.currency] ?? "USD",
    language: map[KEYS.language] ?? "en",
    address: {
      line1: map[KEYS.addressLine1] ?? "",
      line2: map[KEYS.addressLine2] ?? "",
      city: map[KEYS.addressCity] ?? "",
      region: map[KEYS.addressRegion] ?? "",
      postalCode: map[KEYS.addressPostalCode] ?? "",
      country: map[KEYS.addressCountry] ?? "",
    },
  };
}

export async function updateInvoiceSettings(
  actor: AuthUser,
  input: {
    companyName?: string;
    currency: string;
    language: string;
    address: InvoiceAddressSettings;
  },
): Promise<InvoiceSettingsView> {
  const organizationId = await resolveSettingsOrganizationId(actor);
  const canSetCompanyName = actor.role === "SUPER_ADMIN";

  await upsertOrganizationSettings(organizationId, {
    ...(canSetCompanyName && input.companyName
      ? { [KEYS.companyName]: input.companyName.trim() }
      : {}),
    [KEYS.currency]: input.currency.trim().toUpperCase(),
    [KEYS.language]: input.language.trim().toLowerCase(),
    [KEYS.addressLine1]: input.address.line1.trim(),
    [KEYS.addressLine2]: input.address.line2.trim(),
    [KEYS.addressCity]: input.address.city.trim(),
    [KEYS.addressRegion]: input.address.region.trim(),
    [KEYS.addressPostalCode]: input.address.postalCode.trim(),
    [KEYS.addressCountry]: input.address.country.trim(),
  });

  await recordAudit({
    actorId: actor.id,
    action: "INVOICE_SETTINGS_UPDATED",
    entity: "Organization",
    entityId: organizationId,
    organizationId,
    metadata: {
      currency: input.currency,
      language: input.language,
      ...(canSetCompanyName && input.companyName ? { companyName: input.companyName.trim() } : {}),
    },
  });

  return getInvoiceSettings(actor);
}

export async function getInvoiceCompanyName(organizationId: string): Promise<string | null> {
  const map = await getOrganizationSettingsMap(organizationId, [KEYS.companyName]);
  const name = map[KEYS.companyName]?.trim();
  return name ? name : null;
}

export async function getEmailTemplateSettings(
  actor: AuthUser,
): Promise<EmailTemplateSettingsView> {
  const organizationId = await resolveSettingsOrganizationId(actor);
  const map = await getOrganizationSettingsMap(organizationId, [
    KEYS.unpaidSubject,
    KEYS.unpaidBody,
    KEYS.paidSubject,
    KEYS.paidBody,
  ]);

  return {
    unpaid: {
      subject: map[KEYS.unpaidSubject] ?? "Invoice {{invoiceNumber}} from {{companyName}}",
      body:
        map[KEYS.unpaidBody] ??
        "Hello {{customerName}},\n\nYour invoice {{invoiceNumber}} for {{total}} is currently unpaid.\n\nDue date: {{dueDate}}\n\n[Pay Invoice]\n\nThank you,\n{{companyName}}",
    },
    paid: {
      subject: map[KEYS.paidSubject] ?? "Payment received for invoice {{invoiceNumber}}",
      body:
        map[KEYS.paidBody] ??
        "Hello {{customerName}},\n\nWe have received your payment of {{total}} for invoice {{invoiceNumber}}.\n\nPayment date: {{paymentDate}}\n\nYour payment has been successfully recorded.\n\n[View Invoice]\n\nThank you,\n{{companyName}}",
    },
  };
}

export async function updateEmailTemplateSettings(
  actor: AuthUser,
  input: EmailTemplateSettingsView,
): Promise<EmailTemplateSettingsView> {
  const organizationId = await resolveSettingsOrganizationId(actor);

  await upsertOrganizationSettings(organizationId, {
    [KEYS.unpaidSubject]: input.unpaid.subject.trim(),
    [KEYS.unpaidBody]: input.unpaid.body.trim(),
    [KEYS.paidSubject]: input.paid.subject.trim(),
    [KEYS.paidBody]: input.paid.body.trim(),
  });

  await recordAudit({
    actorId: actor.id,
    action: "EMAIL_TEMPLATES_UPDATED",
    entity: "Organization",
    entityId: organizationId,
    organizationId,
  });

  return getEmailTemplateSettings(actor);
}

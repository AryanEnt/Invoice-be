import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/user.repository.js", () => ({
  findUserById: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("../src/repositories/organization.repository.js", () => ({
  findOrganizationById: vi.fn(),
  getDefaultOrganizationId: vi.fn(),
}));

vi.mock("../src/services/invoice-settings.service.js", () => ({
  getInvoiceCompanyName: vi.fn(),
}));

vi.mock("../src/integrations/storage/r2.client.js", () => ({
  isR2Configured: vi.fn(() => false),
}));

vi.mock("../src/integrations/storage/r2.service.js", () => ({
  assertLogoUploadMeta: vi.fn(),
  buildAdminBrandingLogoKey: vi.fn(),
  createPresignedDownloadUrl: vi.fn(),
  deleteObject: vi.fn(),
  getObject: vi.fn(),
  isAdminBrandingLogoKey: vi.fn(),
  uploadObject: vi.fn(),
}));

vi.mock("../src/services/audit.service.js", () => ({
  recordAudit: vi.fn(),
}));

import { getEffectiveBranding } from "../src/services/branding.service.js";
import { findUserById } from "../src/repositories/user.repository.js";
import {
  findOrganizationById,
  getDefaultOrganizationId,
} from "../src/repositories/organization.repository.js";
import { getInvoiceCompanyName } from "../src/services/invoice-settings.service.js";

const findUserByIdMock = vi.mocked(findUserById);
const findOrganizationByIdMock = vi.mocked(findOrganizationById);
const getDefaultOrganizationIdMock = vi.mocked(getDefaultOrganizationId);
const getInvoiceCompanyNameMock = vi.mocked(getInvoiceCompanyName);

function user(partial: Record<string, unknown>) {
  return {
    id: "u1",
    email: "a@example.com",
    passwordHash: "x",
    firstName: "A",
    lastName: "B",
    phone: null,
    avatarObjectKey: null,
    role: "MEMBER",
    status: "ACTIVE",
    organizationId: "org1",
    administratorId: null,
    companyName: null,
    companyLogoObjectKey: null,
    lastLoginAt: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as Awaited<ReturnType<typeof findUserById>>;
}

describe("getEffectiveBranding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDefaultOrganizationIdMock.mockResolvedValue("org1");
    findOrganizationByIdMock.mockResolvedValue({
      id: "org1",
      name: "Platform Co",
      slug: "platform",
      logoObjectKey: "organizations/org1/logo/x.png",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    getInvoiceCompanyNameMock.mockResolvedValue("Platform Brand");
  });

  it("uses admin branding for members under that admin", async () => {
    findUserByIdMock.mockImplementation(async (id: string) => {
      if (id === "member1") {
        return user({ id: "member1", role: "MEMBER", administratorId: "admin1" });
      }
      if (id === "admin1") {
        return user({
          id: "admin1",
          role: "ADMIN",
          companyName: "Admin A Co",
          companyLogoObjectKey: "branding/admins/admin1/logo/a.webp",
        });
      }
      return null;
    });

    const branding = await getEffectiveBranding("member1");
    expect(branding.companyName).toBe("Admin A Co");
    expect(branding.logoObjectKey).toBe("branding/admins/admin1/logo/a.webp");
    expect(branding.source).toBe("admin");
    expect(branding.adminId).toBe("admin1");
  });

  it("falls back to platform branding when admin has none", async () => {
    findUserByIdMock.mockImplementation(async (id: string) => {
      if (id === "admin2") {
        return user({ id: "admin2", role: "ADMIN", companyName: null, companyLogoObjectKey: null });
      }
      return null;
    });

    const branding = await getEffectiveBranding("admin2");
    expect(branding.companyName).toBe("Platform Brand");
    expect(branding.logoObjectKey).toBe("organizations/org1/logo/x.png");
    expect(branding.source).toBe("platform");
  });

  it("uses platform branding for super admin", async () => {
    findUserByIdMock.mockResolvedValue(
      user({ id: "sa1", role: "SUPER_ADMIN", organizationId: "org1", administratorId: null }),
    );

    const branding = await getEffectiveBranding("sa1");
    expect(branding.companyName).toBe("Platform Brand");
    expect(branding.source).toBe("platform");
    expect(branding.adminId).toBeNull();
  });
});

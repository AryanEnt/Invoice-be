/**
 * Seed demo customers, invoices, and payments for sia@invoicehub.com (MEMBER).
 *
 * Usage:
 *   npx tsx scripts/seed-sia-demo-data.ts
 *
 * Safe to re-run: tagged records use notes/invoiceNumber prefixes and are replaced.
 */
import { randomUUID } from "node:crypto";
import {
  InvoiceEmailStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();

const MEMBER_EMAIL = "sia@invoicehub.com";
const TAG = "SEED_SIA_DEMO";
const CURRENCY = "NPR";

const FIRST_NAMES = [
  "Aarav", "Priya", "Niraj", "Sita", "Rohan", "Anisha", "Bikash", "Kriti",
  "Suman", "Manisha", "Pratik", "Sabina", "Dipesh", "Rachana", "Kiran",
  "Nisha", "Hari", "Puja", "Santosh", "Meena", "Ramesh", "Sunita", "Gopal",
  "Laxmi", "Binod", "Sarita", "Umesh", "Kabita", "Dinesh", "Ritu",
];

const LAST_NAMES = [
  "Sharma", "Thapa", "Gurung", "Rai", "Adhikari", "Karki", "Magar", "Shrestha",
  "Basnet", "Poudel", "Khadka", "Bhandari", "Tamang", "Lamichhane", "Joshi",
];

const COMPANIES = [
  "Himalaya Traders", "Kathmandu Soft", "Everest Logistics", "Pokhara Retail",
  "Lalitpur Design Co", "Biratnagar Supply", "Chitwan Agro", "Butwal Hardware",
  "Nepal Craft House", "Valley Tech", "Annapurna Foods", "Sagarmatha Media",
  "Bagmati Services", "Gandaki Outfitters", "Karnali Imports",
];

const SERVICES = [
  { description: "Website maintenance", unitPrice: 15000 },
  { description: "Consulting hours", unitPrice: 4500 },
  { description: "Graphic design package", unitPrice: 22000 },
  { description: "Cloud hosting (monthly)", unitPrice: 8000 },
  { description: "SEO optimization", unitPrice: 18000 },
  { description: "Software license", unitPrice: 35000 },
  { description: "Training workshop", unitPrice: 12000 },
  { description: "Support retainer", unitPrice: 25000 },
  { description: "Mobile app update", unitPrice: 40000 },
  { description: "Data migration", unitPrice: 28000 },
];

function money(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(4));
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function pick<T>(items: T[], index: number): T {
  return items[index % items.length]!;
}

function invoiceScenario(index: number): {
  status: InvoiceStatus;
  emailStatus: InvoiceEmailStatus;
  invoiceOffset: number;
  dueOffset: number;
  paidRatio: number;
  viewed: boolean;
} {
  const bucket = index % 10;
  if (bucket === 0) {
    return {
      status: "DRAFT",
      emailStatus: "NOT_SENT",
      invoiceOffset: 3 + (index % 5),
      dueOffset: 14,
      paidRatio: 0,
      viewed: false,
    };
  }
  if (bucket === 1 || bucket === 2) {
    return {
      status: "OVERDUE",
      emailStatus: "SENT",
      invoiceOffset: 40 + (index % 20),
      dueOffset: -10 - (index % 12),
      paidRatio: bucket === 2 ? 0.3 : 0,
      viewed: true,
    };
  }
  if (bucket === 3) {
    return {
      status: "PARTIALLY_PAID",
      emailStatus: "SENT",
      invoiceOffset: 20 + (index % 10),
      dueOffset: 5 + (index % 8),
      paidRatio: 0.45,
      viewed: true,
    };
  }
  if (bucket === 4 || bucket === 5 || bucket === 6) {
    return {
      status: "PAID",
      emailStatus: "SENT",
      invoiceOffset: 15 + (index % 45),
      dueOffset: -2 + (index % 5),
      paidRatio: 1,
      viewed: true,
    };
  }
  if (bucket === 7) {
    return {
      status: "VIEWED",
      emailStatus: "SENT",
      invoiceOffset: 8 + (index % 7),
      dueOffset: 10 + (index % 10),
      paidRatio: 0,
      viewed: true,
    };
  }
  return {
    status: "SENT",
    emailStatus: "SENT",
    invoiceOffset: 5 + (index % 12),
    dueOffset: 12 + (index % 15),
    paidRatio: 0,
    viewed: false,
  };
}

async function clearPreviousSeed(memberId: string, organizationId: string): Promise<void> {
  const seededInvoices = await prisma.invoice.findMany({
    where: {
      organizationId,
      OR: [
        { notes: { contains: TAG } },
        { invoiceNumber: { startsWith: "SIA-" } },
        { createdById: memberId, notes: { contains: TAG } },
      ],
    },
    select: { id: true },
  });
  const invoiceIds = seededInvoices.map((row) => row.id);

  if (invoiceIds.length > 0) {
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  }

  await prisma.customer.deleteMany({
    where: {
      organizationId,
      notes: { contains: TAG },
    },
  });

  await prisma.product.deleteMany({
    where: {
      organizationId,
      sku: { startsWith: "SIA-DEMO-" },
    },
  });
}

async function main(): Promise<void> {
  const member = await prisma.user.findUnique({
    where: { email: MEMBER_EMAIL },
    select: {
      id: true,
      email: true,
      role: true,
      organizationId: true,
      administratorId: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!member) {
    throw new Error(`User not found: ${MEMBER_EMAIL}`);
  }
  if (member.role !== "MEMBER") {
    throw new Error(`${MEMBER_EMAIL} is ${member.role}, expected MEMBER`);
  }
  if (!member.organizationId) {
    throw new Error(`${MEMBER_EMAIL} has no organizationId`);
  }
  if (!member.administratorId) {
    throw new Error(`${MEMBER_EMAIL} has no administratorId`);
  }

  const organizationId = member.organizationId;
  const administratorId = member.administratorId;

  console.log(`Seeding demo data for ${member.email} (${member.firstName} ${member.lastName})`);
  console.log(`Organization: ${organizationId}`);
  console.log(`Administrator: ${administratorId}`);

  await clearPreviousSeed(member.id, organizationId);
  console.log("Cleared previous SIA demo seed data");

  const products = [];
  for (let i = 0; i < SERVICES.length; i += 1) {
    const service = SERVICES[i]!;
    products.push(
      await prisma.product.create({
        data: {
          organizationId,
          kind: "SERVICE",
          name: service.description,
          description: `${TAG} catalog item`,
          sku: `SIA-DEMO-${String(i + 1).padStart(3, "0")}`,
          unit: "unit",
          unitPrice: money(service.unitPrice),
          currency: CURRENCY,
          isActive: true,
        },
      }),
    );
  }

  const customers = [];
  for (let i = 0; i < 28; i += 1) {
    const first = pick(FIRST_NAMES, i);
    const last = pick(LAST_NAMES, i * 3);
    const company = pick(COMPANIES, i);
    customers.push(
      await prisma.customer.create({
        data: {
          organizationId,
          administratorId,
          name: `${first} ${last}`,
          company,
          email: `${first.toLowerCase()}.${last.toLowerCase()}${i + 1}@demo-sia.test`,
          phone: `98${String(10000000 + i * 137).slice(0, 8)}`,
          notes: `${TAG} customer for member dashboard / invoice testing`,
          isActive: i % 11 !== 0,
        },
      }),
    );
  }

  const invoiceCount = 55;
  let paymentCount = 0;
  const methods: PaymentMethod[] = ["BANK_TRANSFER", "CASH", "CHECK", "OTHER"];

  for (let i = 0; i < invoiceCount; i += 1) {
    const scenario = invoiceScenario(i);
    const customer = pick(customers, i);
    const lineCount = 1 + (i % 3);
    const items = [];
    let subtotal = 0;

    for (let line = 0; line < lineCount; line += 1) {
      const catalog = pick(SERVICES, i + line);
      const quantity = 1 + ((i + line) % 3);
      const lineTotal = catalog.unitPrice * quantity;
      subtotal += lineTotal;
      items.push({
        description: catalog.description,
        quantity: money(quantity),
        unitPrice: money(catalog.unitPrice),
        discount: money(0),
        taxAmount: money(0),
        lineTotal: money(lineTotal),
        sortOrder: line,
        catalogKind: "SERVICE" as const,
        unit: "unit",
        sku: `SIA-DEMO-${String(((i + line) % SERVICES.length) + 1).padStart(3, "0")}`,
        productId: pick(products, i + line).id,
      });
    }

    const total = subtotal;
    const amountPaid = Math.round(total * scenario.paidRatio * 100) / 100;
    const invoiceDate = daysAgo(scenario.invoiceOffset);
    const dueDate =
      scenario.dueOffset >= 0 ? daysFromNow(scenario.dueOffset) : daysAgo(Math.abs(scenario.dueOffset));

    let status = scenario.status;
    if (scenario.paidRatio >= 1) {
      status = "PAID";
    } else if (scenario.paidRatio > 0) {
      status = dueDate < new Date() ? "OVERDUE" : "PARTIALLY_PAID";
    } else if (status !== "DRAFT" && dueDate < daysAgo(0) && status !== "CANCELLED") {
      status = "OVERDUE";
    }

    const sentAt =
      scenario.emailStatus === "SENT" ? daysAgo(Math.max(0, scenario.invoiceOffset - 1)) : null;
    const viewedAt = scenario.viewed
      ? daysAgo(Math.max(0, scenario.invoiceOffset - 2))
      : null;

    const invoice = await prisma.invoice.create({
      data: {
        organizationId,
        customerId: customer.id,
        createdById: member.id,
        assignedMemberId: member.id,
        invoiceNumber: `SIA-${String(1001 + i)}`,
        status,
        invoiceDate,
        dueDate,
        currency: CURRENCY,
        subtotal: money(subtotal),
        discountAmount: money(0),
        taxAmount: money(0),
        total: money(total),
        amountPaid: money(amountPaid),
        notes: `${TAG} demo invoice #${i + 1}`,
        terms: "Payment due within agreed terms.",
        emailStatus: scenario.emailStatus,
        emailSentAt: sentAt,
        sentAt,
        viewedAt,
        shareToken: randomUUID().replace(/-/g, ""),
        items: { create: items },
      },
    });

    if (amountPaid > 0) {
      const paymentDate = daysAgo(Math.max(0, scenario.invoiceOffset - 3));
      await prisma.payment.create({
        data: {
          organizationId,
          invoiceId: invoice.id,
          customerId: customer.id,
          recordedById: member.id,
          amount: money(amountPaid),
          currency: CURRENCY,
          method: pick(methods, i),
          provider: "MANUAL",
          status: "COMPLETED" satisfies PaymentStatus,
          paidAt: paymentDate,
          notes: `${TAG} payment`,
        },
      });
      paymentCount += 1;

      // Extra partial second payment for some invoices
      if (status === "PARTIALLY_PAID" && amountPaid < total) {
        const extra = Math.min(total - amountPaid, Math.round(total * 0.15 * 100) / 100);
        if (extra > 0) {
          await prisma.payment.create({
            data: {
              organizationId,
              invoiceId: invoice.id,
              customerId: customer.id,
              recordedById: member.id,
              amount: money(extra),
              currency: CURRENCY,
              method: pick(methods, i + 1),
              provider: "MANUAL",
              status: "COMPLETED",
              paidAt: daysAgo(Math.max(0, scenario.invoiceOffset - 1)),
              notes: `${TAG} partial follow-up`,
            },
          });
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { amountPaid: money(amountPaid + extra) },
          });
          paymentCount += 1;
        }
      }
    }
  }

  // Set a useful collection target on the admin (James) so admin forecast also has something when testing that office
  await prisma.organizationSetting.upsert({
    where: {
      organizationId_key: {
        organizationId,
        key: `dashboard.collectionTarget.${administratorId}`,
      },
    },
    create: {
      organizationId,
      key: `dashboard.collectionTarget.${administratorId}`,
      value: "500000.0000",
    },
    update: { value: "500000.0000" },
  });

  console.log("Seed complete:");
  console.log(`  Products/services: ${products.length}`);
  console.log(`  Customers:         ${customers.length}`);
  console.log(`  Invoices:          ${invoiceCount}`);
  console.log(`  Payments:          ${paymentCount}`);
  console.log(`  Currency:          ${CURRENCY}`);
  console.log(`Login as ${MEMBER_EMAIL} and open Dashboard / Invoices / Customers / Payments.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

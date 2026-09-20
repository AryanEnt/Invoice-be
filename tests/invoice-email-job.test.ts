import { describe, expect, it, vi } from "vitest";
import { processInvoiceEmailOutbox } from "../src/services/invoice-email-job.service.js";

const findOutboxEventById = vi.fn();
const markOutboxProcessing = vi.fn();
const markOutboxCompleted = vi.fn();
const markOutboxFailed = vi.fn();
const sendInvoiceEmail = vi.fn();
const findInvoiceById = vi.fn();
const updateInvoice = vi.fn();
const recordAudit = vi.fn();

vi.mock("../src/repositories/outbox.repository.js", () => ({
  findOutboxEventById: (...args: unknown[]) => findOutboxEventById(...args),
  markOutboxProcessing: (...args: unknown[]) => markOutboxProcessing(...args),
  markOutboxCompleted: (...args: unknown[]) => markOutboxCompleted(...args),
  markOutboxFailed: (...args: unknown[]) => markOutboxFailed(...args),
}));

vi.mock("../src/integrations/email/send-invoice-email.js", () => ({
  sendInvoiceEmail: (...args: unknown[]) => sendInvoiceEmail(...args),
}));

vi.mock("../src/repositories/invoice.repository.js", () => ({
  findInvoiceById: (...args: unknown[]) => findInvoiceById(...args),
  updateInvoice: (...args: unknown[]) => updateInvoice(...args),
}));

vi.mock("../src/services/audit.service.js", () => ({
  recordAudit: (...args: unknown[]) => recordAudit(...args),
}));

vi.mock("../src/lib/redis-lock.js", () => ({
  invoiceSendLockKey: (id: string) => `outinvoice:lock:invoice-send:${id}`,
  acquireLock: async () => ({ acquired: true, token: "lock-token" }),
  releaseLock: async () => undefined,
}));

vi.mock("../src/lib/invoice-view.js", () => ({
  toInvoiceView: (invoice: { id: string }) => invoice,
}));

describe("invoice email outbox worker", () => {
  it("skips already completed outbox rows", async () => {
    findOutboxEventById.mockResolvedValueOnce({
      id: "job-1",
      status: "COMPLETED",
      aggregateId: "inv-1",
      payload: { actorId: "user-1" },
    });
    await processInvoiceEmailOutbox("job-1");
    expect(sendInvoiceEmail).not.toHaveBeenCalled();
  });

  it("marks the outbox failed when email sending throws", async () => {
    findOutboxEventById.mockResolvedValueOnce({
      id: "job-2",
      status: "ENQUEUED",
      aggregateId: "inv-2",
      payload: { actorId: "user-1" },
      providerId: null,
    });
    findInvoiceById.mockResolvedValueOnce({
      id: "inv-2",
      status: "DRAFT",
      organizationId: "org-1",
      invoiceNumber: "INV-1",
      customer: { email: "a@example.com", name: "A" },
    });
    sendInvoiceEmail.mockRejectedValueOnce(new Error("Resend down"));
    updateInvoice.mockResolvedValue({});

    await expect(processInvoiceEmailOutbox("job-2")).rejects.toThrow("Resend down");
    expect(markOutboxFailed).toHaveBeenCalled();
    expect(markOutboxCompleted).not.toHaveBeenCalled();
  });
});

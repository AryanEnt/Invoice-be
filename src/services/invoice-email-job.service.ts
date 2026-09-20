import { Prisma } from "@prisma/client";
import { sendInvoiceEmail } from "../integrations/email/send-invoice-email.js";
import { logger } from "../lib/logger.js";
import { acquireLock, invoiceSendLockKey, releaseLock } from "../lib/redis-lock.js";
import { requestLogFields } from "../lib/request-context.js";
import { toInvoiceView } from "../lib/invoice-view.js";
import { findInvoiceById, updateInvoice } from "../repositories/invoice.repository.js";
import {
  findOutboxEventById,
  markOutboxCompleted,
  markOutboxFailed,
  markOutboxProcessing,
} from "../repositories/outbox.repository.js";
import type { InvoiceView } from "../types/invoice.js";
import { recordAudit } from "./audit.service.js";

export async function deliverInvoiceEmail(input: {
  invoiceId: string;
  actorId: string;
  outboxId?: string;
}): Promise<InvoiceView> {
  const invoice = await findInvoiceById(input.invoiceId);
  if (!invoice) {
    throw new Error("Invoice not found");
  }

  try {
    const result = await sendInvoiceEmail(invoice);
    const issued = invoice.status === "DRAFT";
    const updated = await updateInvoice(invoice.id, {
      emailStatus: "SENT",
      emailSentAt: new Date(),
      emailLastError: null,
      ...(issued
        ? {
            status: "SENT" as const,
            sentAt: new Date(),
          }
        : {}),
    });

    await recordAudit({
      actorId: input.actorId,
      action: "INVOICE_SENT",
      entity: "Invoice",
      entityId: updated.id,
      organizationId: updated.organizationId,
      metadata: {
        invoiceNumber: updated.invoiceNumber,
        channel: "email",
        outboxId: input.outboxId ?? null,
        providerId: result.id ?? null,
      },
    });

    return toInvoiceView(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email failed";
    await updateInvoice(invoice.id, {
      emailStatus: "FAILED",
      emailLastError: message.slice(0, 500),
    });
    throw error;
  }
}

export async function processInvoiceEmailOutbox(outboxId: string): Promise<void> {
  const outbox = await findOutboxEventById(outboxId);
  if (!outbox) {
    logger.warn("Invoice email outbox missing", requestLogFields({ outboxId }));
    return;
  }
  if (outbox.status === "COMPLETED") {
    logger.info(
      "Invoice email outbox already completed",
      requestLogFields({ outboxId, invoiceId: outbox.aggregateId }),
    );
    return;
  }

  const payload = (outbox.payload ?? {}) as { actorId?: string };
  const actorId = typeof payload.actorId === "string" ? payload.actorId : "system";
  const lock = await acquireLock(invoiceSendLockKey(outbox.aggregateId), 60);
  if (!lock.acquired && !lock.unavailable) {
    logger.info(
      "Invoice email job skipped; lock held",
      requestLogFields({
        outboxId,
        invoiceId: outbox.aggregateId,
      }),
    );
    throw new Error("Invoice send lock held");
  }

  try {
    await markOutboxProcessing(outbox.id);
    await deliverInvoiceEmail({
      invoiceId: outbox.aggregateId,
      actorId,
      outboxId: outbox.id,
    });
    await markOutboxCompleted(outbox.id, outbox.providerId);
    logger.info(
      "Invoice email delivered",
      requestLogFields({
        outboxId,
        invoiceId: outbox.aggregateId,
        jobId: outbox.id,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email failed";
    const retryAt = new Date(Date.now() + 30_000);
    await markOutboxFailed(outbox.id, message, retryAt);
    logger.error(
      "Invoice email job failed",
      requestLogFields({
        outboxId,
        invoiceId: outbox.aggregateId,
        message,
      }),
    );
    throw error;
  } finally {
    if (lock.acquired) {
      await releaseLock(invoiceSendLockKey(outbox.aggregateId), lock.token);
    }
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

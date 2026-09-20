import { Queue } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { createBullmqConnection } from "../lib/redis.js";

export const INVOICE_EMAIL_QUEUE = "outinvoice-invoice-email";

export type InvoiceEmailJobData = {
  outboxId: string;
  invoiceId: string;
  actorId: string;
};

let queue: Queue<InvoiceEmailJobData> | null | undefined;

export function getInvoiceEmailQueue(): Queue<InvoiceEmailJobData> | null {
  if (!env.REDIS_URL) {
    return null;
  }
  if (queue) {
    return queue;
  }
  const connection = createBullmqConnection();
  if (!connection) {
    return null;
  }
  queue = new Queue<InvoiceEmailJobData>(INVOICE_EMAIL_QUEUE, {
    connection,
    prefix: "outinvoice",
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 2000 },
    },
  });
  queue.on("error", (error) => {
    logger.warn("Invoice email queue error", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
  return queue;
}

export async function enqueueInvoiceEmailJob(data: InvoiceEmailJobData): Promise<boolean> {
  const q = getInvoiceEmailQueue();
  if (!q) {
    return false;
  }
  try {
    await q.add("send", data, {
      jobId: data.outboxId,
    });
    return true;
  } catch (error) {
    logger.warn("Failed to enqueue invoice email job", {
      outboxId: data.outboxId,
      invoiceId: data.invoiceId,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function closeInvoiceEmailQueue(): Promise<void> {
  if (!queue) {
    return;
  }
  await queue.close();
  queue = null;
}

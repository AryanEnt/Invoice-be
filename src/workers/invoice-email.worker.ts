import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { createBullmqConnection } from "../lib/redis.js";
import { INVOICE_EMAIL_QUEUE, enqueueInvoiceEmailJob, type InvoiceEmailJobData } from "../queues/invoice-email.queue.js";
import { listRecoverableOutboxEvents, markOutboxEnqueued } from "../repositories/outbox.repository.js";
import { processInvoiceEmailOutbox } from "../services/invoice-email-job.service.js";

export async function recoverPendingInvoiceEmailJobs(): Promise<number> {
  const pending = await listRecoverableOutboxEvents(200);
  let recovered = 0;
  for (const event of pending) {
    const payload = (event.payload ?? {}) as { actorId?: string };
    const ok = await enqueueInvoiceEmailJob({
      outboxId: event.id,
      invoiceId: event.aggregateId,
      actorId: typeof payload.actorId === "string" ? payload.actorId : "system",
    });
    if (ok) {
      await markOutboxEnqueued(event.id);
      recovered += 1;
    }
  }
  logger.info("Invoice email outbox recovery complete", {
    pending: pending.length,
    recovered,
  });
  return recovered;
}

export function startInvoiceEmailWorker(): Worker<InvoiceEmailJobData> | null {
  const connection = createBullmqConnection();
  if (!connection) {
    logger.error("Invoice email worker cannot start without REDIS_URL");
    return null;
  }

  const worker = new Worker<InvoiceEmailJobData>(
    INVOICE_EMAIL_QUEUE,
    async (job) => {
      logger.info("Invoice email job started", {
        jobId: job.id,
        outboxId: job.data.outboxId,
        invoiceId: job.data.invoiceId,
        attemptsMade: job.attemptsMade,
      });
      await processInvoiceEmailOutbox(job.data.outboxId);
    },
    {
      connection,
      prefix: "outinvoice",
      concurrency: env.WORKER_CONCURRENCY,
      limiter: { max: 10, duration: 60_000 },
    },
  );

  worker.on("failed", (job, error) => {
    logger.error("Invoice email job retry/failure", {
      jobId: job?.id,
      outboxId: job?.data.outboxId,
      invoiceId: job?.data.invoiceId,
      attemptsMade: job?.attemptsMade,
      message: error.message,
    });
  });

  worker.on("completed", (job) => {
    logger.info("Invoice email job completed", {
      jobId: job.id,
      outboxId: job.data.outboxId,
      invoiceId: job.data.invoiceId,
    });
  });

  return worker;
}

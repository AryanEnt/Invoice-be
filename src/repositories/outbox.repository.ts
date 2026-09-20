import type { OutboxStatus, OutboxType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function createOutboxEvent(data: {
  type: OutboxType;
  aggregateId: string;
  payload?: Prisma.InputJsonValue;
}): Promise<{ id: string; status: OutboxStatus; aggregateId: string }> {
  return prisma.outboxEvent.create({
    data: {
      type: data.type,
      aggregateId: data.aggregateId,
      payload: data.payload,
      status: "PENDING",
    },
    select: { id: true, status: true, aggregateId: true },
  });
}

export async function findActiveOutboxEvent(type: OutboxType, aggregateId: string) {
  return prisma.outboxEvent.findFirst({
    where: {
      type,
      aggregateId,
      status: { in: ["PENDING", "ENQUEUED", "PROCESSING"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function findOutboxEventById(id: string) {
  return prisma.outboxEvent.findUnique({ where: { id } });
}

export async function listRecoverableOutboxEvents(take = 100) {
  return prisma.outboxEvent.findMany({
    where: {
      status: { in: ["PENDING", "ENQUEUED"] },
      availableAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take,
  });
}

export async function markOutboxEnqueued(id: string): Promise<void> {
  await prisma.outboxEvent.update({
    where: { id },
    data: { status: "ENQUEUED" },
  });
}

export async function markOutboxProcessing(id: string): Promise<void> {
  await prisma.outboxEvent.update({
    where: { id },
    data: {
      status: "PROCESSING",
      lockedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
}

export async function markOutboxCompleted(id: string, providerId?: string | null): Promise<void> {
  await prisma.outboxEvent.update({
    where: { id },
    data: {
      status: "COMPLETED",
      processedAt: new Date(),
      lockedAt: null,
      lastError: null,
      providerId: providerId ?? undefined,
    },
  });
}

export async function markOutboxFailed(id: string, error: string, retryAt?: Date): Promise<void> {
  await prisma.outboxEvent.update({
    where: { id },
    data: {
      status: retryAt ? "PENDING" : "FAILED",
      lastError: error.slice(0, 500),
      availableAt: retryAt ?? new Date(),
      lockedAt: null,
    },
  });
}

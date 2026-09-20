import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export type RequestContext = {
  requestId: string;
  userId?: string;
  organizationId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function createRequestId(): string {
  return randomUUID();
}

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function requestLogFields(extra?: Record<string, unknown>): Record<string, unknown> {
  const context = getRequestContext();
  return {
    ...(context?.requestId ? { requestId: context.requestId } : {}),
    ...(context?.userId ? { userId: context.userId } : {}),
    ...(context?.organizationId ? { organizationId: context.organizationId } : {}),
    ...extra,
  };
}

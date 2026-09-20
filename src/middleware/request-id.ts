import type { NextFunction, Request, Response } from "express";
import { createRequestId, runWithRequestContext } from "../lib/request-context.js";

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const requestIdValue =
    typeof incoming === "string" && incoming.trim().length > 0 && incoming.length <= 128
      ? incoming.trim()
      : createRequestId();
  req.requestId = requestIdValue;
  res.setHeader("x-request-id", requestIdValue);
  runWithRequestContext({ requestId: requestIdValue }, () => {
    next();
  });
}

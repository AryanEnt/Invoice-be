import type { NextFunction, Request, Response } from "express";
import type { PermissionCode } from "../config/permissions.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

export function requirePermission(permission: PermissionCode) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      next(new UnauthorizedError());
      return;
    }

    if (!req.authUser.permissions.includes(permission)) {
      next(new ForbiddenError("You do not have permission to perform this action"));
      return;
    }

    next();
  };
}

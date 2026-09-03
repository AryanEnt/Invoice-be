import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError, ValidationError } from "../lib/errors.js";
import { readRouteParam } from "../utils/request-param.js";

interface OrganizationIdSource {
  param?: string;
}

export function requireOrganizationAccess(source: OrganizationIdSource = { param: "organizationId" }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      next(new UnauthorizedError());
      return;
    }

    const paramName = source.param ?? "organizationId";
    const organizationId = readRouteParam(req.params[paramName]);

    if (!organizationId) {
      next(new ValidationError("Organization id is required"));
      return;
    }

    if (req.authUser.role === "SUPER_ADMIN") {
      next();
      return;
    }

    if (!req.authUser.organizationId || req.authUser.organizationId !== organizationId) {
      next(new ForbiddenError("You do not have access to this organization"));
      return;
    }

    next();
  };
}

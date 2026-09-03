import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import {
  getCollectionTarget,
  getDashboardForecast,
  updateCollectionTarget,
} from "../services/dashboard-forecast.service.js";
import { getDashboard } from "../services/dashboard.service.js";
import { success } from "../utils/api-response.js";
import {
  dashboardForecastQuerySchema,
  dashboardQuerySchema,
  updateCollectionTargetSchema,
} from "../validators/dashboard.validators.js";
import { validate } from "../validators/validate.js";

export async function getDashboardController(req: Request, res: Response): Promise<void> {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  const query = validate(dashboardQuerySchema, req.query);
  const dashboard = await getDashboard(req.authUser, query);
  res.status(200).json(success({ dashboard }));
}

export async function getDashboardForecastController(req: Request, res: Response): Promise<void> {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  const query = validate(dashboardForecastQuerySchema, req.query);
  const forecast = await getDashboardForecast(req.authUser, query);
  res.status(200).json(success({ forecast }));
}

export async function getCollectionTargetController(req: Request, res: Response): Promise<void> {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  const target = await getCollectionTarget(req.authUser);
  res.status(200).json(success({ target }));
}

export async function updateCollectionTargetController(req: Request, res: Response): Promise<void> {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  const body = validate(updateCollectionTargetSchema, req.body);
  const target = await updateCollectionTarget(req.authUser, body.amount);
  res.status(200).json(success({ target }));
}

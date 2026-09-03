import type { Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors.js";
import { recordExpenseAccount } from "../services/expense.service.js";
import { success } from "../utils/api-response.js";
import { createExpenseSchema } from "../validators/expense.validators.js";
import { validate } from "../validators/validate.js";

export async function createExpenseController(req: Request, res: Response): Promise<void> {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  const body = validate(createExpenseSchema, req.body);
  const expense = await recordExpenseAccount(req.authUser, body);
  res.status(201).json(success({ expense }));
}

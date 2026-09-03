import type { Request, Response } from "express";
import { toCsv } from "../lib/csv.js";
import { UnauthorizedError } from "../lib/errors.js";
import { getReport } from "../services/report.service.js";
import { success } from "../utils/api-response.js";
import { reportKindParamSchema, reportQuerySchema } from "../validators/report.validators.js";
import { validate } from "../validators/validate.js";

function requireActor(req: Request) {
  if (!req.authUser) {
    throw new UnauthorizedError();
  }
  return req.authUser;
}

export async function getReportController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(reportKindParamSchema, req.params);
  const query = validate(reportQuerySchema, req.query);
  const report = await getReport(actor, { ...params, ...query });
  res.status(200).json(success({ report }));
}

export async function exportReportCsvController(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const params = validate(reportKindParamSchema, req.params);
  const query = validate(reportQuerySchema, req.query);
  const report = await getReport(actor, { ...params, ...query, csv: true, page: 1, pageSize: 25 });
  const csv = toCsv(report.table.columns, report.table.rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${report.kind}-${query.preset}.csv"`,
  );
  res.status(200).send(csv);
}

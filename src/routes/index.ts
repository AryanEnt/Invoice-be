import { Router } from "express";
import { adminRouter } from "./admin.routes.js";
import { authRouter } from "./auth.routes.js";
import { customerRouter } from "./customer.routes.js";
import { dashboardRouter } from "./dashboard.routes.js";
import { expenseRouter } from "./expense.routes.js";
import { healthRouter } from "./health.routes.js";
import { reportRouter } from "./report.routes.js";
import { invoiceRouter } from "./invoice.routes.js";
import { memberRouter } from "./member.routes.js";
import { paymentRouter } from "./payment.routes.js";
import { productRouter } from "./product.routes.js";
import { publicInvoiceRouter } from "./public-invoice.routes.js";
import { settingsRouter } from "./settings.routes.js";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/reports", reportRouter);
apiRouter.use("/expenses", expenseRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/admins", adminRouter);
apiRouter.use("/members", memberRouter);
apiRouter.use("/customers", customerRouter);
apiRouter.use("/public/invoices", publicInvoiceRouter);
apiRouter.use("/invoices", invoiceRouter);
apiRouter.use("/payments", paymentRouter);
apiRouter.use("/products", productRouter);
apiRouter.use("/settings", settingsRouter);

export { apiRouter };

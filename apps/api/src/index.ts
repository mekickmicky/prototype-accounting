import { Elysia } from "elysia";
import { authRoutes } from "./routes/auth";
import { accountRoutes } from "./routes/accounts";
import { journalEntryRoutes } from "./routes/journal-entries";
import { periodRoutes } from "./routes/periods";
import { reportRoutes } from "./routes/reports";
import { customerRoutes } from "./routes/customers";
import { salesInvoiceRoutes } from "./routes/sales-invoices";
import { receiptRoutes } from "./routes/receipts";
import { bankAccountRoutes } from "./routes/bank-accounts";
import { vendorRoutes } from "./routes/vendors";
import { billRoutes } from "./routes/bills";
import { paymentRoutes } from "./routes/payments";
import { taxFilingRoutes } from "./routes/tax-filings";
import { errorHandler } from "./middleware/error-handler";

const PORT = Number(process.env.PORT ?? 3001);

const app = new Elysia()
  .use(errorHandler)
  .get("/", () => ({ ok: true, service: "wind-accounting-api" }))
  .get("/health", () => ({ status: "healthy", ts: new Date().toISOString() }))
  .group("/api/v1", (app) =>
    app
      .use(authRoutes)
      .use(accountRoutes)
      .use(journalEntryRoutes)
      .use(periodRoutes)
      .use(reportRoutes)
      .use(customerRoutes)
      .use(salesInvoiceRoutes)
      .use(receiptRoutes)
      .use(bankAccountRoutes)
      .use(vendorRoutes)
      .use(billRoutes)
      .use(paymentRoutes)
      .use(taxFilingRoutes),
  )
  .listen(PORT);

console.log(`🦊 wind-accounting-api running on :${app.server?.port}`);

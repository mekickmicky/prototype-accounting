import { Elysia } from "elysia";
import { authRoutes } from "./routes/auth";
import { accountRoutes } from "./routes/accounts";
import { journalEntryRoutes } from "./routes/journal-entries";
import { periodRoutes } from "./routes/periods";
import { reportRoutes } from "./routes/reports";
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
      .use(reportRoutes),
  )
  .listen(PORT);

console.log(`🦊 wind-accounting-api running on :${app.server?.port}`);

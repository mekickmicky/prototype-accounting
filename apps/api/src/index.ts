import { Elysia } from "elysia";

const PORT = Number(process.env.PORT ?? 3001);

const app = new Elysia()
  .get("/", () => ({ ok: true, service: "wind-accounting-api" }))
  .get("/health", () => ({ status: "healthy", ts: new Date().toISOString() }))
  .listen(PORT);

console.log(`🦊 wind-accounting-api running on :${app.server?.port}`);

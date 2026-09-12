import { Hono } from "hono";
import { cors } from "hono/cors";
import { SECTORS, STATES } from "@tele/shared";
import type { Env } from "./env.js";
import { ngos } from "./routes/ngos.js";
import { register } from "./routes/register.js";
import { DbError } from "./lib/db.js";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const handler = cors({
    origin: c.env.ALLOWED_ORIGIN?.split(",") ?? ["http://localhost:5173"],
    allowHeaders: ["content-type", "authorization", "x-org-id"],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    maxAge: 86400,
  });
  return handler(c, next);
});

app.get("/health", (c) => c.json({ ok: true }));

/**
 * The taxonomy, served from the API so the front end never hardcodes it and
 * a future mobile client gets the same list. Cached hard at the edge — it
 * changes at most a few times a year.
 */
app.get("/api/taxonomy", (c) => {
  c.header("cache-control", "public, max-age=3600");
  return c.json({ sectors: SECTORS, states: STATES });
});

app.route("/api/ngos", ngos);
app.route("/api/register", register);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof DbError) {
    console.error("db error", err.message, err.detail);
    return c.json({ error: "Something went wrong reading the directory." }, 502);
  }
  console.error("unhandled", err);
  return c.json({ error: "Something went wrong." }, 500);
});

export default app;

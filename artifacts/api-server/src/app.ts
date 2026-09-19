import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import helmet from "helmet";
import router from "./routes";
import { logger } from "./lib/logger";
import { rateLimitMiddleware } from "./lib/rateLimit";

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set");
}

// CORS_ORIGIN should be a comma-separated allowlist of the frontend origin(s),
// e.g. "https://eirf.example.gov.ph". `origin: true` (reflect any origin)
// combined with `credentials: true` lets ANY website read authenticated API
// responses via a signed-in officer's browser, since the signed cookie rides
// along with credentialed fetches — that defeats the cookie's SameSite
// protection. In local/dev (no CORS_ORIGIN set) we fall back to reflecting
// the origin so the Vite dev server keeps working.
const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// The report calls this "not exploitable in a properly deployed instance,
// but worth double-checking CORS_ORIGIN and NODE_ENV are always set" — make
// that check active instead of relying on someone remembering to look. If
// this ever fires in a real deployment (not local dev), CORS_ORIGIN and/or
// NODE_ENV=production are missing and any origin is currently being
// reflected with credentials.
if (allowedOrigins.length === 0 && process.env.NODE_ENV !== "production") {
  logger.warn(
    "CORS_ORIGIN is not set — reflecting the request origin (dev-only fallback). " +
      "If this process is reachable from outside your own machine, set CORS_ORIGIN " +
      "and NODE_ENV=production before it's exposed.",
  );
}

const app: Express = express();

app.use(
  helmet({
    // This is a JSON + file API with no HTML views of its own, so CSP is
    // mainly a defense-in-depth backstop for S3 (evidence files with a
    // crafted Content-Type): Content-Disposition: attachment on the
    // storage routes is the primary fix, this is a second layer in case a
    // future route ever serves something inline by mistake.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // The frontend is a separate origin from this API (see CORS_ORIGIN
    // above) and legitimately fetches evidence files cross-origin with
    // credentials, so Helmet's default same-origin Cross-Origin-Resource-
    // Policy would break that flow.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // COOP/COEP cross-origin isolation has no benefit for a pure API
    // server and can interfere with the evidence "open in new tab"
    // download flow, so leave those off rather than defaulting them on.
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(
  cors({
    origin:
      allowedOrigins.length > 0
        ? allowedOrigins
        : process.env.NODE_ENV === "production"
          ? false
          : true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(sessionSecret));

// A generous backstop so the API as a whole isn't completely unthrottled —
// login has its own tighter, per-username limiter (see routes/auth.ts) and
// the unauthenticated public-objects route has its own tighter one too (see
// routes/storage.ts). 300 req/min per IP comfortably covers normal use
// (including the offline-sync client replaying a queue) while still
// bounding a single client hammering the search/list endpoints.
app.use(
  "/api",
  rateLimitMiddleware({ windowMs: 60 * 1000, max: 300, keyPrefix: "api" }),
  router,
);

export default app;

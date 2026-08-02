import cors from "cors";
import helmet from "helmet";
import { addApiRoutes } from "./api/routes";
import express, { urlencoded, json } from "express";
import contextMiddleware from "./middlewares/context";
import errorHandlingMiddleware from "./middlewares/error";
import {
  badAuthRateLimiterHandler,
  rootRateLimiter,
} from "./middlewares/rate-limit";
import { compatibilityCheckMiddleware } from "./middlewares/compatibilityCheck";
import { COMPATIBILITY_CHECK_HEADER } from "@croco-calc/contracts";
import { createETagGenerator } from "./utils/etag";
import { v4RequestBody } from "./middlewares/utility";

const etagFn = createETagGenerator({ weak: true });

/**
 * ME-159 / ME-176 — express's `json()` default body limit is **100 kB**, which is
 * smaller than a legitimate `POST /results` payload and silently 413s long runs
 * before any controller or zod schema sees them.
 *
 * The request body is already bounded by the schemas, so the limit is derived
 * from that ceiling rather than picked by feel. `TaskLogSchema` caps the log at
 * `TASK_LOG_MAX_ENTRIES` = 1000 entries, each with `prompt`/`expected`/`given`
 * of at most 64 characters, and `ChartDataSchema` adds 3 x 481 points. Measured
 * `JSON.stringify` sizes of a full `CompletedEvent`:
 *
 *   - realistic 8-minute run at ~120 tpm (960 entries)  ~134 kB  <- 413s today
 *   - 1000 entries, typical prompt lengths              ~144 kB
 *   - 1000 entries, every string at the 64-char max     ~312 kB  <- schema ceiling
 *
 * So anything below ~312 kB can reject a request the schema would have accepted,
 * turning a validation problem into an opaque transport failure. 512 kB sits
 * ~1.6x above that ceiling, leaving room for future result fields while still
 * bounding memory per request; the rate limiters bound the request *rate*.
 */
export const JSON_BODY_LIMIT = "512kb";

/**
 * INF-054: CORS is an allowlist, never `cors()`'s default allow-all. The
 * production origin comes from `FRONTEND_URL` (INF-052, D1 -> https://crococalc.com);
 * `localhost:3000` is the Vite dev server port.
 */
export function buildCorsOrigins(): string[] {
  const frontendUrl = process.env["FRONTEND_URL"]?.replace(/\/+$/, "");

  const origins = new Set<string>(["http://localhost:3000"]);

  if (frontendUrl !== undefined && frontendUrl !== "") {
    origins.add(frontendUrl);

    // the apex and the www host are the same site (D1); allow both without
    // requiring two env vars to stay in sync.
    if (frontendUrl.includes("://www.")) {
      origins.add(frontendUrl.replace("://www.", "://"));
    } else {
      origins.add(frontendUrl.replace("://", "://www."));
    }
  }

  return [...origins];
}

function buildApp(): express.Application {
  const app = express();

  app.use(urlencoded({ extended: true }));
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.use(
    cors({
      origin: buildCorsOrigins(),
      exposedHeaders: [COMPATIBILITY_CHECK_HEADER],
    }),
  );
  app.use(helmet());

  // INF-055: Azure Container Apps terminates TLS in front of the container and
  // rate limiting depends on the real client IP.
  app.set("trust proxy", 1);

  app.use(compatibilityCheckMiddleware);
  app.use(contextMiddleware);

  app.use(badAuthRateLimiterHandler);
  app.use(rootRateLimiter);
  app.use(v4RequestBody);

  app.set("etag", etagFn);

  addApiRoutes(app);

  app.use(errorHandlingMiddleware);

  return app;
}

export default buildApp();

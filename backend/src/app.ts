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
  app.use(json());
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

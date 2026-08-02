import { EndpointMetadata } from "@croco-calc/contracts/util/api";
import { AppRoute, AppRouter } from "@ts-rest/core";
import { TsRestRequestHandler } from "@ts-rest/express";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { TsRestRequestWithContext } from "../api/types";
import CrocoError from "../utils/error";
import { isDevEnvironment } from "../utils/misc";

export type AsyncTsRestRequestHandler<T extends AppRouter | AppRoute> = (
  ...args: Parameters<TsRestRequestHandler<T>>
) => Promise<void>;
/** Endpoint is only available in dev environment, else return 503. */
export function onlyAvailableOnDev(): RequestHandler {
  return (
    _req: TsRestRequestWithContext,
    _res: Response,
    next: NextFunction,
  ) => {
    if (!isDevEnvironment()) {
      next(
        new CrocoError(
          503,
          "Development endpoints are only available in DEV mode.",
        ),
      );
    } else {
      next();
    }
  };
}

export function getMetadata(req: TsRestRequestWithContext): EndpointMetadata {
  // oxlint-disable-next-line no-unsafe-member-access
  return (req.tsRestRoute["metadata"] ?? {}) as EndpointMetadata;
}

/**
 * The req.body property returns undefined when the body has not been parsed. In Express 4, it returns {} by default.
 * Restore the v4 behavior
 * @param req
 * @param _res
 * @param next
 */
export async function v4RequestBody(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.body === undefined) {
    req.body = {};
  }

  next();
}

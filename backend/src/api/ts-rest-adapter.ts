import { AppRoute, AppRouter } from "@ts-rest/core";
import { TsRestRequest } from "@ts-rest/express";
import { CrocoResponse } from "../utils/croco-response";
import { Context } from "../middlewares/context";
import { CrocoRequest } from "./types";

export function callController<
  TRoute extends AppRoute | AppRouter,
  TQuery,
  TBody,
  TParams,
  TResponse,
  //ignoring as it might be used in the future
  // oxlint-disable-next-line no-unnecessary-type-parameters
  TStatus = 200,
>(
  handler: CrocoHandler<TQuery, TBody, TParams, TResponse>,
): (all: TypeSafeTsRestRequest<TRoute, TQuery, TBody, TParams>) => Promise<{
  status: TStatus;
  body: CrocoResponse<TResponse>;
}> {
  return async (all) => {
    const req: CrocoRequest<TQuery, TBody, TParams> = {
      body: all.body as TBody,
      query: all.query as TQuery,
      params: all.params as TParams,
      raw: all.req,
      ctx: all.req["ctx"] as Context,
    };

    const result = await handler(req);
    const response = {
      status: 200 as TStatus,
      body: {
        message: result.message,
        data: result.data,
      },
    };

    return response;
  };
}

type WithBody<T> = {
  body: T;
};
type WithQuery<T> = {
  query: T;
};

type WithParams<T> = {
  params: T;
};

type WithoutBody = {
  body?: never;
};
type WithoutQuery = {
  query?: never;
};
type WithoutParams = {
  params?: never;
};

type CrocoHandler<TQuery, TBody, TParams, TResponse> = (
  req: CrocoRequest<TQuery, TBody, TParams>,
) => Promise<CrocoResponse<TResponse>>;

type TypeSafeTsRestRequest<
  TRoute extends AppRoute | AppRouter,
  TQuery,
  TBody,
  TParams,
> = {
  req: TsRestRequest<TRoute>;
} & (TQuery extends undefined ? WithoutQuery : WithQuery<TQuery>) &
  (TBody extends undefined ? WithoutBody : WithBody<TBody>) &
  (TParams extends undefined ? WithoutParams : WithParams<TParams>);

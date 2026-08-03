import { IsValidResponse } from "../types/validation";
import { AnyFieldApi } from "@tanstack/solid-form";
import { handleResult } from "../components/ui/form/utils";

type IsValidResponseOrFunction =
  | ((message: string) => IsValidResponse)
  | IsValidResponse;

/**
 * The default handler for a 5xx.
 *
 * This used to be the bare string "Server unavailable. Please try again later.",
 * which threw away `body.message` and left every server-side failure looking
 * identical. That is how a 500 from `GET /users/checkName/:name` presented as an
 * outage: the field validator failed, the submit button stayed disabled, and the
 * real reason never reached the user or a bug report. Note that
 * `ape/adapters/ts-rest-adapter.ts` also fabricates a 500 for transport failures
 * (CORS, DNS, TLS, the 10 s timeout), so the appended text is often the only
 * clue to which of the two happened.
 */
function defaultServerErrorMessage(message: string): string {
  const detail = message.trim();
  if (detail === "") {
    return "Server unavailable. Please try again later.";
  }
  return `Server unavailable, please try again later (${detail})`;
}

export function remoteValidation<V, T>(
  call: (
    val: V,
  ) => Promise<{ status: number; body: { data?: T; message: string } }>,
  options?: {
    check?: (data: T) => IsValidResponse;
    on4xx?: IsValidResponseOrFunction;
    on5xx?: IsValidResponseOrFunction;
  },
): (val: V) => Promise<IsValidResponse> {
  return async (val) => {
    const result = await call(val);
    if (result.status <= 299) {
      return options?.check?.(result.body.data as T) ?? true;
    }

    let handler: IsValidResponseOrFunction;
    if (result.status <= 499) {
      handler = options?.on4xx ?? ((message) => message);
    } else {
      handler = options?.on5xx ?? defaultServerErrorMessage;
    }

    if (typeof handler === "function") return handler(result.body.message);
    return handler;
  };
}

export function remoteValidationForm<V, T>(
  call: (
    val: V,
  ) => Promise<{ status: number; body: { data?: T; message: string } }>,
  options?: {
    check?: (data: T) => IsValidResponse;
    on4xx?: IsValidResponseOrFunction;
    on5xx?: IsValidResponseOrFunction;
  },
): (val: {
  value: V;
  fieldApi: AnyFieldApi;
}) => Promise<undefined | string | string[]> {
  return async (val: { value: V; fieldApi: AnyFieldApi }) => {
    let validationResult;

    const result = await call(val.value);
    if (result.status <= 299) {
      validationResult = options?.check?.(result.body.data as T) ?? undefined;
    } else {
      let handler: IsValidResponseOrFunction;
      if (result.status <= 499) {
        handler = options?.on4xx ?? ((message) => message);
      } else {
        handler = options?.on5xx ?? defaultServerErrorMessage;
      }

      if (typeof handler === "function") {
        validationResult = handler(result.body.message);
      } else {
        validationResult = handler;
      }
    }

    if (validationResult === true || validationResult === undefined) {
      return undefined;
    }
    if (typeof validationResult === "string") return validationResult;

    return handleResult(val.fieldApi, [
      { type: "warning", message: validationResult.warning },
    ]);
  };
}

import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { PartialConfigSchema } from "@croco-calc/schemas/configs";
import {
  CommonResponses,
  meta,
  MonkeyResponseSchema,
  responseWithNullableData,
} from "./util/api";

export const GetConfigResponseSchema =
  responseWithNullableData(PartialConfigSchema);

export type GetConfigResponse = z.infer<typeof GetConfigResponseSchema>;

const c = initContract();

export const configsContract = c.router(
  {
    get: {
      summary: "get config",
      description: "Get config of the current user.",
      method: "GET",
      path: "",
      responses: {
        200: GetConfigResponseSchema,
      },
      metadata: meta({
        rateLimit: "configGet",
      }),
    },
    save: {
      summary: "update config",
      description:
        "Update the config of the current user. Only provided values will be updated while the missing values will be unchanged.",
      method: "PATCH",
      path: "",
      /**
       * TR-210 / TR-260 — deliberately NOT strict. Note the **explicit**
       * `.strip()`: it is load-bearing, not decoration.
       *
       * `ConfigSchema` is `.strict()`, and zod's `.partial()` carries the
       * `unknownKeys` setting through to the derived schema. So bare
       * `PartialConfigSchema` is *also* strict, and writing `body:
       * PartialConfigSchema` here silently kept the very behaviour TR-260
       * struck. `.strip()` is what actually relaxes it.
       *
       * Why it must be relaxed: a browser holding a cached SPA build still
       * sends the config keys that build knew about. The moment a key is
       * removed server-side, a strict body answers that client's next config
       * save with a 422 — so the user silently stops being able to save *any*
       * setting until they hard-refresh. Removing the two struck caret keys
       * (TR-203) would have done exactly that.
       *
       * Stripping unknown keys instead is what makes key removal survivable.
       * The frontend already `.strip()`s on read, so strictness on write
       * protected nothing; it only turned every future removal into a
       * coordinated-deploy problem.
       *
       * `ConfigSchema` itself stays strict — a removed key still cannot be
       * smuggled back into the *type*. This relaxes the wire, not the model.
       */
      body: PartialConfigSchema.strip(),
      responses: {
        200: MonkeyResponseSchema,
      },
      metadata: meta({
        rateLimit: "configUpdate",
      }),
    },
    delete: {
      summary: "delete config",
      description: "Delete/reset the config for the current user.",
      method: "DELETE",
      path: "",
      body: c.noBody(),
      responses: {
        200: MonkeyResponseSchema,
      },
      metadata: meta({
        rateLimit: "configDelete",
      }),
    },
  },
  {
    pathPrefix: "/configs",
    strictStatusCodes: true,
    metadata: meta({
      openApiTags: "configs",
    }),

    commonResponses: CommonResponses,
  },
);

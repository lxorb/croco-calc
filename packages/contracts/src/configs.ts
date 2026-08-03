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
       * TR-210 / TR-260 — deliberately NOT `.strict()`.
       *
       * Deploy-ordering hazard, and a permanent one: a browser holding a
       * cached SPA build still sends the config keys that build knew about. The
       * moment a key is removed server-side, `.strict()` answers that client's
       * next config save with a 422 — so the user silently stops being able to
       * save *any* setting until they hard-refresh. Removing the two struck
       * caret keys (TR-203) would have done exactly that.
       *
       * A non-strict object schema strips unknown keys instead, which is the
       * behaviour that makes key removal survivable. The frontend already
       * `.strip()`s on read, so strictness on write protected nothing; it only
       * turned every future removal into a coordinated-deploy problem.
       */
      body: PartialConfigSchema,
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

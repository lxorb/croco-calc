import { generateOpenApi } from "@ts-rest/open-api";
import { COMPATIBILITY_CHECK, contract } from "@croco-calc/contracts/index";
import { writeFileSync, mkdirSync } from "fs";
import { EndpointMetadata, PermissionId } from "@croco-calc/contracts/util/api";
import type { OpenAPIObject, OperationObject } from "openapi3-ts";
import {
  getLimits,
  RateLimiterId,
  Window,
} from "@croco-calc/contracts/rate-limit/index";
import { formatDuration } from "date-fns";

type SecurityRequirementObject = {
  [name: string]: string[];
};

export function getOpenApi(): OpenAPIObject {
  const openApiDocument = generateOpenApi(
    contract,
    {
      openapi: "3.1.0",
      info: {
        title: "croco calc API",
        description:
          "Documentation for the endpoints provided by the croco calc API server.\n\nAuthentication is performed with the Authorization HTTP header in the format `Authorization: Bearer FIREBASE_ID_TOKEN`.\n\nThere is a rate limit of `30 requests per minute` across all endpoints, with some endpoints being more strict.",
        version: `2.${COMPATIBILITY_CHECK}.0`,
        termsOfService: "https://crococalc.com/terms-of-service",
        contact: {
          name: "Support",
          email: "support@crococalc.com",
        },
        license: {
          name: "GPL-3.0",
          url: "https://www.gnu.org/licenses/gpl-3.0.html",
        },
      },
      servers: [
        {
          url: process.env["BACKEND_URL"] ?? "http://localhost:5005",
          description: "Production server",
        },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: "http",
            scheme: "bearer",
          },
        },
      },
      tags: [
        {
          name: "users",
          description: "User account data.",
          "x-displayName": "Users",
          "x-public": "yes",
        },
        {
          name: "configs",
          description: "User specific configs like test settings or theme.",
          "x-displayName": "User configs",
          "x-public": "no",
        },
        {
          name: "results",
          description: "User test results",
          "x-displayName": "Test results",
          "x-public": "yes",
        },
        {
          name: "public",
          description: "Public endpoints such as site-wide stats.",
          "x-displayName": "Public",
          "x-public": "yes",
        },
        {
          name: "leaderboards",
          description: "All-time, daily and weekly-XP leaderboards.",
          "x-displayName": "Leaderboards",
        },
        {
          name: "connections",
          description: "Connections between users.",
          "x-displayName": "Connections",
          "x-public": "no",
        },
        {
          name: "psas",
          description: "Public service announcements.",
          "x-displayName": "PSAs",
          "x-public": "yes",
        },
        {
          name: "admin",
          description:
            "Various administrative endpoints. Require user to have admin permissions.",
          "x-displayName": "Admin",
          "x-public": "no",
        },
        {
          name: "configuration",
          description: "Server configuration",
          "x-displayName": "Server configuration",
          "x-public": "yes",
        },
        {
          name: "development",
          description:
            "Development related endpoints. Only available on dev environment",
          "x-displayName": "Development",
          "x-public": "no",
        },
      ],
    },

    {
      jsonQuery: true,
      setOperationId: "concatenated-path",
      operationMapper: (operation, route) => {
        const metadata = route.metadata as EndpointMetadata;
        if (!operation.description?.trim()?.endsWith(".")) {
          operation.description += ".";
        }
        operation.description += "\n\n";

        addAuth(operation, metadata);
        addRateLimit(operation, metadata);
        addRequiredConfiguration(operation, metadata);
        addTags(operation, metadata);
        return operation;
      },
    },
  );
  return openApiDocument;
}

function addAuth(
  operation: OperationObject,
  metadata: EndpointMetadata | undefined,
): void {
  const auth = metadata?.authenticationOptions ?? {};
  const permissions = getRequiredPermissions(metadata) ?? [];
  const security: SecurityRequirementObject[] = [];
  if (!auth.isPublic && !auth.isPublicOnDev) {
    security.push({ BearerAuth: permissions });
  }

  const includeInPublic = auth.isPublic === true;
  operation["x-public"] = includeInPublic ? "yes" : "no";
  operation.security = security;

  if (permissions.length !== 0) {
    operation.description += `**Required permissions:** ${permissions.join(
      ", ",
    )}\n\n`;
  }
}

function getRequiredPermissions(
  metadata: EndpointMetadata | undefined,
): PermissionId[] | undefined {
  if (metadata?.requirePermission === undefined) {
    return undefined;
  }

  if (Array.isArray(metadata.requirePermission)) {
    return metadata.requirePermission;
  }
  return [metadata.requirePermission];
}

function addTags(
  operation: OperationObject,
  metadata: EndpointMetadata | undefined,
): void {
  if (metadata?.openApiTags === undefined) return;
  operation.tags = Array.isArray(metadata.openApiTags)
    ? metadata.openApiTags
    : [metadata.openApiTags];
}

function addRateLimit(
  operation: OperationObject,
  metadata: EndpointMetadata | undefined,
): void {
  if (metadata?.rateLimit === undefined) return;
  // oxlint-disable-next-line no-unsafe-assignment
  const okResponse = operation.responses["200"];
  if (okResponse === undefined) return;

  operation.description += getRateLimitDescription(metadata.rateLimit);

  // oxlint-disable-next-line no-unsafe-assignment no-unsafe-member-access
  okResponse["headers"] = {
    // oxlint-disable-next-line no-unsafe-member-access
    ...okResponse["headers"],
    "x-ratelimit-limit": {
      schema: { type: "integer" },
      description: "The number of allowed requests in the current period",
    },
    "x-ratelimit-remaining": {
      schema: { type: "integer" },
      description: "The number of remaining requests in the current period",
    },
    "x-ratelimit-reset": {
      schema: { type: "integer" },
      description: "The timestamp of the start of the next period",
    },
  };
}

function getRateLimitDescription(limit: RateLimiterId): string {
  const limits = getLimits(limit);

  const result = `**Rate limit:** This operation can be called up to ${
    limits.limiter.max
  } times ${formatWindow(limits.limiter.window)}`;

  return `${result}.\n\n`;
}

function formatWindow(window: Window): string {
  if (typeof window === "number") {
    const seconds = Math.floor(window / 1000);
    const duration = formatDuration({
      hours: Math.floor(seconds / 3600),
      minutes: Math.floor(seconds / 60) % 60,
      seconds: seconds % 60,
    });

    return `every ${duration}`;
  }
  return `per ${window}`;
}

function addRequiredConfiguration(
  operation: OperationObject,
  metadata: EndpointMetadata | undefined,
): void {
  if (metadata?.requireConfiguration === undefined) {
    return;
  }

  //@ts-expect-error somehow path doesnt exist
  operation.description += `**Required configuration:** This operation can only be called if the [configuration](#tag/configuration/operation/configuration.get) for  \`${metadata.requireConfiguration.path}\` is \`true\`.\n\n`;
}

//detect if we run this as a main
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error("Provide filename.");
    process.exit(1);
  }
  const outFile = args[0] as string;

  //create directories if needed
  const lastSlash = outFile.lastIndexOf("/");
  if (lastSlash > 1) {
    const dir = outFile.substring(0, lastSlash);
    mkdirSync(dir, { recursive: true });
  }

  const openapi = getOpenApi();
  writeFileSync(args[0] as string, JSON.stringify(openapi, null, 2));
}

import admin from "firebase-admin";
import Logger from "../utils/logger";
import { existsSync, readFileSync } from "fs";
import CrocoError from "../utils/error";
import path from "path";
import { isDevEnvironment } from "../utils/misc";

const SERVICE_ACCOUNT_PATH = path.join(
  __dirname,
  "../../src/credentials/serviceAccountKey.json",
);

/**
 * INF-097 / INF-098: in production the whole service-account JSON arrives in
 * `FIREBASE_SERVICE_ACCOUNT_JSON` (Key Vault -> container env). The on-disk key
 * is a local-development convenience only and is never shipped in the image.
 * There is deliberately no `BYPASS_FIREBASE` escape hatch: in `MODE=prod` with
 * neither source present the process must fail to boot.
 */
function readServiceAccount(): admin.ServiceAccount | undefined {
  const fromEnv = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];

  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    try {
      return JSON.parse(fromEnv) as admin.ServiceAccount;
    } catch (error) {
      throw new CrocoError(
        500,
        "FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON.",
        "init() firebase-admin.ts",
      );
    }
  }

  if (existsSync(SERVICE_ACCOUNT_PATH)) {
    return JSON.parse(
      readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"),
    ) as admin.ServiceAccount;
  }

  return undefined;
}

export function init(): void {
  const serviceAccount = readServiceAccount();

  if (serviceAccount === undefined) {
    if (isDevEnvironment()) {
      Logger.warning(
        "Firebase service account key not found! Continuing in dev mode, but authentication will throw errors.",
      );
      return;
    }

    throw new CrocoError(
      500,
      "Firebase service account not found. Set FIREBASE_SERVICE_ACCOUNT_JSON, or place a key at credentials/serviceAccountKey.json for local development.",
      "init() firebase-admin.ts",
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  Logger.success("Firebase app initialized");
}

function get(): typeof admin {
  if (admin.apps.length === 0) {
    throw new CrocoError(
      500,
      "Firebase app not initialized! Make sure FIREBASE_SERVICE_ACCOUNT_JSON is set, or that a service account key exists at credentials/serviceAccountKey.json.",
      "get() firebase-admin.ts",
    );
  }
  return admin;
}

export default get;

import { Plugin } from "vite";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Generates the two firebase config modules at build time (INF-090, INF-099,
 * INF-100). `frontend/vite.config.ts` aliases `/constants/firebase-config` to
 * `/constants/firebase-config-live` for production builds only, so a production
 * build needs `firebase-config-live.ts` to exist — and it is deliberately NOT
 * committed (both paths are gitignored).
 *
 * Values come from `FIREBASE_*` environment variables, mirroring the names in
 * `docker/example.env`. In production every one of them MUST be present and
 * non-empty; a deploy that silently shipped an empty auth config would look
 * healthy and be unusable (INF-101).
 */

const KEYS = [
  ["apiKey", "FIREBASE_APIKEY"],
  ["authDomain", "FIREBASE_AUTHDOMAIN"],
  ["projectId", "FIREBASE_PROJECTID"],
  ["storageBucket", "FIREBASE_STORAGEBUCKET"],
  ["messagingSenderId", "FIREBASE_MESSAGINGSENDERID"],
  ["appId", "FIREBASE_APPID"],
] as const;

const CONSTANTS_DIR = path.resolve(import.meta.dirname, "../src/ts/constants");

export function firebaseConfig(options: {
  isDevelopment: boolean;
  env: Record<string, string>;
}): Plugin {
  return {
    name: "generate-firebase-config",
    enforce: "pre",
    buildStart() {
      if (options.isDevelopment) return;

      const missing = KEYS.filter(
        ([, envName]) =>
          options.env[envName] === undefined || options.env[envName] === "",
      ).map(([, envName]) => envName);
      if (missing.length > 0) {
        throw new Error(
          `production build: missing firebase configuration (${missing.join(", ")}). ` +
            "Set every FIREBASE_* variable; the deploy workflow must not fall back to the CI stub.",
        );
      }

      const body = KEYS.map(
        ([key, envName]) =>
          `  ${key}: ${JSON.stringify(options.env[envName] as string)},`,
      ).join("\n");
      const module = `// Generated at build time by vite-plugins/firebase-config.ts. Do not commit.\nexport const firebaseConfig = {\n${body}\n};\n`;

      mkdirSync(CONSTANTS_DIR, { recursive: true });
      writeFileSync(
        path.join(CONSTANTS_DIR, "firebase-config-live.ts"),
        module,
      );
      // The non-live module is what the type-checker and dev server import; only
      // create it when the developer has no local one to preserve.
      const local = path.join(CONSTANTS_DIR, "firebase-config.ts");
      if (!existsSync(local)) writeFileSync(local, module);
    },
  };
}

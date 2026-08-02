import {
  defineConfig,
  loadEnv,
  UserConfig,
  BuildEnvironmentOptions,
  PluginOption,
  CSSOptions,
} from "vite";
import path from "node:path";
import injectHTML from "vite-plugin-html-inject";
import childProcess from "child_process";
import autoprefixer from "autoprefixer";
import { Fonts } from "./src/ts/constants/fonts";
import { icons } from "./vite-plugins/icons";
import { fontPreview } from "./vite-plugins/font-preview";
import { envConfig } from "./vite-plugins/env-config";
import { firebaseConfig } from "./vite-plugins/firebase-config";
import { minifyJson } from "./vite-plugins/minify-json";
import { versionFile } from "./vite-plugins/version-file";
import { oxlintChecker } from "./vite-plugins/oxlint-checker";
import { injectPreload } from "./vite-plugins/inject-preload";
import Inspect from "vite-plugin-inspect";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import { VitePWA } from "vite-plugin-pwa";
import { KnownFontName } from "@croco-calc/schemas/fonts";
import solidPlugin from "vite-plugin-solid";
import devtools from "solid-devtools/vite";
import tailwindcss from "@tailwindcss/vite";

/** Default theme (`serika_dark`), used for the PWA manifest colours (INF-116). */
const THEME_BACKGROUND = "#323437";

/** Default theme (`serika_dark`), used for the PWA manifest colours (INF-116). */
const THEME_BACKGROUND = "#323437";

function getFontsConfig(): string {
  return `\n${Object.keys(Fonts)
    .sort()
    .map((name: string) => {
      const config = Fonts[name as KnownFontName];
      if (config.systemFont === true) return "";
      return `"${name.replaceAll("_", " ")}": (
        "src": "${config.fileName}",
        "weight": ${config.weight ?? 400},
        ),`;
    })
    .join("\n")}\n`;
}

function pad(
  numbers: number[],
  maxLength: number,
  fillString: string,
): string[] {
  return numbers.map((number) =>
    number.toString().padStart(maxLength, fillString),
  );
}

function getClientVersion(isDevelopment: boolean): string {
  if (isDevelopment) {
    return "DEVELOPMENT_CLIENT";
  }
  const date = new Date();
  const versionPrefix = pad(
    [date.getFullYear(), date.getMonth() + 1, date.getDate()],
    2,
    "0",
  ).join(".");
  const versionSuffix = pad([date.getHours(), date.getMinutes()], 2, "0").join(
    ".",
  );
  const version = [versionPrefix, versionSuffix].join("_");

  try {
    const commitHash = childProcess
      .execSync("git rev-parse --short HEAD")
      .toString();

    return `${version}_${commitHash}`.replace(/\n/g, "");
  } catch (e) {
    return `${version}_unknown-hash`;
  }
}

/**
 * INF-013: a production build MUST NOT be able to fall back to monkeytype's
 * API. `vite-plugins/env-config.ts` used to default to `api.monkeytype.com`
 * when `BACKEND_URL` was unset, which would have shipped a frontend talking to
 * somebody else's backend.
 */
function requireBackendUrl(env: Record<string, string>, mode: string): string {
  const backendUrl = env["BACKEND_URL"];
  if (backendUrl === undefined || backendUrl.trim() === "") {
    throw new Error(
      `${mode}: BACKEND_URL is not defined. Set it to the deployed API origin (Terraform output api_base_url).`,
    );
  }
  if (backendUrl.includes("monkeytype.com")) {
    throw new Error(
      `${mode}: BACKEND_URL points at monkeytype.com ("${backendUrl}"). croco calc must not call monkeytype's API.`,
    );
  }
  return backendUrl;
}

/** Hostname of the API, so the service worker never caches API responses (INF-031). */
function getApiHostname(backendUrl: string | undefined): string | null {
  if (backendUrl === undefined || backendUrl.trim() === "") return null;
  try {
    return new URL(backendUrl).hostname;
  } catch {
    return null;
  }
}

function getPlugins({
  isDevelopment,
  env,
}: {
  isDevelopment: boolean;
  env: Record<string, string>;
}): PluginOption[] {
  const clientVersion = getClientVersion(isDevelopment);
  const apiHostname = getApiHostname(env["BACKEND_URL"]);

  const plugins: PluginOption[] = [
    firebaseConfig({ isDevelopment, env }),
    // WP-04 owns vite-plugins/icons.ts; registering it here turns a missing or
    // mis-collected icon id into a build failure (CP-002, C10).
    icons(),
    envConfig({ isDevelopment, clientVersion, env }),
    injectHTML() as PluginOption,
    tailwindcss(),

    solidPlugin(),
    devtools({
      autoname: true,
    }),
  ];

  const devPlugins: PluginOption[] = [
    oxlintChecker({
      debounceDelay: 125,
      typeAware: true,
      overlay: isDevelopment,
    }),
    Inspect(),
  ];

  const prodPlugins: PluginOption[] = [
    fontPreview(),
    versionFile({ clientVersion }),
    ViteMinifyPlugin(),
    VitePWA({
      // injectRegister: "networkfirst",
      injectRegister: null,
      registerType: "autoUpdate",
      manifest: {
        short_name: "croco calc",
        name: "croco calc",
        start_url: "/",
        icons: [
          {
            src: "/images/icons/maskable_icon_x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/images/icons/general_icon_x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
        background_color: THEME_BACKGROUND,
        display: "standalone",
        theme_color: THEME_BACKGROUND,
      },
      manifestFilename: "manifest.json",
      workbox: {
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globIgnores: ["**/.*"],
        globPatterns: [],
        navigateFallback: "",
        runtimeCaching: [
          {
            urlPattern: (options) => {
              const isApi =
                apiHostname !== null && options.url.hostname === apiHostname;
              return options.sameOrigin && !isApi;
            },
            handler: "NetworkFirst",
            options: {},
          },
          {
            urlPattern: (options) => {
              //disable caching for version.json
              return options.url.pathname === "/version.json";
            },
            handler: "NetworkOnly",
            options: {},
          },
        ],
      },
    }),
    injectPreload(),
    minifyJson(),
  ];

  return [...plugins, ...(isDevelopment ? devPlugins : prodPlugins)].filter(
    (it) => it !== null,
  );
}

function getBuildOptions(): BuildEnvironmentOptions {
  return {
    sourcemap: false,
    emptyOutDir: true,
    outDir: "../dist",
    assetsInlineLimit: 0, //dont inline small files as data
    rolldownOptions: {
      input: {
        index: path.resolve(__dirname, "src/index.html"),
        email: path.resolve(__dirname, "src/email-handler.html"),
        privacy: path.resolve(__dirname, "src/privacy-policy.html"),
        security: path.resolve(__dirname, "src/security-policy.html"),
        terms: path.resolve(__dirname, "src/terms-of-service.html"),
        404: path.resolve(__dirname, "src/404.html"),
      },
      output: {
        assetFileNames: (assetInfo) => {
          let extType = (assetInfo.names[0] as string).split(".").at(1);

          if (extType === undefined) {
            throw new Error(
              `Could not determine asset type for asset: ${assetInfo.names[0]}`,
            );
          }

          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
            extType = "images";
          }
          if (
            /\.(woff|woff2|eot|ttf|otf)$/.test(assetInfo.names[0] as string)
          ) {
            return `webfonts/[name]-[hash].${extType}`;
          }
          // oxlint-disable-next-line no-deprecated
          if (assetInfo.name === "misc.css") {
            return `${extType}/vendor.[hash][extname]`;
          }

          return `${extType}/[name].[hash][extname]`;
        },
        chunkFileNames: "js/[name].[hash].js",
        entryFileNames: "js/[name].[hash].js",
        codeSplitting: {
          groups: [
            {
              name: "vendor-firebase",
              test: /node_modules\/@firebase\//,
            },
            {
              name: "vendor-tanstack",
              test: /node_modules\/@tanstack\//,
            },
            {
              name: "croco-calc-packages",
              test: /[\\/]packages[\\/](schemas|contracts|util|math-engine)[\\/]/,
            },
            {
              name: "vendor-chart",
              test: /node_modules\/chart/,
            },
            {
              name: "app-utils",
              test: /src\/ts\/utils\//,
            },
            {
              name: "vendor",
              test: /node_modules\//,
            },
          ],
        },
      },
    },
  };
}

function getCssOptions({
  isDevelopment,
}: {
  isDevelopment: boolean;
}): CSSOptions {
  return {
    devSourcemap: true,
    postcss: {
      plugins: [autoprefixer({})],
    },
    preprocessorOptions: {
      scss: {
        additionalData(source: string, fp: string) {
          if (isDevelopment || fp.endsWith("index.scss")) {
            const bypassFonts = isDevelopment
              ? `$previewFontsPath:"webfonts";`
              : "";
            const fonts = `
              ${bypassFonts}
              $fonts: (${getFontsConfig()});
              `;
            return `
              //inject variables into sass context
              ${fonts}

              ${source}`;
          } else {
            return source;
          }
        },
      },
    },
  };
}

export default defineConfig(({ mode }): UserConfig => {
  const env = loadEnv(mode, process.cwd(), "");
  const isDevelopment = mode !== "production";

  if (!isDevelopment) {
    requireBackendUrl(env, mode);
    if (env["RECAPTCHA_SITE_KEY"] === undefined) {
      throw new Error(`${mode}: RECAPTCHA_SITE_KEY is not defined`);
    }
  }

  return {
    plugins: getPlugins({ isDevelopment, env }),
    build: getBuildOptions(),
    css: getCssOptions({ isDevelopment }),
    server: {
      open: env["SERVER_OPEN"] !== "false",
      port: 3000,
      host: env["BACKEND_URL"] !== undefined,
      watch: {
        //we rebuild the whole contracts package when a file changes
        //so we only want to watch one file
        ignored: [/.*\/packages\/contracts\/dist\/(?!configs).*/],
      },
    },
    resolve: {
      alias: isDevelopment
        ? []
        : [
            {
              find: /\/constants\/firebase-config$/,
              replacement: "/constants/firebase-config-live",
            },
          ],
    },
    clearScreen: false,
    root: "src",
    publicDir: "../static",
  };
});

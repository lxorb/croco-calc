import { Plugin } from "vite";

/**
 * INF-030 — the API lives on its own origin, so preconnecting to it saves a
 * round trip on the first call.
 *
 * That origin is **not** knowable at authoring time. INF-047 fixes it as the
 * Container App's default FQDN, `https://ca-croco-calc-api.<env-hash>.
 * westeurope.azurecontainerapps.io`, whose `<env-hash>` Azure only assigns when
 * the managed environment is created; INF-025/§5.2 defer the custom API domain
 * out of v1. The one place that origin is known is `BACKEND_URL` — the same
 * Terraform output (`api_base_url`) the API client, the INF-013 build guard and
 * INF-031's service-worker hostname all read. So the tag is generated from it
 * rather than hard-coded, which is also why `head.html` carries no preconnect
 * of its own: a literal there would silently rot into a hostname that resolves
 * NXDOMAIN, which is worse than no preconnect at all.
 */
export function backendPreconnect(env: Record<string, string>): Plugin {
  const origin = readOrigin(env["BACKEND_URL"]);

  return {
    name: "croco-calc:backend-preconnect",
    transformIndexHtml: {
      // After `vite-plugin-html-inject` has pulled `head.html` in.
      order: "post",
      handler(html: string): string {
        if (origin === null) return html;
        return html.replace(
          "<head>",
          `<head>\n    <link rel="preconnect" href="${origin}" />`,
        );
      },
    },
  };
}

function readOrigin(backendUrl: string | undefined): string | null {
  if (backendUrl === undefined || backendUrl.trim() === "") return null;
  try {
    return new URL(backendUrl).origin;
  } catch {
    return null;
  }
}

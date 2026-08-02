import { z } from "zod";
import { createSignal } from "solid-js";
import { LocalStorageWithSchema } from "./utils/local-storage-with-schema";

/**
 * The persisted cookie consent (INV-118h).
 *
 * Only the strictly necessary category survives: the `analytics` and `sentry`
 * flags went with `analytics-controller` (INV-118e) and `sentry.ts` (INV-118d,
 * A-08), and ads are not built in this stage (CP-006).
 *
 * The schema is `.strict()` and there is deliberately no migration — a stored
 * value carrying the old keys fails to parse, `LocalStorageWithSchema` falls
 * back to `null`, and the modal asks again. That is the correct behaviour when
 * the set of things being consented to changes.
 */
const AcceptedCookiesSchema = z
  .object({
    security: z.boolean(),
  })
  .strict()
  .nullable();

export type AcceptedCookies = z.infer<typeof AcceptedCookiesSchema>;

const cookies = new LocalStorageWithSchema({
  key: "acceptedCookies",
  schema: AcceptedCookiesSchema,
  fallback: null,
  // no migration here, if cookies changed, we need to ask the user again
});

const [acceptedCookies, _setAcceptedCookies] = createSignal(cookies.get());

export function getAcceptedCookies(): AcceptedCookies | null {
  return acceptedCookies();
}

export function setAcceptedCookies(accepted: AcceptedCookies): void {
  cookies.set(accepted);
  _setAcceptedCookies(accepted);
  activateWhatsAccepted();
}

/**
 * Kept as the single place consent is acted on. Nothing is gated on consent
 * today — the only retained category is required — so this is a no-op, but the
 * call sites (`index.ts` boot, `setAcceptedCookies`) stay wired up so adding an
 * optional category later is a one-line change here rather than a hunt.
 */
export function activateWhatsAccepted(): void {
  // nothing optional to activate
}

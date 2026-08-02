import { createSignal } from "solid-js";
import { z } from "zod";
import { createEffectOn } from "../hooks/effects";
import { getActivePage } from "./core";
import { serialize as serializeUrlSearchParams } from "zod-urlsearchparams";

/**
 * AC-162: exactly four tabs, in this order. monkeytype's `apeKeys` tab is gone
 * in full (AC-163) — the enum member, the two ape-key signals, the tab entry and
 * the component are all removed, and no ape-key artefact remains in the repo.
 */
export const AccountSettingsTabSchema = z.enum([
  "account",
  "authentication",
  "blockedUsers",
  "dangerZone",
]);
export type AccountSettingsTab = z.infer<typeof AccountSettingsTabSchema>;

export const accountSettingsTabs: Record<
  AccountSettingsTab,
  { icon: string; text: string }
> = {
  account: { text: "account", icon: "ph:user-bold" },
  authentication: { text: "authentication", icon: "ph:key-bold" },
  blockedUsers: { text: "blocked users", icon: "ph:prohibit-bold" },
  dangerZone: { text: "danger zone", icon: "ph:warning-bold" },
};

export const AccountSettingsUrlParamsSchema = z
  .object({
    tab: AccountSettingsTabSchema,
  })
  .partial();
export type AccountSettingsUrlParams = z.infer<
  typeof AccountSettingsUrlParamsSchema
>;

export const [getCurrentTab, setCurrentTab] =
  createSignal<AccountSettingsTab>("account");

export function readAccountSettingsGetParameters(
  params: AccountSettingsUrlParams | undefined,
): void {
  if (params?.tab === undefined) return;

  setCurrentTab(params.tab);
}

/** AC-164: `?tab={key}`, written with `replaceState`, page-scoped. */
createEffectOn(getCurrentTab, (tab) => {
  //make sure we only replace the url if we are on the accountSettings page. If this is missing the url-handler will not work correctly
  if (getActivePage() !== "accountSettings") return;
  const data: AccountSettingsUrlParams = { tab };

  const urlParams = serializeUrlSearchParams({
    schema: AccountSettingsUrlParamsSchema,
    data,
  });
  const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
  window.history.replaceState({}, "", newUrl);
});

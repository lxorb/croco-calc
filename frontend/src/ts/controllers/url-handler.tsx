import {
  ConfigSchema,
  CustomBackgroundFilter,
  CustomBackgroundFilterSchema,
  CustomBackgroundSize,
  CustomBackgroundSizeSchema,
  CustomThemeColors,
  CustomThemeColorsSchema,
} from "@croco-calc/schemas/configs";
import { parseWithSchema as parseJsonWithSchema } from "@croco-calc/util/json";
import { tryCatchSync } from "@croco-calc/util/trycatch";
import { decompressFromURI } from "lz-ts";
import { z } from "zod";

import {
  SHARED_SETTINGS_ORDER,
  SharedTestSettings,
} from "../components/modals/ShareTestSettings";
import { getBarLabel } from "../config/bar-controls";
import { setConfig } from "../config/setters";
import { Config } from "../config/store";
import { authEvent } from "../events/auth";
import {
  showNoticeNotification,
  showSuccessNotification,
} from "../states/notifications";
import { restart as restartTest } from "../test/test-logic";
import * as Misc from "../utils/misc";

/**
 * The two things croco calc still reads out of the URL: a shared custom theme
 * and a shared settings tuple.
 *
 * `linkDiscord` is gone with the whole Discord integration (INV-190; the
 * feature is deferred, master section 5 item 1) and `loadChallengeFromUrl` with
 * the challenge system (INV-185, SB-159).
 */

const customThemeUrlDataSchema = z.object({
  c: CustomThemeColorsSchema,
  i: z.string().optional(),
  s: CustomBackgroundSizeSchema.optional(),
  f: CustomBackgroundFilterSchema.optional(),
});

export function loadCustomThemeFromUrl(getOverride?: string): void {
  const getValue = Misc.findGetParameter("customTheme", getOverride);
  if (getValue === null) return;

  const { data: decoded, error } = tryCatchSync(() =>
    parseJsonWithSchema(atob(getValue), customThemeUrlDataSchema),
  );
  if (error) {
    console.log("Custom theme URL decoding failed", error);
    showNoticeNotification(`Failed to load theme from URL: ${error.message}`);
    return;
  }

  let colorArray: CustomThemeColors | undefined;
  let image: string | undefined;
  let size: CustomBackgroundSize | undefined;
  let filter: CustomBackgroundFilter | undefined;
  if (Array.isArray(decoded.c) && decoded.c.length === 10) {
    colorArray = decoded.c;
    image = decoded.i;
    size = decoded.s;
    filter = decoded.f;
  } else if (Array.isArray(decoded) && decoded.length === 10) {
    // This is for backward compatibility with old format
    colorArray = decoded as unknown as CustomThemeColors;
  }

  if (colorArray?.length !== 10) {
    showNoticeNotification("Failed to load theme from URL: no colors found");
    return;
  }

  const oldCustomTheme = Config.customTheme;
  const oldCustomThemeColors = Config.customThemeColors;
  try {
    setConfig("customThemeColors", colorArray);
    showSuccessNotification("Custom theme applied");

    if (image !== undefined && size !== undefined && filter !== undefined) {
      setConfig("customBackground", image);
      setConfig("customBackgroundSize", size);
      setConfig("customBackgroundFilter", filter);
    }

    if (!Config.customTheme) setConfig("customTheme", true);
  } catch (e) {
    showNoticeNotification(
      "Something went wrong. Reverting to previous state.",
    );
    console.error(e);
    setConfig("customTheme", oldCustomTheme);
    setConfig("customThemeColors", oldCustomThemeColors);
  }
}

/**
 * SB-193 — the shared-settings tuple is croco calc's eight config keys, in the
 * order `ShareTestSettings.tsx` writes them (`SHARED_SETTINGS_ORDER`, imported
 * from there so there is exactly one declaration of the wire format). The
 * `?testSettings=` parameter name and the `lz-ts` `compressToURI` encoding are
 * monkeytype's, unchanged.
 *
 * A `null` slot means "the sharer unticked this setting", so the recipient
 * keeps their own value for it.
 *
 * The element schemas are read straight off `ConfigSchema`, so an unknown or
 * out-of-domain value in a hand-edited URL is rejected by zod before it reaches
 * `setConfig` — the tuple can never widen past the config's own value domain.
 */
const TestSettingsSchema = z.tuple(
  SHARED_SETTINGS_ORDER.map((key) =>
    ConfigSchema.shape[key].nullable(),
  ) as unknown as [z.ZodTypeAny, ...z.ZodTypeAny[]],
);

export function loadTestSettingsFromUrl(getOverride?: string): void {
  const getValue = Misc.findGetParameter("testSettings", getOverride);
  if (getValue === null) return;

  const { data: de, error } = tryCatchSync(() =>
    parseJsonWithSchema(decompressFromURI(getValue) ?? "", TestSettingsSchema),
  );
  if (error) {
    console.error("Failed to parse test settings:", error);
    showNoticeNotification(
      `Failed to load test settings from URL: ${error.message}`,
    );
    return;
  }

  const decoded = de as SharedTestSettings;
  const applied: Record<string, string> = {};

  SHARED_SETTINGS_ORDER.forEach((key, index) => {
    const value = decoded[index];
    if (value === null || value === undefined) return;

    // SB-194 — every applied value goes through `setConfig`, so the SB-215
    // all-off guard and the SB-090/SB-091 coupling apply to a shared URL
    // exactly as they do to a click in the bar. A rejected key is simply not
    // reported as applied.
    const wasSet = setConfig(key, value as never, { nosave: true });
    if (!wasSet) return;

    applied[key] = getBarLabel(key, Config[key] as never);
  });

  void restartTest({
    nosave: true,
  });

  const appliedEntries = Object.entries(applied).filter(
    ([, v]) => v !== undefined,
  );

  if (appliedEntries.length > 0) {
    const lines = appliedEntries
      .map(
        ([key, val]) =>
          Misc.escapeHTML(key) + (val ? ": " + Misc.escapeHTML(val) : ""),
      )
      .join("<br />");
    showSuccessNotification(`Settings applied from URL:<br /><br />${lines}`, {
      durationMs: 10000,
      useInnerHtml: true,
    });
  }
}

authEvent.subscribe(async (event) => {
  if (event.type === "authStateChanged") {
    const search = window.location.search;

    await event.data.loadPromise;

    loadCustomThemeFromUrl(search);
    loadTestSettingsFromUrl(search);
  }
});

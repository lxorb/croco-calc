import { Config } from "./config/store";
import * as Caret from "./test/caret";
import { configEvent } from "./events/config";
import { debounce, throttle } from "throttle-debounce";
import * as TestUI from "./test/test-ui";
import { getActivePage, getGlobalOffsetTop } from "./states/core";
import { isDevEnvironment } from "./utils/env";
import { canQuickRestart } from "./utils/quick-restart";
import { FontName } from "@croco-calc/schemas/configs";
import { qs, qsr } from "./utils/dom";
import { createEffect } from "solid-js";
import fileStorage from "./utils/file-storage";
import { convertRemToPixels } from "./utils/numbers";
import { replaceUnderscoresWithSpaces } from "./utils/strings";
import { getResultVisible, isTestActive } from "./states/test";

let isPreviewingFont = false;
export function previewFontFamily(font: FontName): void {
  document.documentElement.style.setProperty(
    "--font",
    `"${font.replaceAll(/_/g, " ")}", "Roboto Mono", "Vazirharf", "monospace"`,
  );
  // A different family means different glyph widths, so the task stream has to
  // re-measure before the preview is judged.
  TestUI.applyStreamStyles();
  isPreviewingFont = true;
}

export async function applyFontFamily(): Promise<void> {
  let font = replaceUnderscoresWithSpaces(Config.fontFamily);

  const localFont = await fileStorage.getFile("LocalFontFamilyFile");
  if (localFont === undefined) {
    //use config font
    qs(".customFont")?.empty();
  } else {
    font = "LOCALCUSTOM";

    qs(".customFont")?.setHtml(`
      @font-face{
        font-family: LOCALCUSTOM;
        src: url(${localFont});
        font-weight: 400;
        font-style: normal;
        font-display: block;
      }`);
  }

  // Upstream inserted a per-language preferred font here. CP-066 removes the
  // language machinery outright — croco calc renders digits and five operator
  // glyphs, which every font in the picker already covers — so the stack is
  // just the chosen family and the fallbacks.
  const fonts = [`"${font}"`, '"Roboto Mono"', '"Vazirharf"', "monospace"];

  document.documentElement.style.setProperty("--font", fonts.join(","));
}

export function clearFontPreview(): void {
  if (!isPreviewingFont) return;
  previewFontFamily(Config.fontFamily);
  isPreviewingFont = false;
}

export function setMediaQueryDebugLevel(level: number): void {
  const body = document.querySelector("body") as HTMLElement;

  body.classList.remove("mediaQueryDebugLevel1");
  body.classList.remove("mediaQueryDebugLevel2");
  body.classList.remove("mediaQueryDebugLevel3");

  if (level > 0 && level < 4) {
    body.classList.add(`mediaQueryDebugLevel${level}`);
  }
}

if (isDevEnvironment()) {
  qs("head title")?.setText(
    `${qs("head title")?.native.textContent ?? ""} (localhost)`,
  );
  qs("body")?.appendHtml(
    `<div class="devIndicator tl">local</div><div class="devIndicator br">local</div>`,
  );
}

window.addEventListener("beforeunload", (event) => {
  // Cancel the event as stated by the standard.
  if (canQuickRestart()) {
    //ignore
  } else {
    if (isTestActive()) {
      event.preventDefault();
      // Included for legacy support, e.g. Chrome/Edge < 119
      // oxlint-disable-next-line no-deprecated
      event.returnValue = "";
    }
  }
});

// `test-ui.ts` re-measures the task stream on resize; what is left here is the
// shell's half of the job — park the caret while the window is in motion, then
// put the keyboard and the caret back once it settles. The tape-mode, line
// centring and hint-position branches went with the features they served
// (CP-060 … CP-066).
const debouncedEvent = debounce(250, () => {
  if (getActivePage() === "test" && !getResultVisible()) {
    setTimeout(() => {
      TestUI.focusTasks();
      Caret.show();
    }, 250);
  }
});

const throttledEvent = throttle(250, () => {
  Caret.hide();
});

window.addEventListener("resize", () => {
  throttledEvent();
  debouncedEvent();
});

createEffect(() => {
  qsr("#app").setStyle({
    paddingTop: `${getGlobalOffsetTop() + convertRemToPixels(2)}px`,
  });
});

configEvent.subscribe(async ({ key }) => {
  if (key === "fontFamily") {
    await applyFontFamily();
  }
});

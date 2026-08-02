import * as TestLogic from "../../test/test-logic";
import * as Result from "../../test/result";
import * as TestScreenshot from "../../test/test-screenshot";
import { getResultVisible } from "../../states/test";
import { Command } from "../types";

/**
 * The result-screen palette commands, kept by SB-160.
 *
 * They mirror the four buttons of the results action row exactly (CP-123 as
 * amended by master C19): `next test`, `repeat test`, `toggle task history`,
 * `copy screenshot` — plus the download variant of the last one, because
 * CP-123 item 5 spells the shift-click behaviour out and `test-screenshot.ts`
 * is kept in full (INV-092).
 *
 * Deleted here: `practiseWords` and its whole subgroup (C19 cuts the
 * `practise mistakes` button and INV-093 deletes `test/practise-words.ts`) and
 * `copyWordsToClipboard` (INV-052 deletes `#copyWordsListButton`; there is no
 * word list in croco calc, and the answered-task log is already reachable
 * through `copyResultStats`).
 */
const commands: Command[] = [
  {
    id: "nextTest",
    display: "Next test",
    alias: "restart start begin test",
    icon: "ph:caret-right-bold",
    available: (): boolean => {
      return getResultVisible();
    },
    exec: (): void => {
      TestLogic.restart();
    },
  },
  {
    id: "repeatTest",
    display: "Repeat test",
    alias: "again same",
    icon: "ph:arrows-clockwise-bold",
    exec: (): void => {
      // CP-089 — "same task set" is a seeded replay, not a word list.
      TestLogic.restart({ repeat: true });
    },
    available: (): boolean => {
      return getResultVisible();
    },
  },
  {
    id: "toggleTaskHistory",
    display: "Toggle task history",
    alias: "tasks history answers",
    icon: "ph:list-bullets-bold",
    exec: (): void => {
      // CP-123 item 4 — the same function the action-row button calls.
      Result.toggleTaskHistory();
    },
    available: (): boolean => {
      return getResultVisible();
    },
  },
  {
    id: "copyScreenshot",
    display: "Copy screenshot to clipboard",
    icon: "ph:image-bold",
    alias: "copy image clipboard",
    exec: (): void => {
      setTimeout(() => {
        void TestScreenshot.copyToClipboard();
      }, 500);
    },
    available: (): boolean => {
      return getResultVisible();
    },
  },
  {
    id: "downloadScreenshot",
    display: "Download screenshot",
    icon: "ph:download-simple-bold",
    alias: "save image download file",
    exec: (): void => {
      setTimeout(async () => {
        void TestScreenshot.download();
      }, 500);
    },
    available: (): boolean => {
      return getResultVisible();
    },
  },
];
export default commands;

import { ConfigKey } from "@croco-calc/schemas/configs";

import {
  applyConfigFromJson,
  restoreDefaultTestSettings,
} from "../config/lifecycle";
import { Config } from "../config/store";
import {
  hideFpsCounter,
  showFpsCounter,
} from "../components/layout/overlays/FpsCounter";
import { randomizeTheme } from "../controllers/theme-controller";
import { isAuthAvailable, signOut } from "../firebase";
import { isAuthenticated } from "../states/core";
import { showModal } from "../states/modals";
import {
  showErrorNotification,
  clearAllNotifications,
  showSuccessNotification,
} from "../states/notifications";
import { getLastEventLog } from "../states/test";
import { CommandlineConfigMetadataObject } from "./commandline-metadata";
import { getIconHtml } from "./icons";
import AddOrRemoveThemeToFavorite from "./lists/add-or-remove-theme-to-favorites";
import CustomBackgroundFilterCommands from "./lists/background-filter";
import CustomBackgroundCommands from "./lists/custom-background";
import CustomThemesListCommands from "./lists/custom-themes-list";
import FontFamilyCommands from "./lists/font-family";
import NavigationCommands from "./lists/navigation";
import ResultScreenCommands from "./lists/result-screen";
import ThemesCommands from "./lists/themes";
import { Command, CommandlineListKey, CommandsSubgroup } from "./types";
import { buildCommandForConfigKey } from "./util";

/**
 * The croco calc command palette (master C8 keeps it; INV-117/INV-069 are
 * overruled).
 *
 * SB-153: the eight settings-bar commands come first, in bar order, generated
 * from config metadata (SB-152) rather than hand-written, so the bar and the
 * palette can never disagree about the option set.
 *
 * SB-159 removed from monkeytype's list: `language`, `quoteLength`,
 * `punctuation`, `numbers`, `mode`, `words`, `changeCustomModeText`,
 * `viewQuoteSearchPopup`, the quote-favourite commands, `britishEnglish`,
 * `lazyMode`, `customPolyglot`, `customLayoutfluid`, `layout`, every `keymap*`
 * command, every funbox command, `loadChallenge`, `watchVideoAd`, `ads` and
 * `minBurst` — plus, by later rulings, the sound commands, presets, tags,
 * `difficulty`, `minWpm`/`minAcc` (C14, C15, C22), `bailOut` (C38) and
 * `blindMode` (C41). The input-side commands of monkeytype's typing pipeline
 * (`freedomMode`, `strictSpace`, `stopOnError`, `quickEnd`, `hideExtraLetters`,
 * …) go with the config keys §6.1 struck, as do `capsLockWarning`, `monkey`,
 * `monkeyPowerLevel`, `liveBurstStyle`, `tapeMode` and the rest of the
 * appearance keys that no longer exist.
 */
export const commands: CommandsSubgroup = {
  title: "",
  list: [
    //result
    ...ResultScreenCommands,

    // ------------------------------------------------------------------
    // test — SB-153: the eight settings-bar commands, first, in bar order
    // (decimals, negatives, addition, multiplication, division, fraction
    // addition, fraction multiplication, time). Each is built by
    // `buildCommandForConfigKey`, so its option list is the zod enum in cycle
    // order (SB-154, SB-011) and executing one produces exactly the same
    // mutation, coupling, persistence and restart as clicking the control
    // (SB-162).
    // ------------------------------------------------------------------
    ...buildCommands(
      "decimals",
      "negatives",
      "addition",
      "multiplication",
      "division",
      "fractionAddition",
      "fractionMultiplication",
      "time",
    ),
    /**
     * SB-157 — one command that puts all eight keys back to the SB-110
     * defaults and restarts the test. Its alias names the reason it exists:
     * the defaults are the only leaderboard-eligible settings (SB-171), and
     * SB-181 makes the "not eligible for leaderboards" notice execute it.
     */
    {
      id: "restoreDefaultTestSettings",
      display: "Restore default test settings",
      alias: "default leaderboard eligible reset settings",
      icon: "tabler:refresh",
      exec: async (): Promise<void> => {
        await restoreDefaultTestSettings();
      },
    },
    {
      id: "shareTestSettings",
      display: "Share test settings",
      alias: "share link url",
      icon: "tabler:share",
      opensModal: true,
      exec: (): void => {
        showModal("ShareTestSettings");
      },
    },

    //behavior
    ...buildCommands("resultSaving", "quickRestart", "singleListCommandLine"),

    //caret (restored by master C11)
    ...buildCommands("smoothCaret", "caretStyle"),

    //appearance
    ...buildCommands(
      "timerStyle",
      "liveSpeedStyle",
      "liveAccStyle",
      "timerColor",
      "timerOpacity",
      "alwaysShowDecimalPlaces",
      "startGraphsAtZero",
      "maxLineWidth",
      "fontSize",
      ...FontFamilyCommands,
    ),

    //theme
    ...buildCommands(
      ...ThemesCommands,
      "customTheme",

      ...CustomThemesListCommands,
      "flipTestColors",
      "colorfulMode",
      ...AddOrRemoveThemeToFavorite,
      ...CustomBackgroundCommands,
      "customBackgroundSize",
      ...CustomBackgroundFilterCommands,
      "randomTheme",
    ),

    {
      id: "randomizeTheme",
      display: "Next random theme",
      icon: "ph:shuffle-bold",
      exec: async (): Promise<void> => randomizeTheme(),
      available: (): boolean => {
        return Config.randomTheme !== "off";
      },
    },

    //showhide elements
    ...buildCommands(
      "showKeyTips",
      "showOutOfFocusWarning",
      "showAverage",
      "showPb",
    ),

    //other
    ...NavigationCommands,
    {
      id: "importSettingsJSON",
      display: "Import settings JSON",
      icon: "ph:file-arrow-up-bold",
      alias: "import config",
      input: true,
      exec: async ({ input }): Promise<void> => {
        if (input === undefined || input === "") return;
        await applyConfigFromJson(input);
      },
    },
    {
      id: "exportSettingsJSON",
      display: "Export settings JSON",
      icon: "ph:file-arrow-down-bold",
      alias: "export config",
      input: true,
      defaultValue: (): string => {
        return JSON.stringify(Config);
      },
    },
    {
      id: "clearNotifications",
      display: "Clear all notifications",
      icon: "ph:trash-bold",
      alias: "dismiss",
      exec: async (): Promise<void> => {
        clearAllNotifications();
      },
    },
    {
      id: "clearSwCache",
      display: "Clear SW cache",
      icon: "ph:hard-drives-bold",
      exec: async (): Promise<void> => {
        const clist = await caches.keys();
        for (const name of clist) {
          await caches.delete(name);
        }
        window.location.reload();
      },
    },
    {
      id: "getSwCache",
      display: "Get SW cache",
      icon: "ph:hard-drives-bold",
      exec: async (): Promise<void> => {
        alert(await caches.keys());
      },
    },
    {
      id: "copyResultStats",
      display: "Copy last event log (result data)",
      alias: "stats events",
      icon: "ph:clipboard-bold",
      visible: false,
      available: (): boolean => {
        return getLastEventLog() !== null;
      },
      exec: async (): Promise<void> => {
        navigator.clipboard
          .writeText(JSON.stringify(getLastEventLog()))
          .then(() => {
            showSuccessNotification("Copied to clipboard");
          })
          .catch((e: unknown) => {
            showErrorNotification("Failed to copy to clipboard", { error: e });
          });
      },
    },
    {
      id: "fpsCounter",
      display: "FPS counter...",
      icon: "ph:gauge-bold",
      visible: false,
      subgroup: {
        title: "FPS counter...",
        list: [
          {
            id: "startFpsCounter",
            display: "show",
            icon: "ph:gauge-bold",
            exec: (): void => {
              showFpsCounter();
            },
          },
          {
            id: "stopFpsCounter",
            display: "hide",
            icon: "ph:gauge-bold",
            exec: (): void => {
              hideFpsCounter();
            },
          },
        ],
      },
    },
    {
      id: "signOut",
      display: "Sign out",
      icon: "ph:sign-out-bold",
      exec: (): void => {
        void signOut();
      },
      available: () => {
        return isAuthAvailable() && isAuthenticated();
      },
    },
  ],
};

const lists: Record<CommandlineListKey, CommandsSubgroup | undefined> = {
  themes: ThemesCommands[0]?.subgroup,
};

const subgroupByConfigKey = Object.fromEntries(
  commands.list
    .filter((it) => it.subgroup?.configKey !== undefined)
    .map((it) => [it.subgroup?.configKey, it.subgroup]),
) as Record<string, CommandsSubgroup>;

export function doesListExist(listName: string): boolean {
  if (subgroupByConfigKey[listName] !== undefined) {
    return true;
  }

  return lists[listName as CommandlineListKey] !== undefined;
}

export async function getList(
  listName: CommandlineListKey | ConfigKey,
): Promise<CommandsSubgroup> {
  const subGroup = subgroupByConfigKey[listName];
  if (subGroup !== undefined) {
    return subGroup;
  }

  const list = lists[listName as CommandlineListKey];
  if (!list) {
    showErrorNotification(`List not found: ${listName}`);
    throw new Error(`List ${listName} not found`);
  }
  return list;
}

let stack: CommandsSubgroup[] = [];

stack = [commands];

export function getStackLength(): number {
  return stack.length;
}

export function setStackToDefault(): void {
  setStack([commands]);
}

export function setStack(val: CommandsSubgroup[]): void {
  stack = val;
}

export function pushToStack(val: CommandsSubgroup): void {
  stack.push(val);
}

export function popFromStack(): void {
  stack.pop();
}

export function getTopOfStack(): CommandsSubgroup {
  return stack[stack.length - 1] as CommandsSubgroup;
}

let singleList: CommandsSubgroup | undefined;
export async function getSingleSubgroup(): Promise<CommandsSubgroup> {
  const singleCommands: Command[] = [];
  for (const command of commands.list) {
    const ret = buildSingleListCommands(command);
    singleCommands.push(...ret);
  }

  singleList = {
    title: "",
    list: singleCommands,
  };
  return singleList;
}

/**
 * SB-161 — `singleListCommandLine` keeps working for the eight new commands:
 * their subgroup entries flatten into `"<Command> > <option>"` rows.
 */
function buildSingleListCommands(
  command: Command,
  parentCommand?: Command,
): Command[] {
  const commands: Command[] = [];
  if (command.subgroup) {
    if (command.subgroup.beforeList) {
      command.subgroup.beforeList();
    }
    const currentCommand = {
      ...command,
      subgroup: {
        ...command.subgroup,
        list: [],
      },
    };
    for (const cmd of command.subgroup.list) {
      commands.push(...buildSingleListCommands(cmd, currentCommand));
    }
  } else {
    if (parentCommand) {
      const parentCommandDisplay = parentCommand.display.replace(
        /\s?\.\.\.$/g,
        "",
      );
      const singleListDisplay = `${
        parentCommandDisplay
      }${getChevronHtml()}${command.display}`;

      const singleListDisplayNoIcon = `${parentCommandDisplay} ${command.display}`;

      let newAlias: string | undefined = undefined;

      if ((parentCommand.alias ?? "") || (command.alias ?? "")) {
        newAlias = [parentCommand.alias, command.alias]
          .filter(Boolean)
          .join(" ");
      }

      const newCommand = {
        ...command,
        singleListDisplay,
        singleListDisplayNoIcon,
        configKey: parentCommand.subgroup?.configKey,
        icon: parentCommand.icon,
        alias: newAlias,
        visible: (parentCommand.visible ?? true) && (command.visible ?? true),
        available: async (): Promise<boolean> => {
          return (
            ((await parentCommand?.available?.()) ?? true) &&
            ((await command?.available?.()) ?? true)
          );
        },
      };
      commands.push(newCommand);
    } else {
      commands.push(command);
    }
  }
  return commands;
}

/**
 * The separator between a flattened command and its option in single-list mode.
 * Cached iconify markup (C30: zero `fa-` strings anywhere in `frontend/src`).
 * `commandline.ts` string-replaces it to splice the active-value checkmark in,
 * so both sides must call this one function rather than inline the markup.
 */
export function getChevronHtml(): string {
  return getIconHtml("ph:caret-right-bold", "chevronIcon");
}

function buildCommands(
  ...commands: (Command | keyof CommandlineConfigMetadataObject)[]
): Command[] {
  return commands.map((it) =>
    typeof it === "string" ? buildCommandForConfigKey(it) : it,
  );
}

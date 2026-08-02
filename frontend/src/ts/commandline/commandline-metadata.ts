import * as ConfigSchemas from "@croco-calc/schemas/configs";
import { replaceUnderscoresWithSpaces } from "../utils/strings";

import { restartTestEvent } from "../events/test";
import { Fonts, KnownFontName } from "../constants/fonts";
import { isAuthenticated } from "../states/core";
import * as UI from "../ui";
import { Validation } from "../types/validation";
import { typedKeys } from "@croco-calc/util/objects";

//TODO: remove display property and instead use optionsMetadata from configMetadata
// eventually this file should be fully merged into config metadata, probably under the 'commandline' property

/**
 * Config keys with no palette command at all — they are either edited through a
 * dedicated surface (the theme modal, C9) or never edited by hand.
 */
type ConfigKeysWithoutCommands =
  | "accountChart"
  | "customThemeColors"
  | "favThemes"
  | "autoSwitchTheme"
  | "themeLight"
  | "themeDark";

type SkippedConfigKeys =
  | "customBackgroundFilter" //this is skipped for now because it has 4 nested inputs;
  | "theme"; //themes are sorted by color and also affected by config.favThemes

export type CommandlineConfigMetadataObject = {
  [K in keyof Omit<
    ConfigSchemas.Config,
    ConfigKeysWithoutCommands | SkippedConfigKeys
    // oxlint-disable-next-line no-explicit-any
  >]: CommandlineConfigMetadata<K, any>;
};

export type InputProps<T extends keyof ConfigSchemas.Config> = {
  alias?: string;
  display?: string;
  afterExec?: (value: ConfigSchemas.Config[T]) => void;
  defaultValue?: () => string;
  /**
   * default value for missing validation is `{schema:true}`
   */
  validation?: Omit<Validation<ConfigSchemas.Config[T]>, "schema"> & {
    schema?: true;
  };
  hover?: () => void;
  configValue?: ConfigSchemas.Config[T];
  inputValueConvert: ConfigSchemas.Config[T] extends string
    ? ((val: string) => string) | undefined
    : (val: string) => ConfigSchemas.Config[T];
};

export type SecondaryInputProps<T extends keyof ConfigSchemas.Config> = {
  secondKey: T;
} & InputProps<T>;

export type CommandlineConfigMetadata<
  T extends keyof ConfigSchemas.Config,
  T2 extends keyof ConfigSchemas.Config,
> = {
  alias?: string;
  display?: string;
  isVisible?: boolean;
  input?: InputProps<T> | SecondaryInputProps<T2> | Record<never, never>;
  subgroup?: SubgroupProps<T>;
};

export type SubgroupProps<T extends keyof ConfigSchemas.Config> = {
  alias?: (value: ConfigSchemas.Config[T]) => string;
  display?: (value: ConfigSchemas.Config[T]) => string;
  configValueMode?: (value: ConfigSchemas.Config[T]) => "include" | undefined;
  isVisible?: (value: ConfigSchemas.Config[T]) => boolean;
  isAvailable?: (value: ConfigSchemas.Config[T]) => (() => boolean) | undefined;
  customData?: (
    value: ConfigSchemas.Config[T],
  ) => Record<string, string | boolean>;
  hover?: (value: ConfigSchemas.Config[T]) => void;
  afterExec?: (value: ConfigSchemas.Config[T]) => void;
  options: "fromSchema" | ConfigSchemas.Config[T][];
};

/**
 * SB-154 restates monkeytype's `afterExec: () => void TestLogic.restart()`.
 * croco calc dispatches `restartTestEvent` instead, which `test/test-logic.ts`
 * subscribes to (`test-logic.ts:1323`) — the identical restart, reached through
 * the identical path the settings bar uses (`TestConfig.tsx:173`). SB-162 makes
 * that identity binding, and going through the event keeps the palette free of
 * a static import of the test engine.
 */
function restartTest(): void {
  restartTestEvent.dispatch();
}

export const commandlineConfigMetadata: CommandlineConfigMetadataObject = {
  // ------------------------------------------------------------------
  // test — the eight settings-bar controls (SB-152 … SB-158).
  //
  // None of them declares `display`: `buildCommandWithSubgroup` derives it from
  // `configMetadata[key].displayString`, which is what makes SB-152's "generated
  // from config metadata, not hand-written" true. The derived strings are
  // exactly SB-156's — `Decimals...`, `Negative numbers...`, `Addition...`,
  // `Multiplication...`, `Division...`, `Fraction addition...`,
  // `Fraction multiplication...`, `Time...`.
  //
  // Likewise none declares `display` on its subgroup: option labels come from
  // `configMetadata[key].optionsMetadata[value].displayString`, so the bar and
  // the palette read one mapping table (SB-155).
  // ------------------------------------------------------------------
  decimals: {
    alias: "decimal point comma",
    subgroup: { options: "fromSchema", afterExec: restartTest },
  },
  negatives: {
    alias: "minus negative",
    subgroup: { options: "fromSchema", afterExec: restartTest },
  },
  addition: {
    alias: "plus add",
    subgroup: { options: "fromSchema", afterExec: restartTest },
  },
  multiplication: {
    alias: "times multiply",
    subgroup: { options: "fromSchema", afterExec: restartTest },
  },
  division: {
    alias: "divide",
    subgroup: { options: "fromSchema", afterExec: restartTest },
  },
  fractionAddition: {
    alias: "fraction fractions",
    subgroup: { options: "fromSchema", afterExec: restartTest },
  },
  fractionMultiplication: {
    alias: "fraction fractions",
    subgroup: { options: "fromSchema", afterExec: restartTest },
  },
  // SB-158 — no `input` branch and no second-based option list. croco calc's
  // time domain is closed (1/2/4/8 minutes, SB-012); an arbitrary duration
  // would fragment the leaderboards, whose second axis is exactly this key
  // (SB-172, SB-176).
  time: {
    alias: "duration minutes",
    subgroup: { options: "fromSchema", afterExec: restartTest },
  },

  //behavior
  quickRestart: {
    subgroup: {
      options: "fromSchema",
    },
  },
  resultSaving: {
    subgroup: {
      options: "fromSchema",
      alias: (val) => (val ? "enabled" : "disabled"),
    },
    alias: "results incognito",
  },
  singleListCommandLine: {
    subgroup: {
      options: "fromSchema",
    },
  },

  //caret
  smoothCaret: {
    subgroup: {
      options: "fromSchema",
    },
  },
  caretStyle: {
    subgroup: {
      options: "fromSchema",
    },
  },

  //appearance
  liveSpeedStyle: {
    subgroup: {
      options: "fromSchema",
    },
    alias: "tpm speed",
  },
  liveAccStyle: {
    subgroup: {
      options: "fromSchema",
    },
    alias: "accuracy",
  },
  timerStyle: {
    subgroup: {
      options: "fromSchema",
      display: replaceUnderscoresWithSpaces,
    },
    alias: "timer",
  },
  timerColor: {
    display: "Live progress color...",
    alias: "timer tpm acc",
    subgroup: {
      options: "fromSchema",
      alias: () => "timer",
    },
  },
  timerOpacity: {
    display: "Live progress opacity...",
    alias: "timer tpm acc",
    subgroup: {
      options: "fromSchema",
      alias: () => "timer",
    },
  },
  alwaysShowDecimalPlaces: {
    subgroup: {
      options: "fromSchema",
    },
  },
  startGraphsAtZero: {
    subgroup: {
      options: "fromSchema",
    },
  },
  maxLineWidth: {
    input: {
      alias: "page",
      inputValueConvert: Number,
    },
  },
  fontSize: {
    input: {
      inputValueConvert: Number,
    },
  },
  fontFamily: {
    subgroup: {
      options: typedKeys(Fonts).sort((a, b) =>
        (Fonts[a]?.display ?? a.replace(/_/g, " ")).localeCompare(
          Fonts[b]?.display ?? b.replace(/_/g, " "),
        ),
      ),
      display: (name: string) =>
        Fonts[name as KnownFontName]?.display ?? name.replaceAll(/_/g, " "),
      customData: (name: string) => {
        const fontConfig = Fonts[name as KnownFontName];
        if (fontConfig === undefined) return {};
        return {
          name: name.replaceAll(/_/g, " "),
          isSystem: fontConfig.systemFont === true,
          display: fontConfig.display,
        } as Record<string, string | boolean>;
      },
      hover: (name: string) => UI.previewFontFamily(name),
    },
  },

  //themes
  customTheme: {
    subgroup: {
      options: "fromSchema",
    },
  },
  flipTestColors: {
    subgroup: {
      options: "fromSchema",
    },
  },
  colorfulMode: {
    subgroup: {
      options: "fromSchema",
    },
  },
  customBackground: {
    input: {},
  },
  customBackgroundSize: {
    subgroup: {
      options: "fromSchema",
    },
  },
  randomTheme: {
    subgroup: {
      options: "fromSchema",
      isAvailable: (value) =>
        value === "custom" ? isAuthenticated : undefined,
    },
  },

  //showhide
  showKeyTips: {
    subgroup: {
      options: "fromSchema",
    },
    display: "Key tips...",
  },
  showOutOfFocusWarning: {
    subgroup: {
      options: "fromSchema",
    },
    display: "Out of focus warning...",
  },
  showAverage: {
    subgroup: {
      options: "fromSchema",
    },
  },
  showPb: {
    subgroup: {
      options: "fromSchema",
    },
    alias: "pb",
  },
};

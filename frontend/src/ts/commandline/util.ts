import { Config } from "../config/store";
import { setConfig } from "../config/setters";
import { ConfigMetadata, configMetadata } from "../config/metadata";
import { capitalizeFirstLetter } from "../utils/strings";
import {
  CommandlineConfigMetadata,
  commandlineConfigMetadata,
  CommandlineConfigMetadataObject,
  InputProps,
  SubgroupProps,
} from "./commandline-metadata";
import { Command } from "./types";
import * as ConfigSchemas from "@croco-calc/schemas/configs";
import { ZodSchema, ZodFirstPartySchemaTypes } from "zod";
import { getOptions } from "../utils/zod";

export function buildCommandForConfigKey<
  K extends keyof CommandlineConfigMetadataObject,
>(key: K): Command {
  const configMeta = configMetadata[key];
  const commandMeta = commandlineConfigMetadata[key];
  const schema = ConfigSchemas.ConfigSchema.shape[key];

  return _buildCommandForConfigKey(key, configMeta, commandMeta, schema);
}
function _buildCommandForConfigKey<
  K extends keyof CommandlineConfigMetadataObject,
>(
  key: K,
  configMeta: ConfigMetadata<K>,
  commandMeta:
    | CommandlineConfigMetadata<K, keyof ConfigSchemas.Config>
    | undefined,
  schema: ZodSchema,
): Command {
  if (commandMeta === undefined || commandMeta === null) {
    throw new Error(`No commandline metadata found for config key "${key}".`);
  }

  let result: Command | undefined = undefined;

  if ("subgroup" in commandMeta && commandMeta.subgroup !== undefined) {
    result = buildCommandWithSubgroup(
      key,
      commandMeta.display,
      commandMeta.alias,
      commandMeta.subgroup,
      configMeta,
      schema,
    );
  }

  if ("input" in commandMeta && commandMeta.input !== undefined) {
    const inputProps = commandMeta.input;

    const inputCommand = buildInputCommand({
      key: "secondKey" in inputProps ? inputProps.secondKey : key,
      isPartOfSubgroup: "subgroup" in commandMeta,
      inputProps: inputProps as InputProps<keyof ConfigSchemas.Config>,
      configMeta: configMeta as unknown as ConfigMetadata<
        keyof ConfigSchemas.Config
      >,
      schema:
        "secondKey" in inputProps
          ? ConfigSchemas.ConfigSchema.shape[inputProps.secondKey]
          : schema,
    });

    if (result === undefined) {
      return inputCommand;
    }

    result.subgroup?.list.push(inputCommand);
  }

  if (result === undefined) {
    throw new Error(
      `Nothing returned for config key "${key}". This is a bug in the commandline metadata.`,
    );
  }
  return result;
}

function buildCommandWithSubgroup<K extends keyof ConfigSchemas.Config>(
  key: K,
  rootDisplay: string | undefined,
  rootAlias: string | undefined,
  subgroupProps: SubgroupProps<K>,
  configMeta: ConfigMetadata<K>,
  schema: ZodSchema,
): Command {
  if (subgroupProps === null) {
    throw new Error(`No commandline metadata found for config key "${key}".`);
  }

  const display =
    rootDisplay ??
    `${capitalizeFirstLetter(configMeta?.displayString ?? key)}...`;

  let values =
    subgroupProps.options ?? (getOptions(schema) as ConfigSchemas.Config[K][]);

  if (values === "fromSchema") {
    values = getOptions(schema) as ConfigSchemas.Config[K][];
  }

  if (values === undefined) {
    throw new Error(
      `Unsupported schema type for key "${key}": ${(schema as ZodFirstPartySchemaTypes)._def.typeName}`,
    );
  }
  const list = values.map((value) =>
    buildSubgroupCommand<K>(key, value, subgroupProps),
  );

  list.sort((a, b) => {
    if (a.configValue === "off" || a.configValue === false) return -1;
    if (b.configValue === "off" || b.configValue === false) return 1;
    return 0;
  });

  return {
    id: `change${capitalizeFirstLetter(key)}`,
    display: display,
    // C30/SB-060 — `configMetadata` carries an iconify id (`icon: string`);
    // font awesome and its `fa` sub-object are gone.
    icon: configMeta.icon,
    subgroup: {
      title: display,
      configKey: key,
      list,
    },
    alias: rootAlias,
  };
}

/**
 * SB-155 — the option label shown in the palette.
 *
 * 1. an explicit `display()` on the commandline metadata still wins (fonts,
 *    `flash_text` → `flash text`, …);
 * 2. the OFF state is the literal word `off`, never the bar's struck-through
 *    label — the palette cannot render a strikethrough, so `+100` for
 *    `addition: "off"` would read as ON;
 * 3. `true` is `on`, mirroring the parenthetical option list in SB-155;
 * 4. otherwise `configMetadata[key].optionsMetadata[value].displayString`, the
 *    same table the bar reads (`config/bar-controls.ts:getBarLabel`), so the
 *    two surfaces cannot disagree;
 * 5. finally the raw value.
 */
function resolveOptionDisplay(
  key: keyof ConfigSchemas.Config,
  value: ConfigSchemas.ConfigValue,
  explicit: string | undefined,
): string {
  if (explicit !== undefined) return explicit;
  if (value === "off" || value === false) return "off";
  if (value === true) return "on";

  const options: Record<string, { displayString?: string }> | undefined =
    configMetadata[key].optionsMetadata;
  return options?.[String(value)]?.displayString ?? String(value);
}

function buildSubgroupCommand<K extends keyof ConfigSchemas.Config>(
  key: keyof ConfigSchemas.Config,
  value: ConfigSchemas.Config[K],
  {
    afterExec,
    hover,
    display: commandDisplay,
    alias: commandAlias,
    configValueMode: commandConfigValueMode,
    isVisible: isCommandVisible,
    isAvailable: isCommandAvailable,
    customData: commandCustomData,
  }: SubgroupProps<K>,
): Command {
  const val = value;

  const displayString = resolveOptionDisplay(
    key,
    value,
    commandDisplay?.(value),
  );

  return {
    id: `set${capitalizeFirstLetter(key)}${capitalizeFirstLetter(
      val.toString(),
    )}`,
    display: displayString,
    configValueMode: commandConfigValueMode?.(value),
    alias: commandAlias?.(value) ?? undefined,
    configValue: val,
    visible: isCommandVisible?.(value) ?? undefined,
    available: isCommandAvailable?.(value) ?? undefined,
    exec: (): void => {
      setConfig(key, val);
      afterExec?.(val);
    },
    hover:
      hover !== undefined
        ? (): void => {
            hover?.(val);
          }
        : undefined,
    customData: commandCustomData?.(val) ?? undefined,
  };
}

function buildInputCommand<K extends keyof ConfigSchemas.Config>({
  key,
  isPartOfSubgroup,
  inputProps,
  configMeta,
  schema,
}: {
  key: K;
  isPartOfSubgroup: boolean;
  inputProps?: InputProps<K>;
  configMeta: ConfigMetadata<K>;
  schema?: ZodSchema;
}): Command {
  const validation = inputProps?.validation ?? { schema: true };

  const displayString =
    inputProps?.display ??
    (isPartOfSubgroup
      ? "custom..."
      : `${capitalizeFirstLetter(configMeta.displayString ?? key)}...`);

  const result = {
    id: `set${capitalizeFirstLetter(key)}Custom`,
    defaultValue:
      inputProps?.defaultValue ?? (() => Config[key]?.toString() ?? ""),
    configValue:
      inputProps !== undefined && "configValue" in inputProps
        ? (inputProps.configValue ?? undefined)
        : undefined,
    display: displayString,
    alias: inputProps?.alias ?? undefined,
    input: true,
    // C30 — iconify id from the config metadata (see `buildCommandWithSubgroup`).
    icon: configMeta.icon,

    //@ts-expect-error this is fine
    exec: ({ input }): void => {
      if (input === undefined) return;
      setConfig(key, input as ConfigSchemas.Config[K]);
      inputProps?.afterExec?.(input as ConfigSchemas.Config[K]);
    },
    hover: inputProps?.hover,
  };

  if (inputProps?.inputValueConvert !== undefined) {
    //@ts-expect-error this is fine
    result["inputValueConvert"] = inputProps.inputValueConvert;
  }

  //@ts-expect-error this is fine
  result["validation"] = {
    schema: validation.schema === true ? schema : undefined,
    isValid: validation.isValid,
  };

  return result as Command;
}

export const __testing = { _buildCommandForConfigKey };

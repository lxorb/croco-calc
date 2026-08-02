import {
  ResultFilterPresetNameSchema,
  ResultFilters,
  ResultFiltersKeys,
} from "@croco-calc/schemas/users";
import { createSignal, For, JSXElement, Show } from "solid-js";
import { SetStoreFunction, unwrap } from "solid-js/store";
import { z } from "zod";

import {
  deleteResultFilterPreset,
  insertResultFilterPreset,
  useResultFilterPresetsLiveQuery,
} from "../../../collections/result-filter-presets";
import { getConfig } from "../../../config/store";
import defaultResultFilters from "../../../constants/default-result-filters";
import { showSimpleModal } from "../../../states/simple-modal";
import { createErrorMessage } from "../../../utils/error";
import {
  normalizeName,
  replaceUnderscoresWithSpaces,
} from "../../../utils/strings";
import { AnimeShow } from "../../common/anime";
import AsyncContent from "../../common/AsyncContent";
import { Button } from "../../common/Button";
import { H3 } from "../../common/Headers";
import { Separator } from "../../common/Separator";
import {
  SETTING_HEADINGS,
  SETTING_ICONS,
  SETTING_KEYS,
  settingLabel,
  verifyResultFiltersStructure,
} from "./utils";

export function Filters(props: {
  filters: ResultFilters;
  onChangeFilters: SetStoreFunction<ResultFilters>;
}): JSXElement {
  /** AC-075: only rendered once the user has saved at least one preset. */
  const FilterPresets = (props: {
    presets: ResultFilters[];
    onChangeFilters: SetStoreFunction<ResultFilters>;
  }): JSXElement => {
    return (
      <Show when={props.presets.length > 0}>
        <div>
          <H3
            icon={{ icon: "ph:sliders-horizontal-bold" }}
            text="filter presets"
          />
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <For each={props.presets}>
              {(preset) => (
                <div class="flex w-full flex-row gap-2">
                  <Button
                    class="w-full"
                    text={replaceUnderscoresWithSpaces(preset.name)}
                    onClick={() =>
                      props.onChangeFilters(
                        verifyResultFiltersStructure(unwrap(preset)),
                      )
                    }
                  />
                  <Button
                    icon={{ icon: "ph:trash-bold", fixedWidth: true }}
                    onClick={() =>
                      showSimpleModal({
                        title: "Delete Filter Preset",
                        buttonText: "delete",
                        text: `Are you sure you want to delete preset ${preset.name}?`,

                        execFn: async () => {
                          try {
                            await deleteResultFilterPreset({
                              presetId: preset._id,
                            });
                            return {
                              status: "success",
                              message: `Filter preset removed`,
                            };
                          } catch (e) {
                            const message = createErrorMessage(
                              e,
                              "Error deleting filter preset",
                            );
                            return { status: "error", message };
                          }
                        },
                      })
                    }
                  />
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    );
  };

  const ButtonGroup = <
    T extends ResultFiltersKeys,
    K extends keyof ResultFilters[T],
  >(options: {
    icon?: string;
    text?: string;
    group: T;
    format?: (value: K) => string;
    classOverride?: string;
    singleSelect?: true;
  }): JSXElement => {
    const items = (): { id: K; text: string }[] =>
      Object.keys(props.filters[options.group]).map((id) => ({
        id,
        text: options.format?.(id as K) ?? new String(id).toString(),
      })) as { id: K; text: string }[];

    return (
      <div>
        <Show when={options.icon !== undefined && options.text !== undefined}>
          <H3
            icon={{ icon: options.icon as string, fixedWidth: true }}
            text={options.text as string}
          />
        </Show>
        <div
          class={
            options.classOverride ??
            "flex justify-evenly gap-2 [&>button]:w-full [&>button]:last:col-span-2"
          }
        >
          <For each={items()}>
            {(item) => (
              <Button
                text={item.text ?? (item.id as string)}
                active={props.filters[options.group][item.id] === true}
                onClick={(e) => {
                  // AC-080: shift-click narrows the group to exactly this option.
                  if (e.shiftKey || options.singleSelect) {
                    const newValue = Object.fromEntries(
                      Object.entries(props.filters[options.group]).map(
                        ([key]) => [key, key === item.id],
                      ),
                    );
                    setFilter(options.group, newValue);
                  } else {
                    setFilter(options.group, {
                      ...(props.filters[options.group] as Record<
                        string,
                        boolean
                      >),
                      // oxlint-disable-next-line typescript/strict-boolean-expressions
                      [item.id]: !props.filters[options.group][item.id],
                    });
                  }
                }}
              />
            )}
          </For>
        </div>
      </div>
    );
  };

  const [isShowAdvanced, setShowAdvanced] = createSignal(false);

  const setFilter = (
    key: ResultFiltersKeys,
    value: Record<string, boolean>,
  ) => {
    props.onChangeFilters(key, value);
  };

  const presetsQuery = useResultFilterPresetsLiveQuery();

  return (
    <div class="flex flex-col gap-8">
      <AsyncContent collections={{ presetsQuery }}>
        {({ presetsQueryData }) => (
          <FilterPresets
            presets={presetsQueryData()}
            onChangeFilters={props.onChangeFilters}
          />
        )}
      </AsyncContent>
      <div>
        <H3 icon={{ icon: "ph:funnel-bold" }} text="filters" />
        {/* AC-074 */}
        <div class="mb-4 grid gap-4 sm:grid-cols-2 lg:flex lg:justify-evenly [&>button]:w-full">
          <Button
            text="all"
            onClick={() => props.onChangeFilters(allFilters())}
          />
          <Button
            text="current settings"
            onClick={() => props.onChangeFilters(fromCurrentSettings())}
          />
          <Button
            text="advanced"
            active={isShowAdvanced()}
            onClick={() => setShowAdvanced((old) => !old)}
          />
          <Button
            text="save as preset"
            onClick={() =>
              showSimpleModal({
                title: "New Filter Preset",
                buttonText: "add",
                schema: z.object({ name: ResultFilterPresetNameSchema }),
                inputs: {
                  name: {
                    placeholder: "Preset Name",
                    type: "text",
                    preprocess: normalizeName,
                  },
                },

                execFn: async ({ name }) => {
                  const filters = { ...unwrap(props.filters), _id: "tmp" };

                  try {
                    await insertResultFilterPreset({
                      name: normalizeName(name),
                      filters,
                    });
                    return {
                      status: "success",
                      message: "Filter preset created",
                    };
                  } catch (e) {
                    const message = createErrorMessage(
                      e,
                      "Error creating filter preset",
                    );
                    return { status: "error", message };
                  }
                },
              })
            }
          />
        </div>
        <Separator class="mb-4 block lg:hidden" />
        {/* AC-076: single-select, five options, defaults to `all time`. */}
        <ButtonGroup
          singleSelect
          classOverride="grid gap-4 sm:grid-cols-2 lg:flex lg:justify-evenly [&>button]:w-full [&>button]:last:col-span-2"
          group="date"
          format={(val) => {
            if (val === "all") return "all time";
            if (val === "last_3months") return "last 3 months";
            return replaceUnderscoresWithSpaces(val);
          }}
        />

        {/* AC-077 / AC-078 */}
        <AnimeShow when={isShowAdvanced()} slide>
          <H3
            icon={{ icon: "ph:wrench-bold" }}
            text="advanced filters"
            class="mt-8"
          />

          <Button
            text="clear filters"
            onClick={() => props.onChangeFilters(noFilters())}
            class="mb-4 w-full"
          />
          <div class="gap-4 md:grid md:grid-cols-2">
            <ButtonGroup
              text="personal best"
              icon="ph:crown-bold"
              group="pb"
              format={(val) => (val === "true" ? "yes" : "no")}
            />
            <ButtonGroup text="time" icon="ph:clock-bold" group="time" />
            <For each={SETTING_KEYS}>
              {(key) => (
                <ButtonGroup
                  text={SETTING_HEADINGS[key]}
                  icon={SETTING_ICONS[key]}
                  group={key}
                  format={(val) => settingLabel(key, val)}
                />
              )}
            </For>
          </div>
        </AnimeShow>
      </div>
    </div>
  );
}

/** AC-074: `all` resets every group to "everything selected". */
function allFilters(): ResultFilters {
  return structuredClone(defaultResultFilters);
}

/** AC-077: deselect everything except the date group. */
function noFilters(): ResultFilters {
  const filters = structuredClone(defaultResultFilters);
  Object.entries(filters)
    .filter(([key, value]) => key !== "date" && typeof value === "object")
    .map(([_, value]) => value as Record<string, boolean>)
    .forEach((group) =>
      Object.keys(group).forEach((it) => (group[it] = false)),
    );

  return filters;
}

/**
 * AC-074: match the settings bar — each of the seven setting groups narrowed to
 * the value currently selected, `time` to the current duration, `pb` to both
 * and `date` to `all`.
 */
function fromCurrentSettings(): ResultFilters {
  const filters = noFilters();

  filters.pb.true = true;
  filters.pb.false = true;

  filters.time[`${getConfig.time}`] = true;

  filters.addition[getConfig.addition] = true;
  filters.multiplication[getConfig.multiplication] = true;
  filters.division[getConfig.division] = true;
  filters.fractionAddition[getConfig.fractionAddition] = true;
  filters.fractionMultiplication[`${getConfig.fractionMultiplication}`] = true;
  filters.decimals[`${getConfig.decimals}`] = true;
  filters.negatives[`${getConfig.negatives}`] = true;

  filters.date.all = true;

  return filters;
}

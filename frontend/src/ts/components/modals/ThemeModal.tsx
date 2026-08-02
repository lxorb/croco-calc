import { CustomTheme, CustomThemeNameSchema } from "@croco-calc/schemas/users";
import { createMemo, createSignal, For, JSXElement, Show } from "solid-js";
import { debounce } from "throttle-debounce";
import { z } from "zod";

import {
  addCustomTheme,
  deleteCustomTheme,
  editCustomTheme,
  useCustomThemesLiveQuery,
} from "../../collections/custom-themes";
import { setConfig } from "../../config/setters";
import { getConfig } from "../../config/store";
import { ColorName, ThemesList, ThemeWithName } from "../../constants/themes";
import {
  clearPreview,
  convertCustomColorsToTheme,
  convertThemeToCustomColors,
  preview,
} from "../../controllers/theme-controller";
import { createEffectOn } from "../../hooks/effects";
import { isAuthenticated } from "../../states/core";
import { hideModal } from "../../states/modals";
import {
  showErrorNotification,
  showNoticeNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { showSimpleModal } from "../../states/simple-modal";
import { getTheme, setTheme, updateThemeColor } from "../../states/theme";
import { cn } from "../../utils/cn";
import { hexToHSL } from "../../utils/colors";
import {
  normalizeName,
  replaceUnderscoresWithSpaces,
} from "../../utils/strings";
import { AnimatedModal } from "../common/AnimatedModal";
import { AnimeSwitch } from "../common/anime";
import { AnimeMatch } from "../common/anime/AnimeMatch";
import { Button } from "../common/Button";
import { Icon } from "../common/Icon";
import { Separator } from "../common/Separator";

/**
 * The theme modal (C9, CP-164 … CP-177).
 *
 * monkeytype split its theme picker in two: a search-and-swatches list in the
 * commandline dialog, and a larger grid on the settings page. The settings page
 * is deleted (INV-116), so C9 extracts `custom-setting/Theme.tsx` here — all of
 * CP-174's content survives, only its host changed. The modal is opened by the
 * `settings` nav item and by the footer theme indicator.
 *
 * CP-175 — presets are sorted by background lightness, darkest first, using the
 * same `hexToHSL` comparison the settings page used.
 */
export const sortedThemes: ThemeWithName[] = [...ThemesList].sort((a, b) => {
  const b1 = hexToHSL(a.bg);
  const b2 = hexToHSL(b.bg);
  return b2.lgt - b1.lgt;
});

/** CP-168 — case-insensitive, and an underscore in a theme name reads as a space. */
function matchesSearch(name: string, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === "") return true;
  return replaceUnderscoresWithSpaces(name).toLowerCase().includes(needle);
}

export function ThemeModal(): JSXElement {
  const [getSearch, setSearch] = createSignal("");
  const customThemes = useCustomThemesLiveQuery();

  /**
   * CP-172 / CP-173 — favourites first, and the list rebuilds whenever
   * `favThemes` changes because it reads the config store reactively.
   */
  const matchingThemes = createMemo((): ThemeWithName[] =>
    sortedThemes.filter((theme) => matchesSearch(theme.name, getSearch())),
  );
  const favouriteThemes = createMemo((): ThemeWithName[] =>
    matchingThemes().filter((theme) =>
      getConfig.favThemes.includes(theme.name),
    ),
  );
  const otherThemes = createMemo((): ThemeWithName[] =>
    matchingThemes().filter(
      (theme) => !getConfig.favThemes.includes(theme.name),
    ),
  );

  const ThemeButton = (props: { theme: ThemeWithName }): JSXElement => {
    const isActive = (): boolean => getConfig.theme === props.theme.name;
    const isFav = (): boolean => getConfig.favThemes.includes(props.theme.name);

    return (
      <button
        type="button"
        style={{
          "--bg": props.theme.bg,
          "--main": props.theme.main,
          "--sub": props.theme.sub,
          "--text": props.theme.text,
        }}
        class={cn(
          "group/theme grid grid-cols-[1fr_auto_1fr] justify-between p-1 ring-4 ring-transparent",
          // CP-169 — the row is painted in the theme it offers.
          "bg-(--bg) text-(--main)",
          "hover:ring-(--main)",
          "transition-[opacity,color,background,box-shadow] duration-125",
          isActive() && "ring-4 ring-(--main)",
        )}
        // CP-170 — hovering or keyboard-focusing a row previews it live.
        onMouseEnter={() => preview(props.theme.name)}
        onFocus={() => preview(props.theme.name)}
        onBlur={() => void clearPreview()}
        onClick={() => {
          // CP-171 — commit, persist, close.
          if (!isActive()) setConfig("theme", props.theme.name);
          void clearPreview(false);
          hideModal("Theme");
        }}
      >
        <div
          class={cn(
            "align-center place-self-start opacity-0 transition-[opacity,color,background] duration-125 group-hover/theme:opacity-100",
            isFav() && "opacity-100",
          )}
        >
          {/* CP-172 — the per-row favourite toggle. */}
          <div
            class={cn(
              "grid justify-center",
              "rounded-full bg-(--bg) p-1",
              "transition-[opacity,color,background] duration-125",
              "hover:text-(--text)",
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (isFav()) {
                setConfig(
                  "favThemes",
                  getConfig.favThemes.filter((t) => t !== props.theme.name),
                );
              } else {
                setConfig("favThemes", [
                  ...getConfig.favThemes,
                  props.theme.name,
                ]);
              }
            }}
          >
            <Icon
              icon="ph:star-bold"
              fixedWidth
              class={cn(
                "transition-[opacity,color,background] duration-125",
                !isFav() && "opacity-50",
              )}
            />
          </div>
        </div>
        <div>{replaceUnderscoresWithSpaces(props.theme.name)}</div>
        <div
          class={cn(
            "place-self-end self-center opacity-0 transition-opacity duration-125 group-hover/theme:opacity-100",
            isActive() && "opacity-100",
          )}
        >
          {/* CP-169 — three circular swatches: main, sub, text. */}
          <div class="grid grid-cols-3 gap-2 rounded-full bg-(--bg) p-1.5">
            <div class="h-4 w-4 rounded-full bg-(--main)"></div>
            <div class="h-4 w-4 rounded-full bg-(--sub)"></div>
            <div class="h-4 w-4 rounded-full bg-(--text)"></div>
          </div>
        </div>
      </button>
    );
  };

  const Presets = (): JSXElement => (
    <div class="grid gap-4">
      {/* CP-167 — search icon, input, then the suggestions list. */}
      <label class="flex items-center gap-2 rounded bg-sub-alt p-2 text-sub">
        <Icon icon="ph:magnifying-glass-bold" fixedWidth />
        <input
          class="w-full bg-transparent text-text outline-none"
          type="text"
          placeholder="Type to search"
          aria-label="Search themes"
          value={getSearch()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
      </label>
      <Show
        when={matchingThemes().length > 0}
        fallback={<div class="text-sub">No themes found</div>}
      >
        {/* CP-174 — the favourites-first two-section grid. */}
        <div class="grid gap-4" onMouseLeave={() => void clearPreview()}>
          <Show when={favouriteThemes().length > 0}>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-2">
              <For each={favouriteThemes()}>
                {(theme) => <ThemeButton theme={theme} />}
              </For>
            </div>
            <Separator />
          </Show>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-2">
            <For each={otherThemes()}>
              {(theme) => <ThemeButton theme={theme} />}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );

  const Customs = (): JSXElement => (
    <div class="grid gap-4">
      <Show when={isAuthenticated()}>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-2">
          <For each={customThemes()}>
            {(theme) => <CustomThemeButton theme={theme} />}
          </For>
        </div>
      </Show>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Picker color="bg" />
        <Picker color="main" />
        <Picker color="sub" />
        <Picker color="text" />
        <Picker color="caret" />
        <Picker color="subAlt" />
        <Picker color="error" />
        <Picker color="errorExtra" />
        <div class="col-span-1 text-sub md:col-span-2">
          when colorful mode is enabled:
        </div>
        <Picker color="colorfulError" />
        <Picker color="colorfulErrorExtra" />
      </div>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          text="load from preset"
          onClick={() => {
            const presetTheme = ThemesList.find(
              (t) => t.name === getConfig.theme,
            );
            if (presetTheme) {
              setTheme({ ...presetTheme, name: "custom" });
            } else {
              showErrorNotification(
                "Current preset theme not found. How is this possible?",
              );
            }
          }}
        />
        <Button
          text="share"
          onClick={() => {
            showSimpleModal({
              title: "Share custom theme",
              schema: z.object({ includeBackground: z.boolean().optional() }),
              inputs: {
                includeBackground: {
                  label: "Include background link, size and filters",
                  type: "checkbox",
                },
              },
              buttonText: "copy link to clipboard",
              buttonAlwaysEnabled: true,
              execFn: async ({ includeBackground }) => {
                const newTheme: {
                  c: string[]; //colors
                  i?: string; //image
                  s?: string; //size
                  f?: object; //filter
                } = {
                  c: convertThemeToCustomColors(getTheme()),
                };

                if (includeBackground) {
                  newTheme.i = getConfig.customBackground;
                  newTheme.s = getConfig.customBackgroundSize;
                  newTheme.f = getConfig.customBackgroundFilter;
                }

                const link = `${window.location.origin}?customTheme=${btoa(
                  JSON.stringify(newTheme),
                )}`;

                try {
                  await navigator.clipboard.writeText(link);
                  showSuccessNotification("URL Copied to clipboard");
                } catch {
                  showNoticeNotification(
                    "Looks like we couldn't copy the link straight to your clipboard. Please copy it manually.",
                    {
                      durationMs: 5000,
                    },
                  );

                  setTimeout(() => {
                    showSimpleModal({
                      title: "Custom theme URL",
                      class: "max-w-2xl",
                      schema: z.object({ url: z.string() }),
                      inputs: {
                        url: {
                          type: "textarea",
                          placeholder: "URL",
                          initVal: link,
                          clickToSelect: true,
                          readOnly: true,
                          class: "h-50",
                        },
                      },
                      execFn: async () => {
                        return {
                          status: "success",
                          showNotification: false,
                        };
                      },
                    });
                  }, 250);
                  // this is flaky, no chaining for simple modals
                }

                return {
                  status: "success",
                  showNotification: false,
                };
              },
            });
          }}
        />
        <Show when={isAuthenticated()}>
          <Button
            text="save as new"
            onClick={() => {
              if (customThemes().length >= 20) {
                showNoticeNotification("Custom themes limit reached");
                return;
              }

              void addCustomTheme({
                name: "custom",
                colors: convertThemeToCustomColors(getTheme()),
              })
                .then(() => {
                  showSuccessNotification("Custom theme saved");
                })
                .catch((e: unknown) => {
                  showErrorNotification(
                    e instanceof Error
                      ? e.message
                      : "Failed to save custom theme",
                  );
                });
            }}
          />
        </Show>
        <Show when={!isAuthenticated()}>
          <Button
            text="save"
            onClick={() => {
              setConfig(
                "customThemeColors",
                convertThemeToCustomColors(getTheme()),
              );
              showSuccessNotification("Custom theme colors saved");
            }}
          />
        </Show>
      </div>
    </div>
  );

  createEffectOn(
    () => getConfig.customTheme,
    (custom) => {
      if (custom) {
        const colorsObj = convertCustomColorsToTheme(
          getConfig.customThemeColors,
        );
        setTheme({ ...colorsObj, name: "custom" });
      }
    },
  );

  return (
    <AnimatedModal
      id="Theme"
      title="Theme"
      modalClass="max-w-6xl"
      // CP-170 — closing without selecting reverts the previewed theme.
      beforeHide={() => void clearPreview()}
    >
      <div class="grid gap-4">
        {/* CP-174 — the preset / custom toggle. */}
        <div class="grid w-full grid-cols-2 gap-2">
          <Button
            onClick={() => setConfig("customTheme", false)}
            active={!getConfig.customTheme}
            text="preset"
          />
          <Button
            onClick={() => setConfig("customTheme", true)}
            active={getConfig.customTheme}
            text="custom"
          />
        </div>
        <AnimeSwitch
          exitBeforeEnter
          animeProps={{
            initial: {
              opacity: 0,
              duration: 125,
            },
            animate: {
              opacity: 1,
              duration: 125,
            },
            exit: {
              opacity: 0,
              duration: 125,
            },
          }}
        >
          <AnimeMatch when={!getConfig.customTheme}>
            <Presets />
          </AnimeMatch>
          <AnimeMatch when={getConfig.customTheme}>
            <Customs />
          </AnimeMatch>
        </AnimeSwitch>
      </div>
    </AnimatedModal>
  );
}

function CustomThemeButton(props: { theme: CustomTheme }): JSXElement {
  const themeColors = () => convertCustomColorsToTheme(props.theme.colors);

  return (
    <button
      type="button"
      style={{
        "--bg": themeColors().bg,
        "--main": themeColors().main,
        "--sub": themeColors().sub,
        "--text": themeColors().text,
      }}
      class={cn(
        "group/theme grid grid-cols-[auto_1fr_auto] justify-between p-0 ring-4 ring-transparent",
        "bg-(--bg) text-(--main)",
        "hover:ring-(--main)",
        "transition-[opacity,color,background,box-shadow] duration-125",
      )}
      onClick={() => {
        setConfig("customThemeColors", props.theme.colors);
      }}
      data-theme-id={props.theme._id}
    >
      <Button
        variant="text"
        icon={{
          icon: "ph:pencil-simple-bold",
          fixedWidth: true,
        }}
        class={cn(
          "mx-1 p-2",
          "[--themable-button-hover-text:var(--main)] [--themable-button-text:var(--sub)]",
          "opacity-0 group-hover/theme:opacity-100",
        )}
        onClick={(e) => {
          e.stopPropagation();
          showSimpleModal({
            title: "Update custom theme",
            schema: z.object({
              name: CustomThemeNameSchema,
              updateColors: z.boolean(),
            }),
            inputs: {
              name: {
                type: "text",
                initVal: replaceUnderscoresWithSpaces(props.theme.name),
                preprocess: normalizeName,
              },
              updateColors: {
                type: "checkbox",
                label: "Update custom theme to current colors",
              },
            },
            buttonText: "update",
            execFn: async ({ name, updateColors }) => {
              if (name === undefined) {
                return {
                  status: "error",
                  message: "Name is required",
                };
              }
              editCustomTheme({
                themeId: props.theme._id,
                name,
                colors: updateColors
                  ? convertThemeToCustomColors(getTheme())
                  : props.theme.colors,
              })
                .then(() => {
                  showSuccessNotification("Updated");
                })
                .catch((err: unknown) => {
                  showErrorNotification(
                    err instanceof Error
                      ? err.message
                      : "Failed to update custom theme",
                  );
                });

              return {
                status: "success",
                showNotification: false,
              };
            },
          });
        }}
      />
      <div>{replaceUnderscoresWithSpaces(props.theme.name)}</div>
      <Button
        variant="text"
        icon={{
          icon: "ph:trash-bold",
          fixedWidth: true,
        }}
        class={cn(
          "mx-1 p-2",
          "[--themable-button-hover-text:var(--main)] [--themable-button-text:var(--sub)]",
          "opacity-0 group-hover/theme:opacity-100",
        )}
        onClick={(e) => {
          e.stopPropagation();
          showSimpleModal({
            title: "Delete custom theme",
            text: `Are you sure you want to delete the custom theme "${replaceUnderscoresWithSpaces(props.theme.name)}"? This action cannot be undone.`,
            buttonText: "delete",
            execFn: async () => {
              void deleteCustomTheme({
                themeId: props.theme._id,
              });
              return {
                status: "success",
                message: "Custom theme deleted",
              };
            },
          });
        }}
      />
    </button>
  );
}

/** CP-174 — one of the ten custom colour pickers. */
function Picker(props: { color: ColorName }): JSXElement {
  let colorInputRef: HTMLInputElement | undefined = undefined;

  const text = (): string => {
    if (props.color === "bg") return "background";
    if (props.color === "main") return "main";
    if (props.color === "sub") return "sub";
    if (props.color === "subAlt") return "sub alt";
    if (props.color === "caret") return "caret";
    if (props.color === "text") return "text";
    if (props.color === "error") return "error";
    if (props.color === "errorExtra") return "extra error";
    if (props.color === "colorfulError") return "error";
    if (props.color === "colorfulErrorExtra") return "extra error";
    return "unknown";
  };

  // oxlint-disable-next-line solid/reactivity
  const debouncedInput = debounce(125, (e: InputEvent) => {
    const target = e.target as HTMLInputElement;
    const color = target.value;
    const key = props.color;

    updateThemeColor(key, color);
  });

  return (
    <div
      class="grid w-full grid-cols-[1fr_1fr_min-content] items-center gap-2"
      style={{
        "--picker-bg": getTheme().bg,
        "--picker-main": getTheme().main,
        "--picker-caret": getTheme().caret,
        "--picker-sub": getTheme().sub,
        "--picker-subAlt": getTheme().subAlt,
        "--picker-text": getTheme().text,
        "--picker-error": getTheme().error,
        "--picker-errorExtra": getTheme().errorExtra,
        "--picker-colorfulError": getTheme().colorfulError,
        "--picker-colorfulErrorExtra": getTheme().colorfulErrorExtra,
      }}
    >
      <div>{text()}</div>
      <input
        class="w-full"
        type="text"
        value={getTheme()[props.color]}
        onChange={(e) => {
          const value = e.currentTarget.value;
          if (!/^#([0-9A-Fa-f]{3}){1,2}$/.test(value)) {
            // invalid hex color
            e.currentTarget.value = getTheme()[props.color];
            return;
          }
          updateThemeColor(props.color, value);
        }}
      />
      <div class="grid">
        <input
          ref={(el) => (colorInputRef = el)}
          type="color"
          value={getTheme()[props.color]}
          onInput={debouncedInput}
          class="pointer-events-none col-[1/1] row-[1/1] m-0 h-full w-0 p-0 opacity-0"
        />
        <Button
          class={cn(
            `col-[1/1] row-[1/1]`,
            `bg-(--picker-${props.color}) text-(--picker-bg)`,
            `hover:bg-(--picker-text)`,
            props.color === "bg" && "bg-(--picker-subAlt) text-(--picker-text)",
            props.color === "subAlt" && "text-(--picker-text)",
          )}
          icon={{
            icon: "ph:palette-bold",
            fixedWidth: true,
          }}
          onClick={() => colorInputRef?.click()}
        />
      </div>
    </div>
  );
}

import {
  CustomBackgroundSchema,
  CustomBackgroundSizeSchema,
  RandomThemeSchema,
  ThemeName,
} from "@croco-calc/schemas/configs";
import { CustomTheme, CustomThemeNameSchema } from "@croco-calc/schemas/users";
import {
  createMemo,
  createResource,
  createSignal,
  For,
  JSXElement,
  Show,
} from "solid-js";
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
  applyCustomBackground,
  applyCustomBackgroundFilters,
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
import FileStorage from "../../utils/file-storage";
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
import { Slider } from "../common/Slider";
import SlimSelect from "../ui/SlimSelect";

/**
 * The theme modal (C9, CP-164 … CP-177).
 *
 * The upstream project split its theme picker in two: a search-and-swatches list in the
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
        <Separator />
        <ThemeExtras />
      </div>
    </AnimatedModal>
  );
}

/**
 * CP-177 / INV-116 — the theme-only settings that had no other home once the
 * settings page was deleted.
 *
 * `AutoSwitchTheme.tsx`, `CustomBackground.tsx` and
 * `CustomBackgroundFilters.tsx` were `SearchableSetting` rows on that page.
 * They are folded in here because their config keys are retained and they are
 * theme-only — they carry no upstream specificity of their own. The
 * `SearchableSetting` wrapper is gone with the page (there is no settings
 * search any more), so each one becomes a labelled row instead; the inputs and
 * the setters they call are unchanged.
 *
 * The whole block is collapsed behind a disclosure so the theme list, which is
 * what the modal is actually for, stays the first thing the user sees.
 */
function ThemeExtras(): JSXElement {
  const [isOpen, setIsOpen] = createSignal(false);

  const themeOptions = (): { text: string; value: string }[] =>
    ThemesList.map((theme) => ({
      text: replaceUnderscoresWithSpaces(theme.name),
      value: theme.name,
    }));

  return (
    <div class="grid gap-4">
      <Button
        variant="text"
        class="justify-self-start"
        text={isOpen() ? "hide extra options" : "show extra options"}
        icon={{
          icon: isOpen() ? "ph:caret-up-bold" : "ph:caret-down-bold",
          fixedWidth: true,
        }}
        onClick={() => setIsOpen(!isOpen())}
      />
      <Show when={isOpen()}>
        <div class="grid gap-6">
          {/* CP-177 — auto switch theme, with its light/dark pair. */}
          <ExtraRow
            title="auto switch theme"
            description="Automatically switch between the light and dark themes below when your system's colour scheme changes."
          >
            <div class="grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2">
              <Button
                active={!getConfig.autoSwitchTheme}
                onClick={() => {
                  if (!getConfig.autoSwitchTheme) return;
                  setConfig("autoSwitchTheme", false);
                }}
                text="off"
              />
              <Button
                active={getConfig.autoSwitchTheme}
                onClick={() => {
                  if (getConfig.autoSwitchTheme) return;
                  setConfig("autoSwitchTheme", true);
                }}
                text="on"
              />
            </div>
          </ExtraRow>
          <Show when={getConfig.autoSwitchTheme}>
            <div class="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div class="grid grid-cols-[7rem_1fr] items-center gap-2">
                <div>light</div>
                <SlimSelect
                  options={themeOptions()}
                  selected={getConfig.themeLight}
                  onChange={(value) =>
                    setConfig("themeLight", value as ThemeName)
                  }
                />
              </div>
              <div class="grid grid-cols-[7rem_1fr] items-center gap-2">
                <div>dark</div>
                <SlimSelect
                  options={themeOptions()}
                  selected={getConfig.themeDark}
                  onChange={(value) =>
                    setConfig("themeDark", value as ThemeName)
                  }
                />
              </div>
            </div>
          </Show>

          <Separator />

          {/* CP-177 — random theme. */}
          <ExtraRow
            title="random theme"
            description="Pick a new theme after every test. `fav` draws from your favourites, `light` and `dark` from themes with a light or dark background, and `custom` from your saved custom themes."
          >
            <div class="grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-2">
              <For each={RandomThemeSchema.options}>
                {(option) => (
                  <Button
                    active={getConfig.randomTheme === option}
                    text={option}
                    onClick={() => {
                      if (getConfig.randomTheme === option) return;
                      setConfig("randomTheme", option);
                    }}
                  />
                )}
              </For>
            </div>
          </ExtraRow>

          <Separator />

          <CustomBackgroundRow />

          <Separator />

          <CustomBackgroundFiltersRow />
        </div>
      </Show>
    </div>
  );
}

/** The label + description + inputs shape `SearchableSetting` used to render. */
function ExtraRow(props: {
  title: string;
  description: string;
  children: JSXElement;
}): JSXElement {
  return (
    <div class="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr] md:gap-8">
      <div>
        <div class="text-text">{props.title}</div>
        <div class="text-sub">{props.description}</div>
      </div>
      <div class="self-end">{props.children}</div>
    </div>
  );
}

/**
 * CP-177 — the custom background URL, the local-image upload and the size
 * buttons, lifted out of `custom-setting/CustomBackground.tsx`.
 */
function CustomBackgroundRow(): JSXElement {
  const [hasLocalBackground] = createResource(
    () => FileStorage.track("LocalBackgroundFile"),
    async () => FileStorage.hasFile("LocalBackgroundFile"),
  );

  const readFileAsDataURL = async (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  return (
    <ExtraRow
      title="custom background"
      description="A background image for the whole site. A local image is kept in this browser's storage and never uploaded, so it is lost if you clear that storage or switch browser."
    >
      <div class="grid gap-2 self-end">
        <Show
          when={!hasLocalBackground()}
          fallback={
            <Button
              icon={{ icon: "ph:trash-bold", fixedWidth: true }}
              text="remove local background"
              onClick={() => {
                void FileStorage.deleteFile("LocalBackgroundFile").then(() => {
                  void applyCustomBackground();
                });
              }}
            />
          }
        >
          <>
            <input
              type="file"
              id="themeModalCustomBackgroundUpload"
              accept="image/*"
              class="hidden"
              onChange={async (e) => {
                const fileInput = e.target;
                const file = fileInput.files?.[0];
                if (!file) return;

                if (!/image\/(jpeg|jpg|png|gif|webp)/.exec(file.type)) {
                  showNoticeNotification("Unsupported image format");
                  fileInput.value = "";
                  return;
                }

                const dataUrl = await readFileAsDataURL(file);
                await FileStorage.storeFile("LocalBackgroundFile", dataUrl);
                void applyCustomBackground();
                fileInput.value = "";
              }}
            />
            {/*
              A `<label for>` rather than a `Button`, because a file input can
              only be opened by a real user gesture on its own label.
            */}
            <label
              // oxlint-disable-next-line react/no-unknown-property
              for="themeModalCustomBackgroundUpload"
              class="inline-flex w-full cursor-pointer items-center justify-center gap-[0.5em] rounded border-0 bg-sub-alt p-[0.5em] text-text transition-[color,background,opacity] duration-125 hover:bg-text hover:text-bg"
            >
              <Icon icon="ph:file-arrow-up-bold" fixedWidth />
              use local image
            </label>
            <Separator text="or" />
            <input
              class="w-full"
              type="text"
              placeholder="image url"
              value={getConfig.customBackground}
              onChange={(e) => {
                const value = e.currentTarget.value.trim();
                if (value === getConfig.customBackground) return;
                const parsed = CustomBackgroundSchema.safeParse(value);
                if (!parsed.success) {
                  showErrorNotification(
                    "Background must be a URL ending in jpg, jpeg, png, gif or webp",
                  );
                  e.currentTarget.value = getConfig.customBackground;
                  return;
                }
                setConfig("customBackground", parsed.data);
              }}
            />
          </>
        </Show>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-2">
          <For each={CustomBackgroundSizeSchema.options}>
            {(option) => (
              <Button
                active={getConfig.customBackgroundSize === option}
                text={option}
                onClick={() => {
                  if (getConfig.customBackgroundSize === option) return;
                  setConfig("customBackgroundSize", option);
                }}
              />
            )}
          </For>
        </div>
      </div>
    </ExtraRow>
  );
}

/**
 * CP-177 — the four background filter sliders, lifted out of
 * `custom-setting/CustomBackgroundFilters.tsx`. `onEveryChange` repaints live
 * while dragging; `onChange` is what actually persists.
 */
function CustomBackgroundFiltersRow(): JSXElement {
  let refBlur: HTMLInputElement | undefined = undefined;
  let refBrightness: HTMLInputElement | undefined = undefined;
  let refSaturate: HTMLInputElement | undefined = undefined;
  let refOpacity: HTMLInputElement | undefined = undefined;

  const refValues = (): [number, number, number, number] | undefined => {
    if (!refBlur || !refBrightness || !refSaturate || !refOpacity) {
      return undefined;
    }
    return [
      Number(refBlur.value),
      Number(refBrightness.value),
      Number(refSaturate.value),
      Number(refOpacity.value),
    ];
  };

  const commit = (index: 0 | 1 | 2 | 3, value: number): void => {
    const current = getConfig.customBackgroundFilter;
    if (value === current[index]) return;
    const next: [number, number, number, number] = [
      current[0],
      current[1],
      current[2],
      current[3],
    ];
    next[index] = value;
    setConfig("customBackgroundFilter", next);
  };

  const filters = [
    { label: "blur", index: 0, min: 0, max: 5, step: 0.1 },
    { label: "brightness", index: 1, min: 0, max: 2, step: 0.1 },
    { label: "saturate", index: 2, min: 0, max: 2, step: 0.1 },
    { label: "opacity", index: 3, min: 0, max: 1, step: 0.1 },
  ] as const;

  const refSetters = [
    (el: HTMLInputElement) => (refBlur = el),
    (el: HTMLInputElement) => (refBrightness = el),
    (el: HTMLInputElement) => (refSaturate = el),
    (el: HTMLInputElement) => (refOpacity = el),
  ];

  return (
    <div class="grid gap-2">
      <div class="text-text">custom background filters</div>
      <div class="grid grid-cols-1 gap-8 md:grid-cols-2">
        <For each={filters}>
          {(filter) => (
            <div class="grid grid-cols-[7rem_1fr] items-center gap-2">
              <div>{filter.label}</div>
              <Slider
                ref={refSetters[filter.index]}
                min={filter.min}
                max={filter.max}
                step={filter.step}
                text={(value) => value.toFixed(1)}
                value={getConfig.customBackgroundFilter[filter.index]}
                onEveryChange={() => applyCustomBackgroundFilters(refValues())}
                onChange={(value) => commit(filter.index, value)}
              />
            </div>
          )}
        </For>
      </div>
    </div>
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

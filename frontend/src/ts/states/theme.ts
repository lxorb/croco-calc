import { createSignal } from "solid-js";
import { ColorName, Theme } from "../constants/themes";
import { ThemeName } from "@croco-calc/schemas/configs";

export type ThemeIdentifier = ThemeName | "custom";
const defaultTheme: Theme & { name: ThemeIdentifier } = {
  name: "croco",
  bg: "#4a5b6e",
  main: "#f8cdc6",
  caret: "#9ec1cc",
  sub: "#9ec1cc",
  subAlt: "#425366",
  text: "#f5efee",
  error: "#c9465e",
  errorExtra: "#c9465e",
  colorfulError: "#c9465e",
  colorfulErrorExtra: "#c9465e",
};

export const [getTheme, setTheme] = createSignal(defaultTheme);

export function updateThemeColor(key: ColorName, color: string): void {
  setTheme((prev) => ({
    ...prev,
    [key]: color,
  }));
}

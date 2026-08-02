/**
 * Example usage in root or frontend:
 * pnpm check-assets (npm run check-assets)
 *
 * Reduced from monkeytype's version (INV-128a): croco calc has no word lists,
 * quotes, keyboard layouts or sound packs, so themes are the only asset class
 * left to validate.
 */

import * as fs from "fs";
import { ThemeName } from "@croco-calc/schemas/configs";
import { themes, ThemeSchema, ThemesList } from "../src/ts/constants/themes";
import { z } from "zod";
import * as ghCore from "@actions/core";

const stepSummary =
  process.env["GITHUB_STEP_SUMMARY"] !== undefined ? ghCore.summary : undefined;

class Problems<K extends string, T extends string> {
  private type: string;
  private labels: Record<T, string>;
  private problems: Partial<Record<K | T, string[]>> = {};

  constructor(type: string, labels: Record<T, string>) {
    this.type = type;
    this.labels = labels;
  }

  public add(key: K | T, problem: string): void {
    this.problems[key] = [...(this.problems[key] ?? []), problem];
  }

  public addValidation(
    key: K | T,
    validationResult: z.SafeParseReturnType<unknown, unknown>,
  ): void {
    if (validationResult.success) return;
    validationResult.error.errors.forEach((e) =>
      this.add(key, `${e.path.join(".")}: ${e.message}`),
    );
  }

  public hasError(): boolean {
    return Object.keys(this.problems).length !== 0;
  }

  public toString(): string {
    stepSummary?.addHeading(`${this.type} Checks`, 2);
    if (!this.hasError()) {
      stepSummary?.addRaw("✅ all checks passed").addEOL();
      return `${this.type} are all \u001b[32mvalid\u001b[0m`;
    }

    Object.entries(this.problems).forEach(([key, problems]) => {
      let label: string = this.labels[key as T] ?? `${key}`;
      stepSummary
        ?.addRaw(`❌ ${label}`)
        .addEOL()
        .addList(problems as string[])
        .addEOL();
    });

    return `${this.type} are \u001b[31minvalid\u001b[0m\n${Object.entries(
      this.problems,
    )
      .map(([key, problems]) => {
        let label: string = this.labels[key as T] ?? `${key}`;

        return `${label}:\n ${(problems as string[])
          .map((error) => `\t- ${error}`)
          .join("\n")}`;
      })
      .join("\n")}`;
  }
}

async function validateThemes(): Promise<void> {
  const problems = new Problems<ThemeName, "_additional">("Themes", {
    _additional:
      "Theme files present but missing in frontend/src/ts/constants/themes.ts",
  });

  //no missing files
  const themeFiles = fs.readdirSync("./static/themes");

  //missing or additional theme files (mismatch in hasCss)
  ThemesList.filter(
    (it) => themeFiles.includes(`${it.name}.css`) !== (it.hasCss ?? false),
  ).forEach((it) =>
    problems.add(
      it.name,
      `${it.hasCss ? "missing" : "additional"} file frontend/static/themes/${it.name}.css`,
    ),
  );

  //additional theme files
  themeFiles
    .filter((it) => !ThemesList.some((theme) => `${theme.name}.css` === it))
    .forEach((it) => problems.add("_additional", it));

  //validate theme colors are valid hex colors, not covered by typescipt
  const themeNameSchema = z.string().regex(/^[a-z0-9_]+$/, {
    message:
      "theme name can only contain lowercase letters, digits and underscore",
  });
  for (const name of Object.keys(themes)) {
    const theme = themes[name as ThemeName];
    problems.addValidation(name as ThemeName, ThemeSchema.safeParse(theme));
    problems.addValidation(name as ThemeName, themeNameSchema.safeParse(name));
  }

  console.log(problems.toString());

  if (problems.hasError()) {
    throw new Error("themes with errors");
  }
}

async function main(): Promise<void> {
  const results = await Promise.allSettled([validateThemes()]);

  await stepSummary?.write();

  if (results.find((it) => it.status === "rejected") !== undefined) {
    throw new Error("One or more checks failed.");
  }
}
void main();

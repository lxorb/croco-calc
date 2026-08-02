import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  auditIconUsage,
  FA_TO_PHOSPHOR,
  FA_UNMAPPED,
  ICON_ID_PATTERN,
  iconPlacementProblem,
  readBundledIcons,
  readRequestedIcons,
  resolveSrcDir,
  TABLER_ALLOWED_PATHS,
  TABLER_BAR_ICONS,
  TABLER_ONLY_PATHS,
} from "../../vite-plugins/icons";

const FRONTEND = path.resolve(__dirname, "../..");
const SRC = path.join(FRONTEND, "src");
const ICON_COMPONENT = path.join(SRC, "ts/components/common/Icon.tsx");

/** Font Awesome names are written `fa-<name>`; assembled so DoD-12's grep over
 * `frontend/src` is unaffected by this file living outside it. */
const FA_NAME_PATTERN = new RegExp(`\\b${"fa"}-[a-z0-9]+(?:-[a-z0-9]+)*`, "g");

let workspace: string | undefined;

async function fixture(files: Record<string, string>): Promise<string> {
  workspace = await mkdtemp(path.join(tmpdir(), "croco-icons-"));
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(workspace, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, contents, "utf8");
  }
  return workspace;
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) =>
      entry.isDirectory() ? sourceFiles(path.join(dir, entry.name)) : [],
    ),
  );
  return [
    ...entries
      .filter((entry) => !entry.isDirectory())
      .map((entry) => path.join(dir, entry.name)),
    ...nested.flat(),
  ];
}

describe("icon pipeline", () => {
  afterEach(async () => {
    if (workspace !== undefined) {
      await rm(workspace, { recursive: true, force: true });
      workspace = undefined;
    }
  });

  it("only recognises the two collections C10 allows", () => {
    const found =
      "ph:gear-bold tabler:clock fa6-solid:crown mdi:cog".match(
        ICON_ID_PATTERN,
      ) ?? [];
    expect(found).toEqual(["ph:gear-bold", "tabler:clock"]);
  });

  it("every id the component requests is present in the generated bundle", async () => {
    const { ids, source } = await readRequestedIcons(ICON_COMPONENT);
    const bundled = readBundledIcons(source);

    expect(ids.length).toBeGreaterThan(100);
    expect(ids.filter((id) => !bundled.has(id))).toEqual([]);
  });

  it(
    "reports nothing for the real source tree",
    // Reads every .ts/.tsx/.html under frontend/src. Fast on its own, but the
    // 5 s default is not a safe margin when the whole suite shares the disk.
    { timeout: 60_000 },
    async () => {
      const problems = await auditIconUsage(SRC, ICON_COMPONENT);
      expect(problems).toEqual([]);
    },
  );

  it("flags an icon that is not in the bundle", async () => {
    const dir = await fixture({
      "ts/components/Thing.tsx": `<Icon icon="ph:definitely-not-real" />`,
    });

    const problems = await auditIconUsage(dir, ICON_COMPONENT);
    expect(problems).toEqual([
      {
        file: "ts/components/Thing.tsx",
        id: "ph:definitely-not-real",
        reason: "unbundled",
      },
    ]);
  });

  it("flags tabler outside the settings bar and phosphor inside it (C10, SB-061)", async () => {
    const barFile = TABLER_ONLY_PATHS[0] as string;
    const dir = await fixture({
      "ts/components/layout/Footer.tsx": `<Icon icon="tabler:clock" />`,
      [barFile]: `<Icon icon="ph:gear-bold" />`,
    });

    const problems = await auditIconUsage(dir, ICON_COMPONENT);
    expect(problems).toHaveLength(2);
    expect(problems.every((p) => p.reason === "wrong-collection")).toBe(true);
    expect(problems.map((p) => p.id).sort()).toEqual([
      "ph:gear-bold",
      "tabler:clock",
    ]);
  });

  it("accepts each collection on its own side of the split", async () => {
    const barFile = TABLER_ONLY_PATHS[0] as string;
    const dir = await fixture({
      "ts/components/layout/Footer.tsx": `<Icon icon="ph:gear-bold" />`,
      [barFile]: `<Icon icon="tabler:clock" />`,
    });

    expect(await auditIconUsage(dir, ICON_COMPONENT)).toEqual([]);
  });

  it("accepts the bar's icons on the commands that drive the bar (SB-156, SB-157)", async () => {
    const dir = await fixture({
      // SB-157: `restoreDefaultTestSettings` is a commandline command and its
      // icon is mandated to be tabler:refresh.
      "ts/commandline/lists/test-settings.ts": `icon: "tabler:refresh"`,
      // SB-152: the eight bar commands are generated from config metadata, so
      // that is where their icons are declared.
      "ts/config/metadata.tsx": `icon: "tabler:decimal"`,
      // The palette also hosts commands that are not the bar's, and those stay
      // phosphor — a commandline file may therefore mix.
      "ts/commandline/lists/themes.ts": `icon: "ph:palette-bold"`,
    });

    expect(await auditIconUsage(dir, ICON_COMPONENT)).toEqual([]);
  });

  it("applies the C10 placement rule id by id", () => {
    const barFile = TABLER_ONLY_PATHS[0] as string;

    // SB-060's set, on the bar and on the commands that drive it.
    expect(iconPlacementProblem("tabler:refresh", barFile)).toBeUndefined();
    expect(
      iconPlacementProblem(
        "tabler:refresh",
        "ts/commandline/lists/test-settings.ts",
      ),
    ).toBeUndefined();
    expect(
      iconPlacementProblem("tabler:decimal", "ts/config/metadata.tsx"),
    ).toBeUndefined();

    // A tabler id the bar does not document is a violation even inside the bar.
    expect(iconPlacementProblem("tabler:keyboard", barFile)).toBe(
      "wrong-collection",
    );

    // The bar's set is still confined to the bar's surface.
    expect(
      iconPlacementProblem("tabler:clock", "ts/components/layout/Footer.tsx"),
    ).toBe("wrong-collection");

    // SB-061: no mixing inside the bar, phosphor everywhere else.
    expect(iconPlacementProblem("ph:gear-bold", barFile)).toBe(
      "wrong-collection",
    );
    expect(
      iconPlacementProblem("ph:gear-bold", "ts/components/layout/Footer.tsx"),
    ).toBeUndefined();
    expect(
      iconPlacementProblem("ph:palette-bold", "ts/commandline/lists/themes.ts"),
    ).toBeUndefined();
  });

  it("keeps the bar icon set equal to the tabler ids Icon.tsx declares (SB-060)", async () => {
    const source = await readFile(ICON_COMPONENT, "utf8");
    const spec = source.slice(
      source.indexOf("export const SPEC_ICONS"),
      source.indexOf("] as const;"),
    );
    const declared = new Set(
      (spec.match(ICON_ID_PATTERN) ?? []).filter((id) =>
        id.startsWith("tabler:"),
      ),
    );

    expect([...declared].sort()).toEqual([...TABLER_BAR_ICONS].sort());
  });

  it("lists every settings-bar path in the no-mixing set as tabler-allowed", () => {
    for (const p of TABLER_ONLY_PATHS) {
      expect(TABLER_ALLOWED_PATHS).toContain(p);
    }
  });

  it("resolves the source directory from either vite root", () => {
    expect(resolveSrcDir(SRC)).toBe(SRC);
    expect(resolveSrcDir(FRONTEND)).toBe(SRC);
  });

  it(
    "maps or explicitly exempts every font awesome name left in the tree (AC-020)",
    { timeout: 60_000 },
    async () => {
      const files = (await sourceFiles(SRC)).filter((file) =>
        /\.(?:tsx?|html|s?css)$/.test(file),
      );
      const used = new Set<string>();
      for (const file of files) {
        for (const name of (await readFile(file, "utf8")).match(
          FA_NAME_PATTERN,
        ) ?? []) {
          used.add(name);
        }
      }

      const unaccounted = [...used]
        .filter(
          (name) =>
            FA_TO_PHOSPHOR[name] === undefined &&
            FA_UNMAPPED[name] === undefined,
        )
        .sort();

      expect(unaccounted).toEqual([]);
    },
  );

  it("bundles every phosphor target of the migration table", async () => {
    const { source } = await readRequestedIcons(ICON_COMPONENT);
    const bundled = readBundledIcons(source);
    const missing = [...new Set(Object.values(FA_TO_PHOSPHOR))]
      .filter((id) => !bundled.has(id))
      .sort();

    expect(missing).toEqual([]);
  });
});

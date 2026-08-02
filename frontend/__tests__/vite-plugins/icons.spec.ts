import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  auditIconUsage,
  ICON_ID_PATTERN,
  readBundledIcons,
  readRequestedIcons,
  TABLER_ONLY_PATHS,
} from "../../vite-plugins/icons";

const FRONTEND = path.resolve(__dirname, "../..");
const ICON_COMPONENT = path.join(FRONTEND, "src/ts/components/common/Icon.tsx");

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

  it("reports nothing for the real source tree", async () => {
    const problems = await auditIconUsage(
      path.join(FRONTEND, "src"),
      ICON_COMPONENT,
    );
    expect(problems).toEqual([]);
  });

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
});

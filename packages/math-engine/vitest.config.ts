import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The >=100 000-task property tests of ME-023 / ME-030 / ME-055 are slow by
    // design; the default 5 s per-test timeout is not enough for them.
    testTimeout: 120_000,
    coverage: {
      include: ["**/*.ts"],
    },
  },
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("CodeMirror dependencies", () => {
  it("resolves a single @codemirror/state version", () => {
    const lockfile = readFileSync(resolve("pnpm-lock.yaml"), "utf8");
    const versions = new Set(
      [...lockfile.matchAll(/^  '@codemirror\/state@([^']+)':$/gm)].map(
        ([, version]) => version,
      ),
    );

    expect(versions.size).toBe(1);
  });
});

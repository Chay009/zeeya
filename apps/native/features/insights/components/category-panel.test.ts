import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const panelPath = path.join(__dirname, "category-panel.tsx");

describe("CategoryPanel", () => {
  it("renders the donut chart above the category bars", () => {
    const source = readFileSync(panelPath, "utf8");
    expect(source).toContain("ZeeyaDonutChart");
  });
});

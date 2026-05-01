import { describe, expect, it } from "vitest";

import {
  isUntitledMdFileName,
  mdFileNameFromPdfFileName,
  sanitizeSuggestedPdfFileName,
} from "./document-filename";

describe("document filename helpers", () => {
  it("detects generated untitled markdown filenames", () => {
    expect(isUntitledMdFileName("untitled-20260501-0824.md")).toBe(true);
    expect(isUntitledMdFileName("project-plan.md")).toBe(false);
    expect(isUntitledMdFileName("untitled.md")).toBe(false);
  });

  it("sanitizes AI suggestions into safe PDF filenames", () => {
    expect(sanitizeSuggestedPdfFileName("  Q2 Roadmap / Launch Plan!!.pdf  ")).toBe(
      "q2-roadmap-launch-plan.pdf",
    );
    expect(sanitizeSuggestedPdfFileName("客户需求分析")).toBe("客户需求分析.pdf");
    expect(sanitizeSuggestedPdfFileName("...")).toBeNull();
  });

  it("keeps suggested PDF filenames short", () => {
    const fileName = sanitizeSuggestedPdfFileName(
      "Comprehensive Supabase Authentication And Markdown History Architecture Implementation Guide.pdf",
    );

    expect(fileName).toBe("comprehensive-supabase-authentication-and.pdf");
    expect(fileName?.length).toBeLessThanOrEqual(48);
  });

  it("converts PDF filenames back to markdown filenames", () => {
    expect(mdFileNameFromPdfFileName("q2-roadmap.pdf")).toBe("q2-roadmap.md");
    expect(mdFileNameFromPdfFileName("q2-roadmap")).toBe("q2-roadmap.md");
  });
});

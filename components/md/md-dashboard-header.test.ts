import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Markdown dashboard history controls", () => {
  const source = readFileSync(
    "components/md/md-dashboard-header.tsx",
    "utf8",
  );

  it("places accessible Undo and Redo controls after the PDF file name", () => {
    const fileNameInput = source.indexOf('aria-label="PDF file name"');
    const undoButton = source.indexOf('aria-label="Undo"');
    const redoButton = source.indexOf('aria-label="Redo"');

    expect(fileNameInput).toBeGreaterThan(-1);
    expect(undoButton).toBeGreaterThan(fileNameInput);
    expect(redoButton).toBeGreaterThan(undoButton);
    expect(source).toContain("<Undo2");
    expect(source).toContain("<Redo2");
  });

  it("disables each control from CodeMirror history availability", () => {
    expect(source).toContain("disabled={!canUndo}");
    expect(source).toContain("disabled={!canRedo}");
    expect(source).toContain("onClick={onUndo}");
    expect(source).toContain("onClick={onRedo}");
  });
});

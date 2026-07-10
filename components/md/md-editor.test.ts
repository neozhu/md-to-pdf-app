import { readFileSync } from "node:fs";
import { history } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { getEditorHistoryState } from "./md-editor";

describe("Markdown editor history", () => {
  it("reports native CodeMirror undo and redo availability", () => {
    const initial = EditorState.create({ doc: "a", extensions: [history()] });
    expect(getEditorHistoryState(initial)).toEqual({
      canUndo: false,
      canRedo: false,
    });

    const edited = initial.update({
      changes: { from: 1, insert: "b" },
      userEvent: "input.type",
    }).state;
    expect(getEditorHistoryState(edited)).toEqual({
      canUndo: true,
      canRedo: false,
    });
  });

  it("exposes native undo and redo commands through its ref", () => {
    const source = readFileSync("components/md/md-editor.tsx", "utf8");
    expect(source).toContain("React.forwardRef<MdEditorHandle");
    expect(source).toContain("undo: () =>");
    expect(source).toContain("redo: () =>");
    expect(source).toContain("undo(editorRef.current.view)");
    expect(source).toContain("redo(editorRef.current.view)");
  });
});

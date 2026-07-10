"use client";

import * as React from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import type { EditorState } from "@codemirror/state";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

export type EditorHistoryState = {
  canUndo: boolean;
  canRedo: boolean;
};

export type MdEditorHandle = {
  undo: () => boolean;
  redo: () => boolean;
};

type MdEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onHistoryStateChange?: (state: EditorHistoryState) => void;
  className?: string;
};

export function getEditorHistoryState(state: EditorState): EditorHistoryState {
  return {
    canUndo: undoDepth(state) > 0,
    canRedo: redoDepth(state) > 0,
  };
}

export const MdEditor = React.forwardRef<MdEditorHandle, MdEditorProps>(function MdEditor({
  value,
  onChange,
  onHistoryStateChange,
  className,
}, ref) {
  const { resolvedTheme } = useTheme();
  const editorRef = React.useRef<ReactCodeMirrorRef>(null);
  const lastHistoryStateRef = React.useRef<EditorHistoryState | null>(null);

  const notifyHistoryState = React.useCallback(
    (state: EditorState) => {
      const next = getEditorHistoryState(state);
      const previous = lastHistoryStateRef.current;
      if (
        previous?.canUndo === next.canUndo &&
        previous.canRedo === next.canRedo
      ) {
        return;
      }
      lastHistoryStateRef.current = next;
      onHistoryStateChange?.(next);
    },
    [onHistoryStateChange],
  );

  const onCreateEditor = React.useCallback(
    (view: EditorView) => notifyHistoryState(view.state),
    [notifyHistoryState],
  );
  const onUpdate = React.useCallback(
    (update: ViewUpdate) => notifyHistoryState(update.state),
    [notifyHistoryState],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      undo: () =>
        editorRef.current?.view ? undo(editorRef.current.view) : false,
      redo: () =>
        editorRef.current?.view ? redo(editorRef.current.view) : false,
    }),
    [],
  );

  React.useEffect(
    () => () =>
      onHistoryStateChange?.({ canUndo: false, canRedo: false }),
    [onHistoryStateChange],
  );

  return (
    <div className={cn("h-full", className)}>
      <CodeMirror
        ref={editorRef}
        value={value}
        height="100%"
        theme={resolvedTheme === "dark" ? vscodeDark : vscodeLight}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
        }}
        extensions={[markdown({ codeLanguages: languages })]}
        onChange={onChange}
        onCreateEditor={onCreateEditor}
        onUpdate={onUpdate}
      />
    </div>
  );
});

MdEditor.displayName = "MdEditor";


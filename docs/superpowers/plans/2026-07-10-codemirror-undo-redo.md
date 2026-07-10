# CodeMirror Undo/Redo Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add accessible Undo and Redo icon controls beside the PDF file name input using the active CodeMirror editor's native session history.

**Architecture:** `MdEditor` owns CodeMirror APIs and exposes a small imperative handle plus history availability callbacks. `MdDashboard` coordinates the editor and header, while `MdDashboardHeader` remains a presentational component that renders disabled-aware buttons.

**Tech Stack:** React 19, TypeScript, CodeMirror 6, `@uiw/react-codemirror`, Lucide React, Vitest, Next.js 16.

## Global Constraints

- Keep CodeMirror's existing keyboard shortcuts.
- Cover only the active document's current editor session; do not persist history across document switches or reloads.
- Accepted AI edits must enter the same native CodeMirror history.
- Keep the existing preview, dirty tracking, autosave, Supabase schema, and API behavior.
- Add no dependency and no parallel React snapshot stack.

---

## File Map

- Modify `components/md/md-editor.tsx`: own CodeMirror history commands and expose a stable editor-history interface.
- Create `components/md/md-editor.test.ts`: verify native history availability and the imperative API contract.
- Modify `components/md/md-dashboard.tsx`: connect the active editor handle and availability state to the header.
- Modify `components/md/md-dashboard-header.tsx`: render the two accessible icon buttons immediately after the file name input.
- Modify `components/md/md-dashboard.test.ts`: verify dashboard wiring.
- Create `components/md/md-dashboard-header.test.ts`: verify placement, accessibility, icons, and disabled wiring.

---

### Task 1: Encapsulate CodeMirror History in `MdEditor`

**Files:**
- Modify: `components/md/md-editor.tsx:1-41`
- Create: `components/md/md-editor.test.ts`

**Interfaces:**
- Consumes: CodeMirror `undo`, `redo`, `undoDepth`, `redoDepth`; `ReactCodeMirrorRef`.
- Produces:

```ts
export type EditorHistoryState = {
  canUndo: boolean;
  canRedo: boolean;
};

export type MdEditorHandle = {
  undo: () => boolean;
  redo: () => boolean;
};

export function getEditorHistoryState(state: EditorState): EditorHistoryState;
```

- [ ] **Step 1: Write the failing history-state and interface tests**

Create `components/md/md-editor.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
pnpm test -- components/md/md-editor.test.ts
```

Expected: FAIL because `getEditorHistoryState` and `MdEditorHandle` do not exist.

- [ ] **Step 3: Implement the minimal editor-history API**

Update `components/md/md-editor.tsx` to use these imports and interfaces:

```ts
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import type { EditorState } from "@codemirror/state";

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
```

Replace the function declaration with a forwarded ref. Keep the existing CodeMirror options unchanged:

```tsx
export const MdEditor = React.forwardRef<MdEditorHandle, MdEditorProps>(
  function MdEditor(
    { value, onChange, onHistoryStateChange, className },
    ref,
  ) {
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
          onCreateEditor={(view) => notifyHistoryState(view.state)}
          onUpdate={(update) => notifyHistoryState(update.state)}
        />
      </div>
    );
  },
);

MdEditor.displayName = "MdEditor";
```

- [ ] **Step 4: Run targeted tests and TypeScript**

Run:

```bash
pnpm test -- components/md/md-editor.test.ts
pnpm exec tsc --noEmit
```

Expected: the new tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the editor API**

```bash
git add components/md/md-editor.tsx components/md/md-editor.test.ts
git commit -m "feat: expose CodeMirror undo redo history"
```

---

### Task 2: Add Header Controls and Dashboard Wiring

**Files:**
- Modify: `components/md/md-dashboard-header.tsx:3-268`
- Modify: `components/md/md-dashboard.tsx:1-1031`
- Modify: `components/md/md-dashboard.test.ts`
- Create: `components/md/md-dashboard-header.test.ts`

**Interfaces:**
- Consumes: `MdEditorHandle` and `EditorHistoryState` from Task 1.
- Produces these new `MdDashboardHeaderProps` members:

```ts
canUndo: boolean;
canRedo: boolean;
onUndo: () => void;
onRedo: () => void;
```

- [ ] **Step 1: Write failing header and dashboard wiring tests**

Create `components/md/md-dashboard-header.test.ts`:

```ts
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
    expect(source).toContain("<RotateCcw");
    expect(source).toContain("<RotateCw");
  });

  it("disables each control from CodeMirror history availability", () => {
    expect(source).toContain("disabled={!canUndo}");
    expect(source).toContain("disabled={!canRedo}");
    expect(source).toContain("onClick={onUndo}");
    expect(source).toContain("onClick={onRedo}");
  });
});
```

Append this test to `components/md/md-dashboard.test.ts`:

```ts
it("wires CodeMirror history state and commands into the header", () => {
  expect(source).toContain("React.useRef<MdEditorHandle>(null)");
  expect(source).toContain("onHistoryStateChange={setEditorHistoryState}");
  expect(source).toContain("canUndo={editorHistoryState.canUndo}");
  expect(source).toContain("canRedo={editorHistoryState.canRedo}");
  expect(source).toContain("onUndo={onUndo}");
  expect(source).toContain("onRedo={onRedo}");
});
```

- [ ] **Step 2: Run the component tests and verify RED**

Run:

```bash
pnpm test -- components/md/md-dashboard-header.test.ts components/md/md-dashboard.test.ts
```

Expected: FAIL because the header props, icons, buttons, editor ref, and wiring are absent.

- [ ] **Step 3: Implement header props and icon controls**

In `components/md/md-dashboard-header.tsx`, add `RotateCcw` and `RotateCw` to the Lucide import. Add these props to the type and destructuring:

```ts
canUndo: boolean;
canRedo: boolean;
onUndo: () => void;
onRedo: () => void;
```

Immediately after the `Input` whose aria-label is `PDF file name`, add:

```tsx
<div
  className="flex items-center gap-1"
  role="group"
  aria-label="Editor history controls"
>
  <Button
    type="button"
    variant="outline"
    size="icon"
    disabled={!canUndo}
    onClick={onUndo}
    aria-label="Undo"
    title="Undo"
  >
    <RotateCcw className="size-4" />
  </Button>
  <Button
    type="button"
    variant="outline"
    size="icon"
    disabled={!canRedo}
    onClick={onRedo}
    aria-label="Redo"
    title="Redo"
  >
    <RotateCw className="size-4" />
  </Button>
</div>
```

- [ ] **Step 4: Wire the active editor through `MdDashboard`**

Change the editor import to:

```ts
import {
  MdEditor,
  type EditorHistoryState,
  type MdEditorHandle,
} from "./md-editor";
```

Near the existing refs and Markdown state, add:

```ts
const editorRef = React.useRef<MdEditorHandle>(null);
const [editorHistoryState, setEditorHistoryState] =
  React.useState<EditorHistoryState>({
    canUndo: false,
    canRedo: false,
  });

const onUndo = React.useCallback(() => {
  editorRef.current?.undo();
}, []);

const onRedo = React.useCallback(() => {
  editorRef.current?.redo();
}, []);
```

Pass these props to `MdDashboardHeader`:

```tsx
canUndo={editorHistoryState.canUndo}
canRedo={editorHistoryState.canRedo}
onUndo={onUndo}
onRedo={onRedo}
```

Add the same ref and callback to both desktop and mobile `MdEditor` render paths:

```tsx
ref={editorRef}
onHistoryStateChange={setEditorHistoryState}
```

Keep `key={`editor-${history.activeDocId}`}`, `value`, and `onChange` unchanged so switching documents resets the CodeMirror instance and accepted AI values remain native external transactions.

- [ ] **Step 5: Run targeted tests and static checks**

Run:

```bash
pnpm test -- components/md/md-editor.test.ts components/md/md-dashboard-header.test.ts components/md/md-dashboard.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint components/md/md-editor.tsx components/md/md-editor.test.ts components/md/md-dashboard.tsx components/md/md-dashboard.test.ts components/md/md-dashboard-header.tsx components/md/md-dashboard-header.test.ts
```

Expected: all targeted tests pass; TypeScript and ESLint exit 0.

- [ ] **Step 6: Run full regression and production verification**

Run:

```bash
pnpm test
pnpm build
git diff --check
```

Expected: the full test suite passes, Next.js production build exits 0, and `git diff --check` reports no whitespace errors.

- [ ] **Step 7: Commit the UI integration**

```bash
git add components/md/md-dashboard.tsx components/md/md-dashboard.test.ts components/md/md-dashboard-header.tsx components/md/md-dashboard-header.test.ts
git commit -m "feat: add undo redo editor controls"
```

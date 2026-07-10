# CodeMirror Undo/Redo Controls Design

## Goal

Add Undo and Redo icon buttons beside the PDF file name input. The controls use the active CodeMirror editor's native history and cover the current document's current editing session.

## Scope

- Keep CodeMirror's existing keyboard shortcuts.
- Include typing, paste, deletion, formatting commands, and accepted AI edits in the same history.
- Reset available history when the active document changes or the editor is unmounted.
- Keep the existing autosave and Supabase document storage behavior.
- Do not persist undo history across document switches, reloads, or browser sessions.
- Do not add a second React snapshot stack or a database revision table.

## Component Design

### `MdEditor`

Convert the component to `forwardRef` and expose a small imperative handle:

```ts
type MdEditorHandle = {
  undo: () => boolean;
  redo: () => boolean;
};
```

The component retains ownership of CodeMirror APIs. It uses CodeMirror's `undo`, `redo`, `undoDepth`, and `redoDepth` commands and reports availability through an `onHistoryStateChange` callback:

```ts
type EditorHistoryState = {
  canUndo: boolean;
  canRedo: boolean;
};
```

History state is emitted after editor creation and after CodeMirror updates. Duplicate state notifications may be suppressed inside `MdEditor` if needed to avoid unnecessary parent renders.

### `MdDashboard`

Hold the `MdEditorHandle` ref and the current `EditorHistoryState`. Pass `undo`, `redo`, `canUndo`, and `canRedo` to the header.

Both desktop and mobile editor render paths receive the same ref and history callback. The existing `key` based on `activeDocId` remains, so switching documents creates a fresh CodeMirror instance and resets the buttons.

Undo and Redo changes continue through the existing CodeMirror `onChange` callback. Therefore preview updates, dirty tracking, and debounced autosave require no separate integration.

### `MdDashboardHeader`

Place a compact pair of icon buttons immediately after the input with `aria-label="PDF file name"`.

- Undo uses Lucide `RotateCcw`, `aria-label="Undo"`, and is disabled when `canUndo` is false.
- Redo uses Lucide `RotateCw`, `aria-label="Redo"`, and is disabled when `canRedo` is false.
- Buttons use the existing `Button` component with the icon size variant and match adjacent header controls.
- Use `title="Undo"` and `title="Redo"`; keyboard shortcuts remain discoverable through standard editor behavior.

## Data Flow

1. A CodeMirror transaction changes the document.
2. `MdEditor` forwards the text through the existing `onChange` callback.
3. `MdEditor` recalculates undo and redo depth and reports button availability.
4. `MdDashboard` updates Markdown state and header props.
5. Clicking a header button invokes the corresponding method on the active editor ref.
6. The resulting CodeMirror transaction repeats the existing update and autosave flow.

Accepted AI output is applied through the controlled editor value. The installed `@uiw/react-codemirror` wrapper dispatches that external value change to CodeMirror, so it remains part of native history and can be undone as one transaction.

## Failure and Edge Behavior

- If no editor is mounted, both buttons are disabled and handlers do nothing.
- Undo at depth zero and Redo at depth zero do nothing.
- Switching documents resets both buttons until the new editor reports its state.
- On mobile Preview mode, the editor is unmounted, so both controls are disabled.
- Autosave failures continue to use the existing toast behavior; undo/redo adds no new persistence failure mode.

## Testing

- `MdEditor` exposes commands that invoke CodeMirror Undo and Redo.
- History availability reflects `undoDepth` and `redoDepth` after updates.
- Header renders both accessible icon buttons beside the file name input and respects disabled state.
- Dashboard wires the editor handle and history state into the header.
- Accepted AI changes remain compatible with the controlled CodeMirror update path.
- Run targeted component tests, TypeScript, ESLint, the full test suite, and the production build.

## Success Criteria

- Users can perform Undo and Redo from visible header icons.
- Buttons accurately communicate whether an operation is available.
- Native keyboard shortcuts continue to work.
- Undo/Redo updates preview and autosave exactly like normal editing.
- No database schema, API, or dependency changes are introduced.

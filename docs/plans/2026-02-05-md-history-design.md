# MD History Sidebar + Drawer (Dummy Data)

## Goal

Optimize the frontend workflow by adding a Markdown document history list on the right side of the main workbench. This makes it easy to switch between previous conversions/iterations. For now, history data is dummy/in-memory; later it will be replaced with real persistence.

## UX

- Desktop (`lg+`): Show a resizable right sidebar inside the main editor card.
- Mobile (`<lg`): Show a `History` button in the header that opens a right-side drawer with overlay.
- History list items show:
  - `mdFileName`
  - `summary` (first ~80 chars, whitespace-collapsed)
  - `updatedAt`
- Top actions:
  - `New` creates a new empty document immediately and switches to it.
  - `Search` filters by file name + summary.
  - `Delete` removes a document (with confirmation).

## Behavior Rules

- History entries are created only on:
  - `New`
  - switching to another history document
- When switching/new, if the current editor content differs from the active document snapshot:
  - update the current document in place (no duplicate history entries)
  - then proceed with the requested switch/new action
- Export (`Download PDF`) and `Print` do not write to history.
- If deleting the active document, automatically switch to the latest document (top of list). If history becomes empty, automatically create a new empty doc.
- On document switch/new, the PDF filename input synchronizes to `mdFileName` → `xxx.pdf`.

## Implementation Notes

- State is kept in a `useMdHistory()` hook:
  - `docs`, `activeDocId`, `query`, plus actions (`createNew`, `switchTo`, `remove`)
- UI is a reusable `MdHistory` component used in both the desktop sidebar and mobile drawer.

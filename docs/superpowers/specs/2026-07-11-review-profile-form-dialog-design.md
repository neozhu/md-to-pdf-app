# Design Review Profile Form Dialog

## Goal

Make Add Profile and Edit easier to use by opening their form in a second, larger dialog while keeping the Manage Profiles list open underneath. The change is complete when Add and Edit open a spacious responsive form, saving or cancelling returns to the unchanged manager list, and existing CRUD behavior remains intact.

## Scope

Change only the presentation and local UI state of `ReviewProfileManager` plus its focused tests.

Do not change:

- the AI Review dialog workflow;
- Review Profile APIs or validation;
- Supabase schema, policies, or seed data;
- delete confirmation behavior;
- Profile field names, limits, helpers, or placeholders; or
- the application's visual system or dependencies.

## Chosen approach

Render a second custom modal layer from `ReviewProfileManager`. This follows the application's existing fixed-overlay pattern and avoids introducing a Dialog dependency for one small interaction change.

The alternatives were rejected for these reasons:

- Replacing the list with the form in a larger Manage Profiles view does not satisfy the requested second dialog.
- Adding Radix or shadcn Dialog would improve built-in focus management but adds a dependency and a broader component-system change that is not required here.

## Interaction flow

The Manage Profiles card always renders its header, list, Add button, and list-level error area.

### Add

1. The user selects **Add Profile**.
2. The component clears `editingId`, resets the form to `EMPTY_FORM`, clears form errors, and opens the form dialog.
3. The dialog title is **Add Review Profile** and the primary action is **Add Profile**.
4. A successful create updates and sorts the Profile list, clears form state, and closes only the form dialog.
5. The Manage Profiles list remains open and shows the created Profile.

### Edit

1. The user selects **Edit** on a Profile.
2. The component copies that Profile into the form, records its ID, clears form errors, and opens the form dialog.
3. The dialog title is **Edit Review Profile** and the primary action is **Save Changes**.
4. A successful update replaces and sorts the corresponding list item, clears form state, and closes only the form dialog.
5. The Manage Profiles list remains open and shows the updated Profile.

### Cancel and close

The form dialog has a close icon and a **Cancel** button. Either action discards the current draft, clears the form error, resets the edit ID and form values, and closes only the form dialog. The parent Manage Profiles list remains open.

The backdrop does not close the form. This avoids accidental loss of a long Reviewer or Editor guidance draft.

## Dialog layout

Render the form overlay with these properties:

- `fixed inset-0 z-[80]`, above the AI Review overlay at `z-[70]`;
- a visible dark backdrop consistent with the current application dialog;
- horizontal viewport padding so it never touches mobile screen edges;
- `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby` title;
- a `w-full max-w-2xl` Card;
- maximum height `calc(100vh - 2rem)` so it fits short screens;
- an overflow-hidden Card with a scrollable form body;
- a persistent header containing the mode-specific title and close icon;
- a footer containing Cancel and the primary save action; and
- no horizontal overflow at 375px or wider.

Keep fields in one column. Name and Description remain compact inputs. Reviewer Guidance and Editor Guidance become `min-h-40` resizable text areas so longer rules are easier to read and edit. The wider dialog supplies the space without changing the existing form content.

Use the existing colors, borders, typography, Button, Card, Input, and Lucide icons. Do not add animation or a new visual theme.

## Focus and accessibility

- Auto-focus Profile Name when Add opens.
- Keep the existing visible focus rings on inputs, text areas, and buttons.
- Give the close icon an explicit accessible label.
- Use the mode-specific heading as the dialog label.
- Disable the save button during an active request and while required fields are empty.

The implementation does not add a custom focus trap. That would require a reusable Dialog primitive or dependency and is outside this focused change. The modal semantics, overlay, auto-focus, and explicit close controls provide a proportional improvement consistent with the current application.

## Errors and saving state

Save failures remain inside the form dialog. The draft stays populated and the dialog stays open so the user can correct or retry it. The list-level delete error remains below the manager list and is not shown inside the form.

While saving:

- the primary action displays **Saving…**;
- the primary action stays disabled; and
- closing or cancelling is also disabled to avoid changing local state while the request is in flight.

No new fallback or error transformation is introduced.

## Component changes

Keep the existing `ReviewProfileManager` public props and API calls.

Within the component:

- render the manager list unconditionally instead of switching between list and form;
- render the form overlay after the manager Card when `isEditing` is true;
- add one local `closeForm` helper that resets dialog state consistently;
- call `closeForm` after a successful save and from both form close controls; and
- keep `beginAdd`, `beginEdit`, `updateField`, `saveProfile`, and `removeProfile` responsibilities otherwise unchanged.

No new exported component or generalized modal abstraction is required.

## Verification

Extend `components/md/review-profile-manager.test.ts` using the project's existing source-contract test pattern. Verify that the component contains:

- a fixed second overlay at `z-[80]`;
- dialog semantics and an accessible title;
- `max-w-2xl` and viewport-constrained height;
- Add and Edit dialog titles;
- taller guidance text areas;
- a shared `closeForm` path; and
- the existing Add, Edit, Delete, field limits, helper guidance, and delete confirmation contracts.

Run the focused component test first, then the complete test suite, lint, and production build. Manually inspect the dialog at mobile and desktop widths if a local browser session is available.

## Intentionally unchanged

- Manage Profiles remains embedded in the AI Review dialog.
- Delete continues using `window.confirm`.
- There is no unsaved-changes confirmation.
- There is no focus-trap dependency or reusable Dialog primitive.
- Supabase is not touched by this UI-only change.

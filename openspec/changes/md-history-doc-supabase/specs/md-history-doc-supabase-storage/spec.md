## ADDED Requirements

### Requirement: Persisted history data model
The system SHALL persist Markdown history documents with the following fields:

- `id` (string): stable identifier for the document
- `mdFileName` (string): the Markdown filename displayed in history (e.g., `meeting-notes.md`)
- `markdown` (string): full Markdown content
- `updatedAt` (number): epoch milliseconds indicating the last time the document snapshot was updated

The system MUST preserve `updatedAt` as epoch milliseconds without timezone conversion.

#### Scenario: Reading a stored document preserves fields
- **WHEN** a document is stored and later retrieved
- **THEN** the retrieved document includes `id`, `mdFileName`, `markdown`, and `updatedAt` matching the stored values

### Requirement: List history documents ordered by most recently updated
The system SHALL provide an API to list all persisted history documents.

The list operation MUST return documents ordered by `updatedAt` descending (most recent first).

#### Scenario: Listing returns newest first
- **WHEN** two documents exist with `updatedAt` values `t2 > t1`
- **THEN** the list result returns the `t2` document before the `t1` document

### Requirement: Create a history document
The system SHALL provide an API to create a persisted history document.

The create operation MUST accept a client-provided `id` (string) and persist it as the primary identifier.

#### Scenario: Creating with a client-provided id
- **WHEN** the client creates a document with `id = "abc"`, `mdFileName = "x.md"`, `markdown = ""`, and `updatedAt = 123`
- **THEN** a subsequent list or get operation returns a document with `id = "abc"`

### Requirement: Update a history document
The system SHALL provide an API to update an existing persisted history document identified by `id`.

The update operation MUST overwrite the stored `mdFileName`, `markdown`, and `updatedAt` with the provided values (last write wins).

#### Scenario: Updating changes the stored snapshot
- **WHEN** an existing document is updated with new `markdown` and a newer `updatedAt`
- **THEN** retrieving the document returns the updated `markdown` and `updatedAt`

### Requirement: Delete a history document
The system SHALL provide an API to delete a persisted history document identified by `id`.

#### Scenario: Deleting removes the document from listing
- **WHEN** a document with `id = "abc"` is deleted
- **THEN** a subsequent list operation does not include any document with `id = "abc"`

### Requirement: Persistence triggers align with history behavior rules
The system MUST persist history snapshots only on the following user actions:

- Creating a new history document (“New”)
- Switching to another history document
- Deleting a history document

The system MUST NOT persist history due to PDF export actions (download/print).

#### Scenario: Export does not write history
- **WHEN** the user downloads or prints a PDF without creating/switching/deleting a document
- **THEN** no create/update operation is issued to persistence

### Requirement: Unauthenticated access (explicitly out of scope for auth)
The system SHALL allow the history persistence APIs to be called without end-user authentication.

#### Scenario: Anonymous client can list history
- **WHEN** a client without login/auth calls the list API
- **THEN** the API returns the persisted history list (or an empty list) without rejecting due to missing authentication

### Requirement: API contract for MD history persistence
The system SHALL expose CRUD APIs for history persistence with JSON payloads containing the `MdHistoryDoc` fields.

At minimum, the following operations MUST be supported:

- List: `GET /api/md-history` → `200` with `{ docs: MdHistoryDoc[] }`
- Create: `POST /api/md-history` with `{ doc: MdHistoryDoc }` → `201` with `{ doc: MdHistoryDoc }`
- Update: `PUT /api/md-history/:id` with `{ doc: MdHistoryDoc }` → `200` with `{ doc: MdHistoryDoc }`
- Delete: `DELETE /api/md-history/:id` → `204`

On server misconfiguration (e.g., missing Supabase env vars), the API MUST return a non-2xx response with a JSON error message.

#### Scenario: Missing configuration returns error JSON
- **WHEN** Supabase configuration is missing on the server
- **THEN** calling `GET /api/md-history` returns a non-2xx status with a JSON body describing the error

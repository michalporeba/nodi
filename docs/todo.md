# TODO

## Suggested Order

The items interlock. Pick one of the orderings below to avoid rework.

**Tier 1 — foundation (do first, independently):**
- ~~**Item 1** (typecheck).~~ ✓ done
- ~~**Item 2** (queued source status).~~ ✓ done

**Tier 2 — server/contract changes (after item 1, mostly independent):**
- ~~**Item 3** (ontology value-kind in add-claim forms).~~ ✓ done
- ~~**Item 4** (client uses server match positions).~~ ✓ done
- ~~**Item 5** (API validation gaps).~~ ✓ done

**Tier 3 — source-viewer chrome and behaviour:**
- ~~**Item 11** (template name on pill).~~ ✓ done
- ~~**Item 7** (hide redundant page-topic header).~~ ✓ done
- ~~**Item 8** (trim right-panel chrome).~~ ✓ done
- ~~**Item 9** (unconfirm a mention).~~ ✓ done
- ~~**Item 10** (pending-selection highlight).~~ ✓ done
- ~~**Item 6** (explicit bulk-action confirmation).~~ ✓ done

**Tier 4 — model refactor:**
- ~~**Item 12** (types as claims).~~ ✓ done (all phases including column drop)
- ~~**Item 13** (merge duplicate entities).~~ ✓ done

**Convention on file:line references:**

Anchors throughout this file are line numbers at the time of writing.
When picking up an item, re-grep for the named identifier (component
name, function name, string literal) before trusting the line number
— numbers drift as earlier items land.

## 1. Stabilize Typecheck and API Contracts

Goal: make TypeScript checks catch client/server contract drift before changes
are considered complete.

Current state:

- `npm run build` passes because Vite builds the client bundle.
- Full client typecheck fails with `tsc --noEmit`.
- Server typecheck fails with `tsc -p tsconfig.server.json --noEmit`.
- The API client and route types have drifted after label-first claims and
  ontology changes.

Known failures to address (snapshot — regenerate via fresh
`tsc --noEmit` and `tsc -p tsconfig.server.json --noEmit` runs before
starting, since later items may have changed which files fail):

- `src/client/api/client.ts`
  - `api.claims.create` requires `subject_entity_id`, but the source viewer now
    creates label-first claims with `subject_label`.
  - Update the create payload type so it accepts either `subject_entity_id` or
    `subject_label`, matching `POST /api/claims`.
- `src/client/components/SourceViewer/EntityPanel.tsx`
  - The topic section fetches an `Entity`, but renders `external_ids`, which only
    exists on `EntityDetail`.
  - Either fetch detail data there, add a lightweight topic DTO with external ID
    data, or stop rendering the QID in that compact topic block.
- `src/server/db/queries.ts`
  - `updateClaim` uses `params: unknown[]`; Bun SQLite expects
    `SQLQueryBindings[]`.
  - Use the existing `Params` alias or another compatible binding type.
- `src/server/ontology/loader.ts`
  - `ontologySourcePath()` references missing `ontologyPath()`.
  - Replace with a valid default, probably `ontologyPaths()[0]`, or remove the
    helper if unused.

Suggested implementation:

1. Fix the type errors without weakening strictness.
2. Add package scripts:
   - `typecheck:client`: `tsc --noEmit`
   - `typecheck:server`: `tsc -p tsconfig.server.json --noEmit`
   - `typecheck`: run both checks
3. Consider making `build` run `typecheck` before `vite build`, or at least
   document that implementation tasks must run both.

Acceptance criteria:

- `npm run typecheck:client` passes.
- `npm run typecheck:server` passes.
- `npm run typecheck` passes.
- `npm run build` still passes.
- No route/client type casts are added just to silence contract errors.

## 2. Fix Queued Source Status Semantics

Goal: match the PRD invariant that merely opening a queued source for
inspection does not mark it active.

Documented behavior:

- `docs/PRD.md` says opening a queued source must not move it to `active`.
- A source should move from `queued` to `active` only when review work starts,
  such as setting the topic, confirming or creating a mention, creating a claim,
  running confirm-all, or changing another source-level review value.

Current implementation:

- `src/client/components/SourceViewer/SourceViewer.tsx` changes a queued source
  to active as soon as it loads.
- This makes preview/inspection indistinguishable from actual review work and
  breaks the queue semantics described in the docs.

Suggested implementation:

1. Remove the automatic `queued -> active` update from the source-load effect.
2. Introduce one small helper for review-start transitions, for example
   `ensureSourceActive()`, used by user actions that create durable review
   state.
3. Call that helper from actions such as:
   - setting or editing the page topic
   - confirming a suggested or ambiguous mention
   - creating a mention from selected text
   - creating a claim
   - adding a relationship claim
   - confirm-all suggestions
   - explicit status/review-state edits
4. Avoid changing a source that is already `done` or `irrelevant` back to
   `active`.

Acceptance criteria:

- Opening `/sources/:id` for a queued source leaves `status = queued`.
- Setting a topic changes the source to `active`.
- Creating or confirming a mention changes the source to `active`.
- Creating a claim changes the source to `active`.
- Confirm-all changes the source to `active` only when it actually confirms at
  least one suggestion.
- Done and irrelevant sources are not silently reactivated by viewer actions.
- The queue view still shows queued, active, done, and irrelevant sources
  consistently after these transitions.

## 3. Apply Ontology Value-Kind In Add-Claim Forms

Source: `docs/issues.md` item 2; `docs/ontology-plan.md` Phase 2.

Goal: make the add-claim entry points consult the ontology shape so the
value input matches the property's declared kind (text-only, entity-only,
or both).

Documented direction:

- `docs/PRD.md` and `docs/ontology-plan.md` Phase 2 specify that claim entry
  should consult `nodi:textAllowed`, `nodi:defaultEntityType`, and `sh:class`.
- The loaded client shape represents those concepts as `value_type`,
  `class_range`, and `default_entity_type`.
- `src/client/components/ClaimRow.tsx` already uses this model for edits to
  existing claims: range warning (near line 27), entity search filter (near
  line 352), and default promotion type (near line 208).

Current state:

- `src/client/components/SourceViewer/EntityPanel.tsx` add-claim form
  (around line 584): bare `PropertyPicker` and a single `<input>` for the
  value, with no lookup of `getPropertyShape(property)`.
- `src/client/components/Entities/EntityDetail.tsx` add-claim form (around
  line 354): same pattern.
- Both render a free-form value input regardless of whether the chosen
  property expects a text literal, an entity reference, or either.

Suggested implementation:

1. After the user selects a property, call `getPropertyShape(property)`
   from `src/client/data/ontology.ts`.
2. If `shape.value_type === 'entity'`, render an entity picker instead of a
   text input. If `shape.class_range` is set, scope the picker to that type.
3. If `shape.value_type === 'both'`, surface a small toggle that lets the user
   choose text literal vs entity reference. Default to entity mode when
   `shape.default_entity_type` or `shape.class_range` is present; otherwise
   default to text mode.
4. If the property is unknown to the ontology, fall back to the current
   free-form text input so custom properties keep working.
5. Extract or reuse shared UI primitives for entity-picking and text capture
   from the existing claim-editing flow where practical. Do not import private
   `ClaimRow.tsx` internals directly unless they are first made stable shared
   components.

Acceptance criteria:

- Picking an entity-valued property (for example `cast_member`) in the
  add-claim form shows an entity picker, not a free-text input.
- Picking a text-valued property with no class range shows a
  free-text input.
- Picking a `both` property lets the user choose text literal or entity
  reference before saving.
- Picking a property the ontology does not know about still renders the
  current free-text input.
- Submitting an entity-valued add-claim writes `object_entity_id` (not
  `value`); submitting a text-valued one writes `value` (not
  `object_entity_id`).
- Behaviour is identical between `EntityPanel` and `EntityDetail`
  add-claim entry points.

## 4. Align Client Highlight Positions With Server Matching

Source: `docs/issues.md` item 3.

Goal: make the source-viewer highlight overlay use the per-occurrence
positions the server already computes, instead of re-scanning rendered DOM
by surface form.

Current state:

- `src/server/matching/engine.ts` computes `plainText` positions and
  returns them on every `Match` (`positions: Array<{ start: number; end:
  number }>`; see the `Match` type around line 12 and the loop building
  `keptMatches`).
- `src/client/components/SourceViewer/SourceContent.tsx` ignores those
  positions: `highlightText()` walks every text node in the rendered DOM
  and matches by `surface_form` regex (lines 26-64 and the loop around
  line 194).
- Consequence: the client cannot identify a *specific occurrence* of a
  match, only "all renderings of this surface form". This blocks
  per-occurrence dismissal, jump-to-mention, and stable provenance once the
  rendered DOM diverges from the plaintext used by the server.

Suggested implementation:

1. Keep the existing server contract: positions are offsets into the server's
   extracted `plainText`, not original HTML offsets.
2. Add a small helper on the client that, given the sanitized DOM, returns
   `(plainTextOffset) -> { node: Text; offset: number }`. The helper must
   mirror the server's `extractPlainText` whitespace/tag/entity behaviour
   closely enough that returned positions map to the same visible text.
3. Replace `highlightText`'s tree-walker regex scan: for each match, for
   each `position` on it, address start/end via the mapping and wrap the
   range in a `<mark>` with the existing `data-*` attributes plus a new
   `data-position-start` (or `data-occurrence-index`).
4. Update `docs/matching.md` to state that the client uses server positions
   and no longer re-scans by surface form.

Acceptance criteria:

- Highlights render in the same visual positions as before for a
  representative source.
- Each `<mark>` carries a stable identifier for its occurrence (position
  index or plaintext offset), distinct between two occurrences of the same
  surface form.
- After removing the regex re-scan in `SourceContent.tsx`, the test source
  used during verification shows no dropped or duplicated highlights.
- `docs/matching.md` no longer claims the client rescans by surface form.

## 5. Tighten Remaining API Validation Gaps

Source: `docs/issues.md` item 4; `docs/alignment-plan.md` step 9.1
follow-up.

Goal: cover the cross-field and value-set constraints that the
field-by-field validator in `src/server/validation.ts` cannot express.

Current state:

- `src/server/validation.ts` validates field types and required/nullable
  rules. It has no support for "exactly one of these fields" or "value
  must be in this set".
- `POST /api/claims` (`src/server/routes/claims.ts` around line 39) accepts
  either `value` (text) or `object_entity_id` (entity reference) but does
  not enforce that exactly one is provided. The current UI relies on discipline
  rather than a server-side check.
- `PATCH /api/claims/:id` can switch between text and entity values, but
  validation has to consider the existing stored claim plus the patch body, not
  just the partial request body.
- External ID creation accepts an arbitrary `system` string; there is no
  whitelist. `docs/schema.sql` and `docs/domain.md` document the current
  expected systems.

Suggested implementation:

1. Extend `src/server/validation.ts` with two additions:
   - `oneOf: string[][]` (or similar) for cross-field "exactly one of"
     constraints, returning a structured error when violated.
   - `enum?: string[]` on a `Rule` for value-set checks on string fields.
2. Apply exact-one validation to `POST /api/claims` for `value` vs
   `object_entity_id`.
3. For `PATCH /api/claims/:id`, validate the resulting claim state after
   merging the request body with the existing row. This allows legitimate
   partial edits such as `{ "property": "performer" }` while still preventing
   both value fields from ending up set or both ending up empty.
4. Decide where the external-ID `system` whitelist lives:
   - Hardcode the documented systems from `docs/schema.sql` and
     `docs/domain.md` (`wikidata`, `wikipedia_en`, `wikipedia_cy`, `imdb`,
     `bbc_programme`, `bfi`, `tmdb_movie`, `tmdb_tv`, `musicbrainz`, `roud`,
     `session_org`) and apply `enum:` validation, or
   - Derive it from the loaded ontology if a future ontology declares
     supported external systems.
   Start with the hardcoded list and a TODO comment pointing at the
   ontology direction.
5. Update `docs/api.md` to document the new 400 responses.

Acceptance criteria:

- `POST /api/claims` with both `value` and `object_entity_id` returns 400
  with a structured error citing the conflicting fields.
- `POST /api/claims` with neither field returns 400.
- `POST /api/entities/:id/external-ids` (or the equivalent route) with an
  unknown `system` returns 400; with every system documented in
  `docs/schema.sql` and `docs/domain.md` it still succeeds when the rest of the
  request is valid.
- `PATCH /api/claims/:id` with only `{ "property": "..." }` still succeeds
  when the existing claim already has exactly one value kind.
- `PATCH /api/claims/:id` that would leave both `value` and
  `object_entity_id` set, or neither set, returns 400.
- Existing well-formed requests are unchanged in behaviour.
- `docs/api.md` lists the new error shapes.

## 6. Require Explicit Confirmation For Bulk Actions

Source: `docs/issues.md` item 5; `docs/alignment-checklist.md` Step 9.2.

Goal: stop the bare `a` keyboard shortcut from triggering `confirm-all`
globally on the source viewer, per the Step 9.2 acceptance criterion.

Current state:

- `src/client/components/SourceViewer/SourceViewer.tsx` around line 547
  registers a `keydown` listener that calls `handleConfirmAll()` whenever
  `e.key === 'a'` and focus is not inside an input/textarea/select.
- `handleConfirmAll()` calls `api.sources.confirmAll(sourceId)` immediately
  with no confirmation step.
- The same listener also binds `e.key === 'd'` to mark the source `done`.
- `docs/alignment-checklist.md` Step 9.2 requires that confirm-all be a
  button click with explicit confirmation, not a bare shortcut.

Suggested implementation:

1. Add an explicit "Confirm all suggestions" button to the source viewer
   header (next to the match counts at lines 575-580 is a reasonable
   place).
2. Wire the click handler to a small confirm step ("Confirm N suggestions
   for this source?") and only then call `api.sources.confirmAll`. Show a
   result toast or inline message with the count actually confirmed.
3. Remove the `if (e.key === 'a') handleConfirmAll()` branch from the
   `keydown` listener.
4. Treat the `d` shortcut as related but separate: either remove it in the
   same pass, or document why this task is limited to confirm-all. Do not add
   any new broad keyboard shortcuts.
5. Keep `Escape` closing the popover as today.

Acceptance criteria:

- `grep -rn "e.key === 'a'" src/client/components/SourceViewer/` returns
  no matches.
- Pressing `a` in the source viewer with no popover open does nothing.
- The new button triggers confirm-all only after an explicit confirmation
  step.
- After confirming, the UI shows how many suggestions were just confirmed.
- A queued source that gets `confirm-all` with at least one confirmation
  still flips to `active` per item 2 in this file.
- No new single-key bulk-action shortcut is introduced.

## 7. Hide Redundant Page-Topic Header In Source Viewer

Source: user UX report at `/sources/1` — the top "TOPIC" panel duplicates
the entity already shown in "ACTIVE TOPIC (PAGE TOPIC)" when the user has
not focused another entity.

Goal: collapse the top `TopicSection` whenever its content is fully shown
by `ActiveTopicSection` below it, while keeping every state that depends
on the top panel working.

Current state:

- `src/client/components/SourceViewer/SourceViewer.tsx` (around line 597)
  composes the right-hand panel by always rendering `TopicSection` first,
  then `RelationshipConnector` (conditional), then `ActiveTopicSection`.
- `src/client/components/SourceViewer/EntityPanel.tsx` `TopicSection`
  (lines 170-237) holds an internal `editing` state and is the only
  component with a ✎ button that opens `TopicPicker`.
- `TopicSection` is also the place where a source with no topic shows
  the picker (lines 188-204) and where a description-only "reference"
  source shows its italic description block (lines 224-228).
- `ActiveTopicSection` (lines 251-306) has no topic-edit affordance.

Behaviour required:

1. Source has no topic — `TopicSection` still renders the picker
   (unchanged).
2. Source has a description-only topic, no entity — `TopicSection` still
   renders the description block (unchanged).
3. Source has an entity topic and the user has not focused another
   entity — `TopicSection` is hidden; `ActiveTopicSection` is the only
   panel and exposes a ✎ button next to its "(page topic)" label.
4. Source has an entity topic and the user is focused on a different
   entity via a confirmed highlight — `TopicSection` renders as today
   (compact page-topic header with ✎); `ActiveTopicSection` renders the
   focused entity with the "← page" button.
5. The user is editing the topic — `TopicSection` renders the
   `TopicPicker` editor; entry into this state is possible from either
   the existing ✎ in `TopicSection` (states 2 and 4) or the new ✎ in
   `ActiveTopicSection` (state 3).

Suggested implementation:

1. Lift `editing` out of `TopicSection`. Add `topicEditing` state in
   `SourceViewer.tsx` and pass `editing` + `onEditingChange` to
   `TopicSection`. Remove `TopicSection`'s internal `useState` for
   `editing`.
2. At the composition site in `SourceViewer.tsx`, render `TopicSection`
   unless `pageTopicId != null && focusedEntityId == null &&
   !topicEditing`. No other rendering rules change.
3. Add an optional `onEditTopic?: () => void` prop to
   `ActiveTopicSection`. When set and `!isFocusing`, render a small
   ✎ button in the heading next to "(page topic)" that calls it.
4. Wire `onEditTopic={() => setTopicEditing(true)}` from `SourceViewer`.
   `TopicSection.onEditingChange` flips the same flag back to `false`
   on save or cancel.
5. No new dependencies. No schema, API, or types changes.

Acceptance criteria:

- State 1 (no topic): visiting `/sources/<id>` for a queued source with
  no `subject_entity_id` renders the existing `TopicPicker` at the top
  of the right panel. No regression versus today.
- State 2 (description-only topic): a source with
  `subject_description` set but no entity still shows the italic
  description block at the top.
- State 3 (entity topic, not focused): visiting `/sources/1` renders
  only one entity panel on the right. A ✎ button is present in the
  heading next to "(page topic)".
- Clicking the ✎ in state 3 reveals the `TopicPicker`; saving updates
  the source and returns to state 3 with the updated topic; cancelling
  returns to state 3 unchanged.
- State 4 (focused on another entity): the top panel reappears as a
  compact page-topic header with its existing ✎; the bottom panel
  shows the focused entity with the "← page" button. No regression.
- State 5: `editing` can be entered from either ✎; saving from either
  ends in state 3 or state 4 depending on whether the user was focused.
- Visual: in state 3 the right-hand panel has no duplicated entity
  name, type badge, or QID.

## 8. Trim Right-Panel Chrome On Source Viewer

Source: user UX report at `/sources/1` after clicking a confirmed
highlight for a non-page-topic entity (e.g. "Lisabeth Miles"). The right
panel renders two pieces of chrome that add no information:

- the "TOPIC" heading above the compact page-topic header, when the entity
  badge and name already convey what the row is,
- the "RELATIONSHIP" heading and the two entity chips at the top and
  bottom of `PathRow`, when the same entities are already shown in the
  surrounding `TopicSection` (above) and `ActiveTopicSection` (below).

Goal: drop the redundant headings and the duplicate entity chips, leaving
the right panel reading like a vertical breadcrumb of entity → connector
→ entity.

Coordinate with item 7: both items modify `TopicSection`, share line
references in `EntityPanel.tsx`, and touch the same compact-view JSX.
Either land item 7 first then re-anchor this item's line numbers via a
fresh grep, or bundle both into a single PR. Do NOT land this item
without item 7 — item 8's removal of the "Topic" heading from the
editing branch assumes the lifted-editing flow from item 7 still works.

Current state:

- `src/client/components/SourceViewer/EntityPanel.tsx` `TopicSection`
  renders a `section-heading` "Topic" in both branches: the editing branch
  (line 192) and the compact display branch (line 211).
- `RelationshipConnector` (line 524) wraps its body in a coloured box and
  renders a `section-heading` "Relationship" (line 579).
- `PathRow` (line 625) renders, for a 1-hop link, three rows in this
  order: `entityChip(pageTopicId, 'page')`, the arrow row,
  `entityChip(activeEntityId, 'active')`. The chip values duplicate what
  `TopicSection` shows above and what `ActiveTopicSection` shows below.
- For 2-hop links, the chain is `page → arrow → intermediate → arrow →
  active`. Only the intermediate chip carries information not shown in
  the surrounding panels.

Behaviour required:

1. `TopicSection` no longer renders the "Topic" heading in either the
   compact or the editing branch. All other content (entity name, type
   badge, QID, description, picker form, ✎ button, ✕ close button) is
   unchanged.
2. `RelationshipConnector` no longer renders the "Relationship" heading.
   The coloured background, padding, and borders remain so the section
   stays visually distinct as the connector between the two entity
   blocks.
3. `PathRow` for a 1-hop path renders only the arrow row (no top chip,
   no bottom chip).
4. `PathRow` for a 2-hop path renders `arrow → intermediate chip →
   arrow` (no top page chip, no bottom active chip; intermediate chip
   stays since it is unique information not shown in the surrounding
   panels).
5. The empty-paths branch of `RelationshipConnector` (no claim links
   between the two entities yet) keeps its property picker, "+ Add"
   button, and the "Saves: topic → property → active" hint; only the
   heading is dropped.
6. No changes to data fetching, the relationship resolver, the property
   picker behaviour, or any other panel.

Suggested implementation:

1. In `src/client/components/SourceViewer/EntityPanel.tsx` `TopicSection`:
   - Editing branch (lines 188-204): remove the wrapper div on lines
     191-196 containing the "Topic" heading and the ✕ close button —
     keep the ✕ button (it cancels editing); fold it into the
     `TopicPicker` row or render it as a small floating control. The
     ✕ must remain reachable when `hasTopic` is true.
   - Compact branch (lines 207-236): remove the `<div className=
     "section-heading">Topic</div>` on line 211. The ✎ button on line
     231 stays where it is (top-right of the row).
2. In `RelationshipConnector` (line 577 onwards): remove the `<div
   className="section-heading">Relationship</div>` on line 579. The
   coloured background `div` wrapper stays.
3. In `PathRow` (lines 677-697): remove the `entityChip(pageTopicId,
   'page')` call at the top of both the 1-hop and 2-hop branches and the
   `entityChip(activeEntityId, 'active')` call at the bottom of both
   branches. Keep `entityChip(xId, 'intermediate')` in the 2-hop branch.
   If `hops.length === 1` ends up with only one child (the arrow row),
   the surrounding `flex-direction: column` wrapper is still fine.
4. Visually sanity-check that the connector still feels anchored between
   the two entity blocks; if it does not, no further change is needed —
   the coloured background plus the top/bottom borders carry the
   anchoring.
5. No new dependencies. No schema, API, or types changes.

Acceptance criteria:

- At `/sources/1` after clicking a confirmed "Lisabeth Miles" highlight
  (page topic Pobol y Cwm), the right panel shows three blocks: a
  topicless compact entity row for Pobol y Cwm (name + Series badge +
  Q687418 + ✎), a connector showing only `↓ cast_member ×`, and the
  `ActiveTopicSection` for Lisabeth Miles. No "TOPIC" or "RELATIONSHIP"
  heading appears anywhere in the right panel.
- A 2-hop relationship still renders the intermediate entity chip
  between the two arrows.
- The empty-paths state (no claim links between page topic and active)
  still shows the property picker, the "+ Add" button, and the
  "Saves: topic → property → active" hint.
- The ✕ that cancels topic editing remains accessible when `hasTopic`
  is true and the user has entered editing mode.
- No regression in `TopicSection`'s state 1 (no topic — picker visible)
  or state 2 (description-only topic — italic description block
  visible). The "(reference, no specific subject)" sub-label remains.
- No change to fetched data, route shapes, or the relationship
  resolver.

## 9. Unconfirm A Mention From The Source Viewer Right Panel

Source: user UX report at `/sources/1` after clicking a confirmed
highlight for "Lisabeth Miles" — the user can delete a *relationship
claim* between page topic and the focused entity (the ✕ next to the
property in `RelationshipConnector`), but has no way to remove the
*association between the highlighted surface form and the entity*. They
want to be able to return the highlight to "suggested" status without
deleting the entity itself.

Goal: add a "remove association" affordance that deletes the
`Mention` row for `(entity_id, source_id, surface_form)` triggered by
the user's current focus, while preserving the entity and any claims
that reference it.

Depends on item 7: this item's acceptance refers to "state 3 from item
7" (page topic visible, no entity focused). If item 7 has not landed,
the post-removal collapse behaviour cannot be verified as written;
land item 7 first, or amend this item's acceptance to describe the
current pre-item-7 right-panel layout.

Design principle (user's framing):

- If the association points at an entity, removing the association does
  **not** remove the entity — only the mention row is deleted; the
  highlight in the source body returns to "suggested" status (the label
  still matches the entity's labels, the matching engine still finds it,
  but no confirmed mention is recorded).
- If the association points at a literal value (a label-first claim
  with no `subject_entity_id` / no entity behind the active topic),
  removing the association also removes that value. *This branch is
  not currently reachable in the UI today — the active topic is always
  backed by an entity — but the principle is recorded here so a future
  step that lets a literal become the active topic does not introduce a
  different rule.*

Current state:

- Confirmed-highlight clicks in `src/client/components/SourceViewer/
  SourceViewer.tsx` (lines 522-535) set `focusedEntityId`,
  `linkedEntityIds`, and `linkedSurfaceForm` from the clicked `Match`,
  then update the right panel. No popover opens, and no per-mention
  controls are rendered on the right panel.
- `ActiveTopicSection` (`src/client/components/SourceViewer/EntityPanel.tsx`
  lines 251-306) has a "← page" button when `isFocusing` but no
  "remove association" affordance.
- `RelationshipConnector` (line 524 in the same file) lets users delete
  individual relationship claims (`api.claims.delete`), but a deleted
  claim does **not** unconfirm the mention.
- The HTTP/client surface for mention deletion already exists:
  `DELETE /api/mentions/:id` (`src/server/routes/mentions.ts` line 23)
  with the client wrapper `api.mentions.delete(id)` in
  `src/client/api/client.ts` line 89.
- The mention table is keyed on `(entity_id, source_id, surface_form)`
  per Phase 1.2 / Step 1.3 of the alignment plan, and confirmed status
  is resolved per-surface-form by the matching engine (Step 4.1). The
  client currently has the entity id (`focusedEntityId`), the source id
  (`sourceId`), and the clicked surface form (`linkedSurfaceForm`), but
  it does **not** have the mention id needed by the current
  `DELETE /api/mentions/:id` route.

Behaviour required:

1. When `focusedEntityId !== null && linkedSurfaceForm !== null` and
   the clicked match was `confirmed`, the right panel shows a small
   "Remove association" control (icon button or text link) near the
   "← page" button on `ActiveTopicSection`. Tooltip: "Unconfirm this
   mention. The entity stays; the highlight returns to suggested."
2. Clicking it deletes the mention row keyed on `(focusedEntityId,
   sourceId, linkedSurfaceForm)`. The entity row is not touched. Any
   claims referencing the entity remain.
3. After deletion, the source viewer behaves as if the user had never
   confirmed: the matching engine returns the same label match with
   `status: 'suggested'`, the highlight in the rendered text turns
   yellow (suggested), and the right panel collapses to the page topic
   (state 3 from item 7), matching the user's framing "the result
   should be the same as if the highlight pointed to an unassociated
   entity which is a potential match".
4. If the same source still has confirmed mentions of the same entity
   under *other* surface forms (e.g. "Lisabeth" in addition to
   "Lisabeth Miles"), those other mentions are not affected — only the
   surface form the user clicked is unconfirmed.
5. If the focused entity is the page topic (`focusedEntityId ===
   pageTopicId` or `!isFocusing`), the "Remove association" control is
   hidden. The page topic is managed by the ✎ on `TopicSection` (and
   the lifted-editing flow from item 7), not by this action.
6. Future literal-value branch (not implemented now; record only): if
   the active topic ever becomes a label-first claim with no backing
   entity, "Remove association" removes the literal claim and, if no
   other claim or mention referenced that label, the highlight drops
   off entirely (no label match left).

Suggested implementation:

1. Add a server-side helper or extend the existing endpoint so the
   client can delete a mention by triple, not just by id. Two options:
   - Extend `deleteMention` in `src/server/db/queries.ts` with a
     companion `deleteMentionByTriple(entity_id, source_id,
     surface_form)`, and add `DELETE /api/mentions` accepting those
     three as query params, or
   - Add a `GET /api/mentions?entity_id=&source_id=&surface_form=`
     lookup that returns the mention id (one row, since the triple is
     unique per Step 1.2), so the client can call the existing
     `DELETE /api/mentions/:id`.
   Pick whichever is cheaper. The triple-based delete is one round trip
   instead of two.
2. Add an `api.mentions.deleteByTriple(...)` (or
   `api.mentions.findByTriple(...)`) helper in
   `src/client/api/client.ts` matching the chosen server shape.
3. In `ActiveTopicSection`, accept a new optional callback prop
   `onRemoveAssociation?: () => Promise<void>` and render a small
   control next to the "← page" button when it is set and `isFocusing`.
   Render style: text link or ghost-button, distinct from the "← page"
   chevron so the actions are not confused.
4. In `SourceViewer.tsx`, wire `onRemoveAssociation` to call the
   delete helper with `(focusedEntityId, sourceId, linkedSurfaceForm)`,
   then `setFocusedEntityId(null)`, `setLinkedEntityIds([])`,
   `setLinkedSurfaceForm(null)`, and `reloadMatches()` so the highlight
   re-renders as suggested.
5. Do **not** delete any `Claim` rows that reference the entity. Do
   **not** touch the entity row. Do **not** affect mentions for other
   surface forms or other sources.

Acceptance criteria:

- Setup: at `/sources/1`, click the confirmed "Lisabeth Miles"
  highlight. The right panel focuses Lisabeth Miles; the relationship
  panel shows the cast_member claim; the highlight in the text is
  green (confirmed).
- A "Remove association" control is visible in the
  `ActiveTopicSection` heading area while `isFocusing` is true.
- Clicking the control:
  - Removes exactly one Mention row matching `(entity_id, source_id,
    surface_form)`. Verify via `sqlite3 data/nodi.db "SELECT * FROM
    Mention WHERE entity_id = ? AND source_id = ? AND surface_form =
    ?"`.
  - Leaves the Entity row intact. Verify via `sqlite3 data/nodi.db
    "SELECT id FROM Entity WHERE id = ?"`.
  - Leaves any Claim rows referencing the entity intact. Verify in
    the entity detail view that the cast_member claim from
    Pobol y Cwm still exists.
  - Returns the highlight in the source body to yellow (suggested)
    status. Verify by re-running matches and reloading the viewer.
  - Collapses the right panel to the page topic (state 3 from item 7).
- If the same entity is also confirmed under a different surface form
  in the same source, that other confirmed highlight remains green
  and its mention row remains in the DB.
- If the active topic is the page topic itself (`!isFocusing`), the
  control is hidden — there is no way to "remove the association" of
  the page topic via this affordance.
- No new dependencies. No schema changes (the mention table already
  supports per-(entity, source, surface form) granularity).

## 10. Show Pending-Selection Highlight In The Source Body While Claim Popover Is Open

Source: user UX report — when text is selected and the claim popover
("About <page topic>") opens, there is no persistent visual indication
of which text the popover is making a statement about. The browser's
native selection highlight is unreliable once the popover (rendered in a
portal) takes focus, and the user has to remember what they selected.

Goal: while the claim popover is open, render the selected text in the
source body with a distinct "pending" highlight colour that is clearly
different from confirmed (green), suggested (yellow), and ambiguous
highlights.

Current state:

- `src/client/components/SourceViewer/SourceContent.tsx` `highlightText`
  (lines 26-64) wraps surface-form matches in `<mark>` with a className
  like `highlight-confirmed`, `highlight-suggested`, `highlight-ambiguous`
  driven by `match.status` (see the loop around line 194). There is no
  notion of a "pending" or "in-flight" highlight.
- `src/client/components/SourceViewer/SourceViewer.tsx` `handleTextSelect`
  (line 537) only receives the selected `text` and screen coordinates;
  it sets `popover` to `{ type: 'claim', text, pos, linkedUrl }`. The
  DOM range is not propagated.
- The `<mark>` rule set has classes `highlight-confirmed`,
  `highlight-suggested`, `highlight-ambiguous` (and the `mark` skip
  rule in `shouldSkipNode`, line 16-24, already prevents nested
  re-highlighting).

Behaviour required:

1. When `popover.type === 'claim'`, the source body shows the popover's
   `text` highlighted with a distinct pending colour. Either of these
   scopes is acceptable; pick the simpler one:
   a. Only the single occurrence the user actually selected (requires
      propagating the DOM range or its plaintext position from
      `SourceContent` to `SourceViewer` and back).
   b. All textual occurrences of the selected string in the source
      body (reuses the existing `highlightText` regex-scan path).
2. The pending highlight is removed when the popover closes (save or
   cancel), restoring the previous match-based highlights.
3. The pending highlight must visually differ from the three existing
   statuses (confirmed/suggested/ambiguous). Suggested palette: a soft
   purple/indigo that matches the popover's existing accent
   `rgba(99,102,241,0.10)` already used in pill backgrounds at
   `src/client/components/SourceViewer/SourceViewer.tsx:393`.
4. The pending highlight must not interact with the matches state: it
   is a transient overlay, not a real `Match`.

Suggested implementation:

1. Add a CSS class `highlight-pending` to the same stylesheet that
   defines `highlight-confirmed`/`highlight-suggested`/`highlight-ambiguous`
   (locate via `grep -rn "highlight-confirmed" src/`). Use a background
   colour distinct from the existing three.
2. Pick scope (b) for the first cut — fewest moving parts. In
   `SourceContent.tsx`, accept an optional `pendingText?: string`
   prop. When set, call `highlightText` with the pending text and
   `highlight-pending` className after the regular matches are
   highlighted (so the pending overlay can co-exist with a confirmed
   highlight underneath if the same string is also a confirmed match).
3. If scope (b) creates layout issues with nested `<mark>` (the
   existing `shouldSkipNode` already skips inside `mark`), prefer
   scope (a): plumb the selected DOM range or plaintext offsets from
   `SourceContent.handleMouseUp` (around lines 261-269) through
   `onTextSelect` to `SourceViewer.setPopover` and back to
   `SourceContent` for a one-off wrap. Document whichever path is
   taken so the next maintainer can repeat it.
4. In `SourceViewer.tsx`, pass `popover?.type === 'claim' ? popover.text
   : undefined` (or the equivalent range) as `pendingText` to
   `SourceContent`.
5. No new dependencies. No schema changes.

Acceptance criteria:

- Select the text "Andrew Teilo" in a source body. The claim popover
  opens. The text "Andrew Teilo" (single occurrence or all
  occurrences — match the chosen scope) is rendered with a visibly
  distinct background colour, different from green, yellow, and
  ambiguous.
- Cancel the popover. The pending highlight disappears; matches
  return to their previous appearance.
- Save the popover. The pending highlight disappears; if the save
  creates a new mention, the rematch may show the same text as
  confirmed (green). No double-highlighting (no nested `<mark>`).
- The change does not regress any existing highlight rendering for
  matches.
- No console errors when the popover opens or closes.

## 11. Linked-Entity Pill Shows Template Name, Not Target Class

Source: user UX report — after picking `cast_member` as the property
and clicking the `Actor` template under "+ new as:", the linked-entity
pill says `+ new (Person)` even though the user clicked `Actor`. The
target class is Person, but the user-visible identity of what they
picked is the template they chose, not its underlying class.

Goal: render the linked-entity pill as `+ new (<template name>)` when
the entity was added via a template (e.g. `+ new (Actor)`), and fall
back to `+ new (<type>)` only when no template was used.

Land before item 12: item 12 reshapes how entity types are stored and
displayed (single `type` becomes `types: string[]` rendered as chips).
If item 12 lands first, this item's "update pill to display
`l.templateName ?? l.type`" becomes stale — `l.type` is no longer the
right field. Either land this item first (recommended; it is small and
isolated) or fold its `templateName` plumbing into item 12 Phase D.

Current state:

- `src/client/components/SourceViewer/SourceViewer.tsx` `ClaimPopover`
  (line 174) defines `LinkedEntity` and tracks new-entity adds via
  `addNew(type, seed_claims)` (line 243). Only `type` and
  `seed_claims` are stored on the `LinkedEntity`; the template's
  `name` is not retained.
- The pill render (line 396) reads `l.type` and produces
  `+ new (Person)` for any template whose `target_class === 'Person'`.
- The template buttons in the "+ new as:" strip (line 440 for the
  default, line 451-459 for the full list) display the template
  `name` correctly (`{roleLabel}` for the default; `{t.name}` is the
  button child for the full list). The information loss happens at
  `addNew`, not at the button label.
- `EntityPanel.tsx` has a parallel template strip (lines 120 and
  441-442) which may have the same pattern; review and apply the
  same fix if so.

Behaviour required:

1. After clicking an `Actor` template button, the resulting pill reads
   `+ new (Actor)`.
2. After clicking a template whose `name === target_class` (e.g. a
   bare `Person` template with no seed claims), the pill reads
   `+ new (Person)` — unchanged.
3. After adding a new entity via any path that does not go through a
   template (if such a path exists or is added later), the pill
   continues to read `+ new (<type>)`.
4. The underlying entity creation is unaffected: the entity is still
   created as `target_class` with the template's `seed_claims`. Only
   the pill label changes.

Suggested implementation:

1. Extend `LinkedEntity` (the `kind: 'new'` variant) with an optional
   `templateName?: string`. Locate the type at the top of
   `ClaimPopover` or wherever it is currently declared.
2. Change `addNew` to take an additional `templateName?: string`
   parameter and store it on the new `LinkedEntity`.
3. Update both call sites in the "+ new as:" strip
   (`src/client/components/SourceViewer/SourceViewer.tsx:437` and
   `src/client/components/SourceViewer/SourceViewer.tsx:459`) to pass
   the template's `name` (`defaultTemplate?.name` and `t.name`
   respectively).
4. Update the pill render (line 396) to display `l.templateName ?? l.type`.
5. Check `EntityPanel.tsx` (lines 120 and 441-442) for an equivalent
   template strip and pill rendering; apply the same change if found.
6. No new dependencies. No schema or API changes (template name is a
   client-side display concern; the server still receives
   `target_class` and `seed_claims`).

Acceptance criteria:

- In the claim popover, pick `cast_member`, then click the `Actor`
  template under "+ new as:". The linked-entity pill reads
  `+ new (Actor)`, not `+ new (Person)`.
- Saving the claim still creates a `Person` entity with the
  `occupation = actor` seed claim attached (server behaviour
  unchanged).
- A template whose `name === target_class` (e.g. a bare `Person`)
  still renders `+ new (Person)`.
- Adding an entity through any non-template path (existing entity
  search result, or any future direct-class add) still renders the
  type, not a missing template name.
- The parallel template strip in `EntityPanel.tsx` (if it produces a
  pill the same way) reads the template name too. If it does not
  render pills, this acceptance line is N/A.

## 12. Model Entity Class Membership As Claims, Not A Column

Source: user UX report comparing the [FictionalPerson] and [Character]
"tabs" for David 'Dai' Ashurst. The two tabs are not really tabs — they
are two separate `Entity` rows with different `type` values that share a
surface form, surfaced together via `LinkedSwitcher`. Labels and claims
on one row are not visible on the other; the `character_role` claim
that points at the FictionalPerson row is absent on the Character row.
The user's intended model is the RDF-idiomatic one: a single entity has
many `rdf:type` assertions; labels, mentions, and claims live on the
one entity; type "tabs" are a UI affordance to bucket claims by which
class they are typical for, not a data partition.

This is a large refactor that touches schema, server queries, matching,
client types, several UI panels, and export. Land it in the phase order
below.

Depends on items 7, 8, 11: this item edits the same right-panel UI
surfaces those items restructure (`TopicSection`, the type-badge
rendering, the linked-entity pill). Land items 7, 8, and 11 before
starting Phase D — otherwise the chip-row JSX changes here will
conflict with the chrome cleanup happening in 7/8 and the pill
template-name change in 11.

Decision (from design discussion):

- Class membership becomes a Claim with `property = 'instance_of'` and
  `value = <class name string>`. Classes are referenced by their short
  name (`Person`, `Character`, …) the same way property keys are short
  strings today; classes are NOT modelled as entities. This avoids
  recursive class-entity bookkeeping.
- `Entity.type` (single TEXT column) is removed once all callers have
  migrated.
- Badge / chip display: render all of an entity's class names as small
  chips, ordered alphabetically. No "primary" class.
- Existing duplicate entity rows (e.g. the two David 'Dai' Ashurst
  rows) are NOT auto-merged by this task. Merging is a follow-up
  (separate todo). After this task lands, those duplicates still
  appear in `LinkedSwitcher` until a merge mechanism arrives.

Phase A — schema migration:

- Reserve `instance_of` as a property key. Add it to a base/shared
  ontology file (create `data/ontology/base.ttl` if none exists) with
  `rdfs:label "instance_of"`, `sh:datatype xsd:string`, and a
  description. Do NOT place it in a domain-specific file such as
  `welsh-film-tv.ttl` — `instance_of` is cross-domain and must be
  loaded regardless of which domain ontologies the user has active.
  Update `NODI_ONTOLOGY` default-path handling so the base file is
  always loaded.
- Idempotent migration in `src/server/db/client.ts`: for every
  existing `Entity` row whose `type` is non-null, INSERT a `Claim`
  with `subject_entity_id = entity.id`, `property = 'instance_of'`,
  `value = entity.type`, `notable = 0`, `source_id = NULL`. Guard
  against re-running: only insert if no `instance_of` claim already
  exists for the entity.
- Leave the `Entity.type` column in place for now (read parallelism
  during transition).
- Update `docs/schema.sql` comments to note that `type` is deprecated
  and class membership is recorded via `instance_of` claims.

Phase B — server reads:

- Add `getEntityTypes(entity_id): string[]` to
  `src/server/db/queries.ts`. Reads from the `instance_of` claims;
  returns alphabetically-sorted unique class names.
- Update the `Entity` interface and `mapEntity` in
  `src/server/db/queries.ts` to expose `types: string[]` alongside the
  deprecated `type: string`.
- Update the API responses in `src/server/routes/entities.ts` to
  include `types`. Keep `type` populated to whichever value remains in
  the column (do not break older clients during the transition).
- Update label-index / matching engine
  (`src/server/matching/engine.ts`): the matching engine does not
  currently filter by type, so no logic change is expected there —
  confirm with a grep.
- Update active-domain filtering and any other place that reads
  `entity.type` (`grep -rn "\.type" src/server/`) to consult `types`
  where appropriate.
- Review the CSVW exporter (`src/server/routes/export.ts` CSVW handler)
  now, not later: it currently assumes one CSV per entity type. With
  multi-type entities, decide the new shape — either (a) emit an entity
  into every CSV its types match, or (b) flatten to a single CSV keyed
  by entity id with a `types` column. Pick (a) unless schema simplicity
  demands (b); document the decision in `docs/api.md`. Implementation
  lands in Phase C; do not defer this decision.

Phase C — server writes:

- Entity creation (`POST /api/entities`) now writes the requested
  type as both `Entity.type` AND a paired `instance_of` claim, in a
  single transaction. (Dual-write during transition; Phase F drops the
  column write.)
- Template-based creation (the `Actor` / `Person` / `Character` …
  templates from item 11) creates the entity + the `instance_of`
  claim for `target_class` + each seed claim, all in one transaction.
- Adding a type to an existing entity is just creating a new
  `instance_of` claim via `POST /api/claims` — no new endpoint
  required. Document this in `docs/api.md`.
- Removing a type is deleting that `instance_of` claim via
  `DELETE /api/claims/:id` — no new endpoint. Reject deletion if it
  would leave the entity with zero types (TBD: decide whether
  zero-types is allowed; default to allowed for label-only entities).
- Implement the CSVW exporter shape decided in Phase B. Update the
  `metadata.json` schema and the per-type CSV emission accordingly.

Phase D — client reads:

- `Entity.types: string[]` in `src/client/api/types.ts`. Keep `type`
  for back-compat during the transition; mark deprecated.
- Replace `entity.type` reads with `entity.types` everywhere
  (`grep -rn "\\.type" src/client/`). Badge / chip rendering:
  - Locate every `<span className={`badge badge-${entity.type}`}>`
    usage (TopicSection, ActiveTopicSection's `EntityDetailPanel`,
    `ClaimRow`, search results, …). Replace with a row of chips, one
    per type, alphabetically ordered. Reuse the existing badge styles
    so colours per class stay consistent.
  - Empty types: render no chip (entity acts as a label-only row).
- `PropertyPicker` and `getPropertyShape` consumers: filter property
  suggestions by the union of `entity.types` rather than a single
  `subjectType`. Properties whose `sh:class` (or
  `nodi:defaultEntityType` / `nodi:roleLabel`) applies to ANY of the
  entity's types are offered.
- `LinkedSwitcher`: change the per-entity buttons from
  "show entity type" to "show entity primary label + type chips" so
  two separate entities sharing a label are still distinguishable
  during the transition (until merge support arrives).

Phase E — client writes:

- The active topic header's chip row gains a trailing `+ type` button
  that opens a class-picker (use the same template list source as the
  entity-creation flow, restricted to bare classes — no seed-claim
  templates for adding a type to an existing entity). Picking a class
  POSTs an `instance_of` claim.
- Each chip carries a tiny `×` to remove the type (DELETE the
  corresponding `instance_of` claim). Removing the last type is
  allowed and yields a label-only entity; confirm with a small inline
  warning if zero types would result.
- The Claims list (in `EntityDetailPanel` and `EntityDetail`) HIDES
  `instance_of` claims so they are surfaced only as chips, not duplicated
  in the claims rows.

Phase F — cleanup:

- Once all reads/writes use `types` and no UI reads `entity.type`,
  remove the `Entity.type` column. Use the SQLite table-swap pattern
  in `src/server/db/client.ts` (idempotent).
- Remove the deprecated `type` field from API responses and types.
- Update `docs/ARCHITECTURE.md` and `docs/PRD.md` to describe class
  membership as claims.

Acceptance criteria (final state, after all phases):

- An entity may have zero, one, or many class memberships. They are
  stored as `instance_of` claims on the entity, not as a column.
- The right-panel active topic header for David 'Dai' Ashurst, when
  the underlying duplicate entities are merged (separate follow-up),
  shows the chip row `Character FictionalPerson` in alphabetical order.
  Until merge arrives, the two entity rows persist and still appear
  in `LinkedSwitcher`, but each row now shows its single class as a
  chip (not a badge).
- A `character_role` claim with the entity as object renders in the
  relationship panel regardless of which class chip is "active",
  because there are no class-scoped data partitions — claims belong
  to the entity, period.
- Labels added to the entity are visible in every view of that
  entity (no labels lost when switching focus among LinkedSwitcher
  buttons for the SAME entity row).
- Adding a class via the `+ type` button creates an `instance_of`
  claim; the new chip appears in the alphabetical row.
- Removing a class via a chip `×` deletes its `instance_of` claim and
  the chip disappears.
- `Entity.type` column is removed; `grep -rn "entity\.type\b" src/`
  returns no application-code matches.
- `instance_of` claims do not appear in the Claims list rendered by
  `EntityDetailPanel` or `EntityDetail`; they are only surfaced as
  chips.
- Property suggestions in the picker for a multi-class entity show
  the union of properties applicable to each of its classes.
- Existing exports (Turtle, N-Quads, CSVW, QuickStatements) continue
  to work. CSVW reflects the multi-type decision made in Phase B and
  implemented in Phase C; documented in `docs/api.md`.

Out of scope (follow-up todos):

- Merging two existing Entity rows into one. The user's screenshot
  scenario only resolves fully once merge support arrives. The
  refactor here makes merge possible but does not perform it.
- Modelling classes themselves as entities (the other half of strict
  RDF). Class names remain short strings in `instance_of.value` for
  this task.
- Reconciliation alignment with Wikidata's `P31` (instance of). The
  `instance_of` claims here are local; aligning them with Wikidata
  classes is a separate effort.

## 13. Merge Duplicate Entity Rows Into One Multi-Type Entity

Source: completion of item 12. After item 12 lands, an entity can have
multiple `instance_of` claims, but pre-existing duplicate rows (like
the FictionalPerson and Character rows both labelled "David 'Dai'
Ashurst") are still two `Entity.id`s in the database. The user's
screenshot scenario only fully resolves when those rows can be merged
into one entity carrying both class memberships.

Goal: provide a way to merge two or more `Entity` rows into a single
canonical row. The canonical row absorbs every other row's labels,
mentions, external IDs, and claims (including `instance_of` claims).
The non-canonical rows are deleted.

Depends on item 12: this item assumes class membership already lives in
`instance_of` claims, not in `Entity.type`. Do not start this item
before item 12 Phase F.

Stub — full design to be written when the item is picked up. Outline:

- A merge endpoint `POST /api/entities/:canonicalId/merge` accepting
  `{ absorbIds: number[] }`.
- Server-side transaction: for each absorbed entity, update all FK
  references (`Claim.subject_entity_id`, `Claim.object_entity_id`,
  `Mention.entity_id`, `Source.subject_entity_id`,
  `ExternalId.entity_id`, labels, search-log entries) to point at the
  canonical id; deduplicate any rows that become identical post-update
  (e.g. two `instance_of = Person` claims collapse to one); delete the
  absorbed rows.
- A UI affordance in `LinkedSwitcher` (or a dedicated dialog) that
  lets the user pick two rows offered for the same surface form and
  merge them. The canonical id is the user's choice; the other rows
  fold into it.
- Acceptance: post-merge, the merged entity's chip row shows the union
  of types alphabetically; all prior mentions and claims still resolve;
  no orphan rows remain in any FK-referenced table.
- Out of scope: cross-source automatic merging based on Wikidata QID
  match (a separate reconciliation feature).

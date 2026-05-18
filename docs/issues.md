Implementation-located findings as of the last review. See `docs/PRD.md`
§ Known Product Risks for the design-level framing.

  - High: fetched pages are injected directly into the app DOM via innerHTML after only regex-removing
    <script>/<style> (src/client/components/SourceViewer/SourceContent.tsx:73). This contradicts the
    documented "sandboxed container / no external requests" model and can allow hostile markup, event
    handlers, iframes, forms, tracking images, and layout breakage inside the app.
    → PRD risk: "The source rendering surface must be kept safe from hostile fetched markup."
    → Alignment plan step 9.3.

  - Medium: the claim entry forms surface text and entity values uniformly, but the value kind for a
    given property is not enforced. The ontology (`data/ontology/welsh-film-tv.ttl`) declares which
    properties take text, which take entities, and which allow both via `nodi:textAllowed`; the source-
    side and entity-detail claim forms (src/client/components/SourceViewer/EntityPanel.tsx:579,
    src/client/components/Entities/EntityDetail.tsx:317) do not consult that guidance. The PRD direction
    is label-first capture *with* the text/entity distinction preserved — free-form text is fine as a
    starting point, but the UI should surface the value kind once the predicate maps to an ontology
    property.
    → PRD risk: "Claim creation and editing should continue moving toward stronger validation of
    text-valued versus entity-valued properties."

  - Medium: matching has two sources of truth. The server computes normalized plaintext positions (src/
    server/matching/engine.ts:67), but the client ignores those positions and rescans rendered DOM by
    surface_form (src/client/components/SourceViewer/SourceContent.tsx:80). That is simple, but brittle
    for future per-occurrence actions, dismissal, jump-to-mention, and precise provenance.
    → PRD risk: "The server and client matching behavior must stay aligned."

  - Medium: the API boundary is typed but not validated enough. Entity creation casts request type with
    as any, external IDs accept arbitrary systems, and claims can drift from the "exactly one of value/
    object_entity_id" intent. The current UI depends on discipline rather than enforceable contracts.
    → PRD risk: "API request bodies should become more consistently validated over time."
    → Alignment plan step 9.1.

  - Low/Medium UX: the core flow is understandable, but several interactions feel prototype-grade:
    window.prompt for labels/IDs (src/client/components/SourceViewer/EntityPanel.tsx:459), hidden
    keyboard shortcuts that can trigger broad actions like confirm-all (src/client/components/
    SourceViewer/SourceViewer.tsx:413), fixed sidebar/right-panel widths, and little feedback after bulk
    actions.
    → PRD risk: "Prototype-grade interactions such as prompts, broad keyboard shortcuts, and bulk actions
    need careful UX treatment before the product is relied on for large datasets."
    → Alignment plan steps 9.2 and 9.3.

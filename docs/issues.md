  - High: fetched pages are injected directly into the app DOM via innerHTML after only regex-removing
    <script>/<style> (src/client/components/SourceViewer/SourceContent.tsx:73). This contradicts the
    documented “sandboxed container / no external requests” model and can allow hostile markup, event
    handlers, iframes, forms, tracking images, and layout breakage inside the app.
  - Medium: claim entry is too free-form for the data model. The domain docs distinguish text vs entity-valued properties (docs/domain.md:31), but both source-side and entity-detail claim forms only
    collect arbitrary property + string value (src/client/components/SourceViewer/EntityPanel.tsx:579,
    src/client/components/Entities/EntityDetail.tsx:317). This will create inconsistent graph data and
    weaken RDF export quickly.
  - Medium: matching has two sources of truth. The server computes normalized plaintext positions (src/
    server/matching/engine.ts:67), but the client ignores those positions and rescans rendered DOM by
    surface_form (src/client/components/SourceViewer/SourceContent.tsx:80). That is simple, but brittle
    for future per-occurrence actions, dismissal, jump-to-mention, and precise provenance.
  - Medium: the API boundary is typed but not validated enough. Entity creation casts request type with
    as any, external IDs accept arbitrary systems, and claims can drift from the “exactly one of value/
    object_entity_id” intent. The current UI depends on discipline rather than enforceable contracts.
  - Low/Medium UX: the core flow is understandable, but several interactions feel prototype-grade:
    window.prompt for labels/IDs (src/client/components/SourceViewer/EntityPanel.tsx:459), hidden
    keyboard shortcuts that can trigger broad actions like confirm-all (src/client/components/
    SourceViewer/SourceViewer.tsx:413), fixed sidebar/right-panel widths, and little feedback after bulkactions.

import { api } from '../../api/client'

export function ExportView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h1>Export</h1>
      </div>
      <div className="scroll-y" style={{ flex: 1, padding: '24px' }}>
        <div style={{ maxWidth: 500 }}>
          <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
            <h3 style={{ marginBottom: 8, fontSize: 15 }}>Turtle (RDF)</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Exports all entities as linked data using Wikidata PIDs where available.
              Labels become <code>rdfs:label</code> triples. ExternalIDs become <code>owl:sameAs</code>.
            </p>
            <a className="btn btn-primary" href={api.export.turtleUrl()} download="nodi-export.ttl">
              ↓ Download Turtle
            </a>
          </div>

          <div className="card" style={{ padding: '20px 24px' }}>
            <h3 style={{ marginBottom: 8, fontSize: 15 }}>CSV</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Exports all entities as a flat CSV file with type, label, Wikidata QID, mention count, and claim count.
            </p>
            <a className="btn btn-primary" href={api.export.csvUrl()} download="nodi-entities.csv">
              ↓ Download CSV
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

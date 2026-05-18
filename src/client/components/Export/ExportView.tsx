import { useState } from 'react'
import { useOntology } from '../../data/ontology'

type Readiness = 'everything' | 'ontology-mapped' | 'publication-ready'
type RdfFormat = 'turtle' | 'nquads'

const READINESS_OPTIONS: { value: Readiness; label: string; description: string }[] = [
  {
    value: 'everything',
    label: 'Everything captured',
    description: 'Includes unresolved labels and weakly structured claims. Never silently drops data.',
  },
  {
    value: 'ontology-mapped',
    label: 'Ontology-mapped',
    description: 'Only claims expressed with ontology properties.',
  },
  {
    value: 'publication-ready',
    label: 'Ready for external publication',
    description: 'Ontology-mapped and either reconciled to an external database or marked notable.',
  },
]

function buildRdfUrl(readiness: Readiness, domains: string[], format: RdfFormat): string {
  const params = new URLSearchParams()
  params.set('readiness', readiness)
  if (format === 'nquads') params.set('format', 'nquads')
  if (domains.length) params.set('domains', domains.join(','))
  return `/api/export/turtle?${params}`
}

function buildCsvUrl(readiness: Readiness, domains: string[]): string {
  const params = new URLSearchParams()
  params.set('readiness', readiness)
  if (domains.length) params.set('domains', domains.join(','))
  return `/api/export/csv?${params}`
}

export function ExportView() {
  const ontology = useOntology()
  const [readiness, setReadiness] = useState<Readiness>('everything')
  const [selectedDomains, setSelectedDomains] = useState<string[]>([])
  const [rdfFormat, setRdfFormat] = useState<RdfFormat>('turtle')

  const allDomains = ontology
    ? [...new Set(ontology.templates.map(t => t.source))]
    : []

  function toggleDomain(domain: string) {
    setSelectedDomains(prev =>
      prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]
    )
  }

  const rdfUrl = buildRdfUrl(readiness, selectedDomains, rdfFormat)
  const csvUrl = buildCsvUrl(readiness, selectedDomains)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h1>Export</h1>
      </div>
      <div className="scroll-y" style={{ flex: 1, padding: '24px' }}>
        <div style={{ maxWidth: 560 }}>

          <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12, fontSize: 15 }}>Readiness level</h3>
            {READINESS_OPTIONS.map(opt => (
              <label
                key={opt.value}
                style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12, cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="readiness"
                  value={opt.value}
                  checked={readiness === opt.value}
                  onChange={() => setReadiness(opt.value)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{opt.description}</div>
                </div>
              </label>
            ))}
          </div>

          {allDomains.length > 1 && (
            <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12, fontSize: 15 }}>Domain scope</h3>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                Leave all unchecked to include all active domains.
              </p>
              {allDomains.map(domain => (
                <label
                  key={domain}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, cursor: 'pointer', fontSize: 13 }}
                >
                  <input
                    type="checkbox"
                    checked={selectedDomains.includes(domain)}
                    onChange={() => toggleDomain(domain)}
                  />
                  {domain}
                </label>
              ))}
            </div>
          )}

          <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
            <h3 style={{ marginBottom: 12, fontSize: 15 }}>RDF format</h3>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="rdf-format" value="turtle" checked={rdfFormat === 'turtle'} onChange={() => setRdfFormat('turtle')} />
                Turtle
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="rdf-format" value="nquads" checked={rdfFormat === 'nquads'} onChange={() => setRdfFormat('nquads')} />
                N-Quads (with named graphs)
              </label>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              {rdfFormat === 'turtle'
                ? 'Exports entities as linked data using Wikidata PIDs where available. Labels become rdfs:label triples. External IDs become owl:sameAs.'
                : 'Each claim is placed in a named graph derived from its source, preserving provenance.'}
            </p>
            <a
              className="btn btn-primary"
              href={rdfUrl}
              download={rdfFormat === 'nquads' ? 'nodi-export.nq' : 'nodi-export.ttl'}
            >
              ↓ Download {rdfFormat === 'nquads' ? 'N-Quads' : 'Turtle'}
            </a>
          </div>

          <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
            <h3 style={{ marginBottom: 8, fontSize: 15 }}>CSV</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Flat CSV with type, label, Wikidata QID, mention count, and claim count.
            </p>
            <a className="btn btn-primary" href={csvUrl} download="nodi-entities.csv">
              ↓ Download CSV
            </a>
          </div>

          <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
            <h3 style={{ marginBottom: 8, fontSize: 15 }}>CSVW (tabular + schema)</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              ZIP containing one CSV per entity type plus a <code>metadata.json</code> with
              column schemas and Wikidata property mappings.
            </p>
            <a className="btn btn-primary" href={`/api/export/csvw?readiness=${readiness}`} download="nodi-export-csvw.zip">
              ↓ Download CSVW
            </a>
          </div>

          <div className="card" style={{ padding: '20px 24px' }}>
            <h3 style={{ marginBottom: 8, fontSize: 15 }}>QuickStatements (Wikidata)</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Batch upload commands for entities reconciled to Wikidata with ontology-mapped,
              notable or reconciled claims. Uses <em>publication-ready</em> readiness level.
            </p>
            <a className="btn btn-primary" href="/api/export/quickstatements" download="nodi-quickstatements.txt">
              ↓ Download QuickStatements
            </a>
          </div>

        </div>
      </div>
    </div>
  )
}

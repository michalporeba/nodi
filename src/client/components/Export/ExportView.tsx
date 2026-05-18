import { useState } from 'react'
import { useOntology } from '../../data/ontology'
import { api } from '../../api/client'

type Readiness = 'everything' | 'ontology-mapped' | 'publication-ready'

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

function buildTurtleUrl(readiness: Readiness, domains: string[]): string {
  const params = new URLSearchParams()
  params.set('readiness', readiness)
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

  const allDomains = ontology
    ? [...new Set(ontology.templates.map(t => t.source))]
    : []

  function toggleDomain(domain: string) {
    setSelectedDomains(prev =>
      prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]
    )
  }

  const turtleUrl = buildTurtleUrl(readiness, selectedDomains)
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
            <h3 style={{ marginBottom: 8, fontSize: 15 }}>Turtle (RDF)</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Exports entities as linked data using Wikidata PIDs where available.
              Labels become <code>rdfs:label</code> triples. External IDs become <code>owl:sameAs</code>.
            </p>
            <a className="btn btn-primary" href={turtleUrl} download="nodi-export.ttl">
              ↓ Download Turtle
            </a>
          </div>

          <div className="card" style={{ padding: '20px 24px' }}>
            <h3 style={{ marginBottom: 8, fontSize: 15 }}>CSV</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 1.5 }}>
              Exports entities as a flat CSV file with type, label, Wikidata QID, mention count, and claim count.
            </p>
            <a className="btn btn-primary" href={csvUrl} download="nodi-entities.csv">
              ↓ Download CSV
            </a>
          </div>

        </div>
      </div>
    </div>
  )
}

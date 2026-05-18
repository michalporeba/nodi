import { NavLink } from 'react-router-dom'
import { useOntology } from '../data/ontology'
import { useActiveDomains } from '../data/activeDomains'

export function Sidebar() {
  const ontology = useOntology()
  const [activeDomains, setActiveDomains] = useActiveDomains()

  const allDomains = ontology
    ? [...new Set(ontology.templates.map(t => t.source))]
    : []

  function toggleDomain(domain: string) {
    setActiveDomains(
      activeDomains.includes(domain)
        ? activeDomains.filter(d => d !== domain)
        : [...activeDomains, domain]
    )
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        nodi
        <span>graph annotations</span>
      </div>
      <div className="sidebar-nav">
        <NavLink to="/queue" className={({ isActive }) => isActive ? 'active' : ''}>
          <span className="icon">📋</span> Queue
        </NavLink>
        <NavLink to="/entities" className={({ isActive }) => isActive ? 'active' : ''}>
          <span className="icon">🏷️</span> Entities
        </NavLink>
        <NavLink to="/export" className={({ isActive }) => isActive ? 'active' : ''}>
          <span className="icon">📤</span> Export
        </NavLink>
      </div>
      {allDomains.length > 0 && (
        <div style={{ padding: '16px 12px 8px', borderTop: '1px solid #1e293b' }}>
          <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Domains
          </div>
          {allDomains.map(domain => (
            <label
              key={domain}
              style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', cursor: 'pointer', fontSize: 12, color: '#94a3b8' }}
            >
              <input
                type="checkbox"
                checked={activeDomains.length === 0 || activeDomains.includes(domain)}
                onChange={() => toggleDomain(domain)}
                style={{ flexShrink: 0 }}
              />
              {domain}
            </label>
          ))}
          {activeDomains.length > 0 && (
            <button
              onClick={() => setActiveDomains([])}
              style={{ fontSize: 10, color: '#64748b', background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer' }}
            >
              reset
            </button>
          )}
        </div>
      )}
    </nav>
  )
}

import { NavLink } from 'react-router-dom'

export function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        nodi
        <span>Welsh Film &amp; Television</span>
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
    </nav>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { QueueView } from './components/Queue/QueueView'
import { SourceViewer } from './components/SourceViewer/SourceViewer'
import { EntityList } from './components/Entities/EntityList'
import { EntityDetail } from './components/Entities/EntityDetail'
import { ExportView } from './components/Export/ExportView'

export function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/queue" replace />} />
            <Route path="/queue" element={<QueueView />} />
            <Route path="/sources/:id" element={<SourceViewer />} />
            <Route path="/entities" element={<EntityList />} />
            <Route path="/entities/:id" element={<EntityDetail />} />
            <Route path="/export" element={<ExportView />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

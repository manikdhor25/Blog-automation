export default function Loading() {
  return (
    <div className="app-layout">
      {/* Sidebar skeleton */}
      <aside className="sidebar" style={{ overflow: 'hidden' }}>
        <div className="sidebar-logo">
          <div className="skeleton" style={{ height: 24, width: '70%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 10, width: '90%' }} />
        </div>
        <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 36, borderRadius: 8 }} />
          ))}
        </div>
      </aside>

      {/* Main content skeleton */}
      <main className="main-content">
        {/* Page header skeleton */}
        <div className="page-header" style={{ marginBottom: 28 }}>
          <div>
            <div className="skeleton" style={{ height: 28, width: 220, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: 180 }} />
          </div>
          <div className="skeleton" style={{ height: 44, width: 160, borderRadius: 8 }} />
        </div>

        {/* Stat cards skeleton */}
        <div className="stat-grid" style={{ marginBottom: 24 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="stat-card" style={{ minHeight: 90 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="skeleton" style={{ height: 12, width: '50%' }} />
                <div className="skeleton" style={{ height: 20, width: 20, borderRadius: '50%' }} />
              </div>
              <div className="skeleton" style={{ height: 32, width: '40%' }} />
            </div>
          ))}
        </div>

        {/* Content cards skeleton */}
        <div className="grid-2" style={{ gap: 16 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card" style={{ minHeight: 200 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <div className="skeleton" style={{ height: 18, width: '35%' }} />
                <div className="skeleton" style={{ height: 30, width: 80, borderRadius: 8 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="skeleton" style={{ height: 36, borderRadius: 8 }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

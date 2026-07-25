import { lazy, Suspense } from 'react';

import { AccessGate } from './auth/AccessGate.jsx';
import { useAuthorization } from './auth/useAuthorization.js';
import { ScreenErrorBoundary } from './ui/ScreenErrorBoundary.jsx';
import { Skeleton } from './ui/Skeleton.jsx';

const Dashboard = lazy(() => import('./Dashboard.jsx'));

function DashboardFallback() {
  return (
    <main role="status" aria-label="กำลังเปิดแดชบอร์ด" className="min-h-screen bg-slate-50 p-3 sm:p-6 md:p-12">
      <div className="mx-auto max-w-7xl space-y-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
      </div>
    </main>
  );
}

export default function App() {
  const authorization = useAuthorization();

  if (authorization.status !== 'authorized') {
    return <AccessGate authorization={authorization} />;
  }

  return (
    <ScreenErrorBoundary key={authorization.user.uid}>
      <Suspense fallback={<DashboardFallback />}>
        <Dashboard authorization={authorization} />
      </Suspense>
    </ScreenErrorBoundary>
  );
}

import { lazy, Suspense, useMemo, useState } from 'react';
import {
  Clock,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  RotateCw,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';

import { firebaseConfig, useEmulators } from './config/firebase.js';
import { getMonitoringFailurePresentation } from './data/monitoringFailurePresentation.js';
import { canPresentMonitoringAnalytics } from './data/presentationPolicy.js';
import { retryMonitoringData, useMonitoringData } from './data/useMonitoringData.js';
import { createMonitoringAnalytics } from './domain/monitoringAnalytics.js';
import { ScreenErrorBoundary } from './ui/ScreenErrorBoundary.jsx';
import { Skeleton } from './ui/Skeleton.jsx';

const loadOverviewScreen = () => import('./screens/OverviewScreen.jsx');
const loadRoomStatusScreen = () => import('./screens/RoomStatusScreen.jsx');
const loadIndividualScreen = () => import('./screens/IndividualScreen.jsx');

const WORKFLOWS = {
  overview: {
    title: 'Population Trends',
    label: 'ภาพรวม (Overview)',
    mobileLabel: 'ภาพรวม',
    icon: LayoutDashboard,
    preload: loadOverviewScreen,
    Screen: lazy(() => loadOverviewScreen().then(module => ({ default: module.OverviewScreen }))),
  },
  heatmap: {
    title: 'Room Status',
    label: 'สถานะรายห้อง (Heatmap)',
    mobileLabel: 'รายห้อง',
    icon: Users,
    preload: loadRoomStatusScreen,
    Screen: lazy(() => loadRoomStatusScreen().then(module => ({ default: module.RoomStatusScreen }))),
  },
  individual: {
    title: 'Individual Tracking',
    label: 'ติดตามรายบุคคล (Trends)',
    mobileLabel: 'รายบุคคล',
    icon: User,
    preload: loadIndividualScreen,
    Screen: lazy(() => loadIndividualScreen().then(module => ({ default: module.IndividualScreen }))),
  },
};
const SYNC_TIME_FORMATTER = new Intl.DateTimeFormat('th-TH', {
  dateStyle: 'short',
  timeStyle: 'medium',
});
const DATA_STATUS_LABELS = {
  idle: 'Starting',
  connecting: 'Connecting',
  ready: 'Verified',
  degraded: 'Incomplete',
  error: 'Failed',
};

function preloadWorkflow(event) {
  void WORKFLOWS[event.currentTarget.dataset.workflow]?.preload().catch(() => undefined);
}

function ScreenFallback() {
  return (
    <div role="status" className="space-y-6" aria-label="กำลังโหลดหน้าวิเคราะห์">
      <Skeleton className="h-24" />
      <Skeleton className="h-72" />
    </div>
  );
}

export default function Dashboard({ authorization }) {
  const [activeTab, setActiveTab] = useState('overview');
  const { user, role, signOut } = authorization;
  const {
    students,
    logs,
    assessments,
    loading,
    issueCount: invalidRecordCount,
    status: dataStatus,
    truncatedStreams,
    lastUpdatedAt,
    errors,
  } = useMonitoringData();
  const analytics = useMemo(
    () => createMonitoringAnalytics({ students, logs, assessments }),
    [students, logs, assessments],
  );
  const lastSyncLabel = lastUpdatedAt
    ? SYNC_TIME_FORMATTER.format(new Date(lastUpdatedAt))
    : '-';
  const dataStatusLabel = DATA_STATUS_LABELS[dataStatus];
  const dataPending = dataStatus === 'idle' || dataStatus === 'connecting';
  const analyticsAllowed = canPresentMonitoringAnalytics(dataStatus);
  const failurePresentation = dataStatus === 'error'
    ? getMonitoringFailurePresentation(errors, { useEmulators })
    : null;
  const activeWorkflow = WORKFLOWS[activeTab];
  const ActiveScreen = activeWorkflow.Screen;

  return (
    <div className="flex min-h-screen flex-col bg-[#f8fafc] font-sans text-slate-900 lg:flex-row">
      <aside className="sticky top-0 z-20 flex w-full flex-col bg-[#0f172a] text-white shadow-2xl lg:h-screen lg:w-72 lg:flex-shrink-0">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-left lg:block lg:p-8 lg:text-center">
          <div className="flex min-w-0 items-center gap-3 lg:block">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500 shadow-lg shadow-blue-500/30 lg:mx-auto lg:mb-4 lg:h-16 lg:w-16 lg:rounded-2xl">
              <HeartPulse className="h-6 w-6 text-white lg:h-8 lg:w-8" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-black tracking-tighter lg:text-2xl">SENTINEL</h1>
              <p className="mt-0.5 truncate text-[8px] font-bold uppercase tracking-[0.16em] text-blue-400 opacity-70 lg:mt-1 lg:text-[10px] lg:tracking-[0.2em] lg:opacity-60">
                Mental Health Dashboard
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="ออกจากระบบ"
            title="ออกจากระบบ"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 lg:hidden"
          >
            <LogOut size={20} />
          </button>
        </div>

        <nav
          aria-label="หน้าวิเคราะห์"
          className="flex gap-2 overflow-x-auto border-b border-white/5 px-3 py-2 [scrollbar-width:none] lg:mt-4 lg:block lg:flex-1 lg:space-y-2 lg:overflow-visible lg:border-b-0 lg:p-4"
        >
          {Object.entries(WORKFLOWS).map(([id, workflow]) => {
            const Icon = workflow.icon;

            return (
              <button
                key={id}
                type="button"
                data-workflow={id}
                aria-current={activeTab === id ? 'page' : undefined}
                onMouseEnter={preloadWorkflow}
                onFocus={preloadWorkflow}
                onClick={() => setActiveTab(id)}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-bold transition-all duration-300 lg:w-full lg:flex-row lg:justify-start lg:gap-4 lg:rounded-2xl lg:px-6 lg:py-4 lg:text-base ${activeTab === id ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 lg:translate-x-2 lg:shadow-lg' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
              >
                <Icon size={20} className="flex-shrink-0" />
                <span className="lg:hidden">{workflow.mobileLabel}</span>
                <span className="hidden lg:inline">{workflow.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="hidden border-t border-white/5 bg-slate-900/50 p-6 lg:block">
          <p className={`truncate text-[10px] font-bold uppercase tracking-widest ${dataStatus === 'ready' ? 'text-emerald-400' : dataStatus === 'error' ? 'text-rose-400' : 'text-amber-400'}`}>
            Data · {dataStatusLabel}
          </p>
          <p className="mt-1 truncate text-[10px] text-slate-500">
            Last verified sync · {lastSyncLabel}
          </p>
          <p className="mt-3 truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {role} · {user.email}
          </p>
          <button
            type="button"
            onClick={signOut}
            className="mt-3 text-xs font-bold text-slate-400 transition hover:text-white"
          >
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-x-hidden bg-[#f8fafc] p-3 pb-8 sm:p-6 lg:p-12">
        {dataStatus === 'error' && (
          <div role="alert" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <p className="font-bold">{failurePresentation.title}</p>
            <p className="mt-1 text-sm">
              {failurePresentation.detail}
            </p>
            <p className="mt-2 text-sm font-medium">{failurePresentation.recovery}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={retryMonitoringData}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
              >
                <RotateCw size={16} />
                ลองเชื่อมต่ออีกครั้ง
              </button>
              <span className="break-all font-mono text-xs text-rose-700">
                รหัส: {failurePresentation.codes.join(', ')}
              </span>
            </div>
          </div>
        )}
        {dataStatus === 'degraded' && (
          <div role="alert" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <p className="font-bold">ข้อมูลไม่ครบถ้วน — หยุดแสดงผลวิเคราะห์</p>
            <p className="mt-1 text-sm">
              {invalidRecordCount > 0 && `พบข้อมูลไม่ผ่านการตรวจสอบ ${invalidRecordCount} รายการ`}
              {invalidRecordCount > 0 && truncatedStreams.length > 0 && ' และ'}
              {truncatedStreams.length > 0 && `พบข้อมูลเกินขีดจำกัดใน ${truncatedStreams.join(', ')}`}
            </p>
          </div>
        )}

        <header className="mb-6 flex items-end justify-between sm:mb-8 lg:mb-12">
          <div className="min-w-0">
            <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
              {activeWorkflow.title}
            </h2>
            <p className="mt-2 flex min-w-0 items-start font-mono text-xs font-bold leading-5 text-slate-400 sm:mt-3 sm:items-center sm:text-sm">
              <Clock size={16} className="mr-2 mt-0.5 flex-shrink-0 sm:mt-0" />
              <span className="min-w-0 break-words">
                {dataStatus === 'ready'
                  ? `verified sync from ${firebaseConfig.projectId} · ${lastSyncLabel}`
                  : `sync status: ${dataStatusLabel}`}
              </span>
            </p>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl">
          {dataPending ? (
            <section role="status" className="rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center sm:p-12">
              <Clock className="mx-auto text-blue-500" size={36} />
              <h3 className="mt-4 text-lg font-black text-slate-800">
                กำลังยืนยันข้อมูลจากเซิร์ฟเวอร์
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Analytics จะเปิดเมื่อข้อมูลทั้งสาม stream ผ่านการยืนยันครบถ้วน
              </p>
            </section>
          ) : !analyticsAllowed ? (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center sm:p-12">
              <ShieldCheck className="mx-auto text-slate-400" size={36} />
              <h3 className="mt-4 text-lg font-black text-slate-800">Analytics paused</h3>
              <p className="mt-2 text-sm text-slate-500">
                แก้ไขการเชื่อมต่อหรือข้อมูลต้นทางให้ครบถ้วนก่อนใช้ผลติดตาม
              </p>
            </section>
          ) : (
            <ScreenErrorBoundary key={activeTab}>
              <Suspense fallback={<ScreenFallback />}>
                <ActiveScreen analytics={analytics} loading={loading} />
              </Suspense>
            </ScreenErrorBoundary>
          )}
        </main>
      </div>
    </div>
  );
}

import { memo, useMemo, useState } from 'react';
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, ShieldCheck, User } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton.jsx';
import { createFourColorTooltipRows } from '../ui/fourColorPresentation.js';

function WeekTick(value) {
  return `Wk ${value}`;
}

const VIEWPOINT_COLORS = {
  self: '#3b82f6',
  buddy: '#10b981',
  command: '#f59e0b',
};

function FourColorTooltip({ active, payload }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="max-w-[calc(100vw-2rem)] rounded-lg border bg-white p-3 text-xs shadow-xl">
      <p className="mb-2 border-b pb-1 font-bold">{point.date}</p>
      {createFourColorTooltipRows(point).map(row => (
        <p key={row.field} style={{ color: VIEWPOINT_COLORS[row.field] }}>
          {row.label}: {row.value ?? '-'} · {row.source}
        </p>
      ))}
    </div>
  );
}

export const IndividualScreen = memo(function IndividualScreen({ analytics, loading }) {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const studentOptions = useMemo(() => analytics.listStudents(), [analytics]);
  const activeStudentId = studentOptions.some(student => student.id === selectedStudentId)
    ? selectedStudentId
    : (studentOptions[0]?.id ?? '');
  const individual = useMemo(
    () => analytics.getIndividual({ studentId: activeStudentId }),
    [analytics, activeStudentId],
  );

  if (loading.students) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!individual) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center font-bold text-slate-400 sm:p-12">
        ยังไม่มีข้อมูล นรม. ที่ติดตามได้
      </div>
    );
  }

  const { student, latestResilience } = individual;

  return (
    <div className="space-y-6">
      <section className="flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:p-6">
        <h3 className="text-lg font-bold sm:text-xl">
          ผลวิเคราะห์: <span className="text-blue-600">{student.name}</span>
        </h3>
        <select
          aria-label="เลือก นรม. ที่ต้องการติดตาม"
          className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto sm:max-w-[50%] sm:py-2"
          value={activeStudentId}
          onChange={event => setSelectedStudentId(event.target.value)}
        >
          {studentOptions.map(option => (
            <option key={option.id} value={option.id}>
              {option.id} - {option.name}
            </option>
          ))}
        </select>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <aside className="col-span-1 space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
          <h4 className="flex items-center border-b pb-3 font-bold text-blue-600">
            <User size={18} className="mr-2" /> ข้อมูลพื้นฐาน
          </h4>
          <dl className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-slate-500">เพศ:</dt>
              <dd className="max-w-[60%] break-words text-right font-bold text-slate-800">{student.demographics?.gender || '-'}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-slate-500">ห้องพัก:</dt>
              <dd className="max-w-[60%] break-words text-right font-bold text-slate-800">{student.room}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-slate-500">ป่วยกาย (Detail):</dt>
              <dd className="max-w-[60%] break-words text-right font-bold text-slate-800">{student.demographics?.physicalIssueDetail || '-'}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-slate-500">สุขภาพจิต (Detail):</dt>
              <dd className="max-w-[60%] break-words text-right font-bold text-slate-800">{student.demographics?.mentalIssueDetail || '-'}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-slate-500">ความรุนแรงจิตเวช:</dt>
              <dd className={`max-w-[60%] break-words text-right font-bold ${student.demographics?.mentalSeverity === 3 ? 'text-rose-500' : 'text-slate-800'}`}>
                {student.mentalSeverityLabel}
              </dd>
            </div>
          </dl>

          <div className="mt-4 border-t pt-4">
            <h4 className="mb-3 flex items-center font-bold text-purple-600">
              ผลความยืดหยุ่นล่าสุด
              {latestResilience && ` (Wk ${latestResilience.week})`}
            </h4>
            <dl className="space-y-2 rounded-lg border border-purple-100 bg-purple-50 p-3 text-sm">
              <div className="flex justify-between">
                <dt>CD-RISC:</dt>
                <dd className="font-bold text-purple-700">
                  {latestResilience?.cd_risc ?? '-'} ({latestResilience?.cdRiscInterpretation ?? '-'})
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>GRIT:</dt>
                <dd className="font-bold text-emerald-600">
                  {latestResilience?.grit ?? '-'} ({latestResilience?.gritInterpretation ?? '-'})
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-4 border-t pt-4">
            <h4 className="mb-2 flex items-center font-bold text-slate-800">
              <ShieldCheck size={18} className="mr-2 text-purple-500" /> Note (Drawing Test)
            </h4>
            <blockquote className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm italic text-slate-600">
              “{individual.drawingNote}”
            </blockquote>
          </div>
        </aside>

        <div className="col-span-1 space-y-6 xl:col-span-2">
          <section className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
            <h4 className="mb-6 flex items-center font-bold text-slate-800">
              <Activity size={18} className="mr-2 text-blue-500" /> 4 Colors Trend (รายวัน)
            </h4>
            {loading.logs ? <Skeleton className="h-56" /> : (
              <div className="h-56 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={individual.fourColorTrend} margin={{ top: 5, right: 8, left: -16, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="show" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis width={32} domain={[1, 4]} ticks={[1, 2, 3, 4]} />
                    <RechartsTooltip content={<FourColorTooltip />} />
                    <Line type="stepAfter" dataKey="self" name="Self" stroke="#3b82f6" strokeWidth={3} dot={false} />
                    <Line type="stepAfter" dataKey="buddy" name="Buddy" stroke="#10b981" strokeWidth={3} dot={false} />
                    <Line type="stepAfter" dataKey="command" name="Command" stroke="#f59e0b" strokeWidth={3} dot={false} />
                    <Brush dataKey="date" height={20} stroke="#cbd5e1" travellerWidth={10} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <section className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
              <h4 className="mb-6 flex items-center font-bold text-slate-800">
                <ShieldCheck size={18} className="mr-2 text-rose-500" /> DASS-21 (คะแนนดิบ 0–21)
              </h4>
              {loading.assessments ? <Skeleton className="h-56" /> : (
                <div className="h-56 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <LineChart data={individual.assessments} margin={{ top: 5, right: 8, left: -16, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} tickFormatter={WeekTick} />
                      <YAxis width={32} domain={[0, 21]} ticks={[0, 7, 14, 21]} />
                      <RechartsTooltip />
                      <Line type="monotone" dataKey="dass_d" name="D" stroke="#3b82f6" strokeWidth={3} />
                      <Line type="monotone" dataKey="dass_a" name="A" stroke="#f59e0b" strokeWidth={3} />
                      <Line type="monotone" dataKey="dass_s" name="S" stroke="#ef4444" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
              <h4 className="mb-6 flex items-center font-bold text-slate-800">
                <ShieldCheck size={18} className="mr-2 text-purple-500" /> CD-RISC & GRIT
              </h4>
              {loading.assessments ? <Skeleton className="h-56" /> : (
                <div className="h-56 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <LineChart data={individual.resilienceTrend} margin={{ top: 5, right: -8, left: -16, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="week" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={18} tickFormatter={WeekTick} />
                      <YAxis width={36} yAxisId="left" domain={[0, 40]} />
                      <YAxis width={36} yAxisId="right" orientation="right" domain={[0, 32]} />
                      <RechartsTooltip />
                      <Line yAxisId="left" type="monotone" dataKey="cd_risc" name="CD-RISC" stroke="#8b5cf6" strokeWidth={3} />
                      <Line yAxisId="right" type="monotone" dataKey="grit" name="GRIT" stroke="#10b981" strokeWidth={3} strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
});

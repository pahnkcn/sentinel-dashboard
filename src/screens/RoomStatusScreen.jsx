import { memo, useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton.jsx';

const STATUS_COLORS = {
  1: '#22c55e',
  2: '#eab308',
  3: '#f97316',
  4: '#ef4444',
};
const DEFERRED_ROOM_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: '0 320px',
};

function getLocalDate() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

function StatusMark({ value, carriedForward = false, sourceDate = '' }) {
  const label = value == null ? 'ไม่มีข้อมูล' : `ระดับ ${value}`;

  return (
    <div className="text-center">
      <span
        role="img"
        aria-label={label}
        title={label}
        className="mx-auto block h-6 w-6 rounded-md shadow-inner"
        style={{ backgroundColor: STATUS_COLORS[value] ?? '#f1f5f9' }}
      />
      {carriedForward && (
        <span className="mt-1 block text-[9px] font-bold text-amber-600">
          CF {sourceDate}
        </span>
      )}
    </div>
  );
}

function StatusCell({ value, carriedForward = false, sourceDate = '' }) {
  return (
    <td className="p-2 text-center 2xl:p-3">
      <StatusMark
        value={value}
        carriedForward={carriedForward}
        sourceDate={sourceDate}
      />
    </td>
  );
}

function StudentStatusCard({
  student,
  observation,
  assessment,
  resilienceAssessment,
  physicalLabel,
}) {
  const statuses = [
    {
      label: 'Self',
      value: observation?.self,
    },
    {
      label: 'Buddy',
      value: observation?.buddy,
      carriedForward: observation?.isBuddyCF,
      sourceDate: observation?.buddySourceDate,
    },
    {
      label: 'Command',
      value: observation?.command,
      carriedForward: observation?.isCommandCF,
      sourceDate: observation?.commandSourceDate,
    },
  ];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-800">{student.name}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-400">ID {student.id}</p>
        </div>
        <span className="flex-shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-600">
          {student.room}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {statuses.map(status => (
          <div key={status.label} className="rounded-xl bg-slate-50 px-2 py-3">
            <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {status.label}
            </p>
            <StatusMark
              value={status.value}
              carriedForward={status.carriedForward}
              sourceDate={status.sourceDate}
            />
          </div>
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-purple-100 bg-purple-50 p-2">
          <dt className="text-[10px] font-bold text-purple-600">CD-RISC</dt>
          <dd className="mt-1 font-black text-slate-700">
            {resilienceAssessment?.cd_risc ?? '-'}
            {resilienceAssessment && <span className="block text-[9px] font-medium text-slate-400">Wk {resilienceAssessment.week}</span>}
          </dd>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-2">
          <dt className="text-[10px] font-bold text-emerald-600">GRIT</dt>
          <dd className="mt-1 font-black text-slate-700">
            {resilienceAssessment?.grit ?? '-'}
            {resilienceAssessment && <span className="block text-[9px] font-medium text-slate-400">Wk {resilienceAssessment.week}</span>}
          </dd>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-2">
          <dt className="text-[10px] font-bold text-blue-600">D</dt>
          <dd className="mt-1 font-black text-slate-700">{assessment?.dass_d ?? '-'}</dd>
        </div>
        <div className="rounded-xl border border-orange-100 bg-orange-50 p-2">
          <dt className="text-[10px] font-bold text-orange-500">A</dt>
          <dd className="mt-1 font-black text-slate-700">{assessment?.dass_a ?? '-'}</dd>
        </div>
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-2">
          <dt className="text-[10px] font-bold text-rose-500">S</dt>
          <dd className="mt-1 font-black text-slate-700">{assessment?.dass_s ?? '-'}</dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
          <dt className="text-[10px] font-bold text-slate-500">ป่วยกาย</dt>
          <dd className="mt-1 break-words text-xs font-bold text-slate-700">{physicalLabel}</dd>
        </div>
      </dl>
    </article>
  );
}

function RoomSection({ room }) {
  return (
    <section className="mb-8 sm:mb-10" style={DEFERRED_ROOM_STYLE}>
      <h4 className="mb-4 inline-block rounded-full border border-blue-100 bg-blue-50/50 px-4 py-1 text-base font-bold text-blue-700 sm:text-lg">
        ห้องพัก: {room.name}
      </h4>

      <div className="grid gap-3 sm:grid-cols-2 2xl:hidden">
        {room.students.map(studentStatus => (
          <StudentStatusCard
            key={studentStatus.student.id}
            {...studentStatus}
          />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-100 2xl:block">
        <table className="w-full table-fixed text-left text-sm">
          <caption className="sr-only">สถานะของ นรม. ห้องพัก {room.name}</caption>
          <thead className="bg-slate-50/80 text-slate-500">
            <tr>
              <th className="w-[9%] p-3 font-bold">ID</th>
              <th className="w-[18%] p-3 font-bold">ชื่อ-สกุล</th>
              <th className="p-3 text-center font-bold">Self</th>
              <th className="p-3 text-center font-bold">Buddy</th>
              <th className="p-3 text-center font-bold">Command</th>
              <th className="border-l p-3 text-center font-bold text-purple-600">CD-RISC</th>
              <th className="p-3 text-center font-bold text-emerald-600">GRIT</th>
              <th className="p-3 text-center font-bold text-blue-600" title="Depression (ซึมเศร้า)">D</th>
              <th className="p-3 text-center font-bold text-orange-500" title="Anxiety (วิตกกังวล)">A</th>
              <th className="p-3 text-center font-bold text-rose-500" title="Stress (ความเครียด)">S</th>
              <th className="border-l p-3 text-center font-bold">ป่วยกาย</th>
            </tr>
          </thead>
          <tbody>
            {room.students.map(({
              student,
              observation,
              assessment,
              resilienceAssessment,
              physicalLabel,
            }) => (
              <tr key={student.id} className="border-b border-slate-50 transition hover:bg-slate-50/50">
                <td className="break-words p-3 font-medium text-slate-400">{student.id}</td>
                <td className="break-words p-3 font-bold text-slate-700">{student.name}</td>
                <StatusCell value={observation?.self} />
                <StatusCell
                  value={observation?.buddy}
                  carriedForward={observation?.isBuddyCF}
                  sourceDate={observation?.buddySourceDate}
                />
                <StatusCell
                  value={observation?.command}
                  carriedForward={observation?.isCommandCF}
                  sourceDate={observation?.commandSourceDate}
                />
                <td className="border-l p-3 text-center font-bold text-slate-600">
                  {resilienceAssessment?.cd_risc ?? '-'}
                  {resilienceAssessment && (
                    <span className="mt-1 block text-[9px] font-medium text-slate-400">
                      Wk {resilienceAssessment.week}
                    </span>
                  )}
                </td>
                <td className="p-3 text-center font-bold text-slate-600">
                  {resilienceAssessment?.grit ?? '-'}
                  {resilienceAssessment && (
                    <span className="mt-1 block text-[9px] font-medium text-slate-400">
                      Wk {resilienceAssessment.week}
                    </span>
                  )}
                </td>
                <td className="p-3 text-center font-bold text-slate-600">{assessment?.dass_d ?? '-'}</td>
                <td className="p-3 text-center font-bold text-slate-600">{assessment?.dass_a ?? '-'}</td>
                <td className="p-3 text-center font-bold text-slate-600">{assessment?.dass_s ?? '-'}</td>
                <td className="break-words border-l p-3 text-center font-bold text-slate-600">{physicalLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export const RoomStatusScreen = memo(function RoomStatusScreen({ analytics, loading }) {
  const observationDates = useMemo(
    () => analytics.listObservationDates(),
    [analytics],
  );
  const firstObservationDate = observationDates[0];
  const latestObservationDate = observationDates.at(-1);
  const [selectedDate, setSelectedDate] = useState(
    () => latestObservationDate ?? getLocalDate(),
  );
  const roomStatus = useMemo(
    () => analytics.getRoomStatus({ date: selectedDate }),
    [analytics, selectedDate],
  );
  const isLoading = loading.students || loading.logs || loading.assessments;

  return (
    <section className="min-h-[60vh] rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:min-h-[600px] sm:p-8">
      <div className="mb-6 flex flex-col items-stretch justify-between gap-4 border-b pb-5 sm:mb-8 sm:items-center sm:pb-6 md:flex-row">
        <h3 className="text-lg font-black text-slate-800 sm:text-xl">Heatmap สถานะรายห้องพัก</h3>
        <div className="flex w-full flex-wrap items-center gap-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:w-auto">
          <Calendar size={18} className="mr-3 text-slate-400" />
          <label htmlFor="room-status-date" className="mr-3 text-sm font-bold text-slate-600">
            เลือกวันที่:
          </label>
          <input
            id="room-status-date"
            type="date"
            className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm font-bold outline-none sm:flex-none"
            value={selectedDate}
            min={firstObservationDate}
            max={latestObservationDate}
            onChange={event => setSelectedDate(event.target.value)}
          />
        </div>
      </div>

      <div className="mb-6 flex w-full flex-wrap gap-x-4 gap-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500 sm:gap-x-6">
        <span><b className="text-blue-600">D</b> = Depression (ซึมเศร้า)</span>
        <span><b className="text-orange-500">A</b> = Anxiety (วิตกกังวล)</span>
        <span><b className="text-rose-500">S</b> = Stress (ความเครียด)</span>
        <span><b className="text-amber-600">CF</b> = ค่าจากวันที่ก่อนหน้า</span>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map(item => <Skeleton key={item} className="h-40" />)}
        </div>
      ) : roomStatus.rooms.length > 0 ? (
        roomStatus.rooms.map(room => <RoomSection key={room.name} room={room} />)
      ) : (
        <div className="p-10 text-center text-slate-400 sm:p-20">ยังไม่มีข้อมูล นรม. ในระบบ</div>
      )}
    </section>
  );
});

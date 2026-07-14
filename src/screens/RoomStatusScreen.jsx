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

function StatusCell({ value, carriedForward = false, sourceDate = '' }) {
  const label = value == null ? 'ไม่มีข้อมูล' : `ระดับ ${value}`;

  return (
    <td className="p-4 text-center">
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
    </td>
  );
}

function RoomSection({ room }) {
  return (
    <section className="mb-10" style={DEFERRED_ROOM_STYLE}>
      <h4 className="mb-4 inline-block rounded-full border border-blue-100 bg-blue-50/50 px-4 py-1 text-lg font-bold text-blue-700">
        ห้องพัก: {room.name}
      </h4>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">สถานะของ นรม. ห้องพัก {room.name}</caption>
          <thead className="bg-slate-50/80 text-slate-500">
            <tr>
              <th className="p-4 font-bold">ID</th>
              <th className="p-4 font-bold">ชื่อ-สกุล</th>
              <th className="p-4 text-center font-bold">Self</th>
              <th className="p-4 text-center font-bold">Buddy</th>
              <th className="p-4 text-center font-bold">Command</th>
              <th className="border-l p-4 text-center font-bold text-purple-600">CD-RISC</th>
              <th className="p-4 text-center font-bold text-emerald-600">GRIT</th>
              <th className="p-4 text-center font-bold text-blue-600" title="Depression (ซึมเศร้า)">D</th>
              <th className="p-4 text-center font-bold text-orange-500" title="Anxiety (วิตกกังวล)">A</th>
              <th className="p-4 text-center font-bold text-rose-500" title="Stress (ความเครียด)">S</th>
              <th className="border-l p-4 text-center font-bold">ป่วยกาย</th>
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
                <td className="p-4 font-medium text-slate-400">{student.id}</td>
                <td className="p-4 font-bold text-slate-700">{student.name}</td>
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
                <td className="border-l p-4 text-center font-bold text-slate-600">
                  {resilienceAssessment?.cd_risc ?? '-'}
                  {resilienceAssessment && (
                    <span className="mt-1 block text-[9px] font-medium text-slate-400">
                      Wk {resilienceAssessment.week}
                    </span>
                  )}
                </td>
                <td className="p-4 text-center font-bold text-slate-600">
                  {resilienceAssessment?.grit ?? '-'}
                  {resilienceAssessment && (
                    <span className="mt-1 block text-[9px] font-medium text-slate-400">
                      Wk {resilienceAssessment.week}
                    </span>
                  )}
                </td>
                <td className="p-4 text-center font-bold text-slate-600">{assessment?.dass_d ?? '-'}</td>
                <td className="p-4 text-center font-bold text-slate-600">{assessment?.dass_a ?? '-'}</td>
                <td className="p-4 text-center font-bold text-slate-600">{assessment?.dass_s ?? '-'}</td>
                <td className="border-l p-4 text-center font-bold text-slate-600">{physicalLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export const RoomStatusScreen = memo(function RoomStatusScreen({ analytics, loading }) {
  const [selectedDate, setSelectedDate] = useState(getLocalDate);
  const roomStatus = useMemo(
    () => analytics.getRoomStatus({ date: selectedDate }),
    [analytics, selectedDate],
  );
  const isLoading = loading.students || loading.logs || loading.assessments;

  return (
    <section className="min-h-[600px] rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
      <div className="mb-8 flex flex-col items-center justify-between gap-4 border-b pb-6 md:flex-row">
        <h3 className="text-xl font-black text-slate-800">Heatmap สถานะรายห้องพัก</h3>
        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-3">
          <Calendar size={18} className="mr-3 text-slate-400" />
          <label htmlFor="room-status-date" className="mr-3 text-sm font-bold text-slate-600">
            เลือกวันที่:
          </label>
          <input
            id="room-status-date"
            type="date"
            className="rounded-lg border bg-white px-3 py-1.5 text-sm font-bold outline-none"
            value={selectedDate}
            onChange={event => setSelectedDate(event.target.value)}
          />
        </div>
      </div>

      <div className="mb-6 inline-flex space-x-6 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
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
        <div className="p-20 text-center text-slate-400">ยังไม่มีข้อมูล นรม. ในระบบ</div>
      )}
    </section>
  );
});

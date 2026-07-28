import { Component } from 'react';
import { ShieldAlert } from 'lucide-react';

export class ScreenErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-12 text-center">
        <ShieldAlert className="mx-auto text-rose-500" size={36} />
        <h3 className="mt-4 text-lg font-black text-slate-800">ไม่สามารถแสดงผลส่วนนี้ได้</h3>
        <p className="mt-2 text-sm text-slate-500">
          ระบบหยุดแสดงข้อมูลในส่วนที่เกิดข้อผิดพลาด กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-700"
        >
          โหลดหน้าใหม่
        </button>
      </section>
    );
  }
}

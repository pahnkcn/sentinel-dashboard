import { HeartPulse, LogIn, LogOut, ShieldAlert } from 'lucide-react';

export function AccessGate({ authorization }) {
  const { status, user, message, signIn, signOut } = authorization;
  const isBusy = status === 'loading' || status === 'authenticating';
  const isUnauthorized = status === 'unauthorized';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white sm:p-6">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl sm:p-8" aria-live="polite">
        <div className="w-16 h-16 bg-blue-500 rounded-2xl mb-6 flex items-center justify-center shadow-lg shadow-blue-500/30">
          {isUnauthorized ? <ShieldAlert size={32} /> : <HeartPulse size={32} />}
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">Sentinel</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">
          {isUnauthorized ? 'ไม่มีสิทธิ์เข้าถึง' : 'Staff sign-in required'}
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          แดชบอร์ดนี้มีข้อมูลสุขภาพที่มีความอ่อนไหว โปรดเข้าสู่ระบบด้วยบัญชีองค์กรที่ได้รับสิทธิ์
        </p>

        {user?.email && (
          <p className="mt-4 rounded-xl bg-slate-800 px-4 py-3 text-sm text-slate-300">
            บัญชี: <span className="font-bold text-white">{user.email}</span>
          </p>
        )}

        {message && <p className="mt-4 text-sm font-semibold text-amber-300">{message}</p>}

        <div className="mt-8 flex flex-col gap-3">
          {!isUnauthorized && (
            <button
              type="button"
              disabled={isBusy}
              onClick={signIn}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-bold transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60"
            >
              <LogIn size={18} />
              {isBusy ? 'กำลังตรวจสอบสิทธิ์…' : 'Sign in with Google'}
            </button>
          )}

          {user && (
            <button
              type="button"
              onClick={signOut}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-bold text-slate-200 transition hover:bg-white/5"
            >
              <LogOut size={18} /> ออกจากระบบ
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

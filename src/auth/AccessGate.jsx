import { useEffect, useRef, useState } from 'react';
import { HeartPulse, LogOut, ShieldAlert } from 'lucide-react';

import { getGoogleClientId, loadGoogleIdentity } from './authSession.js';

export function AccessGate({ authorization }) {
  const { status, user, message, signIn, signOut } = authorization;
  const googleButtonRef = useRef(null);
  const [googleError, setGoogleError] = useState('');
  const isBusy = status === 'loading' || status === 'authenticating';
  const isUnauthorized = status === 'unauthorized';
  const clientId = getGoogleClientId();

  useEffect(() => {
    if (isBusy || isUnauthorized || !clientId || !googleButtonRef.current) return undefined;
    let active = true;
    setGoogleError('');

    loadGoogleIdentity()
      .then(identity => {
        if (!active || !googleButtonRef.current) return;
        googleButtonRef.current.replaceChildren();
        identity.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: response => {
            if (active && typeof response?.credential === 'string') {
              void signIn(response.credential);
            }
          },
        });
        identity.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'filled_blue',
          size: 'large',
          shape: 'rectangular',
          text: 'signin_with',
          width: 320,
        });
      })
      .catch(() => {
        if (active) setGoogleError('ไม่สามารถโหลด Google Sign-In ได้ กรุณาลองรีเฟรชหน้า');
      });

    return () => {
      active = false;
    };
  }, [clientId, isBusy, isUnauthorized, signIn]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white sm:p-6">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl sm:p-8" aria-live="polite">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/30">
          {isUnauthorized ? <ShieldAlert size={32} /> : <HeartPulse size={32} />}
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-400">Sentinel</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">
          {isUnauthorized ? 'ไม่มีสิทธิ์เข้าถึง' : 'Staff sign-in required'}
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          แดชบอร์ดนี้ใช้ข้อมูลสังเคราะห์สำหรับการสาธิต โปรดเข้าสู่ระบบด้วยบัญชี Google ที่ได้รับสิทธิ์
        </p>

        {user?.email && (
          <p className="mt-4 rounded-xl bg-slate-800 px-4 py-3 text-sm text-slate-300">
            บัญชี: <span className="font-bold text-white">{user.email}</span>
          </p>
        )}

        {(message || googleError || !clientId) && (
          <p className="mt-4 text-sm font-semibold text-amber-300">
            {message || googleError || 'ยังไม่ได้ตั้งค่า VITE_GOOGLE_CLIENT_ID'}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3">
          {!isUnauthorized && !isBusy && clientId && (
            <div ref={googleButtonRef} className="flex min-h-11 justify-center" />
          )}
          {isBusy && (
            <p role="status" className="rounded-xl bg-slate-800 px-5 py-3 text-center font-bold text-slate-300">
              กำลังตรวจสอบสิทธิ์…
            </p>
          )}

          {(user || isUnauthorized) && (
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

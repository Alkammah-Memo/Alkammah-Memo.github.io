import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, ScanFace } from 'lucide-react';
import { disableLock, readLock, unlockWithBiometrics } from '../../lib/appLock';
import { signOutUser } from '../../lib/cloud';

/**
 * Wraps the whole app. When the Face ID lock is on, the app stays mounted (nothing in progress is lost) but is hidden
 * and unreachable until the device confirms the owner. It locks on opening and after the chosen time away.
 */
export const AppLockGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locked, setLocked] = useState<boolean>(() => readLock() !== null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await unlockWithBiometrics();
    setBusy(false);
    if (ok) setLocked(false);
    else setFailed(true);
  }, [busy]);

  useEffect(() => {
    const onVis = () => {
      const cfg = readLock();
      if (!cfg) return;
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current !== null) {
        const away = (Date.now() - hiddenAt.current) / 60000;
        hiddenAt.current = null;
        if (away >= cfg.timeout) setLocked(true);
      }
    };
    const onChange = () => {
      if (!readLock()) setLocked(false);
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('alkammah-lock-changed', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('alkammah-lock-changed', onChange);
    };
  }, []);

  // try once automatically when it locks (some browsers need a tap; the button always works)
  const auto = useRef(false);
  useEffect(() => {
    if (locked && !auto.current) {
      auto.current = true;
      void unlock();
    }
    if (!locked) auto.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  return (
    <>
      <div
        style={locked ? { visibility: 'hidden' } : undefined}
        aria-hidden={locked || undefined}
        inert={locked}
      >
        {children}
      </div>
      {locked && (
        <div className="fixed inset-0 z-[100000] bg-[#11161F] flex items-center justify-center p-6" role="dialog" aria-label="App locked">
          <div className="w-full max-w-xs text-center text-white space-y-5">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-white/10 flex items-center justify-center">
              <ScanFace className="w-8 h-8 text-[#D4AF37]" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Alkammah Memo is locked</h1>
              <p className="text-xs text-slate-400 mt-1">Use Face ID or Touch ID to open it.</p>
            </div>
            <button
              type="button"
              onClick={unlock}
              disabled={busy}
              className="w-full h-12 rounded-2xl bg-[#0071e3] hover:bg-[#0062c4] text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanFace className="w-4 h-4" />}
              Unlock
            </button>
            {failed && <p className="text-xs text-rose-300">Not recognised. Try again.</p>}
            <button
              type="button"
              onClick={() => {
                disableLock();
                void signOutUser().finally(() => setLocked(false));
              }}
              className="text-xs text-slate-400 underline min-h-9"
            >
              Use my password instead
            </button>
          </div>
        </div>
      )}
    </>
  );
};

import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { setNewPassword } from '../../lib/cloud';
import { passwordProblem } from '../../lib/passwordRules';

/** Shown after the person opens the "reset my password" e-mail link: choose a new password, then continue into the app. */
export const ResetPasswordScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const problem = passwordProblem(pw);
    if (problem) return setError(problem);
    if (pw !== pw2) return setError('The two passwords do not match.');
    setBusy(true);
    setError('');
    try {
      await setNewPassword(pw);
      // drop the one-time link from the address bar
      history.replaceState(null, '', location.pathname);
      onDone();
    } catch (err) {
      setError((err as Error)?.message || 'Could not change the password.');
    } finally {
      setBusy(false);
    }
  };

  const input =
    'mt-1 w-full h-11 px-3 rounded-xl border border-[#d2d2d7] text-sm outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20';
  return (
    <div className="min-h-[100dvh] bg-[#11161F] flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-7 space-y-4 border border-white/10">
        <div className="flex flex-col items-center text-center gap-2 pb-2">
          <div className="w-12 h-12 rounded-2xl bg-[#11161F] flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#1d1d1f]">Choose a new password</h1>
          <p className="text-xs text-[#515154]">At least 10 characters, with letters and numbers.</p>
        </div>
        <label className="block text-xs font-semibold text-[#515154]">
          New password
          <input type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={input} />
        </label>
        <label className="block text-xs font-semibold text-[#515154]">
          Repeat new password
          <input type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={input} />
        </label>
        {error && <div className="text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-800 p-3">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 rounded-xl bg-[#0071e3] hover:bg-[#0062c4] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Save new password
        </button>
      </form>
    </div>
  );
};

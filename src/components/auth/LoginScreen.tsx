import React, { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { signInWithPassword } from '../../lib/cloud';

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await signInWithPassword(email, password);
    } catch (err) {
      const msg = (err as Error)?.message || 'Sign-in failed';
      setError(/invalid login/i.test(msg) ? 'Incorrect email or password.' : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#11161F] flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-7 space-y-4 border border-white/10"
      >
        <div className="flex flex-col items-center text-center gap-2 pb-2">
          <div className="w-12 h-12 rounded-2xl bg-[#11161F] flex items-center justify-center">
            <Lock className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#1d1d1f]">Alkammah Memo</h1>
          <p className="text-xs text-[#515154]">Private executive workspace. Sign in to continue.</p>
        </div>

        <label className="block text-xs font-semibold text-[#515154]">
          Email
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full h-11 px-3 rounded-xl border border-[#d2d2d7] text-sm outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
          />
        </label>
        <label className="block text-xs font-semibold text-[#515154]">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full h-11 px-3 rounded-xl border border-[#d2d2d7] text-sm outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20"
          />
        </label>

        {error && <div className="text-xs rounded-xl bg-rose-50 border border-rose-200 text-rose-800 p-3">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 rounded-xl bg-[#0071e3] hover:bg-[#0062c4] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Sign in
        </button>
      </form>
    </div>
  );
};

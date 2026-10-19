import React, { useState, useSyncExternalStore } from 'react';
import { Cake, X } from 'lucide-react';
import { birthdaysOn, getTeam, nameOf, subscribeTeam } from '../../lib/team';

const key = (day: string) => `alkammah_bday_seen_${day}`;

/** "Today is X's birthday" (and a greeting on your own), once a day, with a shortcut to write to them. */
export const BirthdayBanner: React.FC<{ ar: boolean; today: string; onWish: (userId: string) => void }> = ({ ar, today, onWish }) => {
  const team = useSyncExternalStore(subscribeTeam, getTeam);
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(key(today)) === '1';
    } catch {
      return false;
    }
  });
  const list = birthdaysOn(team.profiles, today);
  if (hidden || list.length === 0) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(key(today), '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="mb-3 rounded-2xl border border-pink-200 bg-gradient-to-r from-pink-50 to-amber-50 p-3 flex items-start gap-3">
      <Cake className="w-6 h-6 text-pink-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1.5">
        {list.map((p) => {
          const mine = p.user_id === team.meId;
          return (
            <div key={p.user_id} className="flex items-center gap-2 flex-wrap text-sm">
              <span className="font-bold text-[#1d1d1f]">
                {mine ? (ar ? 'كل عام وأنت بخير! اليوم عيد ميلادك 🎉' : 'Happy birthday! Today is your day 🎉') : ar ? `اليوم عيد ميلاد ${nameOf(p)} 🎂` : `Today is ${nameOf(p)}'s birthday 🎂`}
              </span>
              {!mine && (
                <button type="button" onClick={() => onWish(p.user_id)} className="min-h-9 px-3 rounded-lg bg-white border border-pink-200 text-xs font-bold text-pink-800">
                  {ar ? 'أرسل تهنئة' : 'Send wishes'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={close} aria-label={ar ? 'إغلاق' : 'Close'} className="min-h-10 min-w-10 -m-1 inline-flex items-center justify-center text-[#6e6e73]">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

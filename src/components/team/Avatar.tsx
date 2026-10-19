import React, { useState } from 'react';
import { safeImageUrl } from '../../lib/drive';
import { nameOf } from '../../lib/team';

const TONES = ['bg-sky-100 text-sky-800', 'bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-800', 'bg-violet-100 text-violet-800', 'bg-teal-100 text-teal-800'];

/** A round picture of a person, or their initials when there is no picture (or it cannot be loaded). */
export const Avatar: React.FC<{
  person?: { user_id?: string; display_name: string; email: string; avatar_url: string };
  size?: number;
  className?: string;
}> = ({ person, size = 36, className = '' }) => {
  const [bad, setBad] = useState<string>('');
  const url = safeImageUrl(person?.avatar_url);
  const name = person ? nameOf(person) : '?';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join('')
    .toUpperCase();
  const tone = TONES[Math.abs(Array.from(person?.user_id || name).reduce((a, c) => a + c.charCodeAt(0), 0)) % TONES.length];
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.38) } as const;
  if (url && bad !== url)
    return <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setBad(url)} style={style} className={`rounded-full object-cover shrink-0 bg-stone-100 ${className}`} />;
  return (
    <span style={style} className={`rounded-full shrink-0 inline-flex items-center justify-center font-bold ${tone} ${className}`} aria-hidden>
      {initials || '?'}
    </span>
  );
};

/**
 * Who Spero is talking to. Every signed-in person gets their own name and the right Arabic grammar (he / she);
 * nothing is hard-coded to one person. App.tsx sets it from the person's profile as soon as it is known.
 */
export interface SperoUser {
  /** how Spero addresses the person in Arabic, e.g. "المهندس محمد" (empty = just "حضرتك") */
  address: string;
  /** the same in English, e.g. "Eng. Mohamed" (empty = no name) */
  addressEn: string;
  /** full name for the system prompt */
  fullName: string;
  /** job title, e.g. "المدير التنفيذي" */
  title: string;
  female: boolean;
}

/** The account owner's original setup (used for the administrator account until a name is set, and when there is no cloud). */
export const OWNER_DEFAULT: SperoUser = { address: 'المهندس محمد', addressEn: 'Eng. Mohamed', fullName: 'محمد القماح', title: 'المدير التنفيذي', female: false };
const NOBODY: SperoUser = { address: '', addressEn: '', fullName: '', title: '', female: false };

let current: SperoUser = OWNER_DEFAULT;
export const getSperoUser = (): SperoUser => current;
export const setSperoUser = (u: SperoUser): void => {
  current = u;
};

/** Builds it from a profile: the name the person typed is used as is (it may already include "Eng." or "د."). */
export function speroUserFrom(p: { display_name: string; role: string } | undefined, female: boolean): SperoUser {
  const name = p?.display_name.trim() || '';
  if (!name) return p?.role === 'admin' ? OWNER_DEFAULT : { ...NOBODY, female };
  return { address: name, addressEn: name, fullName: name, title: p?.role === 'admin' ? 'مدير النظام' : 'مدير', female };
}

/** "المهندس محمد" or, when there is no name, a polite "حضرتك" — for short fixed replies. */
export const callAr = (): string => current.address || 'حضرتك';
/** ", Eng. Mohamed" or '' — appended to short English replies. */
export const callEn = (): string => (current.addressEn ? `, ${current.addressEn}` : '');

// ----- "Spero calls me he / she": an account-level choice (saved with the other account preferences)
let femalePref = false;
const prefListeners = new Set<() => void>();
export const getFemalePref = () => femalePref;
export const setFemalePref = (v: boolean) => {
  if (v === femalePref) return;
  femalePref = v;
  prefListeners.forEach((l) => l());
};
export const subscribeFemalePref = (l: () => void) => {
  prefListeners.add(l);
  return () => {
    prefListeners.delete(l);
  };
};

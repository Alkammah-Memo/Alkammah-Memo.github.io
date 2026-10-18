/**
 * Face ID / Touch ID lock (WebAuthn platform authenticator).
 * A second door on top of the e-mail + password sign-in: when it is on, the app is covered until the device itself
 * confirms the owner's face or fingerprint. The biometric never leaves the device; the app only learns "yes" or "no".
 * The credential id lives on this device only, so every device sets its own lock.
 */
const KEY = 'alkammah_applock_v1';

export type LockTimeout = 0 | 1 | 5 | 15; // minutes away before the lock returns (0 = every time the app is left)

interface LockConfig {
  credId: string; // base64url
  timeout: LockTimeout;
}

const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = (str: string): Uint8Array => {
  const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const raw = atob(s);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

export function readLock(): LockConfig | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v.credId === 'string' ? { credId: v.credId, timeout: [0, 1, 5, 15].includes(v.timeout) ? v.timeout : 1 } : null;
  } catch {
    return null;
  }
}
function writeLock(c: LockConfig | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('alkammah-lock-changed'));
}

export async function biometricsAvailable(): Promise<boolean> {
  try {
    return Boolean(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
  } catch {
    return false;
  }
}

/** turn the lock on: registers this device's Face ID / Touch ID (the OS shows its own prompt) */
export async function enableLock(accountLabel: string, timeout: LockTimeout = 1): Promise<void> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: 'Alkammah Memo', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: accountLabel || 'owner', displayName: accountLabel || 'Owner' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Face ID setup was cancelled.');
  writeLock({ credId: b64(cred.rawId), timeout });
}

export function setLockTimeout(timeout: LockTimeout) {
  const c = readLock();
  if (c) writeLock({ ...c, timeout });
}

export function disableLock() {
  writeLock(null);
}

/** ask the device to confirm the owner; resolves true only after a successful Face ID / Touch ID */
export async function unlockWithBiometrics(): Promise<boolean> {
  const c = readLock();
  if (!c) return true;
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: challenge(),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: unb64(c.credId) as BufferSource, transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return Boolean(res);
  } catch {
    return false;
  }
}

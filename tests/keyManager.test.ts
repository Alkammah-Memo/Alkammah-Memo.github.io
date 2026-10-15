import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  keyManager,
  runWithFailover,
  classifyError,
  NoKeysConfiguredError,
  AllKeysFailedError,
  DEFAULT_MODELS,
} from '../src/lib/ai/keyManager';

async function configure(keys: string[]) {
  const slots = keyManager.getSettings().slots.map((s, i) => ({
    ...s,
    key: keys[i] || '',
    status: 'untested' as const,
    cooldownUntil: undefined,
    message: undefined,
  }));
  await keyManager.save({ slots, models: DEFAULT_MODELS, preferredSlotId: undefined }, { persistRemote: false });
}

const quotaError = () => Object.assign(new Error('429 RESOURCE_EXHAUSTED: quota exceeded'), { status: 429 });

describe('classifyError', () => {
  it('recognises quota, auth, overload and network problems', () => {
    expect(classifyError(quotaError()).kind).toBe('quota');
    expect(classifyError(new Error('API key not valid. Please pass a valid API key.')).kind).toBe('auth');
    expect(classifyError(Object.assign(new Error('The model is overloaded'), { status: 503 })).kind).toBe('overloaded');
    expect(classifyError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(classifyError(Object.assign(new Error('Bad schema'), { status: 400 })).retryable).toBe(false);
  });
});

describe('runWithFailover', () => {
  beforeEach(async () => {
    await configure(['KEY-A', 'KEY-B', 'KEY-C']);
  });

  it('uses the first key when healthy', async () => {
    const op = vi.fn(async (k: string) => `ok:${k}`);
    expect(await runWithFailover(op)).toBe('ok:KEY-A');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('switches to the next key immediately on a quota error and remembers it', async () => {
    const op = vi.fn(async (k: string) => {
      if (k === 'KEY-A') throw quotaError();
      return `ok:${k}`;
    });
    expect(await runWithFailover(op)).toBe('ok:KEY-B');
    expect(keyManager.getSettings().preferredSlotId).toBe(2);
    expect(keyManager.getSettings().slots[0].status).toBe('limited');

    // the next request goes straight to the healthy key without touching the resting one
    op.mockClear();
    expect(await runWithFailover(op)).toBe('ok:KEY-B');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('falls through all three keys', async () => {
    const op = async (k: string) => {
      if (k !== 'KEY-C') throw quotaError();
      return 'ok:C';
    };
    expect(await runWithFailover(op)).toBe('ok:C');
  });

  it('keeps retrying every key in later rounds and recovers when one comes back', async () => {
    let calls = 0;
    const op = async (k: string) => {
      calls++;
      if (calls <= 3) throw quotaError(); // round 1: everything is down
      return `ok:${k}`; // round 2: service is back
    };
    const result = await runWithFailover(op, { maxRounds: 3 });
    expect(result.startsWith('ok:')).toBe(true);
    expect(calls).toBe(4);
  });

  it('gives up with a clear error only after all rounds fail', async () => {
    const op = async () => {
      throw quotaError();
    };
    await expect(runWithFailover(op, { maxRounds: 2 })).rejects.toBeInstanceOf(AllKeysFailedError);
  });

  it('does not burn through keys for a malformed request', async () => {
    const op = vi.fn(async () => {
      throw Object.assign(new Error('INVALID_ARGUMENT: bad request'), { status: 400 });
    });
    await expect(runWithFailover(op)).rejects.toThrow(/INVALID_ARGUMENT/);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('reports missing keys', async () => {
    await configure([]);
    await expect(runWithFailover(async () => 1)).rejects.toBeInstanceOf(NoKeysConfiguredError);
  });

  it('works with only a single key configured', async () => {
    await configure(['', 'ONLY', '']);
    expect(await runWithFailover(async (k) => k)).toBe('ONLY');
  });
});

describe('error messages', () => {
  it('extracts the readable sentence from SDK JSON errors', () => {
    const err = new Error('got status: 400 . {"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}');
    const c = classifyError(err);
    expect(c.kind).toBe('auth');
    expect(c.message).toContain('API key not valid. Please pass a valid API key.');
    expect(c.message).not.toContain('{"error"');
  });
});

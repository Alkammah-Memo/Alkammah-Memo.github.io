import { describe, expect, it } from 'vitest';
import { passwordProblem } from '../src/lib/passwordRules';

describe('passwordProblem', () => {
  it('rejects short, simple or letters-only passwords', () => {
    expect(passwordProblem('abc123')).not.toBeNull();
    expect(passwordProblem('abcdefghijkl')).not.toBeNull();
    expect(passwordProblem('1234567890')).not.toBeNull();
    expect(passwordProblem('aaaaaaaaaaaa')).not.toBeNull();
  });
  it('accepts a long mix of letters and numbers', () => {
    expect(passwordProblem('Blue-Falcon-2026')).toBeNull();
  });
});

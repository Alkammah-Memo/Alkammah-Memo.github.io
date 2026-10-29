import { describe, it, expect } from 'vitest';
import { resolveOwners } from '../src/lib/directory';
import type { Person } from '../src/types';

const P = (name: string, initials: string): Person => ({ id: name, workspaceId: 'w', name, initials, role: '', department: '', company: '', isAliasVerified: true, isActive: true, createdAt: '', updatedAt: '' });
const dir = [P('Yara Adel', 'YA'), P('Amira Azmi', 'AZ'), P('Mona Mostafa', 'MM'), P('Ali Aziz', 'AA'), P('Amr Adly', 'AA')];

describe('resolveOwners', () => {
  it('turns handwritten initials into the directory name', () => {
    expect(resolveOwners('YA', dir)).toBe('Yara Adel');
    expect(resolveOwners('A.Z.', dir)).toBe('Amira Azmi');
    expect(resolveOwners('ya, mm', dir)).toBe('Yara Adel, Mona Mostafa');
  });
  it('keeps unknown or ambiguous initials as written', () => {
    expect(resolveOwners('XX', dir)).toBe('XX');
    expect(resolveOwners('AA', dir)).toBe('AA');
    expect(resolveOwners('Unassigned', dir)).toBe('Unassigned');
  });
});

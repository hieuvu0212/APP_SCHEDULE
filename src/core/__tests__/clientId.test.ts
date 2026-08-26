import { describe, it, expect } from 'vitest';
import { clientIdFromName } from '../clientId';

describe('clientIdFromName', () => {
  it('generates the same id for the same name', () => {
    expect(clientIdFromName('Gia')).toBe('client-gia');
    expect(clientIdFromName('Gia Bảo')).toBe('client-gia-bao');
  });

  it('normalizes casing, accents, and extra spaces', () => {
    const expected = 'client-gia-bao';
    expect(clientIdFromName('Gia Bảo')).toBe(expected);
    expect(clientIdFromName('gia bảo')).toBe(expected);
    expect(clientIdFromName('  Gia   BẢO ')).toBe(expected);
    expect(clientIdFromName('Gia Bão')).toBe(expected);
  });

  it('returns null for empty or punctuation-only names', () => {
    expect(clientIdFromName('')).toBeNull();
    expect(clientIdFromName('   ')).toBeNull();
    expect(clientIdFromName('???')).toBeNull();
    expect(clientIdFromName('---')).toBeNull();
    expect(clientIdFromName('- ')).toBeNull();
  });

  it('simulates migration on two different machines (deterministic)', () => {
    const listMachineA = ['Gia', 'Minh', 'Nguyệt Nga'].map(clientIdFromName);
    const listMachineB = ['  Gia ', 'MINH', 'nguyệt nga'].map(clientIdFromName);
    
    expect(listMachineA).toEqual(listMachineB);
  });
});

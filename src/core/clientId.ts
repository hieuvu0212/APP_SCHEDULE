import { normalizeText } from './filter';

export function clientIdFromName(name: string): string | null {
  const normalized = normalizeText(name);
  if (!normalized) return null;
  
  const idStr = normalized
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
    
  if (!/[a-z0-9]/.test(idStr)) return null;
  return `client-${idStr}`;
}

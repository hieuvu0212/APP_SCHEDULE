import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import type { } from '../types';

export function useClients() {
  return useLiveQuery(() => db.clients.filter(c => !c.deletedAt).toArray()) ?? [];
}

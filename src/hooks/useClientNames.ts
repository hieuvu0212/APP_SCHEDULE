import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';

export function useClientNames(): Map<string, string> {
  const map = useLiveQuery(async () => {
    const clients = await db.clients.toArray();
    return new Map(clients.map(c => [c.id, c.name]));
  }, []);
  return map ?? new Map();
}

export async function fetchClientNames(): Promise<Map<string, string>> {
  const clients = await db.clients.toArray();
  return new Map(clients.map(c => [c.id, c.name]));
}

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';

export function useKnownClients(): string[] {
  return useLiveQuery(async () => {
    const clients = await db.clients.toArray();
    return clients.filter(c => !c.deletedAt).map(c => c.name);
  }, []) ?? [];
}

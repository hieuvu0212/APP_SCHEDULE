import { db, newId, nowISO } from '../schema';
import { clientIdFromName } from '../../core/clientId';
import { normalizeText } from '../../core/filter';
import type { Client } from '../../types';

/** Mọi đối tượng chưa xóa. Nơi DUY NHẤT đọc `db.clients` cho tầng giao diện. */
export async function listClients(): Promise<Client[]> {
  const rows = await db.clients.toArray();
  return rows.filter((c) => !c.deletedAt);
}

export async function ensureClient(name: string): Promise<Client> {
  const deterministicId = clientIdFromName(name);
  const id = deterministicId || newId();
  
  const existing = await db.clients.get(id);
  
  const t = nowISO();

  if (!existing) {
    const newClient: Client = {
      id,
      name,
      createdAt: t,
      updatedAt: t,
    };
    await db.clients.put(newClient);
    return newClient;
  }

  if (normalizeText(existing.name) === normalizeText(name)) {
    return existing;
  }

  const fallbackId = newId();
  const fallbackClient: Client = {
    id: fallbackId,
    name,
    createdAt: t,
    updatedAt: t,
  };
  await db.clients.put(fallbackClient);
  return fallbackClient;
}

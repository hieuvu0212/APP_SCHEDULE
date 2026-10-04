import { db, newId, nowISO } from '../schema';
import { clientIdFromName, collisionClientId } from '../../core/clientId';
import { normalizeText } from '../../core/filter';
import type { Client } from '../../types';

/** Mọi đối tượng chưa xóa. Nơi DUY NHẤT đọc `db.clients` cho tầng giao diện. */
export async function listClients(): Promise<Client[]> {
  const rows = await db.clients.toArray();
  return rows.filter((c) => !c.deletedAt);
}

async function createClient(id: string, name: string): Promise<Client> {
  const t = nowISO();
  const client: Client = { id, name, createdAt: t, updatedAt: t };
  await db.clients.put(client);
  return client;
}

export async function ensureClient(name: string): Promise<Client> {
  const key = normalizeText(name);
  const id = clientIdFromName(name) || newId();

  const existing = await db.clients.get(id);
  if (!existing) return createClient(id, name);
  if (normalizeText(existing.name) === key) return existing;

  // ─── Id chính đã thuộc về một người KHÁC tên ────────────────────────────
  //
  // `小明 minh` / `大明 minh`, hoặc `Minh` / `Minh!`. Trước đây nhánh này
  // dùng `newId()`, nên gõ lại tên của người thứ hai là đẻ thêm một đối tượng
  // mỗi lần — xem `collisionClientId()`.

  // Người thứ hai có thể đã được tạo bằng `newId()` ngẫu nhiên từ trước bản
  // này. Tìm theo tên để gõ lại vẫn trỏ về đúng bản ghi cũ thay vì sinh thêm
  // một bản `client-c_…` song song. Chỉ quét bảng khi đã trùng — hiếm.
  const byName = (await db.clients.toArray()).find(
    (c) => c.id !== id && normalizeText(c.name) === key,
  );
  if (byName) return byName;

  const altId = collisionClientId(name);
  if (altId && !(await db.clients.get(altId))) return createClient(altId, name);

  // Id dự phòng cũng đã có chủ (tới đây nghĩa là KHÁC tên, vì cùng tên đã
  // được `byName` bắt) — đụng độ băm 32-bit trên đúng tên đã trùng. Không còn
  // gì tất định để dùng nữa.
  return createClient(newId(), name);
}

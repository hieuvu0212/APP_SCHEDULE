import { useLiveQuery } from 'dexie-react-hooks';
import { listClients } from '../db/repo/clients';

/**
 * Tên các Đối tượng đã có, để `parseQuickAdd` nhận ra tên người trong câu.
 *
 * Đi qua `db/repo/` chứ không gọi thẳng `db.clients` — quy tắc bất di bất dịch
 * số 2. Bản trước đọc thẳng Dexie ở đây, và đó là chỗ duy nhất trong hooks/
 * làm vậy.
 */
export function useKnownClients(): string[] {
  return useLiveQuery(async () => (await listClients()).map((c) => c.name), []) ?? [];
}

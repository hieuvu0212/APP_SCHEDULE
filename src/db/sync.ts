// ═══════════════════════════════════════════════════════════════════════════
//  db/sync.ts — đồng bộ hai chiều IndexedDB ↔ Supabase
//
//  Phép so sánh "ai thắng" nằm ở core/sync.ts, phép gộp theo từng trường ở
//  core/fieldMerge.ts, và cả hai có test. File này chỉ lo việc nói chuyện với
//  mạng và với Dexie, cộng bốn phép biến đổi hình dạng dữ liệu mà chỗ nào cũng
//  dễ làm sai, và ghi BẢN GỐC (db/syncBase.ts) sau mỗi lần hai bên khớp nhau.
//
//  ⚠️ ĐÂY LÀ ĐOẠN MÃ NGUY HIỂM NHẤT TRONG DỰ ÁN.
//  Mọi thứ khác cùng lắm làm hỏng dữ liệu trên MỘT máy, và đã có sao lưu để
//  quay về. Chỗ này ghi đè được cả hai phía cùng lúc, và nó ghi đè lên chính
//  cái mà người dùng tưởng là bản dự phòng của mình.
//
//  ─── BỐN PHÉP BIẾN ĐỔI, VÀ VÌ SAO CHÚNG KHÔNG ĐỐI XỨNG ────────────────────
//
//  1. TÊN TRƯỜNG   camelCase ↔ snake_case. Chỉ ở TẦNG NGOÀI CÙNG.
//     `tags` và `daysOfWeek` là mảng giá trị nguyên thủy, không phải mảng
//     object — đệ quy vào trong chúng chỉ tốn công.
//
//  2. `user_id`    Gắn vào lúc đẩy, GỠ RA lúc kéo về.
//     Bản đồng bộ đầu tiên giữ lại nó, nên mọi bản ghi kéo về đều mọc thêm
//     một trường `userId` mà phần còn lại của ứng dụng không biết tới, rồi
//     trôi thẳng vào file sao lưu.
//
//  3. `null` → VẮNG MẶT khi kéo về.
//     Postgres trả về `null` cho mọi cột trống; bản ghi tạo tại máy thì đơn
//     giản là KHÔNG CÓ trường đó. Không chuẩn hóa thì cùng một buổi có hai
//     hình dạng khác nhau tùy nó sinh ra ở đâu — và `deletedAt: null` là một
//     giá trị KHÁC với `deletedAt` vắng mặt đối với mọi phép kiểm `in`.
//
//  4. VẮNG MẶT → `null` khi đẩy lên.  ← QUAN TRỌNG NHẤT, ĐỌC KỸ
//
//     Khôi phục từ Thùng rác XÓA HẲN thuộc tính `deletedAt` (Dexie hiểu
//     `undefined` là lệnh xóa thuộc tính — README nói rõ). Nên payload đẩy lên
//     không có khóa `deleted_at` nào cả.
//
//     PostgREST dựng danh sách cột từ HỢP các khóa của cả lô, rồi sinh
//     `INSERT … ON CONFLICT DO UPDATE`. Cột không có trong danh sách thì
//     KHÔNG được cập nhật — tombstone cũ trên đám mây nằm nguyên. Bản ghi
//     thành "sống ở máy này, chết trên đám mây", và mọi máy khác kéo về sẽ
//     thấy nó vẫn bị xóa. Thao tác khôi phục biến mất không dấu vết.
//
//     Tệ hơn: hành vi phụ thuộc vào việc trong LÔ ĐÓ có bản ghi nào khác đang
//     mang `deleted_at` hay không. Cùng một thao tác, lúc chạy lúc không, tùy
//     người dùng vừa xóa cái gì khác. Loại lỗi không bao giờ tái hiện được
//     theo yêu cầu.
//
//     Cách chữa: điền ĐỦ MỌI CỘT cho từng dòng đẩy lên, thiếu thì `null`.
//     Danh sách cột lấy từ chính dữ liệu vừa kéo về — PostgREST luôn trả đủ
//     mọi cột kể cả cột null, nên nó là nguồn chính xác nhất và không cần
//     thêm một bản khai lược đồ thứ ba để lệch.
// ═══════════════════════════════════════════════════════════════════════════

import type { BackupTable } from '../core/backup';
import { BACKUP_TABLES } from '../core/backup';
import { planSync, summarize, type SyncReport, type TableSyncResult } from '../core/sync';
import { mergeRecords } from '../core/fieldMerge';
import { getSupabase } from './cloud';
import { nowISO } from './schema';
import { dropUnusedSeedDuplicates } from './dedupe';
import { loadBases, saveBases } from './syncBase';
import { tableOf, type SoftDeletableRow } from './tables';

export type CloudRow = Record<string, unknown>;

/**
 * Cổng nối ra đám mây.
 *
 * Tồn tại để bộ test thay được bằng một bản giả. Không có nó thì cách duy
 * nhất để kiểm tra tầng này là gọi Supabase thật — chậm, cần mạng, cần tài
 * khoản, và không dựng nổi các tình huống mới là thứ đáng test: khôi phục sau
 * khi xóa, hai máy sửa cùng một buổi, một bảng lỗi giữa chừng.
 */
/** Một dòng trong bản kê: chỉ đủ để so ai mới hơn, không kèm nội dung */
export interface ManifestRow {
  id: string;
  updatedAt?: string;
}

export interface CloudTransport {
  userId: string;

  /**
   * Bản kê: chỉ `id` và `updated_at` của MỌI dòng.
   *
   * ⚠️ ĐÂY LÀ THỨ KHIẾN ĐỒNG BỘ TRỞ THÀNH GIA TĂNG.
   *
   * `planSync()` chỉ cần đúng hai trường đó (cộng bản gốc lưu ở máy) để quyết
   * định ai thắng — nội dung bản ghi chỉ cần cho dòng phải kéo về, và cho
   * số rất ít dòng hai máy cùng sửa phải gộp. Nên không có lý do gì tải cả
   * nghìn dòng đầy đủ về rồi vứt đi 99% trong số chúng.
   *
   * Một dòng kê nặng khoảng 60 byte; một buổi học đầy đủ (tiêu đề, ghi chú,
   * địa điểm, tên đối tượng) dễ dàng vượt 300. Với hai năm lịch thì đó là
   * khác biệt giữa vài chục KB và vài MB mỗi lần bấm Đồng bộ.
   *
   * Cách này KHÔNG dùng mốc thời gian (watermark), và đó là chủ đích: mốc thời
   * gian đòi hai đồng hồ phải khớp nhau. Máy có đồng hồ chạy chậm sẽ sinh
   * `updatedAt` nhỏ hơn mốc và bản ghi của nó KHÔNG BAO GIỜ được đẩy lên —
   * mất dữ liệu âm thầm, không lỗi, không cách nào phát hiện. Bản kê thì so
   * trực tiếp hai bên nên lệch đồng hồ không tạo ra được trạng thái đó.
   */
  fetchManifest(table: string): Promise<ManifestRow[]>;

  /** Nội dung đầy đủ của đúng những dòng cần kéo về */
  fetchByIds(table: string, ids: string[]): Promise<CloudRow[]>;

  /**
   * Một dòng bất kỳ, chỉ để biết bảng có những cột nào.
   *
   * Cần khi có dòng phải đẩy lên nhưng không có dòng nào phải kéo về — lúc đó
   * không có mẫu nào để suy ra danh sách cột. Trả `null` nếu bảng rỗng.
   */
  fetchSample(table: string): Promise<CloudRow | null>;

  upsert(table: string, rows: CloudRow[]): Promise<void>;

  /**
   * Xóa CỨNG theo id — dùng cho Thùng rác → Xóa vĩnh viễn.
   *
   * ⚠️ Không có nó thì xóa vĩnh viễn ở máy chỉ xóa được một nửa: hàng trên
   * đám mây còn nguyên, và lần đồng bộ kế tiếp kéo nó về. BẢN GHI SỐNG LẠI.
   * Người dùng xóa lần nữa, nó lại về — một vòng lặp không có lối ra mà nhìn
   * từ phía họ thì giống hệt như ứng dụng bị hỏng.
   */
  deleteByIds(table: string, ids: string[]): Promise<void>;
}

export type CloudErrorCode = 'notConfigured' | 'notSignedIn';

/**
 * Mang MÃ LỖI chứ không mang câu tiếng Việt.
 *
 * Tầng giao diện dịch mã đó qua i18n. Bản trước ném `new Error('Chưa đăng
 * nhập')` rồi tầng trên dò chuỗi bằng `.includes('Lỗi')` để chọn màu chữ —
 * hỏng ngay khi đổi sang tiếng Anh, và không có gì báo.
 */
export class CloudError extends Error {
  // Khai trường tường minh, KHÔNG dùng thuộc tính-tham-số của TypeScript
  // (`constructor(readonly code: …)`). `erasableSyntaxOnly` bật trong
  // tsconfig cấm cú pháp nào không xóa được thuần bằng phép bóc kiểu — đó là
  // điều kiện để Node và trình duyệt chạy thẳng .ts mà không cần biên dịch.
  readonly code: CloudErrorCode;

  constructor(code: CloudErrorCode) {
    super(code);
    this.name = 'CloudError';
    this.code = code;
  }
}

// ─── Biến đổi hình dạng ────────────────────────────────────────────────────

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Đám mây → local. Xem phép biến đổi 2 và 3 ở đầu file. */
export function fromCloud(row: CloudRow): SoftDeletableRow {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === 'user_id' || value === null) continue;
    out[toCamel(key)] = value;
  }
  return out as SoftDeletableRow;
}

/** Local → đám mây. Xem phép biến đổi 1, 2 và 4 ở đầu file. */
export function toCloud(row: SoftDeletableRow, columns: string[], userId: string): CloudRow {
  const snake: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    snake[toSnake(key)] = value;
  }

  const out: CloudRow = {};
  for (const col of columns) {
    // `??` chứ không phải `||`: `false` và `0` là giá trị hợp lệ.
    out[col] = snake[col] ?? null;
  }
  out.user_id = userId;
  return out;
}

/**
 * Danh sách cột đầy đủ của một bảng.
 *
 * Ưu tiên tuyệt đối cho dữ liệu vừa kéo về: PostgREST trả đủ mọi cột kể cả
 * cột null, nên một dòng bất kỳ là bản khai lược đồ chính xác nhất có thể có
 * — và nó không thể lệch khỏi máy chủ theo cách một danh sách viết tay sẽ
 * lệch.
 *
 * Bảng đám mây rỗng thì không có gì để tham chiếu, nhưng cũng không sao: mọi
 * dòng đẩy lên đều là INSERT, và INSERT không cần xóa giá trị cũ nào cả.
 * `deleted_at` vẫn thêm vào bằng tay để bản ghi đã xóa mềm đi lên đúng ngay
 * từ lần đồng bộ đầu tiên.
 */
export function columnsFor(cloudRows: CloudRow[], localRows: SoftDeletableRow[]): string[] {
  if (cloudRows.length > 0) return Object.keys(cloudRows[0]);

  const cols = new Set<string>(['deleted_at']);
  for (const row of localRows) {
    for (const key of Object.keys(row)) {
      if (key === 'userId') continue; // rác do bản đồng bộ cũ để lại
      cols.add(toSnake(key));
    }
  }
  return [...cols];
}

/** Một dòng mẫu để biết lược đồ, hoặc mảng rỗng nếu bảng đám mây chưa có gì */
async function sampleOf(transport: CloudTransport, table: string): Promise<CloudRow[]> {
  const row = await transport.fetchSample(table);
  return row ? [row] : [];
}

// ─── Vòng đồng bộ ──────────────────────────────────────────────────────────

async function syncTable(
  transport: CloudTransport,
  name: BackupTable,
): Promise<TableSyncResult> {
  const remote = toSnake(name);
  try {
    const table = tableOf(name);
    const local = await table.toArray();
    const bases = await loadBases(name, transport.userId);

    // BƯỚC 1 — bản kê. Chỉ id + updatedAt, đủ để `planSync` quyết định.
    const manifest = await transport.fetchManifest(remote);
    const plan = planSync<{ id: string; updatedAt?: string }>(local, manifest, [...bases.values()]);

    // Dòng đang khớp mà thiếu bản gốc: ghi bản gốc từ bản local, không tải gì.
    // Đây là đường để dữ liệu đồng bộ từ trước khi có tính năng này cũng được
    // gộp theo trường ngay từ lần sửa đầu tiên sau đó.
    const localById = new Map(local.map((row) => [row.id, row]));
    const fullLocal = (refs: { id: string }[]) =>
      refs.map((r) => localById.get(r.id)).filter((r): r is SoftDeletableRow => r !== undefined);
    await saveBases(name, transport.userId, fullLocal(plan.toRebase));

    // BƯỚC 2 — chỉ tải nội dung của những dòng THẬT SỰ cần: kéo về, và gộp.
    // Gộp cần nội dung đám mây; gom chung một lượt `fetchByIds` với dòng kéo.
    const mergeIds = new Set(plan.toMerge.map((r) => r.id));
    const wanted = [...plan.toPull, ...plan.toMerge].map((r) => r.id);
    const fetched = wanted.length > 0 ? await transport.fetchByIds(remote, wanted) : [];
    const pulledRaw = fetched.filter((r) => !mergeIds.has(String(r.id)));

    // Kéo TRƯỚC, đẩy SAU. Cả hai tính từ cùng một ảnh chụp nên thứ tự không
    // đổi kết quả, nhưng kéo trước nghĩa là nếu đứt mạng giữa chừng thì máy
    // này đã nhận được thứ nó chưa có — hướng mất mát ít đau hơn.
    if (pulledRaw.length > 0) {
      const pulled = pulledRaw.map(fromCloud);
      await table.bulkPut(pulled);
      await saveBases(name, transport.userId, pulled);
    }

    // BƯỚC 3 — gộp theo từng trường những dòng hai máy cùng sửa.
    //
    // Bản gộp ghi xuống máy NGAY, trước khi đẩy. Đẩy hỏng thì lần sau gộp lại
    // (bản gốc chưa đổi, local giờ là bản gộp) và ra đúng kết quả cũ — các
    // trường đám mây đã sửa nay "đổi ở cả hai phía thành cùng một giá trị".
    const now = nowISO();
    const merged: SoftDeletableRow[] = [];
    for (const raw of fetched) {
      if (!mergeIds.has(String(raw.id))) continue;
      const theirs = fromCloud(raw);
      const mine = localById.get(theirs.id);
      const was = bases.get(theirs.id);
      if (!mine || !was) continue;
      merged.push(mergeRecords(was, mine, theirs, now).merged);
    }
    if (merged.length > 0) await table.bulkPut(merged);

    const rows = [...fullLocal(plan.toPush), ...merged];
    if (rows.length > 0) {
      // Danh sách cột suy từ dòng vừa tải về. Không tải dòng nào thì hỏi máy
      // chủ một dòng mẫu — nhưng CHỈ khi thật sự cần, và chỉ một dòng.
      const sample = fetched.length > 0 ? fetched : await sampleOf(transport, remote);

      const columns = columnsFor(sample, rows);
      await transport.upsert(
        remote,
        rows.map((row) => toCloud(row, columns, transport.userId)),
      );
      // SAU `upsert`, không trước — xem chú thích của `saveBases`.
      await saveBases(name, transport.userId, rows);
    }

    return {
      table: name,
      pushed: rows.length,
      pulled: plan.toPull.length,
      merged: merged.length,
      inSync: plan.inSync,
    };
  } catch (error) {
    // ⚠️ MỘT BẢNG HỎNG KHÔNG ĐƯỢC KÉO THEO BẢY BẢNG CÒN LẠI.
    //
    // Bản trước `throw` thẳng trong vòng lặp. `salary_rules` đứng thứ năm và
    // lược đồ của nó sai, nên adjustments, adjustment_templates và payments
    // KHÔNG BAO GIỜ được đồng bộ — trong khi người dùng chỉ thấy một dòng
    // "Lỗi đồng bộ" và tưởng là mạng chập chờn.
    return {
      table: name,
      pushed: 0,
      pulled: 0,
      merged: 0,
      inSync: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Đồng bộ hai chiều toàn bộ dữ liệu.
 *
 * ⚠️ THỨ TỰ BACKUP_TABLES LÀ CÓ Ý NGHĨA, ĐỪNG SẮP XẾP LẠI CHO ĐẸP.
 * Đám mây có khóa ngoại ghép: `rules` trỏ tới `categories`, `exceptions` trỏ
 * tới `rules`. Đẩy con trước cha là vi phạm ràng buộc. Thứ tự hiện tại
 * (categories → rules → exceptions → …) đã đúng chiều phụ thuộc.
 *
 * Không ném khi một bảng lỗi — lỗi nằm trong báo cáo trả về, theo từng bảng.
 * Chỉ ném khi chưa cấu hình hoặc chưa đăng nhập, vì khi đó không có việc gì
 * để làm cả.
 */
export async function syncWithCloud(transport?: CloudTransport): Promise<SyncReport> {
  const t = transport ?? (await syncTransport());
  const results: TableSyncResult[] = [];
  for (const name of BACKUP_TABLES) {
    results.push(await syncTable(t, name));
  }

  // Máy mới cài app tự seed năm danh mục mẫu, rồi lần đồng bộ đầu tiên kéo về
  // năm danh mục thật của người dùng — thành mười. Bước dọn này bỏ đi những
  // bản seed CHƯA hề được dùng tới. Xem core/dedupe.ts.
  //
  // Đặt sau vòng đồng bộ chứ không trong nó: nó cần nhìn thấy dữ liệu SAU KHI
  // đã kéo về đủ, và nó chỉ đụng vào dữ liệu cục bộ.
  //
  // Nuốt lỗi có chủ đích — đây là việc dọn dẹp, không phải việc chính. Làm
  // hỏng cả báo cáo đồng bộ vì một bước dọn là đánh đổi sai.
  try {
    await dropUnusedSeedDuplicates();
  } catch {
    /* không sao, lần đồng bộ sau dọn tiếp */
  }

  return summarize(results);
}

// ─── Cổng nối Supabase thật ────────────────────────────────────────────────

/** PostgREST trả tối đa 1000 dòng mỗi lượt. Xem chú thích trong `page()`. */
const PAGE_SIZE = 1000;

/**
 * Số id tối đa nhét vào một mệnh đề `in(…)`.
 *
 * PostgREST nhận bộ lọc qua chuỗi truy vấn, và máy chủ có giới hạn độ dài URL
 * (thường 8–16 KB). Mỗi UUID chiếm 37 ký tự, nên khoảng 200 id là chạm ngưỡng
 * an toàn. Vượt qua thì lỗi trả về là `414 URI Too Long` — một mã lỗi HTTP
 * chẳng nói gì về nguyên nhân thật, và chỉ xuất hiện với người dùng có nhiều
 * dữ liệu nhất.
 */
const ID_BATCH = 200;

/**
 * Cổng nối tới Supabase thật.
 *
 * Export vì `db/purge.ts` cũng cần nó — xóa vĩnh viễn phải chạm tới đám mây,
 * và dựng một cổng nối thứ hai ở đó sẽ là bản sao thứ hai của logic đăng nhập
 * và phân trang.
 *
 * Ném `CloudError` khi chưa cấu hình hoặc chưa đăng nhập. Nơi gọi quyết định
 * đó là lỗi hay chỉ là lý do để bỏ qua phần đám mây.
 */
export async function syncTransport(): Promise<CloudTransport> {
  const supabase = await getSupabase();
  if (!supabase) throw new CloudError('notConfigured');

  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) throw new CloudError('notSignedIn');

  /**
   * Đọc hết một truy vấn, cuộn qua từng trang.
   *
   * ⚠️ PHẢI PHÂN TRANG. `select()` trần trả về TỐI ĐA 1000 dòng và KHÔNG báo
   * là đã cắt. Hai năm lịch dạy kèm dễ dàng vượt 1000 exception. Hậu quả không
   * phải là lỗi mà là im lặng: máy mới chỉ nhận 1000 dòng đầu, người dùng thấy
   * lịch thiếu một mảng và không hiểu vì sao.
   */
  async function page<T>(
    build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await build(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
    }
    return rows;
  }

  return {
    userId: user.id,

    async fetchManifest(table) {
      const rows = await page<{ id: string; updated_at: string | null }>((from, to) =>
        supabase.from(table).select('id,updated_at').range(from, to),
      );
      return rows.map((r) => ({ id: r.id, updatedAt: r.updated_at ?? undefined }));
    },

    async fetchByIds(table, ids) {
      const out: CloudRow[] = [];
      for (let i = 0; i < ids.length; i += ID_BATCH) {
        const batch = ids.slice(i, i + ID_BATCH);
        const rows = await page<CloudRow>((from, to) =>
          supabase.from(table).select('*').in('id', batch).range(from, to),
        );
        out.push(...rows);
      }
      return out;
    },

    async fetchSample(table) {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) throw new Error(error.message);
      return data?.[0] ?? null;
    },

    async deleteByIds(table, ids) {
      for (let i = 0; i < ids.length; i += ID_BATCH) {
        const { error } = await supabase
          .from(table)
          .delete()
          .in('id', ids.slice(i, i + ID_BATCH));
        if (error) throw new Error(error.message);
      }
    },

    async upsert(table, rows) {
      // `onConflict` khai TƯỜNG MINH vì khóa chính là GHÉP `(user_id, id)`,
      // không phải `id`. Xem lý do trong supabase_schema.sql — tóm tắt:
      // `UNCATEGORIZED_ID` là hằng số cố định nên mọi người dùng đều tạo ra
      // một Category mang cùng một id.
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'user_id,id' });
      if (error) throw new Error(error.message);
    },
  };
}

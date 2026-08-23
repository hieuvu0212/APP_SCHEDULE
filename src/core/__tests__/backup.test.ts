import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  backupFileName,
  countRecords,
  mergeById,
  validateBackup,
} from '../backup';

const SCHEMA = 1;

function file(over: Record<string, unknown> = {}) {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA,
    exportedAt: '2026-08-21T15:00:00.000Z',
    data: { categories: [], rules: [], exceptions: [], events: [] },
    ...over,
  };
}

describe('validateBackup — bắt nhầm file', () => {
  it('từ chối thứ không phải object', () => {
    expect(validateBackup(null, SCHEMA)).toMatchObject({ reason: 'notObject' });
    expect(validateBackup('{}', SCHEMA)).toMatchObject({ reason: 'notObject' });
    expect(validateBackup([1, 2], SCHEMA)).toMatchObject({ reason: 'notObject' });
  });

  it('từ chối JSON hợp lệ nhưng không phải file sao lưu', () => {
    // Đây là ca thực tế nhất: người dùng chọn nhầm package.json
    expect(validateBackup({ name: 'gì đó' }, SCHEMA)).toMatchObject({
      reason: 'wrongFormat',
    });
  });

  it('từ chối file thiếu khối data', () => {
    expect(validateBackup(file({ data: undefined }), SCHEMA)).toMatchObject({
      reason: 'missingData',
    });
  });

  it('CHẶN file từ bản ứng dụng mới hơn', () => {
    // Nhập vào sẽ âm thầm làm mất các trường bản này chưa biết.
    expect(validateBackup(file({ schemaVersion: 99 }), SCHEMA)).toMatchObject({
      reason: 'newerSchema',
    });
  });

  it('CHO PHÉP file từ bản cũ hơn', () => {
    expect(validateBackup(file({ schemaVersion: 0 }), SCHEMA).ok).toBe(true);
  });

  it('từ chối khi một bảng không phải mảng', () => {
    expect(
      validateBackup(file({ data: { categories: { a: 1 } } }), SCHEMA),
    ).toMatchObject({ reason: 'tableNotArray' });
  });

  it('bảng thiếu được coi là rỗng, không phải lỗi', () => {
    const result = validateBackup(file({ data: { categories: [] } }), SCHEMA);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.data.salaryRules).toEqual([]);
      expect(result.backup.data.adjustments).toEqual([]);
    }
  });

  it('báo lại các bảng lạ thay vì lặng lẽ bỏ qua', () => {
    const result = validateBackup(
      file({ data: { categories: [], somethingNew: [] } }),
      SCHEMA,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.unknownTables).toEqual(['somethingNew']);
  });
});

describe('mergeById — quy tắc dùng chung với đồng bộ Cloud', () => {
  const a1 = { id: 'a', updatedAt: '2026-01-01T00:00:00Z', v: 'cũ' };
  const a2 = { id: 'a', updatedAt: '2026-06-01T00:00:00Z', v: 'mới' };
  const b = { id: 'b', updatedAt: '2026-03-01T00:00:00Z', v: 'b' };

  it('bản ghi mới hơn thắng', () => {
    const { merged, updated } = mergeById([a1], [a2]);
    expect(merged).toEqual([a2]);
    expect(updated).toBe(1);
  });

  it('bản ghi cũ hơn KHÔNG ghi đè bản mới', () => {
    const { merged, kept } = mergeById([a2], [a1]);
    expect(merged).toEqual([a2]);
    expect(kept).toBe(1);
  });

  it('hòa thì giữ bản đang có — nhập lại đúng file vừa xuất không đổi gì', () => {
    const { merged, added, updated, kept } = mergeById([a1, b], [a1, b]);
    expect(merged).toEqual([a1, b]);
    expect(added).toBe(0);
    expect(updated).toBe(0);
    expect(kept).toBe(2);
  });

  it('bản ghi chỉ có ở một bên đều được giữ — trộn KHÔNG BAO GIỜ xóa', () => {
    const { merged, added } = mergeById([a1], [b]);
    expect(merged).toHaveLength(2);
    expect(added).toBe(1);
  });

  it('bản ghi thiếu updatedAt bị coi là cũ nhất', () => {
    const noStamp = { id: 'a', v: 'không dấu thời gian' };
    expect(mergeById([a1], [noStamp]).merged).toEqual([a1]);
    expect(mergeById([noStamp], [a1]).merged).toEqual([a1]);
  });

  it('bỏ qua bản ghi rác không có id', () => {
    const junk = [{ nope: true }, null, { id: 'c', updatedAt: '2026-01-01T00:00:00Z' }];
    const { merged } = mergeById([a1], junk as never);
    expect(merged.map((r) => r.id).sort()).toEqual(['a', 'c']);
  });

  it('trộn vào tập rỗng là chép nguyên', () => {
    const { merged, added } = mergeById([], [a1, b]);
    expect(merged).toHaveLength(2);
    expect(added).toBe(2);
  });
});

describe('tiện ích', () => {
  it('tên file theo giờ địa phương, không phải UTC', () => {
    // 23:30 ngày 20/08 giờ địa phương — toISOString() sẽ nhảy sang ngày 21
    expect(backupFileName(new Date(2026, 7, 20, 23, 30))).toBe(
      'personal-schedule-2026-08-20.json',
    );
  });

  it('đếm tổng số bản ghi qua mọi bảng', () => {
    const result = validateBackup(
      file({ data: { categories: [1, 2], events: [3] } }),
      SCHEMA,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(countRecords(result.backup)).toBe(3);
  });
});

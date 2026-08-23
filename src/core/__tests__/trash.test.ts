import { describe, expect, it } from 'vitest';
import { daysSinceDeleted, isPurgeable, purgeCutoff } from '../trash';

const NOW = new Date('2026-08-21T12:00:00.000Z');

describe('purgeCutoff', () => {
  it('lùi đúng số ngày', () => {
    expect(purgeCutoff(7, NOW)).toBe('2026-08-14T12:00:00.000Z');
    expect(purgeCutoff(30, NOW)).toBe('2026-07-22T12:00:00.000Z');
  });

  it('0 ngày = ngay bây giờ, tức dọn sạch mọi thứ', () => {
    expect(purgeCutoff(0, NOW)).toBe('2026-08-21T12:00:00.000Z');
  });

  it('số âm được kẹp về 0, không lùi ngược thành tương lai', () => {
    // Lùi âm sẽ cho mốc ở TƯƠNG LAI và dọn luôn cả thứ vừa xóa một giây trước.
    expect(purgeCutoff(-5, NOW)).toBe(purgeCutoff(0, NOW));
  });

  it('vượt ranh giới tháng và năm', () => {
    expect(purgeCutoff(60, new Date('2026-01-15T00:00:00.000Z'))).toBe(
      '2025-11-16T00:00:00.000Z',
    );
  });
});

describe('isPurgeable', () => {
  const cutoff = purgeCutoff(7, NOW);

  it('bản ghi xóa lâu hơn mốc thì dọn được', () => {
    expect(isPurgeable('2026-08-01T00:00:00.000Z', cutoff)).toBe(true);
  });

  it('bản ghi vừa xóa thì chưa dọn', () => {
    expect(isPurgeable('2026-08-20T00:00:00.000Z', cutoff)).toBe(false);
  });

  it('bản ghi ĐANG SỐNG không bao giờ bị dọn', () => {
    // `undefined <= cutoff` trong JS là false — đúng ngẫu nhiên chứ không do
    // ai nghĩ tới. Chặn tường minh để người sửa sau không phải đoán.
    expect(isPurgeable(undefined, cutoff)).toBe(false);
  });

  it('xóa đúng thời điểm mốc thì tính là dọn được', () => {
    expect(isPurgeable(cutoff, cutoff)).toBe(true);
  });
});

describe('daysSinceDeleted', () => {
  it('đếm đúng số ngày trọn vẹn', () => {
    expect(daysSinceDeleted('2026-08-18T12:00:00.000Z', NOW)).toBe(3);
    expect(daysSinceDeleted('2026-08-21T00:00:00.000Z', NOW)).toBe(0);
  });

  it('mốc ở tương lai trả về 0, không ra số âm', () => {
    expect(daysSinceDeleted('2026-09-01T00:00:00.000Z', NOW)).toBe(0);
  });
});

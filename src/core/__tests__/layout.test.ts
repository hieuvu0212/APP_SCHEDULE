import { describe, expect, it } from 'vitest';
import type { Occurrence } from '../../types';
import { MIN_BLOCK_MINUTES, layoutDay, visibleHourRange } from '../layout';
import { endsNextDay, toAbsolute, toMinutes } from '../time';

const DATE = '2026-08-20';

function occ(startTime: string, durationMinutes: number, key = startTime): Occurrence {
  const startAbs = toAbsolute(DATE, startTime);
  return {
    key,
    sourceType: 'SINGLE',
    sourceId: key,
    title: key,
    categoryId: 'cat',
    date: DATE,
    startTime,
    durationMinutes,
    endsNextDay: endsNextDay(startTime, durationMinutes),
    startAbs,
    endAbs: startAbs + durationMinutes * 60_000,
    status: 'SCHEDULED',
    hasConflict: false,
    conflictWith: [],
  };
}

/** Tra kết quả theo key cho gọn */
function index(items: ReturnType<typeof layoutDay>) {
  return new Map(items.map((p) => [p.occurrence.key, p]));
}

// ───────────────────────────────────────────────────────────────────────────

describe('vị trí theo phút', () => {
  it('topMin lấy đúng từ startTime, không phụ thuộc khung giờ hiển thị', () => {
    const [p] = layoutDay([occ('09:30', 60)]);
    expect(p.topMin).toBe(toMinutes('09:30'));
    expect(p.heightMin).toBe(60);
    expect(p.clipped).toBe(false);
  });

  it('buổi quá ngắn vẫn được nống lên chiều cao tối thiểu để còn bấm trúng', () => {
    const [p] = layoutDay([occ('09:00', 5)]);
    expect(p.heightMin).toBe(MIN_BLOCK_MINUTES);
  });
});

describe('ca qua đêm', () => {
  it('bị KẸP ở đáy ngày và gắn cờ clipped, không tràn xuống âm', () => {
    const [p] = layoutDay([occ('22:00', 240)]); // 22:00 → 02:00 hôm sau
    expect(p.topMin).toBe(1320);
    expect(p.heightMin).toBe(120); // chỉ còn 2 tiếng nằm trong ngày
    expect(p.clipped).toBe(true);
    expect(p.topMin + p.heightMin).toBe(1440);
  });

  it('ca kết thúc đúng nửa đêm thì không bị coi là cắt', () => {
    const [p] = layoutDay([occ('22:00', 120)]);
    expect(p.heightMin).toBe(120);
    expect(p.clipped).toBe(false);
  });
});

describe('xếp cột khi chồng lấn', () => {
  it('hai buổi rời nhau dùng chung một cột', () => {
    const items = index(layoutDay([occ('08:00', 60), occ('10:00', 60)]));
    expect(items.get('08:00')!.cols).toBe(1);
    expect(items.get('10:00')!.cols).toBe(1);
    expect(items.get('10:00')!.col).toBe(0);
  });

  it('hai ca LIỀN KỀ (10–12 và 12–14) KHÔNG bị tách cột', () => {
    // Cùng tinh thần với overlaps() dùng bất đẳng thức nghiêm ngặt: chạm nhau
    // ở điểm cuối không phải là chồng lấn. Tách cột ở đây sẽ làm mọi ca nối
    // tiếp nhau bị bóp lại còn nửa bề ngang mà chẳng vì lý do gì.
    const items = index(layoutDay([occ('10:00', 120), occ('12:00', 120)]));
    expect(items.get('10:00')!.cols).toBe(1);
    expect(items.get('12:00')!.cols).toBe(1);
    expect(items.get('12:00')!.col).toBe(0);
  });

  it('hai buổi chồng lấn một phần bị tách thành hai cột', () => {
    const items = index(layoutDay([occ('10:00', 120), occ('11:00', 120)]));
    expect(items.get('10:00')!.cols).toBe(2);
    expect(items.get('11:00')!.cols).toBe(2);
    expect(items.get('10:00')!.col).toBe(0);
    expect(items.get('11:00')!.col).toBe(1);
  });

  it('ba buổi cùng giờ thì cả cụm rộng bằng nhau', () => {
    const items = index(
      layoutDay([occ('10:00', 60, 'a'), occ('10:00', 60, 'b'), occ('10:00', 60, 'c')]),
    );
    expect([...items.values()].map((p) => p.cols)).toEqual([3, 3, 3]);
    expect([...items.values()].map((p) => p.col).sort()).toEqual([0, 1, 2]);
  });

  it('cột được tái sử dụng trong cùng một cụm', () => {
    // a: 10–13 (dài, giữ cột 0 suốt cụm)
    // b: 10–11 → cột 1
    // c: 11–12 → cột 1 đã trống, dùng lại thay vì mở cột thứ ba
    const items = index(
      layoutDay([occ('10:00', 180, 'a'), occ('10:00', 60, 'b'), occ('11:00', 60, 'c')]),
    );
    expect(items.get('a')!.col).toBe(0);
    expect(items.get('b')!.col).toBe(1);
    expect(items.get('c')!.col).toBe(1);
    expect(items.get('a')!.cols).toBe(2);
  });

  it('hai cụm tách rời được đánh số cột độc lập', () => {
    const items = index(
      layoutDay([
        occ('08:00', 60, 'x1'),
        occ('08:30', 60, 'x2'), // cụm 1 — chồng lấn
        occ('15:00', 60, 'y'), // cụm 2 — một mình
      ]),
    );
    expect(items.get('x1')!.cols).toBe(2);
    expect(items.get('y')!.cols).toBe(1);
    expect(items.get('y')!.col).toBe(0);
  });

  it('mảng rỗng không làm vỡ thuật toán', () => {
    expect(layoutDay([])).toEqual([]);
  });
});

describe('visibleHourRange', () => {
  it('không có buổi nào thì vẫn hiện khung mặc định', () => {
    expect(visibleHourRange([])).toEqual({ startHour: 6, endHour: 23 });
  });

  it('nới lên trên khi có buổi sớm hơn khung mặc định', () => {
    expect(visibleHourRange([occ('05:15', 60)]).startHour).toBe(5);
  });

  it('nới xuống dưới khi có ca đêm, nhưng không vượt quá 24', () => {
    expect(visibleHourRange([occ('22:00', 240)]).endHour).toBe(24);
  });

  it('buổi nằm gọn trong khung mặc định thì không nới', () => {
    expect(visibleHourRange([occ('09:00', 60)])).toEqual({ startHour: 6, endHour: 23 });
  });
});

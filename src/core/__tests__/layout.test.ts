import { describe, expect, it } from 'vitest';
import type { Occurrence } from '../../types';
import {
  MIN_BLOCK_MINUTES,
  bandIndexOf,
  groupByBand,
  layoutDay,
  visibleHourRange,
} from '../layout';
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

describe('bandIndexOf — xếp buổi vào hàng Sáng/Chiều/Tối cho bản in', () => {
  it('chia đúng ở hai điểm ranh giới', () => {
    expect(bandIndexOf('11:59')).toBe(0);
    expect(bandIndexOf('12:00')).toBe(1);
    expect(bandIndexOf('17:59')).toBe(1);
    expect(bandIndexOf('18:00')).toBe(2);
  });

  it('PHỦ TRỌN 24 giờ — không để hở khoảng nào', () => {
    // Ca 05:00 và ca 23:30 là chuyện có thật. Hở một khoảng là buổi rơi vào
    // đó biến mất khỏi bản in mà không báo gì.
    expect(bandIndexOf('00:00')).toBe(0);
    expect(bandIndexOf('05:00')).toBe(0);
    expect(bandIndexOf('23:59')).toBe(2);
  });

  it('mọi giờ trong ngày đều tìm được một hàng', () => {
    for (let m = 0; m < 1440; m += 7) {
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      expect(bandIndexOf(hhmm)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('groupByBand', () => {
  it('chia đúng ba nhóm theo giờ bắt đầu', () => {
    const groups = groupByBand([
      { startTime: '19:00' },
      { startTime: '08:00' },
      { startTime: '14:00' },
    ]);
    expect(groups.map((g) => g.map((x) => x.startTime))).toEqual([
      ['08:00'],
      ['14:00'],
      ['19:00'],
    ]);
  });

  it('LUÔN trả về đủ số nhóm, kể cả nhóm rỗng', () => {
    // Tầng hiển thị cần biết "chiều nay không có gì" để in dấu gạch, chứ
    // không phải bỏ hàng đó đi rồi làm lệch bố cục giữa các ngày.
    expect(groupByBand([{ startTime: '08:00' }])).toEqual([[{ startTime: '08:00' }], [], []]);
    expect(groupByBand([])).toEqual([[], [], []]);
  });

  it('giữ nguyên thứ tự bên trong mỗi nhóm', () => {
    const groups = groupByBand([
      { startTime: '09:00' },
      { startTime: '07:00' },
      { startTime: '11:00' },
    ]);
    // Không tự sắp xếp — người gọi đã sắp theo startAbs trước đó.
    expect(groups[0].map((x) => x.startTime)).toEqual(['09:00', '07:00', '11:00']);
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

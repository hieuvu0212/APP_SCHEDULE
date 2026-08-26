// ═══════════════════════════════════════════════════════════════════════════
//  Mỗi bài dưới đây tương ứng một lỗi THẬT của bản phân tích đầu tiên, hoặc
//  một quy tắc mà nếu đảo lại thì lỗi đó quay về. Không có bài nào chỉ để phủ
//  cho đủ dòng.
//
//  `TODAY` cố định là thứ Hai để "thứ N tới" đếm được bằng tay khi đọc test.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from '../quickAdd';
import { dayOfWeek } from '../time';

/** 2026-08-24 là thứ Hai */
const TODAY = '2026-08-24';

describe('parseQuickAdd — mốc kiểm tra', () => {
  it('TODAY đúng là thứ Hai, nếu không thì mọi kỳ vọng bên dưới sai', () => {
    expect(dayOfWeek(TODAY)).toBe(1);
  });
});

describe('parseQuickAdd — đường thuận', () => {
  it('bóc được tiêu đề, khoảng giờ và thứ', () => {
    expect(parseQuickAdd('Học toán 18h-20h thứ 3', TODAY)).toEqual({
      title: 'Học toán',
      date: '2026-08-25',
      startTime: '18:00',
      endTime: '20:00',
      clientName: null,
      daysOfWeek: [2],
      // MỘT thứ thì vẫn là buổi đơn lẻ — xem nhóm "nhiều thứ" bên dưới.
      repeats: false,
    });
  });

  it('nhận giờ có phút và dấu hai chấm', () => {
    const r = parseQuickAdd('Họp nhóm 18:30 - 20:45 thứ 6', TODAY);
    expect(r.title).toBe('Họp nhóm');
    expect(r.startTime).toBe('18:30');
    expect(r.endTime).toBe('20:45');
    expect(r.date).toBe('2026-08-28');
  });

  it('không nói giờ kết thúc thì mặc định một tiếng', () => {
    expect(parseQuickAdd('Đi nhậu 7h tối mai', TODAY)).toEqual({
      title: 'Đi nhậu',
      date: '2026-08-25',
      startTime: '19:00',
      endTime: '20:00',
      clientName: null,
      daysOfWeek: [],
      repeats: false,
    });
  });

  it('hiểu "lúc" đứng trước giờ trần', () => {
    const r = parseQuickAdd('Gặp khách lúc 14:30 ngày mai', TODAY);
    expect(r.title).toBe('Gặp khách');
    expect(r.startTime).toBe('14:30');
    expect(r.date).toBe('2026-08-25');
  });
});

// ─── Lỗi thật của bản đầu tiên ─────────────────────────────────────────────

describe('parseQuickAdd — ngày phải phân tích TRƯỚC giờ', () => {
  // Bản cũ: { title: "Nộp báo cáo /8", startTime: "25:00", date: hôm nay }
  // Bộ dò giờ chạy trước và nuốt số 25 làm giờ, khiến nhánh d/m không bao giờ
  // chạy được. Đảo lại thứ tự trong quickAdd.ts là bài này đỏ.
  it('"25/8" là ngày, không phải giờ 25:00', () => {
    expect(parseQuickAdd('Nộp báo cáo 25/8', TODAY)).toEqual({
      title: 'Nộp báo cáo',
      date: '2026-08-25',
      startTime: null,
      endTime: null,
      clientName: null,
      daysOfWeek: [],
      repeats: false,
    });
  });

  it('ngày d/m đi kèm giờ thì bóc được cả hai', () => {
    expect(parseQuickAdd('Thi cuối kỳ 25/12 lúc 7h30', TODAY)).toEqual({
      title: 'Thi cuối kỳ',
      date: '2026-12-25',
      startTime: '07:30',
      endTime: '08:30',
      clientName: null,
      daysOfWeek: [],
      repeats: false,
    });
  });

  it('ngày đã trôi qua trong năm nay thì hiểu là năm sau', () => {
    // Cùng một luật với "thứ N tới": Thêm nhanh luôn nói về tương lai.
    expect(parseQuickAdd('Giỗ 20/8', TODAY).date).toBe('2027-08-20');
  });

  it('năm ghi rõ thì tôn trọng nguyên văn, kể cả khi ở quá khứ', () => {
    expect(parseQuickAdd('Ôn lại 20/8/2020', TODAY).date).toBe('2020-08-20');
  });

  it('ngày không tồn tại thì bỏ qua, không cuộn sang tháng sau', () => {
    // new Date(2026, 1, 31) tự nhảy sang 3/3. Nhận bừa thì "31/2" thành 03/03
    // và người dùng không hề biết mình vừa đặt lịch nhầm ngày.
    const r = parseQuickAdd('Việc gì đó 31/2', TODAY);
    expect(r.date).toBeNull();
  });

  it('KHÔNG lệch một ngày ở múi giờ dương', () => {
    // Bản cũ dựng chuỗi bằng toISOString(): new Date(2026,7,25) là nửa đêm
    // giờ địa phương, đổi sang UTC ở UTC+7 thành 17:00 ngày 24 → "2026-08-24".
    expect(parseQuickAdd('X 25/8', TODAY).date).toBe('2026-08-25');
  });
});

describe('parseQuickAdd — số trần không phải là giờ', () => {
  // Bản cũ: startTime "10:00", title "Học toán lớp"
  it('"lớp 10" giữ nguyên trong tiêu đề', () => {
    expect(parseQuickAdd('Học toán lớp 10', TODAY)).toEqual({
      title: 'Học toán lớp 10',
      date: null,
      startTime: null,
      endTime: null,
      clientName: null,
      daysOfWeek: [],
      repeats: false,
    });
  });

  it('số phòng không bị hiểu thành giờ', () => {
    const r = parseQuickAdd('Thi phòng 12', TODAY);
    expect(r.startTime).toBeNull();
    expect(r.title).toBe('Thi phòng 12');
  });
});

describe('parseQuickAdd — buổi áp cho cả khoảng giờ', () => {
  // Bản cũ: 07:00–09:00, và chữ "tối" rơi lại trong tiêu đề.
  it('"7h-9h tối" là 19:00–21:00', () => {
    expect(parseQuickAdd('Dạy Lý 7h-9h tối', TODAY)).toEqual({
      title: 'Dạy Lý',
      date: null,
      startTime: '19:00',
      endTime: '21:00',
      clientName: null,
      daysOfWeek: [],
      repeats: false,
    });
  });

  it('buổi chiều dời giờ nhỏ hơn 12', () => {
    expect(parseQuickAdd('Cà phê 3h chiều', TODAY).startTime).toBe('15:00');
  });

  it('"12 trưa" là 12:00, "12 đêm" là 00:00', () => {
    expect(parseQuickAdd('Ăn 12h trưa', TODAY).startTime).toBe('12:00');
    expect(parseQuickAdd('Xem phim 12h đêm', TODAY).startTime).toBe('00:00');
  });

  it('giờ đã ở dạng 24h thì buổi không dời thêm', () => {
    expect(parseQuickAdd('Ca đêm 22h tối', TODAY).startTime).toBe('22:00');
  });
});

describe('parseQuickAdd — giờ không hợp lệ', () => {
  // Bản cũ sinh "24:00" cho "23h", một giá trị mà <input type="time"> từ chối
  // — người dùng thấy ô giờ kết thúc trống trơn mà không hiểu vì sao.
  it('23h + 1 tiếng cuộn về 00:00, không phải 24:00', () => {
    expect(parseQuickAdd('Trực đêm 23h', TODAY)).toEqual({
      title: 'Trực đêm',
      date: null,
      startTime: '23:00',
      endTime: '00:00',
      clientName: null,
      daysOfWeek: [],
      repeats: false,
    });
  });

  it('giờ vượt 23 thì không nhận', () => {
    expect(parseQuickAdd('Việc 25h', TODAY).startTime).toBeNull();
  });

  it('phút vượt 59 thì không nhận', () => {
    expect(parseQuickAdd('Việc 10:75', TODAY).startTime).toBeNull();
  });
});

describe('parseQuickAdd — không đoán bừa', () => {
  it('không nói ngày thì trả null, không mặc định hôm nay', () => {
    // Mặc định hôm nay làm câu phân tích HỎNG và câu cố ý không nói ngày cho
    // ra kết quả giống hệt nhau. Tầng gọi mới là nơi chọn giá trị mặc định.
    expect(parseQuickAdd('Học bài 20h', TODAY).date).toBeNull();
  });

  it('không nói giờ thì trả null', () => {
    expect(parseQuickAdd('Nghỉ lễ mai', TODAY).startTime).toBeNull();
  });

  it('câu rỗng không làm vỡ gì', () => {
    expect(parseQuickAdd('', TODAY)).toEqual({
      title: '',
      date: null,
      startTime: null,
      endTime: null,
      clientName: null,
      daysOfWeek: [],
      repeats: false,
    });
  });
});

describe('parseQuickAdd — thứ trong tuần', () => {
  it('"thứ 2" gõ vào thứ Hai nghĩa là thứ Hai TUẦN SAU', () => {
    // Nói "thứ 2" về ngày hôm nay thì người ta nói "hôm nay".
    expect(parseQuickAdd('Họp thứ 2', TODAY).date).toBe('2026-08-31');
  });

  it('chủ nhật viết tắt cn', () => {
    expect(parseQuickAdd('Về quê cn', TODAY).date).toBe('2026-08-30');
  });

  it('thứ viết bằng chữ', () => {
    expect(parseQuickAdd('Học nhóm thứ tư', TODAY).date).toBe('2026-08-26');
  });

  it('"t5" viết tắt', () => {
    expect(parseQuickAdd('Gặp thầy t5', TODAY).date).toBe('2026-08-27');
  });

  it('chữ bắt đầu bằng "t" không bị hiểu thành thứ', () => {
    const r = parseQuickAdd('Học tư duy phản biện', TODAY);
    expect(r.date).toBeNull();
    expect(r.title).toBe('Học tư duy phản biện');
  });
});

describe('parseQuickAdd — cắt theo vị trí, không dùng String.replace', () => {
  it('chuỗi lặp lại không làm cắt nhầm chỗ', () => {
    // `replace(match[0], '')` xóa lần xuất hiện ĐẦU TIÊN của "18" — tức là số
    // 18 trong "Bài 18", không phải "18h" ở cuối câu.
    const r = parseQuickAdd('Bài 18 ôn tập 18h', TODAY);
    expect(r.startTime).toBe('18:00');
    expect(r.title).toBe('Bài 18 ôn tập');
  });
});

// ─── Nhiều thứ trong tuần → LỊCH LẶP ───────────────────────────────────────

describe('parseQuickAdd — nhiều thứ thì phải là lịch lặp', () => {
  it('"thứ 2,5" cho ra hai thứ và bật cờ lặp', () => {
    // Câu người dùng thật sự gõ. Trước đây nó tạo MỘT buổi vào thứ Năm và
    // đánh rơi hoàn toàn thứ Hai.
    const r = parseQuickAdd('Dạy Gia thứ 2,5 18h-20h', TODAY);
    expect(r.daysOfWeek).toEqual([1, 4]);
    expect(r.repeats).toBe(true);
    expect(r.startTime).toBe('18:00');
    expect(r.endTime).toBe('20:00');
    expect(r.title).toBe('Dạy Gia');
  });

  it('date là buổi ĐẦU TIÊN trong các thứ đó', () => {
    // TODAY là thứ Hai 24/08. "thứ 2,5" tới gần nhất là thứ Năm 27/08 —
    // KHÔNG phải hôm nay, vì "thứ 2" gõ vào thứ Hai nghĩa là tuần sau.
    expect(parseQuickAdd('Dạy Gia thứ 2,5', TODAY).date).toBe('2026-08-27');
  });

  it('nhận dấu ngăn "và"', () => {
    expect(parseQuickAdd('Học thứ 3 và thứ 6', TODAY).daysOfWeek).toEqual([2, 5]);
  });

  it('nhận danh sách ba thứ', () => {
    expect(parseQuickAdd('Gym thứ 2,4,6 6h', TODAY).daysOfWeek).toEqual([1, 3, 5]);
  });

  it('nhận dạng viết tắt t2, t5', () => {
    expect(parseQuickAdd('Ca t2, t5', TODAY).daysOfWeek).toEqual([1, 4]);
  });

  it('gộp được chủ nhật vào danh sách', () => {
    expect(parseQuickAdd('Trực thứ 7 và cn', TODAY).daysOfWeek).toEqual([0, 6]);
  });

  it('thứ trùng nhau chỉ tính một lần', () => {
    expect(parseQuickAdd('Học thứ 3, thứ 3', TODAY).daysOfWeek).toEqual([2]);
  });
});

describe('parseQuickAdd — MỘT thứ vẫn là buổi đơn lẻ', () => {
  it('"thứ 5" trần không bật cờ lặp', () => {
    // "Họp thứ 5" hầu như luôn là một cuộc họp, không phải lịch cố định mỗi
    // thứ Năm suốt đời. Đoán sai hướng này thì người dùng phải đi xóa cả chuỗi.
    const r = parseQuickAdd('Họp thứ 5', TODAY);
    expect(r.daysOfWeek).toEqual([4]);
    expect(r.repeats).toBe(false);
  });

  it('"mỗi thứ 3" thì có lặp', () => {
    expect(parseQuickAdd('Học Anh mỗi thứ 3', TODAY).repeats).toBe(true);
  });

  it('"hàng tuần" cũng vậy', () => {
    expect(parseQuickAdd('Họp giao ban hàng tuần thứ 2', TODAY).repeats).toBe(true);
  });

  it('không nói thứ nào thì không lặp', () => {
    const r = parseQuickAdd('Cà phê 15h mai', TODAY);
    expect(r.daysOfWeek).toEqual([]);
    expect(r.repeats).toBe(false);
  });
});

describe('parseQuickAdd — danh sách thứ không nuốt số đứng sau', () => {
  it('"thứ 5 phòng 2" chỉ ra thứ Năm', () => {
    // ⚠️ Đây là lý do dấu ngăn phải TƯỜNG MINH. Nhận cả khoảng trắng trần thì
    // "phòng 2" biến thành thứ Hai, và người dùng nhận về một chuỗi lặp mà họ
    // không hề yêu cầu.
    const r = parseQuickAdd('Thi thứ 5 phòng 2', TODAY);
    expect(r.daysOfWeek).toEqual([4]);
    expect(r.repeats).toBe(false);
  });
});

// ─── Đối tượng ─────────────────────────────────────────────────────────────

describe('parseQuickAdd — nhận ra Đối tượng từ dữ liệu đã có', () => {
  const known = ['Gia', 'Minh', 'Gia Bảo'];

  it('tên đã từng dùng thì nhận ra ngay', () => {
    expect(parseQuickAdd('Dạy Gia thứ 2,5 18h', TODAY, known).clientName).toBe('Gia');
  });

  it('KHÔNG đoán tên chưa từng thấy', () => {
    // ⚠️ Bài quan trọng nhất của nhóm này.
    //
    // "dạy Toán" có cấu trúc GIỐNG HỆT "dạy Gia": động từ + danh từ riêng viết
    // hoa. Không quy tắc cú pháp nào phân biệt được. Đoán bừa nghĩa là mỗi lần
    // gõ "dạy Toán" lại sinh ra một Đối tượng tên "Toán" phải đi xóa.
    expect(parseQuickAdd('Dạy Toán thứ 2', TODAY, known).clientName).toBeNull();
  });

  it('bỏ dấu và không phân biệt hoa thường, nhưng trả về ĐÚNG dạng đã lưu', () => {
    // Gõ "gia" phải ra "Gia", không tạo thêm một đối tượng viết thường.
    expect(parseQuickAdd('day gia 18h', TODAY, known).clientName).toBe('Gia');
  });

  it('tên dài thắng tên ngắn', () => {
    // "Gia Bảo" phải thắng "Gia", nếu không thì đối tượng luôn bị cắt cụt.
    expect(parseQuickAdd('Dạy Gia Bảo 18h', TODAY, known).clientName).toBe('Gia Bảo');
  });

  it('không khớp tên nằm bên trong một từ khác', () => {
    // "An" không được khớp trong "Anh văn".
    expect(parseQuickAdd('Học Anh văn 18h', TODAY, ['An']).clientName).toBeNull();
  });

  it('không có danh sách thì không nhận ra ai', () => {
    expect(parseQuickAdd('Dạy Gia 18h', TODAY).clientName).toBeNull();
  });
});

describe('parseQuickAdd — "cho"/"với" là đường tắt cho lần đầu', () => {
  it('"cho Gia" nhận ra dù chưa từng có trong dữ liệu', () => {
    expect(parseQuickAdd('Dạy thêm cho Gia thứ 2,5', TODAY).clientName).toBe('Gia');
  });

  it('"với anh Nam" lấy cả cụm viết hoa', () => {
    expect(parseQuickAdd('Họp với Nam 9h', TODAY).clientName).toBe('Nam');
  });

  it('chữ thường sau "cho" KHÔNG phải tên người', () => {
    // "cho" và "với" là hai từ phổ biến bậc nhất tiếng Việt. Không đòi viết
    // hoa thì "làm cho xong" cho ra một đối tượng tên "xong".
    expect(parseQuickAdd('Làm cho xong bài tập 20h', TODAY).clientName).toBeNull();
  });
});

describe('parseQuickAdd — câu đầy đủ của người dùng', () => {
  it('"Dạy Gia thứ 2,5 18-20h" ra đúng một lịch lặp hoàn chỉnh', () => {
    const r = parseQuickAdd('Dạy Gia thứ 2,5 18h-20h', TODAY, ['Gia']);
    expect(r).toEqual({
      title: 'Dạy Gia',
      date: '2026-08-27',
      startTime: '18:00',
      endTime: '20:00',
      clientName: 'Gia',
      daysOfWeek: [1, 4],
      repeats: true,
    });
  });
});

describe('parseQuickAdd — từ nối không được trơ lại trong tiêu đề', () => {
  it('chữ chỉ lặp bị dọn đi', () => {
    // "Học Anh mỗi" đọc như một câu bỏ dở.
    expect(parseQuickAdd('Học Anh mỗi thứ 3 19h', TODAY).title).toBe('Học Anh');
  });

  it('"hàng tuần" cũng vậy', () => {
    expect(parseQuickAdd('Họp giao ban hàng tuần thứ 2', TODAY).title).toBe('Họp giao ban');
  });

  it('"từ" bị dọn — chữ có dấu mà `\b` không bắt được', () => {
    // ⚠️ Bản trước dùng `\b` nên "vào", "lúc", "ngày", "hồi" đều bị xóa còn
    // "từ" thì không: 'ừ' không nằm trong [A-Za-z0-9_]. Cùng cái bẫy đã gài ở
    // phần thứ trong tuần, lọt lại ở hàm dọn tiêu đề.
    expect(parseQuickAdd('Ôn bài từ mai', TODAY).title).toBe('Ôn bài');
  });
});

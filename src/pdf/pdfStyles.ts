// ═══════════════════════════════════════════════════════════════════════════
//  pdf/pdfStyles.ts — bảng kiểu cho tài liệu PDF
//
//  ⚠️ KHÔNG dùng Tailwind ở đây, cũng không dùng biến CSS của ứng dụng.
//  @react-pdf/renderer có bộ layout riêng (một tập con của flexbox) và không
//  đọc CSS của trang. Mọi giá trị phải viết tường minh.
//
//  Đơn vị mặc định là POINT. A4 ngang = 841,89 × 595,28 pt. Trừ lề 28pt mỗi
//  bên còn 786 × 539 pt, chia bảy cột là 112 pt mỗi cột.
//
//  ⚠️ MÀU CỐ ĐỊNH SÁNG. Bản PDF không bao giờ đi theo chế độ tối của ứng
//  dụng: nền tối vừa tốn mực vừa không đọc được khi in ra giấy, và người ta
//  gửi file PDF cho người khác chứ không chỉ tự xem.
// ═══════════════════════════════════════════════════════════════════════════

import { StyleSheet } from '@react-pdf/renderer';

export const COLORS = {
  ink: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#cbd5e1',
  headerBg: '#f1f5f9',
} as const;

export const styles = StyleSheet.create({
  page: {
    // `fontFamily` KHÔNG đặt ở đây — SchedulePdf gắn vào lúc render, vì họ
    // font phụ thuộc nội dung (Latin hay CJK). Xem pdf/fonts.ts.
    fontSize: 7,
    color: COLORS.body,
    backgroundColor: '#ffffff',
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 28,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.ink,
    paddingBottom: 5,
    marginBottom: 8,
  },
  appName: { fontSize: 13, fontWeight: 'bold', color: COLORS.ink },
  rangeLabel: { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  exportedLabel: { fontSize: 6.5, color: COLORS.faint },

  grid: { flexDirection: 'row', width: '100%' },
  column: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: COLORS.line,
    // Bảy viền cạnh nhau sẽ dày gấp đôi ở chỗ giáp nhau. Bù bằng lề âm.
    marginRight: -0.5,
  },
  columnHead: {
    backgroundColor: COLORS.headerBg,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
    paddingVertical: 3,
    alignItems: 'center',
  },
  weekday: { fontSize: 8, fontWeight: 'bold', color: COLORS.ink },
  dayLabel: { fontSize: 6.5, color: COLORS.muted, marginTop: 1 },

  columnBody: { padding: 3, minHeight: 380 },
  emptyDay: { fontSize: 7, color: COLORS.faint, textAlign: 'center', marginTop: 6 },

  event: {
    borderLeftWidth: 2,
    borderRadius: 2,
    paddingVertical: 2,
    paddingHorizontal: 3,
    marginBottom: 3,
  },
  eventTime: { fontSize: 6.5, fontWeight: 'bold', color: COLORS.ink },
  eventTitle: { fontSize: 7, color: COLORS.ink, marginTop: 0.5 },
  eventMeta: { fontSize: 6, color: COLORS.muted, marginTop: 0.5 },

  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
    paddingTop: 5,
    marginTop: 8,
  },
  summaryTitle: { fontSize: 7.5, fontWeight: 'bold', color: COLORS.ink, marginRight: 10 },
  summaryItem: { fontSize: 7, color: COLORS.body, marginRight: 12 },
  summaryValue: { fontWeight: 'bold', color: COLORS.ink },
  summaryNote: { fontSize: 6, color: COLORS.faint },

  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  legendDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 3 },
  legendText: { fontSize: 6.5, color: COLORS.muted },
});

/** Pha loãng màu danh mục làm nền khối sự kiện, dạng hex 8 ký tự */
export function eventTint(hex: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex.trim()) ? `${hex}22` : '#f8fafc';
}

// ═══════════════════════════════════════════════════════════════════════════
//  pdf/pdfStyles.ts — bảng kiểu cho tài liệu PDF
//
//  ⚠️ KHÔNG dùng Tailwind ở đây, cũng không dùng biến CSS của ứng dụng.
//  @react-pdf/renderer có bộ layout riêng (một tập con của flexbox) và không
//  đọc CSS của trang. Mọi giá trị phải viết tường minh.
//
//  Đơn vị mặc định là POINT. A4 ngang = 841,89 × 595,28 pt. Trừ lề 28pt mỗi
//  bên còn 786 × 539 pt: cột "Buổi" 56pt + bảy cột ngày (~104 pt mỗi cột).
//
//  Bảng là HÀNG, không còn là cột: một cột "Buổi" bên trái + bảy cột ngày,
//  rồi ba hàng Sáng/Chiều/Tối. Xếp theo hàng để ba buổi thẳng hàng ngang qua
//  các ngày — với cột, chiều cao từng khối phụ thuộc nội dung nên không có
//  gì bảo đảm "Sáng" của T2 ngang hàng "Sáng" của T5.
// ═══════════════════════════════════════════════════════════════════════════

import { StyleSheet } from '@react-pdf/renderer';
import { COLORS } from './palette';

export { eventTint } from './palette';

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

  // Viền ngoài của bảng nằm ở `grid`; viền trong do từng ô tự vẽ mép phải và
  // từng hàng tự vẽ mép dưới. react-pdf không có border-collapse nên phải
  // tự tránh vẽ đôi: ô cuối hàng và hàng cuối không vẽ.
  grid: {
    flexDirection: 'column',
    width: '100%',
    flex: 1,
    borderWidth: 0.5,
    borderColor: COLORS.line,
  },
  headRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: COLORS.headerBg,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
  },
  bandHeadCell: {
    width: 56,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 0.5,
    borderRightColor: COLORS.line,
  },
  dayHeadCell: {
    flex: 1,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekday: { fontSize: 8, fontWeight: 'bold', color: COLORS.ink },
  dayLabel: { fontSize: 6.5, color: COLORS.muted, marginTop: 1 },

  bandRow: { flexDirection: 'row', width: '100%', flex: 1 },
  bandLabelCell: {
    width: 56,
    padding: 3,
    borderRightWidth: 0.5,
    borderRightColor: COLORS.line,
  },
  dayCell: { flex: 1, padding: 3 },

  bandLabel: {
    fontSize: 6,
    fontWeight: 'bold',
    color: COLORS.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

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

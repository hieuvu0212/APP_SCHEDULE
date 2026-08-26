// ═══════════════════════════════════════════════════════════════════════════
//  pdf/palette.ts — bảng màu cố định sáng dùng chung cho mọi đầu xuất
//
//  HÀM THUẦN, KHÔNG import @react-pdf/renderer.
//
//  Tách khỏi pdf/styles.ts vì bản xuất PNG cần ĐÚNG bộ màu này mà không được
//  kéo theo @react-pdf (~456 KB): png/ chụp DOM bằng html2canvas-pro, còn
//  pdf/ dựng tài liệu bằng react-pdf — hai cơ chế khác nhau, một bảng màu.
//
//  ⚠️ MÀU CỐ ĐỊNH SÁNG. Bản in/PNG không bao giờ đi theo chế độ tối của ứng
//  dụng: nền tối vừa tốn mực vừa không đọc được khi in ra giấy, và người ta
//  gửi file cho người khác chứ không chỉ tự xem.
// ═══════════════════════════════════════════════════════════════════════════

export const COLORS = {
  ink: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#cbd5e1',
  headerBg: '#f1f5f9',
} as const;

/** Pha loãng màu danh mục làm nền khối sự kiện, dạng hex 8 ký tự */
export function eventTint(hex: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex.trim()) ? `${hex}22` : '#f8fafc';
}

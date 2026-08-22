// ═══════════════════════════════════════════════════════════════════════════
//  components/styles.ts — lớp Tailwind dùng chung
//
//  Tách khỏi ui.tsx để file đó CHỈ export component. Fast Refresh của Vite
//  giữ được state của một module khi module đó không export gì ngoài
//  component; một hằng chuỗi nằm chung cũng đủ làm mất điều kiện đó.
// ═══════════════════════════════════════════════════════════════════════════

export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900';

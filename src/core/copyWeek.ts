// ═══════════════════════════════════════════════════════════════════════════
//  core/copyWeek.ts — nhân bản lịch một tuần sang tuần khác
//
//  HÀM THUẦN. Không import React, không import Dexie.
//
//  Dành cho lịch làm ca: ca đổi từng tuần nên không viết được thành lịch lặp,
//  nhưng tuần này thường giống tuần trước ở phần lớn các buổi. Chép rồi sửa
//  vài chỗ nhanh hơn nhập lại từ đầu.
//
//  ⚠️ KHÔNG CHÉP BUỔI DO LỊCH LẶP SINH RA.
//  Chuỗi lặp tự nó đã phủ sang tuần đích rồi. Chép thêm một bản sao đơn lẻ
//  vào đó là mỗi buổi hiện hai lần, và bản sao thì không nghe lệnh khi người
//  dùng sửa chuỗi — hai bản dần lệch nhau mà không có gì báo.
//
//  Phép thử là `ruleOriginalDate`, không phải `sourceType`:
//
//    · ruleOriginalDate có     → buổi do rule sinh (kể cả đã dời/sửa) → BỎ
//    · ruleOriginalDate không  → buổi đơn lẻ, hoặc ngoại lệ loại ADD  → CHÉP
//
//  Ngoại lệ ADD mang sourceType='RULE' nhưng KHÔNG lặp lại — nó là một buổi
//  thêm tay đúng một lần. Lọc theo sourceType sẽ đánh rơi đúng nhóm này.
// ═══════════════════════════════════════════════════════════════════════════

import type { Occurrence, SingleEvent } from '../types';
import { addDays, daysBetween, overlaps, toAbsolute } from './time';

/** Buổi chuẩn bị tạo — chưa có id và dấu thời gian, tầng db điền nốt */
export type EventDraft = Omit<
  SingleEvent,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

export interface CopyWeekPlan {
  drafts: EventDraft[];
  /** Bỏ vì do lịch lặp sinh ra — chuỗi tự phủ sang tuần đích */
  skippedRecurring: number;
  /** Bỏ vì đã hủy hoặc vắng mặt */
  skippedCancelled: number;
  /**
   * Số bản nháp sẽ đè giờ lên một buổi đã có ở tuần đích.
   *
   * Chỉ để báo trước, KHÔNG chặn. Trùng lịch là chuyện có thật và người dùng
   * có thể cố ý; việc của hộp thoại là nói ra con số trước khi họ bấm.
   */
  conflicts: number;
}

export interface CopyWeekInput {
  /** Occurrence của tuần nguồn */
  source: Occurrence[];
  /** Occurrence đã có sẵn ở tuần đích — dùng để đếm trùng giờ */
  target: Occurrence[];
  /** "YYYY-MM-DD" — ngày đầu tuần nguồn */
  fromWeekStart: string;
  /** "YYYY-MM-DD" — ngày đầu tuần đích */
  toWeekStart: string;
}

/**
 * Dựng danh sách buổi cần tạo, KHÔNG ghi gì.
 *
 * Tách hẳn phần quyết định ra khỏi phần ghi để hộp thoại xác nhận hiển thị
 * đúng những con số mà thao tác sẽ thực hiện — đếm một đằng ghi một nẻo là
 * lỗi rất khó thấy.
 */
export function planWeekCopy(input: CopyWeekInput): CopyWeekPlan {
  const offset = daysBetween(input.fromWeekStart, input.toWeekStart);

  const drafts: EventDraft[] = [];
  let skippedRecurring = 0;
  let skippedCancelled = 0;

  for (const o of input.source) {
    if (o.ruleOriginalDate != null) {
      skippedRecurring++;
      continue;
    }
    if (o.status === 'CANCELLED' || o.status === 'NO_SHOW') {
      skippedCancelled++;
      continue;
    }

    drafts.push({
      title: o.title,
      categoryId: o.categoryId,
      date: addDays(o.date, offset),
      startTime: o.startTime,
      durationMinutes: o.durationMinutes,
      location: o.location,
      clientName: o.clientName,
      notes: o.notes,
      ratePerHour: o.ratePerHour,
      fixedAmount: o.fixedAmount,
      // Bản sao là KẾ HOẠCH, không phải bản ghi. Chép nguyên trạng thái
      // COMPLETED sang tuần sau là khai rằng một buổi chưa diễn ra đã xong,
      // và nó sẽ chảy thẳng vào thống kê lẫn bảng lương.
      status: 'SCHEDULED',
    });
  }

  return {
    drafts,
    skippedRecurring,
    skippedCancelled,
    conflicts: countConflicts(drafts, input.target),
  };
}

/**
 * Đếm số bản nháp đè giờ lên buổi có sẵn ở tuần đích.
 *
 * Đếm theo BẢN NHÁP chứ không theo cặp: một buổi chồng lên ba buổi khác vẫn
 * tính là một, vì câu người dùng cần trả lời là "bao nhiêu buổi tôi sắp tạo
 * sẽ rơi vào chỗ đã có lịch".
 */
function countConflicts(drafts: EventDraft[], target: Occurrence[]): number {
  if (target.length === 0) return 0;

  let n = 0;
  for (const d of drafts) {
    const start = toAbsolute(d.date, d.startTime);
    const end = start + d.durationMinutes * 60_000;
    const hit = target.some(
      (o) =>
        o.status !== 'CANCELLED' && overlaps(start, end, o.startAbs, o.endAbs),
    );
    if (hit) n++;
  }
  return n;
}

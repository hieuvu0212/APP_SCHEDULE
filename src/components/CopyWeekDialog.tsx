// ═══════════════════════════════════════════════════════════════════════════
//  CopyWeekDialog — nhân bản lịch tuần đang xem sang tuần khác
//
//  Hộp thoại này KHÔNG tự quyết định gì. Nó gọi planWeekCopy() rồi hiển thị
//  đúng những con số của kế hoạch đó, và khi bấm xác nhận thì ghi đúng mảng
//  `drafts` vừa hiển thị. Đếm một đằng ghi một nẻo là loại lỗi không ai phát
//  hiện cho tới lúc lịch đã sai.
//
//  Tuần đích được nạp riêng bằng useSchedule: cửa sổ đang mở chỉ chứa tuần
//  nguồn, nên không đếm được trùng giờ nếu không đọc thêm.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Occurrence } from '../types';
import type { EventDraft } from '../core/copyWeek';
import { planWeekCopy } from '../core/copyWeek';
import { addDays, startOfWeek } from '../core/time';
import { useSchedule } from '../hooks/useSchedule';
import { useSettings } from '../hooks/useSettings';
import { formatDate } from '../i18n';
import { inputClass } from './styles';
import { Button, Field, Modal } from './ui';

export function CopyWeekDialog({
  source,
  fromWeekStart,
  onConfirm,
  onClose,
}: {
  /** Occurrence của tuần đang xem */
  source: Occurrence[];
  /** "YYYY-MM-DD" — ngày đầu tuần đang xem */
  fromWeekStart: string;
  onConfirm: (drafts: EventDraft[]) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { weekStartsOn } = useSettings();
  const [toWeekStart, setToWeekStart] = useState(() => addDays(fromWeekStart, 7));
  const [busy, setBusy] = useState(false);

  /**
   * Ô chọn ngày nhận ngày bất kỳ, nhưng thao tác này chép NGUYÊN MỘT TUẦN.
   *
   * Không nắn về đầu tuần thì chọn nhằm thứ Tư sẽ dịch cả tuần đi ba ngày:
   * ca thứ Hai rơi vào thứ Năm. Kết quả vẫn "chạy", chỉ là sai — và sai theo
   * kiểu người dùng chỉ nhận ra sau khi đã sửa tay mấy buổi.
   */
  const pickWeek = (date: string) => {
    if (!date) return;
    setToWeekStart(startOfWeek(date, weekStartsOn));
  };

  const target = useSchedule(toWeekStart, addDays(toWeekStart, 6));

  const plan = useMemo(
    () =>
      planWeekCopy({
        source,
        target: target ?? [],
        fromWeekStart,
        toWeekStart,
      }),
    [source, target, fromWeekStart, toWeekStart],
  );

  const sameWeek = toWeekStart === fromWeekStart;
  const loading = target === undefined;
  const nothingToCopy = plan.drafts.length === 0;

  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(plan.drafts);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t('copyWeek.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={busy || loading || sameWeek || nothingToCopy}
          >
            {busy
              ? t('copyWeek.copying')
              : t('copyWeek.confirm', { n: plan.drafts.length })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {t('copyWeek.intro', { from: formatDate(fromWeekStart) })}
        </p>

        <Field label={t('copyWeek.target')} hint={t('copyWeek.targetHint')}>
          {(id) => (
            <input
              id={id}
              type="date"
              className={inputClass}
              value={toWeekStart}
              onChange={(e) => pickWeek(e.target.value)}
            />
          )}
        </Field>

        <div className="flex flex-wrap gap-2">
          {[-1, 1, 2].map((n) => (
            <Button key={n} onClick={() => setToWeekStart(addDays(fromWeekStart, n * 7))}>
              {n < 0
                ? t('copyWeek.weeksBack', { n: -n })
                : t('copyWeek.weeksAhead', { n })}
            </Button>
          ))}
        </div>

        {sameWeek ? (
          <Note tone="warn">{t('copyWeek.sameWeek')}</Note>
        ) : loading ? (
          <Note>{t('common.loading')}</Note>
        ) : (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <Line
              label={t('copyWeek.willCreate')}
              value={String(plan.drafts.length)}
              strong
            />
            {plan.skippedRecurring > 0 && (
              <Line
                label={t('copyWeek.skippedRecurring')}
                value={String(plan.skippedRecurring)}
                note={t('copyWeek.skippedRecurringWhy')}
              />
            )}
            {plan.skippedCancelled > 0 && (
              <Line
                label={t('copyWeek.skippedCancelled')}
                value={String(plan.skippedCancelled)}
              />
            )}
            {plan.conflicts > 0 && (
              <Line
                label={t('copyWeek.conflicts')}
                value={String(plan.conflicts)}
                note={t('copyWeek.conflictsWhy')}
                tone="warn"
              />
            )}
          </div>
        )}

        {!sameWeek && !loading && nothingToCopy && (
          <Note tone="warn">{t('copyWeek.nothing')}</Note>
        )}
      </div>
    </Modal>
  );
}

function Line({
  label,
  value,
  note,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
  tone?: 'warn';
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={tone === 'warn' ? 'text-amber-700' : 'text-slate-600'}>
          {label}
        </span>
        <span
          className={`tabular-nums ${
            strong ? 'text-base font-semibold text-slate-900' : 'text-slate-700'
          }`}
        >
          {value}
        </span>
      </div>
      {note && <p className="mt-0.5 text-xs text-slate-400">{note}</p>}
    </div>
  );
}

function Note({ children, tone }: { children: string; tone?: 'warn' }) {
  return (
    <p
      className={`rounded-xl px-3 py-2 text-sm ${
        tone === 'warn'
          ? 'bg-amber-50 text-amber-800'
          : 'bg-slate-50 text-slate-500'
      }`}
    >
      {children}
    </p>
  );
}

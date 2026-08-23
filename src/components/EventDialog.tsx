// ═══════════════════════════════════════════════════════════════════════════
//  components/EventDialog.tsx — form tạo/sửa sự kiện
//
//  MỘT form phục vụ cả bốn việc: tạo sự kiện đơn, tạo lịch lặp, sửa sự kiện
//  đơn, sửa lịch lặp. Ô "Lặp lại" quyết định bản ghi sinh ra là SingleEvent
//  hay RecurringRule — người dùng không cần biết hai thứ đó khác nhau.
//
//  ⚠️ HAI CHỖ DỄ SAI:
//
//  1. Người dùng nhập GIỜ KẾT THÚC, DB lưu THỜI LƯỢNG. Quy đổi bằng
//     durationFrom(), thứ hiểu được ca vắt qua nửa đêm. Không bao giờ lưu
//     endTime, không bao giờ trừ chuỗi giờ cho nhau.
//
//  2. Sửa một buổi của lịch lặp có BA phạm vi khác hẳn nhau. Chọn nhầm phạm
//     vi là viết lại cả quá khứ và làm nhảy số bảng lương các tháng đã chốt,
//     nên phạm vi được hỏi thẳng trong form chứ không đoán.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Category,
  Frequency,
  Occurrence,
  OccurrenceStatus,
  RecurringRule,
  SingleEvent,
} from '../types';
import { dayOfWeek, durationFrom, endTimeOf, endsNextDay, hoursOf } from '../core/time';
import { formatHours, formatMoney } from '../i18n';
import { validate, type EndMode, type RepeatChoice } from './eventValidation';
import { inputClass } from './styles';
import { Button, ColorDot, Field, Modal } from './ui';

export type EditScope = 'OCCURRENCE' | 'FOLLOWING' | 'SERIES';

export type DialogTarget =
  | { kind: 'create'; date: string; startTime: string }
  | { kind: 'event'; event: SingleEvent }
  | { kind: 'rule'; rule: RecurringRule; occurrence: Occurrence };

export interface SubmitPayload {
  title: string;
  categoryId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  location?: string;
  clientName?: string;
  notes?: string;
  ratePerHour?: number;
  fixedAmount?: number;
  status: OccurrenceStatus;
  /** null = không lặp */
  recurrence: RecurrenceDraft | null;
  scope: EditScope;
}

export interface RecurrenceDraft {
  freq: Frequency;
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  endDate?: string;
  count?: number;
}

type MoneyMode = 'none' | 'hourly' | 'fixed';

interface FormState {
  title: string;
  categoryId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  clientName: string;
  notes: string;
  status: OccurrenceStatus;
  moneyMode: MoneyMode;
  ratePerHour: string;
  fixedAmount: string;
  repeat: RepeatChoice;
  interval: string;
  daysOfWeek: number[];
  dayOfMonth: string;
  endMode: EndMode;
  endDate: string;
  count: string;
  scope: EditScope;
}

/**
 * Ngưỡng nghi ngờ gõ nhầm giờ kết thúc.
 *
 * Ô "Kết thúc" nhận giờ treo tường, nên gõ 00:00 cho ca sáng nghĩa là NỬA ĐÊM
 * HÔM SAU — durationFrom() cộng thêm một ngày và ra 15,5 tiếng, hoàn toàn hợp
 * lệ về mặt dữ liệu. Không chặn, vì ca 12–16 tiếng là có thật; chỉ nói ra con
 * số để người dùng tự thấy nó lạ.
 */
const LONG_SHIFT_MINUTES = 12 * 60;

const STATUSES: OccurrenceStatus[] = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
const STATUS_KEY: Record<OccurrenceStatus, string> = {
  SCHEDULED: 'occurrence.scheduled',
  COMPLETED: 'occurrence.completed',
  CANCELLED: 'occurrence.cancelled',
  NO_SHOW: 'occurrence.noShow',
};

// ───────────────────────────────────────────────────────────────────────────

function initialState(
  target: DialogTarget,
  categories: Category[],
  defaultScope: EditScope,
): FormState {
  const fallbackCategory = categories[0]?.id ?? '';

  const base: FormState = {
    title: '',
    categoryId: fallbackCategory,
    date: '',
    startTime: '08:00',
    endTime: '09:00',
    location: '',
    clientName: '',
    notes: '',
    status: 'SCHEDULED',
    moneyMode: 'none',
    ratePerHour: '',
    fixedAmount: '',
    repeat: 'NONE',
    interval: '1',
    daysOfWeek: [],
    dayOfMonth: '',
    endMode: 'never',
    endDate: '',
    count: '10',
    scope: 'SERIES',
  };

  if (target.kind === 'create') {
    return {
      ...base,
      date: target.date,
      startTime: target.startTime,
      endTime: endTimeOf(target.startTime, 60),
      daysOfWeek: [dayOfWeek(target.date)],
      dayOfMonth: String(Number(target.date.slice(8))),
    };
  }

  if (target.kind === 'event') {
    const e = target.event;
    return {
      ...base,
      title: e.title,
      categoryId: e.categoryId,
      date: e.date,
      startTime: e.startTime,
      endTime: endTimeOf(e.startTime, e.durationMinutes),
      location: e.location ?? '',
      clientName: e.clientName ?? '',
      notes: e.notes ?? '',
      status: e.status,
      moneyMode: e.fixedAmount != null ? 'fixed' : e.ratePerHour != null ? 'hourly' : 'none',
      ratePerHour: e.ratePerHour != null ? String(e.ratePerHour) : '',
      fixedAmount: e.fixedAmount != null ? String(e.fixedAmount) : '',
      daysOfWeek: [dayOfWeek(e.date)],
      dayOfMonth: String(Number(e.date.slice(8))),
    };
  }

  // Sửa một buổi của lịch lặp: form hiển thị giá trị ĐÃ HỢP NHẤT (rule +
  // exception) của đúng buổi đó, còn phần lặp lấy từ rule gốc.
  const { rule, occurrence: o } = target;
  return {
    ...base,
    title: o.title,
    categoryId: o.categoryId,
    date: o.date,
    startTime: o.startTime,
    endTime: endTimeOf(o.startTime, o.durationMinutes),
    location: o.location ?? '',
    clientName: o.clientName ?? '',
    notes: o.notes ?? '',
    status: o.status,
    moneyMode: o.fixedAmount != null ? 'fixed' : o.ratePerHour != null ? 'hourly' : 'none',
    ratePerHour: o.ratePerHour != null ? String(o.ratePerHour) : '',
    fixedAmount: o.fixedAmount != null ? String(o.fixedAmount) : '',
    repeat: rule.freq,
    interval: String(rule.interval || 1),
    daysOfWeek: rule.daysOfWeek ?? [dayOfWeek(o.date)],
    dayOfMonth: String(rule.dayOfMonth ?? Number(o.date.slice(8))),
    endMode: rule.endDate ? 'until' : rule.count != null ? 'count' : 'never',
    endDate: rule.endDate ?? '',
    count: rule.count != null ? String(rule.count) : '10',
    scope: defaultScope,
  };
}

/** "45.000" / "45 000đ" → 45000. Chỉ giữ chữ số — VND không có phần lẻ. */
function parseMoney(raw: string): number | undefined {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return undefined;
  return Number(digits);
}

// ───────────────────────────────────────────────────────────────────────────

export function EventDialog({
  target,
  categories,
  /**
   * Phạm vi chọn sẵn khi mở form cho một buổi của lịch lặp.
   *
   * Mặc định 'OCCURRENCE' — mở từ lịch thì ít phá hoại nhất. Nhưng mở từ màn
   * hình quản lý lịch lặp thì ý định rõ ràng là sửa CẢ CHUỖI, và buổi hiển
   * thị ở đó chỉ là buổi đại diện được dựng ra để form có chỗ đọc.
   */
  defaultScope = 'OCCURRENCE',
  onSubmit,
  onClose,
}: {
  target: DialogTarget;
  categories: Category[];
  defaultScope?: EditScope;
  onSubmit: (payload: SubmitPayload) => Promise<void> | void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(() =>
    initialState(target, categories, defaultScope),
  );
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const category = categories.find((c) => c.id === form.categoryId);
  const isRuleTarget = target.kind === 'rule';
  // Sửa "chỉ buổi này" thì phần lặp không có nghĩa — khóa lại thay vì để
  // người dùng chỉnh xong rồi ngơ ngác không thấy gì thay đổi.
  const recurrenceLocked = isRuleTarget && form.scope === 'OCCURRENCE';

  const durationMinutes = useMemo(() => {
    try {
      return durationFrom(form.startTime, form.endTime);
    } catch {
      return 0;
    }
  }, [form.startTime, form.endTime]);

  // validate() trả về KHÓA i18n chứ không phải câu chữ — hàm thuần, test được,
  // và không phải kéo kiểu TFunction của i18next xuyên qua nó.
  const errors = useMemo(() => validate(form, durationMinutes), [form, durationMinutes]);
  const hasErrors = Object.keys(errors).length > 0;

  const submit = async () => {
    setTouched(true);
    if (hasErrors || saving) return;
    setSaving(true);
    try {
      await onSubmit({
        title: form.title.trim(),
        categoryId: form.categoryId,
        date: form.date,
        startTime: form.startTime,
        durationMinutes,
        location: form.location.trim() || undefined,
        clientName: form.clientName.trim() || undefined,
        notes: form.notes.trim() || undefined,
        ratePerHour: form.moneyMode === 'hourly' ? parseMoney(form.ratePerHour) : undefined,
        fixedAmount: form.moneyMode === 'fixed' ? parseMoney(form.fixedAmount) : undefined,
        status: form.status,
        recurrence:
          form.repeat === 'NONE' || recurrenceLocked
            ? null
            : {
                freq: form.repeat,
                interval: Math.max(1, Number(form.interval) || 1),
                daysOfWeek: form.repeat === 'WEEKLY' ? form.daysOfWeek : undefined,
                dayOfMonth:
                  form.repeat === 'MONTHLY' ? Number(form.dayOfMonth) || undefined : undefined,
                endDate: form.endMode === 'until' ? form.endDate : undefined,
                count: form.endMode === 'count' ? Number(form.count) || undefined : undefined,
              },
        scope: isRuleTarget ? form.scope : 'SERIES',
      });
    } finally {
      setSaving(false);
    }
  };

  const show = (key: string) => (touched && errors[key] ? t(errors[key]) : undefined);

  return (
    <Modal
      wide
      title={t(target.kind === 'create' ? 'event.createTitle' : 'event.editTitle')}
      onClose={onClose}
      footer={
        <>
          {touched && hasErrors && (
            <span className="mr-auto text-xs text-red-600">{t('event.fixErrors')}</span>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isRuleTarget && (
          <ScopePicker value={form.scope} onChange={(v) => set('scope', v)} />
        )}

        <Field label={t('event.title')} error={show('title')}>
          {(id) => (
            <input
              id={id}
              autoFocus
              className={inputClass}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder={t('event.titlePlaceholder')}
            />
          )}
        </Field>

        <Field label={t('category.title')} error={show('categoryId')}>
          {(id) => (
            <div className="flex items-center gap-2">
              {category && <ColorDot color={category.color} />}
              <select
                id={id}
                className={inputClass}
                value={form.categoryId}
                onChange={(e) => set('categoryId', e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isIncomeEligible ? ' ₫' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Ở phạm vi "toàn bộ chuỗi", ô này KHÔNG còn là ngày của một buổi
              mà là ngày bắt đầu của cả chuỗi. Đổi nhãn thay vì để nguyên rồi
              âm thầm diễn giải khác — người dùng phải biết mình đang sửa gì. */}
          <Field
            label={t(
              isRuleTarget && form.scope === 'SERIES' ? 'event.seriesStart' : 'event.date',
            )}
            hint={
              isRuleTarget && form.scope === 'SERIES'
                ? t('event.seriesStartHint')
                : undefined
            }
            error={show('date')}
          >
            {(id) => (
              <input
                id={id}
                type="date"
                className={inputClass}
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('event.startTime')} error={show('startTime')}>
            {(id) => (
              <input
                id={id}
                type="time"
                className={inputClass}
                value={form.startTime}
                onChange={(e) => set('startTime', e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t('event.endTime')}
            hint={
              durationMinutes > 0
                ? t('event.durationHint', { hours: formatHours(hoursOf(durationMinutes)) }) +
                  (overnight(form.startTime, durationMinutes)
                    ? ` · ${t('occurrence.endsNextDay')}`
                    : '')
                : undefined
            }
            error={show('endTime')}
          >
            {(id) => (
              <input
                id={id}
                type="time"
                className={inputClass}
                value={form.endTime}
                onChange={(e) => set('endTime', e.target.value)}
              />
            )}
          </Field>
        </div>

        {durationMinutes >= LONG_SHIFT_MINUTES && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('event.longDurationWarning', {
              hours: formatHours(hoursOf(durationMinutes)),
              endTime: form.endTime,
            })}
          </p>
        )}

        <RecurrenceSection
          form={form}
          set={set}
          locked={recurrenceLocked}
          error={show('recurrence')}
        />

        <MoneySection form={form} set={set} category={category} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('event.location')}>
            {(id) => (
              <input
                id={id}
                className={inputClass}
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('event.clientName')} hint={t('event.clientHint')}>
            {(id) => (
              <input
                id={id}
                className={inputClass}
                placeholder={t('event.clientPlaceholder')}
                value={form.clientName}
                onChange={(e) => set('clientName', e.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label={t('event.status')}>
          {(id) => (
            <select
              id={id}
              className={inputClass}
              value={form.status}
              onChange={(e) => set('status', e.target.value as OccurrenceStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(STATUS_KEY[s])}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label={t('event.notes')}>
          {(id) => (
            <textarea
              id={id}
              rows={2}
              className={inputClass}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function ScopePicker({
  value,
  onChange,
}: {
  value: EditScope;
  onChange: (v: EditScope) => void;
}) {
  const { t } = useTranslation();
  const options: Array<{ value: EditScope; label: string; hint: string }> = [
    { value: 'OCCURRENCE', label: t('scope.occurrence'), hint: t('scope.occurrenceHint') },
    { value: 'FOLLOWING', label: t('scope.following'), hint: t('scope.followingHint') },
    { value: 'SERIES', label: t('scope.series'), hint: t('scope.seriesHint') },
  ];

  return (
    <fieldset className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <legend className="px-1 text-xs font-semibold text-amber-800">
        {t('scope.legend')}
      </legend>
      <div className="space-y-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="edit-scope"
              className="mt-1"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>
              <span className="font-medium text-slate-800">{o.label}</span>
              <span className="block text-xs text-slate-500">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RecurrenceSection({
  form,
  set,
  locked,
  error,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  locked: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  const choices: RepeatChoice[] = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'];

  return (
    <fieldset
      disabled={locked}
      className={`rounded-xl border border-slate-200 p-3 ${locked ? 'opacity-50' : ''}`}
    >
      <legend className="px-1 text-xs font-semibold text-slate-500">
        {t('recurrence.legend')}
      </legend>

      {locked && (
        <p className="mb-2 text-xs text-slate-500">{t('recurrence.lockedHint')}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {choices.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => set('repeat', c)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              form.repeat === c
                ? 'bg-primary text-primary-fg'
                : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t(`recurrence.${c.toLowerCase()}`)}
          </button>
        ))}
      </div>

      {form.repeat !== 'NONE' && (
        <div className="mt-3 space-y-3">
          <Field label={t('recurrence.interval')} hint={t(`recurrence.intervalHint.${form.repeat.toLowerCase()}`)}>
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                max={52}
                className={`${inputClass} max-w-28`}
                value={form.interval}
                onChange={(e) => set('interval', e.target.value)}
              />
            )}
          </Field>

          {form.repeat === 'WEEKLY' && (
            <div>
              <span className="block text-xs font-medium text-slate-500">
                {t('recurrence.daysOfWeek')}
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                  const on = form.daysOfWeek.includes(dow);
                  return (
                    <button
                      key={dow}
                      type="button"
                      onClick={() =>
                        set(
                          'daysOfWeek',
                          on
                            ? form.daysOfWeek.filter((d) => d !== dow)
                            : [...form.daysOfWeek, dow].sort((a, b) => a - b),
                        )
                      }
                      className={`size-9 rounded-lg text-xs font-medium transition ${
                        on
                          ? 'bg-primary text-primary-fg'
                          : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {t(`weekday.s${dow}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {form.repeat === 'MONTHLY' && (
            <Field label={t('recurrence.dayOfMonth')} hint={t('recurrence.dayOfMonthHint')}>
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min={1}
                  max={31}
                  className={`${inputClass} max-w-28`}
                  value={form.dayOfMonth}
                  onChange={(e) => set('dayOfMonth', e.target.value)}
                />
              )}
            </Field>
          )}

          <div>
            <span className="block text-xs font-medium text-slate-500">
              {t('recurrence.ends')}
            </span>
            {/* ⚠️ Ô ngày và ô số buổi phải nằm NGOÀI thẻ <label>, là anh em
                của nó chứ không phải con.

                Một <label> không có thuộc tính `for` sẽ gắn với thẻ nhập
                ĐẦU TIÊN nằm trong nó — ở đây là cái radio. Đặt ô số vào
                trong cùng label đó thì mọi cú bấm vào ô số đều bị chuyển
                thành cú bấm lên radio, tiêu điểm nhảy đi, và người dùng gõ
                số vào chỗ không nhận.

                Hậu quả rất khó lần: form vẫn lưu bình thường, chỉ là lưu
                giá trị mặc định "10" thay vì con số người dùng vừa gõ. Rồi
                màn hình Quản lý báo chuỗi "3 buổi" vẫn đang chạy — và người
                ta sẽ đi tìm lỗi trong thuật toán tính lịch lặp. */}
            <div className="mt-1 space-y-1.5 text-sm">
              {(['never', 'until', 'count'] as EndMode[]).map((mode) => (
                <div key={mode} className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="end-mode"
                      checked={form.endMode === mode}
                      onChange={() => set('endMode', mode)}
                    />
                    <span className="text-slate-700">{t(`recurrence.end.${mode}`)}</span>
                  </label>

                  {mode === 'until' && form.endMode === 'until' && (
                    <input
                      type="date"
                      aria-label={t('recurrence.end.until')}
                      className={`${inputClass} max-w-44`}
                      value={form.endDate}
                      onChange={(e) => set('endDate', e.target.value)}
                    />
                  )}
                  {mode === 'count' && form.endMode === 'count' && (
                    <input
                      type="number"
                      min={1}
                      aria-label={t('recurrence.end.count')}
                      className={`${inputClass} max-w-24`}
                      value={form.count}
                      onChange={(e) => set('count', e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </fieldset>
  );
}

function MoneySection({
  form,
  set,
  category,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  category: Category | undefined;
}) {
  const { t } = useTranslation();

  // GATING: danh mục không tính thu nhập thì ô tiền không có nghĩa gì cả.
  // Vẫn nói rõ lý do thay vì im lặng giấu đi.
  if (!category?.isIncomeEligible) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {t('event.noIncomeCategory', { name: category?.name ?? '' })}
      </p>
    );
  }

  const modes: MoneyMode[] = ['none', 'hourly', 'fixed'];
  const preview =
    form.moneyMode === 'hourly'
      ? parseMoney(form.ratePerHour)
      : form.moneyMode === 'fixed'
        ? parseMoney(form.fixedAmount)
        : undefined;

  return (
    <fieldset className="rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-500">
        {t('event.income')}
      </legend>

      <div className="flex flex-wrap gap-1.5">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => set('moneyMode', m)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              form.moneyMode === m
                ? 'bg-primary text-primary-fg'
                : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t(`event.money.${m}`)}
          </button>
        ))}
      </div>

      {form.moneyMode === 'none' && (
        <p className="mt-2 text-xs text-slate-400">
          {t('event.money.noneHint', {
            rate:
              category.defaultRatePerHour != null
                ? formatMoney(category.defaultRatePerHour)
                : t('payroll.notApplicable'),
          })}
        </p>
      )}

      {form.moneyMode !== 'none' && (
        <div className="mt-3">
          <Field
            label={t(form.moneyMode === 'hourly' ? 'salary.ratePerHour' : 'event.money.fixedLabel')}
            hint={preview != null ? formatMoney(preview) : undefined}
          >
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                className={`${inputClass} max-w-52`}
                value={form.moneyMode === 'hourly' ? form.ratePerHour : form.fixedAmount}
                onChange={(e) =>
                  set(form.moneyMode === 'hourly' ? 'ratePerHour' : 'fixedAmount', e.target.value)
                }
              />
            )}
          </Field>
          {form.moneyMode === 'fixed' && (
            <p className="mt-1 text-xs text-slate-400">{t('event.money.fixedHint')}</p>
          )}
        </div>
      )}
    </fieldset>
  );
}

// ───────────────────────────────────────────────────────────────────────────

/** Bọc endsNextDay để giờ nhập dở dang không ném lỗi giữa lúc gõ */
function overnight(startTime: string, durationMinutes: number): boolean {
  try {
    return endsNextDay(startTime, durationMinutes);
  } catch {
    return false;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
//  components/SalaryRuleForm.tsx — cấu hình lương cho một công việc
//
//  ⚠️ ĐÂY LÀ CHỖ CHỐT QUYẾT ĐỊNH CÒN TREO TỪ PHASE 0.
//
//  `mode` và `shortfallPolicy` KHÔNG CÓ GIÁ TRỊ MẶC ĐỊNH AN TOÀN. Cùng một
//  bộ dữ liệu 160 giờ trên chuẩn 176, phạt 100k, thưởng 300k cho ra ba con số
//  hoàn toàn khác nhau:
//
//      HOURLY 45.000đ/giờ                 → 7.400.000
//      FIXED_MONTHLY 8tr, NONE            → 8.200.000
//      FIXED_MONTHLY 8tr, PRO_RATA        → 7.472.727
//
//  Chọn sẵn giúp người dùng một cái là chọn hộ họ mức lương. Nên form khởi
//  tạo với mode rỗng và bắt chọn rõ trước khi cho lưu.
//
//  Khoảng hiệu lực dùng effectiveFrom/effectiveTo chứ KHÔNG phải mỗi tháng
//  một bản ghi. Làm hai năm mà mỗi tháng một bản là 24 bản ghi giống hệt nhau,
//  và tháng nào quên tạo thì thu nhập tháng đó về 0.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Category, SalaryMode, SalaryRule, ShortfallPolicy } from '../types';
import { createSalaryRule, updateSalaryRule } from '../db/repo/salary';
import { formatMoney } from '../i18n';
import { inputClass } from './styles';
import { Button, Field, Modal } from './ui';

const CURRENCIES = ['VND', 'USD', 'CNY'] as const;

interface FormState {
  categoryId: string;
  /** '' = CHƯA CHỌN. Cố ý không mặc định — xem chú thích đầu file. */
  mode: SalaryMode | '';
  effectiveFrom: string;
  effectiveTo: string;
  currency: string;
  ratePerHour: string;
  baseSalary: string;
  standardMonthlyHours: string;
  shortfallPolicy: ShortfallPolicy | '';
  overtimeMultiplier: string;
  nightShiftMultiplier: string;
  nightShiftStart: string;
  nightShiftEnd: string;
}

function digits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Số thập phân cho hệ số (1.5, 1.3) — giữ dấu chấm, bỏ mọi thứ khác */
function decimal(raw: string): string {
  return raw.replace(/[^\d.]/g, '');
}

function initial(rule: SalaryRule | null, categoryId: string, month: string): FormState {
  if (!rule) {
    return {
      categoryId,
      mode: '',
      effectiveFrom: month,
      effectiveTo: '',
      currency: 'VND',
      ratePerHour: '',
      baseSalary: '',
      standardMonthlyHours: '',
      shortfallPolicy: '',
      overtimeMultiplier: '',
      nightShiftMultiplier: '',
      nightShiftStart: '22:00',
      nightShiftEnd: '06:00',
    };
  }
  return {
    categoryId: rule.categoryId,
    mode: rule.mode,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo ?? '',
    currency: rule.currency,
    ratePerHour: rule.ratePerHour != null ? String(rule.ratePerHour) : '',
    baseSalary: rule.baseSalary != null ? String(rule.baseSalary) : '',
    standardMonthlyHours:
      rule.standardMonthlyHours != null ? String(rule.standardMonthlyHours) : '',
    shortfallPolicy: rule.shortfallPolicy ?? '',
    overtimeMultiplier:
      rule.overtimeMultiplier != null ? String(rule.overtimeMultiplier) : '',
    nightShiftMultiplier:
      rule.nightShiftMultiplier != null ? String(rule.nightShiftMultiplier) : '',
    nightShiftStart: rule.nightShiftStart ?? '22:00',
    nightShiftEnd: rule.nightShiftEnd ?? '06:00',
  };
}

function validateSalaryRule(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.categoryId) errors.categoryId = 'validation.required';
  if (!form.mode) errors.mode = 'salary.mustPickMode';
  if (!/^\d{4}-\d{2}$/.test(form.effectiveFrom)) errors.effectiveFrom = 'validation.monthRequired';
  if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) {
    errors.effectiveTo = 'validation.effectiveToBeforeFrom';
  }

  if (form.mode === 'HOURLY' && !digits(form.ratePerHour)) {
    errors.ratePerHour = 'validation.required';
  }

  if (form.mode === 'FIXED_MONTHLY') {
    if (!digits(form.baseSalary)) errors.baseSalary = 'validation.required';
    if (!form.shortfallPolicy) errors.shortfallPolicy = 'salary.mustPickShortfall';

    // Chia cho 0 → Infinity → NaN lan ra toàn bộ báo cáo. Chặn cả ở đây lẫn
    // ở db/repo/salary.ts, vì bản import dữ liệu không đi qua form này.
    const needsHours =
      form.shortfallPolicy === 'PRO_RATA' || !!decimal(form.overtimeMultiplier);
    const hours = Number(digits(form.standardMonthlyHours));
    if (needsHours && !(hours > 0)) {
      errors.standardMonthlyHours = 'salary.standardHoursRequired';
    }
  }

  const night = Number(decimal(form.nightShiftMultiplier));
  if (form.nightShiftMultiplier && !(night > 0)) {
    errors.nightShiftMultiplier = 'validation.multiplierPositive';
  }
  const ot = Number(decimal(form.overtimeMultiplier));
  if (form.overtimeMultiplier && !(ot > 0)) {
    errors.overtimeMultiplier = 'validation.multiplierPositive';
  }

  return errors;
}

// ───────────────────────────────────────────────────────────────────────────

export function SalaryRuleForm({
  rule,
  categories,
  defaultCategoryId,
  month,
  onClose,
}: {
  rule: SalaryRule | null;
  categories: Category[];
  defaultCategoryId: string;
  month: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(() => initial(rule, defaultCategoryId, month));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const errors = validateSalaryRule(form);
  const show = (key: string) => (touched && errors[key] ? t(errors[key]) : undefined);

  const save = async () => {
    setTouched(true);
    setFailure(null);
    if (Object.keys(errors).length > 0 || saving || !form.mode) return;
    setSaving(true);
    try {
      const hourly = form.mode === 'HOURLY';
      const payload = {
        categoryId: form.categoryId,
        mode: form.mode,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || undefined,
        currency: form.currency,
        ratePerHour: hourly ? Number(digits(form.ratePerHour)) : undefined,
        baseSalary: hourly ? undefined : Number(digits(form.baseSalary)),
        standardMonthlyHours:
          !hourly && digits(form.standardMonthlyHours)
            ? Number(digits(form.standardMonthlyHours))
            : undefined,
        shortfallPolicy: hourly ? undefined : (form.shortfallPolicy || undefined),
        overtimeMultiplier: decimal(form.overtimeMultiplier)
          ? Number(decimal(form.overtimeMultiplier))
          : undefined,
        nightShiftMultiplier: decimal(form.nightShiftMultiplier)
          ? Number(decimal(form.nightShiftMultiplier))
          : undefined,
        nightShiftStart: decimal(form.nightShiftMultiplier) ? form.nightShiftStart : undefined,
        nightShiftEnd: decimal(form.nightShiftMultiplier) ? form.nightShiftEnd : undefined,
      };

      if (rule) await updateSalaryRule(rule.id, payload);
      else await createSalaryRule(payload);
      onClose();
    } catch (e) {
      // Tầng repo cũng chặn cấu hình sinh NaN — hiện nguyên văn lý do của nó
      // thay vì nuốt lỗi rồi để người dùng ngồi đoán.
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const eligible = categories.filter((c) => c.isIncomeEligible);

  return (
    <Modal
      wide
      title={t(rule ? 'salary.editTitle' : 'salary.addTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {failure && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {failure}
          </p>
        )}

        <Field label={t('category.title')} error={show('categoryId')}>
          {(id) => (
            <select
              id={id}
              className={inputClass}
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              <option value="">—</option>
              {eligible.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        {eligible.length === 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('salary.noEligibleCategory')}
          </p>
        )}

        {/* ── Chế độ lương — BẮT BUỘC CHỌN RÕ ── */}
        <fieldset className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-500">
            {t('salary.mode')}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {(['HOURLY', 'FIXED_MONTHLY'] as SalaryMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set('mode', m)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  form.mode === m
                    ? 'bg-primary text-primary-fg'
                    : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t(m === 'HOURLY' ? 'salary.modeHourly' : 'salary.modeFixedMonthly')}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {form.mode === 'HOURLY'
              ? t('salary.modeHourlyHint')
              : form.mode === 'FIXED_MONTHLY'
                ? t('salary.modeFixedHint')
                : t('salary.modePickHint')}
          </p>
          {show('mode') && <p className="mt-1 text-xs text-red-600">{show('mode')}</p>}
        </fieldset>

        {form.mode === 'HOURLY' && (
          <Field
            label={t('salary.ratePerHour')}
            error={show('ratePerHour')}
            hint={
              digits(form.ratePerHour)
                ? formatMoney(Number(digits(form.ratePerHour)), form.currency)
                : undefined
            }
          >
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                className={`${inputClass} max-w-52`}
                value={form.ratePerHour}
                onChange={(e) => set('ratePerHour', e.target.value)}
              />
            )}
          </Field>
        )}

        {form.mode === 'FIXED_MONTHLY' && (
          <>
            <Field
              label={t('salary.baseSalary')}
              error={show('baseSalary')}
              hint={
                digits(form.baseSalary)
                  ? formatMoney(Number(digits(form.baseSalary)), form.currency)
                  : undefined
              }
            >
              {(id) => (
                <input
                  id={id}
                  inputMode="numeric"
                  className={`${inputClass} max-w-52`}
                  value={form.baseSalary}
                  onChange={(e) => set('baseSalary', e.target.value)}
                />
              )}
            </Field>

            {/* ── Chính sách thiếu giờ — BẮT BUỘC CHỌN RÕ ── */}
            <fieldset className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <legend className="px-1 text-xs font-semibold text-amber-800">
                {t('salary.shortfallPolicy')}
              </legend>
              <div className="space-y-1.5">
                {(['NONE', 'PRO_RATA'] as ShortfallPolicy[]).map((p) => (
                  <label key={p} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="shortfall"
                      className="mt-1"
                      checked={form.shortfallPolicy === p}
                      onChange={() => set('shortfallPolicy', p)}
                    />
                    <span>
                      <span className="font-medium text-slate-800">
                        {t(p === 'NONE' ? 'salary.shortfallNone' : 'salary.shortfallProRata')}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {t(
                          p === 'NONE'
                            ? 'salary.shortfallNoneHint'
                            : 'salary.shortfallProRataHint',
                        )}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {show('shortfallPolicy') && (
                <p className="mt-1 text-xs text-red-600">{show('shortfallPolicy')}</p>
              )}
            </fieldset>

            <Field
              label={t('salary.standardHours')}
              error={show('standardMonthlyHours')}
              hint={t('salary.standardHoursHint')}
            >
              {(id) => (
                <input
                  id={id}
                  inputMode="numeric"
                  className={`${inputClass} max-w-32`}
                  value={form.standardMonthlyHours}
                  onChange={(e) => set('standardMonthlyHours', e.target.value)}
                />
              )}
            </Field>
          </>
        )}

        {/* ── Khoảng hiệu lực ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t('salary.effectiveFrom')} error={show('effectiveFrom')}>
            {(id) => (
              <input
                id={id}
                type="month"
                className={inputClass}
                value={form.effectiveFrom}
                onChange={(e) => set('effectiveFrom', e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t('salary.effectiveTo')}
            hint={t('salary.effectiveToHint')}
            error={show('effectiveTo')}
          >
            {(id) => (
              <input
                id={id}
                type="month"
                className={inputClass}
                value={form.effectiveTo}
                onChange={(e) => set('effectiveTo', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('settings.currency')}>
            {(id) => (
              <select
                id={id}
                className={inputClass}
                value={form.currency}
                onChange={(e) => set('currency', e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        {/* ── Tùy chọn nâng cao ── */}
        {form.mode && (
          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-slate-500">
              {t('salary.advanced')}
            </summary>
            <div className="mt-3 space-y-3">
              <Field
                label={t('salary.overtimeMultiplier')}
                hint={t('salary.overtimeHint')}
                error={show('overtimeMultiplier')}
              >
                {(id) => (
                  <input
                    id={id}
                    inputMode="decimal"
                    placeholder="1.5"
                    className={`${inputClass} max-w-28`}
                    value={form.overtimeMultiplier}
                    onChange={(e) => set('overtimeMultiplier', e.target.value)}
                  />
                )}
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field
                  label={t('salary.nightShiftMultiplier')}
                  error={show('nightShiftMultiplier')}
                >
                  {(id) => (
                    <input
                      id={id}
                      inputMode="decimal"
                      placeholder="1.3"
                      className={inputClass}
                      value={form.nightShiftMultiplier}
                      onChange={(e) => set('nightShiftMultiplier', e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('salary.nightShiftStart')}>
                  {(id) => (
                    <input
                      id={id}
                      type="time"
                      className={inputClass}
                      value={form.nightShiftStart}
                      onChange={(e) => set('nightShiftStart', e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t('salary.nightShiftEnd')}>
                  {(id) => (
                    <input
                      id={id}
                      type="time"
                      className={inputClass}
                      value={form.nightShiftEnd}
                      onChange={(e) => set('nightShiftEnd', e.target.value)}
                    />
                  )}
                </Field>
              </div>
              <p className="text-xs text-slate-400">{t('salary.nightShiftHint')}</p>
            </div>
          </details>
        )}
      </div>
    </Modal>
  );
}

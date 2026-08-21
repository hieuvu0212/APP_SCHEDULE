// ═══════════════════════════════════════════════════════════════════════════
//  components/SettingsView.tsx — cấu hình hệ thống
//
//  `SystemSettings` có từ Phase 0 nhưng tới giờ chưa màn hình nào sửa được nó.
//  Trường cấu hình mà không có nơi sửa là TRƯỜNG CHẾT — đúng loại lỗi B2 mà
//  tài liệu review đã bắt được với `Category.defaultRatePerHour`.
//
//  Màn hình này gỡ bốn trường. Riêng `theme` cố ý CHƯA làm: bật chế độ tối
//  đúng nghĩa phải thêm biến `dark:` vào từng lớp Tailwind của mọi component.
//  Bày ra một công tắc không chạy còn tệ hơn là chưa có công tắc, nên nó
//  không xuất hiện ở đây và được ghi vào mục còn treo trong README.
// ═══════════════════════════════════════════════════════════════════════════

import { useTranslation } from 'react-i18next';
import type { SystemSettings } from '../types';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { Field, inputClass } from './ui';

const CURRENCIES: Array<SystemSettings['currency']> = ['VND', 'USD', 'CNY'];

export function SettingsView() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{t('nav.settings')}</h2>
        <p className="text-xs text-slate-500">{t('settings.hint')}</p>
      </div>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <Field label={t('settings.weekStartsOn')} hint={t('settings.weekStartsOnHint')}>
          {(id) => (
            <select
              id={id}
              className={`${inputClass} max-w-52`}
              value={String(settings.weekStartsOn)}
              onChange={(e) =>
                void update({ weekStartsOn: Number(e.target.value) as 0 | 1 })
              }
            >
              <option value="1">{t('weekday.s1')}</option>
              <option value="0">{t('weekday.s0')}</option>
            </select>
          )}
        </Field>

        <Field label={t('settings.currency')} hint={t('settings.currencyHint')}>
          {(id) => (
            <select
              id={id}
              className={`${inputClass} max-w-52`}
              value={settings.currency}
              onChange={(e) =>
                void update({ currency: e.target.value as SystemSettings['currency'] })
              }
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Toggle
          checked={settings.autoCompletePastOccurrences}
          onChange={(v) => void update({ autoCompletePastOccurrences: v })}
          label={t('settings.autoComplete')}
          hint={t('settings.autoCompleteHint')}
        />

        <Toggle
          checked={settings.showConflictAlerts}
          onChange={(v) => void update({ showConflictAlerts: v })}
          label={t('settings.showConflicts')}
          hint={t('settings.showConflictsHint')}
        />
      </section>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {t('settings.storageNote')}
      </p>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="block text-xs leading-snug text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

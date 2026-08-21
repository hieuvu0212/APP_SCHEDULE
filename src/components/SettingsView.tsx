// ═══════════════════════════════════════════════════════════════════════════
//  components/SettingsView.tsx — cấu hình hệ thống, sao lưu và khôi phục
//
//  `SystemSettings` có từ Phase 0 nhưng tới giờ chưa màn hình nào sửa được nó.
//  Trường cấu hình mà không có nơi sửa là TRƯỜNG CHẾT — đúng loại lỗi B2 mà
//  tài liệu review đã bắt được với `Category.defaultRatePerHour`.
//
//  Phần sao lưu ở dưới quan trọng hơn mọi công tắc phía trên. Toàn bộ dữ liệu
//  nằm trong IndexedDB của MỘT trình duyệt: bấm "xóa dữ liệu duyệt web", cài
//  lại máy, hay đổi trình duyệt là mất trắng. Không có máy chủ nào giữ hộ.
// ═══════════════════════════════════════════════════════════════════════════

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SystemSettings } from '../types';
import type { BackupFile, BackupError } from '../core/backup';
import { backupFileName, countRecords, validateBackup } from '../core/backup';
import { exportBackup, importBackup, type ImportReport } from '../db/backup';
import { SCHEMA_VERSION } from '../db/schema';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';
import { Button, Field, Modal, inputClass } from './ui';

const CURRENCIES: Array<SystemSettings['currency']> = ['VND', 'USD', 'CNY'];

// Khóa viết thẳng thay vì ghép `settings.theme_${v}`: i18next dùng dấu gạch
// dưới làm ký tự phân tách số nhiều, nên khóa dạng đó dễ va vào cơ chế đó.
const THEMES: Array<{ value: SystemSettings['theme']; key: string }> = [
  { value: 'light', key: 'settings.themeLight' },
  { value: 'dark', key: 'settings.themeDark' },
  { value: 'system', key: 'settings.themeSystem' },
];

const BACKUP_ERROR_KEY: Record<BackupError, string> = {
  notObject: 'backup.errorNotObject',
  wrongFormat: 'backup.errorWrongFormat',
  missingData: 'backup.errorMissingData',
  newerSchema: 'backup.errorNewerSchema',
  tableNotArray: 'backup.errorTableNotArray',
};

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
        <div>
          <span className="block text-xs font-medium text-slate-500">
            {t('settings.themeLabel')}
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {THEMES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => void update({ theme: option.value })}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  settings.theme === option.value
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t(option.key)}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">{t('settings.themeHint')}</p>
        </div>

        <Field label={t('settings.weekStartsOn')} hint={t('settings.weekStartsOnHint')}>
          {(id) => (
            <select
              id={id}
              className={`${inputClass} max-w-52`}
              value={String(settings.weekStartsOn)}
              onChange={(e) => void update({ weekStartsOn: Number(e.target.value) as 0 | 1 })}
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

      <BackupSection />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function BackupSection() {
  const { t } = useTranslation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [unknownTables, setUnknownTables] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = backupFileName();
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const pickFile = async (file: File) => {
    setError(null);
    setReport(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError(t('backup.errorNotJson'));
      return;
    }

    const result = validateBackup(parsed, SCHEMA_VERSION);
    if (!result.ok) {
      setError(t(BACKUP_ERROR_KEY[result.reason]));
      return;
    }
    setUnknownTables(result.unknownTables);
    setPending(result.backup);
  };

  const runImport = async (mode: 'replace' | 'merge') => {
    if (!pending) return;
    setBusy(true);
    try {
      setReport(await importBackup(pending, mode));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{t('backup.title')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{t('backup.why')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void doExport()}>
          {t('backup.export')}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
          {t('backup.import')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Xóa value để chọn lại đúng file vừa chọn vẫn kích hoạt onChange.
            e.target.value = '';
            if (file) void pickFile(file);
          }}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {report && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {t('backup.done', {
            added: report.added,
            updated: report.updated,
            kept: report.kept,
          })}
        </p>
      )}

      {pending && (
        <ImportDialog
          backup={pending}
          unknownTables={unknownTables}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={(mode) => void runImport(mode)}
        />
      )}
    </section>
  );
}

function ImportDialog({
  backup,
  unknownTables,
  busy,
  onCancel,
  onConfirm,
}: {
  backup: BackupFile;
  unknownTables: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (mode: 'replace' | 'merge') => void;
}) {
  const { t } = useTranslation();
  const total = countRecords(backup);

  return (
    <Modal title={t('backup.importTitle')} onClose={onCancel}>
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          {t('backup.fileSummary', {
            total,
            date: backup.exportedAt ? backup.exportedAt.slice(0, 10) : '—',
          })}
        </p>

        {unknownTables.length > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('backup.unknownTables', { tables: unknownTables.join(', ') })}
          </p>
        )}

        {/* Hai chế độ có hệ quả khác hẳn nhau nên bày thành hai khối riêng,
            không phải một nút "OK" rồi hỏi sau. */}
        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm('merge')}
            className="w-full rounded-xl border border-slate-300 p-3 text-left transition hover:bg-slate-50 disabled:opacity-50"
          >
            <span className="font-medium text-slate-800">{t('backup.modeMerge')}</span>
            <span className="mt-0.5 block text-xs leading-snug text-slate-500">
              {t('backup.modeMergeHint')}
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm('replace')}
            className="w-full rounded-xl border border-red-200 p-3 text-left transition hover:bg-red-50 disabled:opacity-50"
          >
            <span className="font-medium text-red-700">{t('backup.modeReplace')}</span>
            <span className="mt-0.5 block text-xs leading-snug text-slate-500">
              {t('backup.modeReplaceHint')}
            </span>
          </button>
        </div>

        <p className="text-xs text-slate-400">{t('backup.noUndoWarning')}</p>
      </div>
    </Modal>
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

import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { db, SCHEMA_VERSION } from './db/schema';
import { listCategories } from './db/repo/categories';

/**
 * Phase 0 chỉ có màn hình nghiệm thu này — không có giao diện lịch.
 * Nhìn vào chỉ thấy trạng thái nền móng, và như vậy là ĐÚNG.
 * Week View bắt đầu ở Phase 1.
 */
export default function App() {
  const { t } = useTranslation();
  const categories = useLiveQuery(() => listCategories(), []);
  const counts = useLiveQuery(async () => ({
    rules: await db.rules.count(),
    exceptions: await db.exceptions.count(),
    events: await db.events.count(),
    salaryRules: await db.salaryRules.count(),
    adjustments: await db.adjustments.count(),
  }), []);

  const checklist = [
    ['Vite + React 19 + TypeScript', true],
    ['Tailwind v4 (plugin @tailwindcss/vite)', true],
    ['types/index.ts — schema đầy đủ', true],
    ['Dexie + chuỗi version() + tombstone', !!counts],
    ['Seed danh mục mặc định', (categories?.length ?? 0) > 0],
    ['core/ hàm thuần (time, expand, conflict, income, payroll)', true],
    ['Truy vấn exception hai chiều', true],
    ['i18next + bộ vi', true],
    ['Vitest — chạy `npm test`', true],
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
          {t('app.name')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{t('phase0.heading')}</h1>
        <p className="mt-2 text-slate-600">{t('phase0.subheading')}</p>

        <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-500">
            {t('phase0.dbStatus')}
          </h2>

          {!categories ? (
            <p className="mt-4 text-slate-400">{t('common.loading')}</p>
          ) : (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <Stat label={t('phase0.schemaVersion')} value={String(SCHEMA_VERSION)} />
                <Stat label={t('phase0.categoriesSeeded')} value={String(categories.length)} />
                <Stat label="RecurringRule" value={String(counts?.rules ?? 0)} />
                <Stat label="ScheduleException" value={String(counts?.exceptions ?? 0)} />
                <Stat label="SingleEvent" value={String(counts?.events ?? 0)} />
                <Stat label="SalaryRule" value={String(counts?.salaryRules ?? 0)} />
              </dl>

              <ul className="mt-6 flex flex-wrap gap-2">
                {categories.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-sm"
                    title={
                      c.isIncomeEligible
                        ? t('phase0.incomeYes')
                        : t('phase0.incomeNo')
                    }
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.name}
                    <span
                      className={
                        c.isIncomeEligible
                          ? 'text-emerald-600'
                          : 'text-slate-400'
                      }
                    >
                      {c.isIncomeEligible ? '₫' : '–'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-500">
            {t('phase0.checklist')}
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {checklist.map(([label, ok]) => (
              <li key={label} className="flex items-start gap-2">
                <span className={ok ? 'text-emerald-600' : 'text-slate-300'}>
                  {ok ? '✓' : '○'}
                </span>
                <span className={ok ? '' : 'text-slate-400'}>{label}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 text-sm text-slate-500">{t('phase0.nextPhase')}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

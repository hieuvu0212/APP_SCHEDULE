import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { StatsView } from '../StatsView';
import { useStats } from '../../hooks/useStats';

vi.mock('../../hooks/useStats');
vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ currency: 'VND', autoCompletePast: false }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => key + (opts ? JSON.stringify(opts) : ''),
  }),
}));

describe('StatsView', () => {
  it('cột biểu đồ thu nhập không bị cao 0px do chia cho 0 hoặc lỗi %', () => {
    // Giả lập data trả về
    vi.mocked(useStats).mockReturnValue({
      categories: [{ id: '1', name: 'Cat 1', color: '#000', isIncomeEligible: true, isSystem: false, sortOrder: 0, createdAt: '', updatedAt: '' }],
      clients: [],
      income: [{ month: '2026-08', net: 5000000, gross: 5000000, currency: 'VND' }],
      totalNet: 5000000,
      mixedCurrency: false,
      categoryStats: [],
      hoursPerMonth: new Map(),
      hoursPerWeekday: [0,0,0,0,0,0,0],
      months: ['2026-08'],
      occurrences: [],
      conflictCount: 0,
      incomeIgnoresFilter: false,
    });

    const { container } = render(<StatsView />);
    // Tìm các cột: chúng là thẻ div có class `bg-primary` và style chứa height
    const bars = Array.from(container.querySelectorAll('div.bg-primary')).filter(el => el.hasAttribute('style'));
    
    expect(bars.length).toBeGreaterThan(0);
    
    // Đảm bảo không có cột nào có height: 0px hoặc NaNpx nếu giá trị lớn hơn 0
    bars.forEach((bar) => {
      const height = (bar as HTMLElement).style.height;
      expect(height).not.toBe('0px');
      expect(height).not.toBe('NaNpx');
    });
  });
});

/// <reference types="jest" />

import {
  ExchangeRateEmailContext,
  formatBs,
  formatDualPrice,
  renderDualPriceCellHtml,
  renderIssuanceDateNotice,
  renderExchangeRateFooterNote,
} from './currency-format.utils';

describe('currency-format.utils', () => {
  const activeRateContext: ExchangeRateEmailContext = {
    enabled: true,
    rate: 52.35,
    currency: 'VES',
    symbol: 'Bs.',
    source: 'BCV',
    mode: 'AUTO',
    updatedAt: '2026-11-07T12:00:00Z',
  };

  const disabledRateContext: ExchangeRateEmailContext = {
    enabled: false,
    rate: 52.35,
    currency: 'VES',
    symbol: 'Bs.',
    source: 'BCV',
    mode: 'AUTO',
    updatedAt: '2026-11-07T12:00:00Z',
  };

  describe('formatBs', () => {
    it('formats amount in Bolívares using Venezuelan locale format', () => {
      // 10 * 52.35 = 523.5
      const formatted = formatBs(10, 52.35);
      expect(formatted).toContain('Bs.');
      expect(formatted).toContain('523,50');
    });

    it('formats larger amounts with thousands separator', () => {
      // 100 * 52.35 = 5235
      const formatted = formatBs(100, 52.35);
      expect(formatted).toContain('Bs.');
      expect(formatted).toContain('5.235,00');
    });
  });

  describe('formatDualPrice', () => {
    it('returns combined USD and Bs format when rateContext is enabled', () => {
      const result = formatDualPrice(25, activeRateContext);
      expect(result.usd).toBe('$25.00');
      expect(result.bs).toContain('Bs.');
      expect(result.combined).toContain('$25.00 (~ Bs.');
      expect(result.combinedHtml).toContain('$25.00');
      expect(result.combinedHtml).toContain('~ Bs.');
    });

    it('falls back to USD-only when rateContext is disabled', () => {
      const result = formatDualPrice(25, disabledRateContext);
      expect(result.usd).toBe('$25.00');
      expect(result.bs).toBeNull();
      expect(result.combined).toBe('$25.00');
      expect(result.combinedHtml).not.toContain('Bs.');
    });

    it('falls back to USD-only when rateContext is null or undefined', () => {
      const result = formatDualPrice(25, null);
      expect(result.usd).toBe('$25.00');
      expect(result.bs).toBeNull();
      expect(result.combined).toBe('$25.00');
    });
  });

  describe('renderDualPriceCellHtml', () => {
    it('renders stacked cell markup when enabled', () => {
      const html = renderDualPriceCellHtml(15.5, activeRateContext);
      expect(html).toContain('$15.50');
      expect(html).toContain('~ Bs.');
    });

    it('renders single USD cell when disabled', () => {
      const html = renderDualPriceCellHtml(15.5, disabledRateContext);
      expect(html).toContain('$15.50');
      expect(html).not.toContain('Bs.');
    });
  });

  describe('renderIssuanceDateNotice', () => {
    it('renders alert markup with emission date when enabled', () => {
      const notice = renderIssuanceDateNotice('07/11/2026', activeRateContext);
      expect(notice).toContain('Nota informativa');
      expect(notice).toContain('07/11/2026');
      expect(notice).toContain('tasa oficial del BCV');
    });

    it('returns empty string when disabled', () => {
      const notice = renderIssuanceDateNotice('07/11/2026', disabledRateContext);
      expect(notice).toBe('');
    });
  });

  describe('renderExchangeRateFooterNote', () => {
    it('renders footer footnote with BCV rate when enabled', () => {
      const footer = renderExchangeRateFooterNote(
        '07/11/2026',
        activeRateContext,
      );
      expect(footer).toContain('Banco Central de Venezuela (BCV)');
      expect(footer).toContain('52,35');
      expect(footer).toContain('07/11/2026');
    });

    it('returns empty string when disabled', () => {
      const footer = renderExchangeRateFooterNote(
        '07/11/2026',
        disabledRateContext,
      );
      expect(footer).toBe('');
    });
  });
});


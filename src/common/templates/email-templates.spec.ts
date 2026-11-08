/// <reference types="jest" />

import {
  getOrderAutoCancelledTemplate,
  getInstallmentPlanTemplate,
  getSinglePaymentUnderReviewTemplate,
  getPaymentApprovedTemplate,
  getPaymentRejectedTemplate,
  getPaymentReminderTemplate,
  getStoreNewDisputeTemplate,
} from './email-templates';
import { ExchangeRateEmailContext } from '../utils/currency-format.utils';

describe('Email Templates', () => {
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

  describe('getOrderAutoCancelledTemplate', () => {
    it('should generate properly formatted cancellation email template without inventory jargon', () => {
      const html = getOrderAutoCancelledTemplate(
        'Edwin Mora',
        'ORD-98765',
        'Tienda Central',
      );

      expect(html).toContain('Edwin Mora');
      expect(html).toContain('ORD-98765');
      expect(html).toContain('Tienda Central');
      expect(html).toContain('Orden Cancelada');
      expect(html).toContain('24 horas');
      expect(html).toContain('Tu Lojita - Tu tienda de confianza');

      // Verify that internal inventory release text is NOT included
      expect(html.toLowerCase()).not.toContain('liberado al inventario');
      expect(html.toLowerCase()).not.toContain('inventario');
    });
  });

  describe('getInstallmentPlanTemplate (Dual Pricing & Bolívares Reference)', () => {
    it('renders dual pricing for paid, pending, installment rows, emission date alert, and BCV footnote when enabled', () => {
      const html = getInstallmentPlanTemplate(
        'María Pérez',
        'ORD-12345',
        100,
        'Boutique Elegancia',
        [
          { amount: 25, dueDate: '15/11/2026' },
          { amount: 25, dueDate: '30/11/2026' },
        ],
        50,
        50,
        '15/11/2026',
        activeRateContext,
        '07/11/2026',
      );

      expect(html).toContain('María Pérez');
      expect(html).toContain('Boutique Elegancia');
      expect(html).toContain('Nota informativa');
      expect(html).toContain('07/11/2026');
      expect(html).toContain('$50.00');
      expect(html).toContain('Bs.');
      expect(html).toContain('2.617,50'); // 50 * 52.35
      expect(html).toContain('1.308,75'); // 25 * 52.35 (installment rows)
      expect(html).toContain('Banco Central de Venezuela (BCV)');
      expect(html).toContain('52,35');
    });

    it('renders USD-only amounts without Bolívares references when rateContext is disabled', () => {
      const html = getInstallmentPlanTemplate(
        'María Pérez',
        'ORD-12345',
        100,
        'Boutique Elegancia',
        [{ amount: 25, dueDate: '15/11/2026' }],
        50,
        50,
        '15/11/2026',
        disabledRateContext,
      );

      expect(html).toContain('$50.00');
      expect(html).not.toContain('~ Bs.');
      expect(html).not.toContain('Nota informativa');
      expect(html).not.toContain('Banco Central de Venezuela (BCV)');
    });
  });

  describe('getSinglePaymentUnderReviewTemplate (Item-level & Total Dual Pricing)', () => {
    it('renders dual pricing on reported total and on each individual item row when enabled', () => {
      const items = [
        { title: 'Zapatos Deportivos', quantity: 2, price: 20 },
        { title: 'Medias de Algodón', quantity: 1, price: 10 },
      ];
      const html = getSinglePaymentUnderReviewTemplate(
        'Carlos Ruiz',
        'ORD-55555',
        'Zapatería Moderna',
        items,
        50,
        activeRateContext,
        '07/11/2026',
      );

      expect(html).toContain('Carlos Ruiz');
      expect(html).toContain('Zapatería Moderna');
      expect(html).toContain('Nota informativa');
      expect(html).toContain('$50.00');
      expect(html).toContain('2.617,50'); // Total reported (50 * 52.35)
      expect(html).toContain('Zapatos Deportivos (x2)');
      expect(html).toContain('2.094,00'); // Subtotal 40 * 52.35
      expect(html).toContain('Medias de Algodón (x1)');
      expect(html).toContain('523,50'); // Subtotal 10 * 52.35
      expect(html).toContain('Banco Central de Venezuela (BCV)');
    });

    it('renders clean USD-only table when rateContext is disabled', () => {
      const items = [{ title: 'Camisa Formal', quantity: 1, price: 30 }];
      const html = getSinglePaymentUnderReviewTemplate(
        'Carlos Ruiz',
        'ORD-55555',
        'Zapatería Moderna',
        items,
        30,
        disabledRateContext,
      );

      expect(html).toContain('$30.00');
      expect(html).not.toContain('~ Bs.');
      expect(html).not.toContain('Nota informativa');
      expect(html).not.toContain('Banco Central de Venezuela (BCV)');
    });
  });

  describe('getPaymentApprovedTemplate', () => {
    it('renders dual pricing on approved amount, remaining balance, and next installment when enabled', () => {
      const html = getPaymentApprovedTemplate(
        'Ana Gómez',
        'ORD-88888',
        'TecnoStore',
        40,
        { index: 2, amount: 60, dueDate: '20/11/2026' },
        60,
        activeRateContext,
        '07/11/2026',
      );

      expect(html).toContain('Ana Gómez');
      expect(html).toContain('TecnoStore');
      expect(html).toContain('Nota informativa');
      expect(html).toContain('$40.00 (~ Bs. 2.094,00)');
      expect(html).toContain('$60.00');
      expect(html).toContain('3.141,00'); // 60 * 52.35
      expect(html).toContain('Banco Central de Venezuela (BCV)');
    });

    it('renders USD-only when rateContext is disabled', () => {
      const html = getPaymentApprovedTemplate(
        'Ana Gómez',
        'ORD-88888',
        'TecnoStore',
        40,
        null,
        0,
        disabledRateContext,
      );

      expect(html).toContain('$40.00');
      expect(html).not.toContain('~ Bs.');
      expect(html).not.toContain('Nota informativa');
    });
  });

  describe('getPaymentRejectedTemplate', () => {
    it('renders dual pricing on rejected amount when enabled', () => {
      const html = getPaymentRejectedTemplate(
        'Pedro Torres',
        'ORD-77777',
        'Farmacia Vida',
        15,
        'Comprobante no coincide con extracto bancario',
        activeRateContext,
        '07/11/2026',
      );

      expect(html).toContain('Pedro Torres');
      expect(html).toContain('Farmacia Vida');
      expect(html).toContain('$15.00 (~ Bs. 785,25)');
      expect(html).toContain('Nota informativa');
      expect(html).toContain('Banco Central de Venezuela (BCV)');
    });

    it('renders USD-only when rateContext is disabled', () => {
      const html = getPaymentRejectedTemplate(
        'Pedro Torres',
        'ORD-77777',
        'Farmacia Vida',
        15,
        'Comprobante no coincide',
        disabledRateContext,
      );

      expect(html).toContain('$15.00');
      expect(html).not.toContain('~ Bs.');
    });
  });

  describe('getPaymentReminderTemplate', () => {
    it('renders dual pricing on due installment amount when enabled', () => {
      const html = getPaymentReminderTemplate(
        'Laura Silva',
        20,
        '10/11/2026',
        'ORD-33333',
        activeRateContext,
        '07/11/2026',
      );

      expect(html).toContain('Laura Silva');
      expect(html).toContain('$20.00 (~ Bs. 1.047,00)');
      expect(html).toContain('Nota informativa');
      expect(html).toContain('Banco Central de Venezuela (BCV)');
    });

    it('renders USD-only when rateContext is disabled', () => {
      const html = getPaymentReminderTemplate(
        'Laura Silva',
        20,
        '10/11/2026',
        'ORD-33333',
        disabledRateContext,
      );

      expect(html).toContain('$20.00');
      expect(html).not.toContain('~ Bs.');
    });
  });

  describe('getStoreNewDisputeTemplate', () => {
    it('renders dual pricing on disputed order amount when enabled', () => {
      const html = getStoreNewDisputeTemplate(
        'Comercializadora El Éxito',
        'El Éxito Centro',
        'ORD-99999',
        'Roberto Díaz',
        'ARTICULO_DANADO',
        'El artículo llegó roto',
        80,
        '07/11/2026',
        activeRateContext,
        '07/11/2026',
      );

      expect(html).toContain('Roberto Díaz');
      expect(html).toContain('ORD-99999');
      expect(html).toContain('$80.00 (~ Bs. 4.188,00)'); // 80 * 52.35
      expect(html).toContain('Nota informativa');
      expect(html).toContain('Banco Central de Venezuela (BCV)');
    });

    it('renders USD-only when rateContext is disabled', () => {
      const html = getStoreNewDisputeTemplate(
        'Comercializadora El Éxito',
        'El Éxito Centro',
        'ORD-99999',
        'Roberto Díaz',
        'ARTICULO_DANADO',
        'El artículo llegó roto',
        80,
        '07/11/2026',
        disabledRateContext,
      );

      expect(html).toContain('$80.00');
      expect(html).not.toContain('~ Bs.');
      expect(html).not.toContain('Nota informativa');
    });
  });
});

import { getOrderAutoCancelledTemplate } from './email-templates';

describe('Email Templates', () => {
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
});

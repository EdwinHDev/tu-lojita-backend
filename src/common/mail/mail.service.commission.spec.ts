jest.mock('@nestjs/common/utils/load-package.util', () => ({
  loadPackage: jest.fn(),
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('@nestjs-modules/mailer', () => ({
  MailerService: class {},
}));

import { MailService } from './mail.service';

describe('MailService commission & reactivation email templates', () => {
  let service: MailService;
  let mockMailerService: { sendMail: jest.Mock };
  let mockPlatformSettingsService: { getExchangeRateContext?: jest.Mock; getExchangeRateConfig: jest.Mock };

  beforeEach(() => {
    mockMailerService = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
    };
    mockPlatformSettingsService = {
      getExchangeRateConfig: jest.fn().mockResolvedValue({
        rate: 50,
        currency: 'USD',
        updatedAt: new Date('2026-11-12T10:00:00Z'),
        source: 'BCV',
      }),
    };
    service = new MailService(
      mockMailerService as any,
      mockPlatformSettingsService as any,
    );
  });

  it('renders pre-cut weekend reminder with dual currency and instructions', async () => {
    await service.sendCommissionPreCutReminder({
      email: 'tienda@example.com',
      storeName: 'Tienda Sol',
      accumulatedAmount: 18,
      cutDateLabel: 'este lunes',
      gracePeriodDays: 4,
      paymentMethodsSummary: ['Pago Móvil: Banesco 0414-0000000 J-12345678-9'],
    });

    expect(mockMailerService.sendMail).toHaveBeenCalledTimes(1);
    const call = mockMailerService.sendMail.mock.calls[0][0];
    expect(call.to).toBe('tienda@example.com');
    expect(call.subject).toContain('Recordatorio Pre-Corte');
    expect(call.subject).toContain('$18.00');
    expect(call.html).toContain('4 días de gracia');
    expect(call.html).toContain('Pago Móvil: Banesco');
    expect(call.text).toContain('$18.00');
  });

  it('renders dynamic grace countdown and fine preview in grace reminder email', async () => {
    await service.sendCommissionGraceReminder('tienda@example.com', 'Tienda Sol', 25, {
      daysRemaining: 2,
      dueDate: new Date('2026-11-14T23:59:59Z'),
      finePreviewAmount: 5,
    });

    const call = mockMailerService.sendMail.mock.calls[0][0];
    expect(call.subject).toContain('Quedan 2 días');
    expect(call.html).toContain('Faltan <strong>2 días</strong>');
    expect(call.html).toContain('$5.00');
    expect(call.text).toContain('$25.00');
  });

  it('renders suspended store email breakdown and 1-2-3 reactivation steps', async () => {
    await service.sendStoreSuspendedForCommissions(
      'tienda@example.com',
      'Tienda Sol',
      30,
      5,
      {
        baseCommission: 25,
        isDailyReminder: true,
        paymentMethodsSummary: ['Zelle: pagos@tulojita.com'],
      },
    );

    const call = mockMailerService.sendMail.mock.calls[0][0];
    expect(call.subject).toContain('Tienda Suspendida');
    expect(call.html).toContain('$25.00');
    expect(call.html).toContain('$5.00');
    expect(call.html).toContain('$30.00');
    expect(call.html).toContain('Zelle: pagos@tulojita.com');
    expect(call.html).toContain('reactiva automáticamente');
  });

  it('renders approved+reactivated and rejected emails cleanly', async () => {
    await service.sendCommissionPaymentApprovedNotice({
      email: 'tienda@example.com',
      storeName: 'Tienda Sol',
      paidAmountUsd: 30,
      remainingDebtUsd: 0,
      reactivated: true,
    });

    await service.sendCommissionPaymentRejectedNotice({
      email: 'tienda@example.com',
      storeName: 'Tienda Sol',
      reportedAmountUsd: 30,
      remainingDebtUsd: 30,
      rejectionReason: 'Referencia ilegible <script>bad</script>',
      isSuspended: true,
    });

    expect(mockMailerService.sendMail).toHaveBeenCalledTimes(2);
    const approved = mockMailerService.sendMail.mock.calls[0][0];
    expect(approved.subject).toContain('Reactivada');
    expect(approved.html).toContain('$30.00');

    const rejected = mockMailerService.sendMail.mock.calls[1][0];
    expect(rejected.subject).toContain('Rechazado');
    expect(rejected.html).toContain('Referencia ilegible &lt;script&gt;bad&lt;/script&gt;');
  });
});

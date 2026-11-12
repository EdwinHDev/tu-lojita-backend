import { Injectable, Logger, Optional } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { Order } from 'src/order/entities/order.entity';
import { Payment } from 'src/payment/entities/payment.entity';
import { PlatformSettingsService } from 'src/platform-settings/platform-settings.service';
import {
  ExchangeRateEmailContext,
  formatDualPrice,
  renderIssuanceDateNotice,
  renderExchangeRateFooterNote,
} from 'src/common/utils/currency-format.utils';
import {
  getInstallmentPlanTemplate,
  getPaymentReminderTemplate,
  getSinglePaymentUnderReviewTemplate,
  getPaymentApprovedTemplate,
  getPaymentRejectedTemplate,
  getOrderAutoCancelledTemplate,
  getStoreNewDisputeTemplate,
  getCustomerDisputeResponseTemplate,
  getStoreStrikeNoticeTemplate,
  getStoreSuspensionTemplate,
  getItemHiddenTemplate,
  getCustomerBlockedTemplate,
  getCustomerUnblockedTemplate,
  getDisputeVerdictNoticeTemplate,
  getAccountSuspensionTemplate,
} from 'src/common/templates/email-templates';
import { formatDateInTimezone } from 'src/common/utils/timezone.utils';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private escapeHtml(value: string): string {
    return (value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private renderCommissionPaymentStepsHtml(
    paymentMethodsSummary?: string[],
  ): string {
    const methodsListHtml =
      paymentMethodsSummary && paymentMethodsSummary.length > 0
        ? `
          <div style="margin: 16px 0; padding: 14px 16px; border-radius: 10px; background-color: #f8fafc; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0f172a;">¿Cómo y dónde pagar? (Cuentas oficiales de Tu Lojita)</p>
            <ul style="margin: 0; padding-left: 18px; color: #334155; font-size: 13px; line-height: 1.55;">
              ${paymentMethodsSummary
                .map((m) => `<li>${this.escapeHtml(m)}</li>`)
                .join('')}
            </ul>
          </div>
        `
        : '';

    return `
      ${methodsListHtml}
      <div style="margin: 16px 0; padding: 14px 16px; border-radius: 10px; background-color: #f1f5f9; border: 1px solid #cbd5e1;">
        <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #0f172a;">Pasos para reportar tu pago en Tu Lojita Empresa:</p>
        <ol style="margin: 0; padding-left: 18px; color: #334155; font-size: 13px; line-height: 1.6;">
          <li>Abre <strong>Tu Lojita Empresa &rarr; Mi Tienda &rarr; Deudas con la Plataforma</strong>.</li>
          <li>Copia los datos de una cuenta oficial, realiza el pago en USD o Bs. y adjunta el comprobante.</li>
          <li>Al aprobarse el pago completo, tu saldo queda al día y tu tienda se reactiva automáticamente.</li>
        </ol>
      </div>
    `;
  }

  constructor(
    private readonly mailerService: MailerService,
    @Optional()
    private readonly platformSettingsService?: PlatformSettingsService,
  ) {}

  private async getExchangeRateContext(): Promise<ExchangeRateEmailContext | null> {
    if (!this.platformSettingsService) {
      return null;
    }
    try {
      const config = await this.platformSettingsService.getExchangeRateConfig();
      return config;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not retrieve exchange rate for email: ${msg}`);
      return null;
    }
  }

  async sendOrderConfirmation(order: Order) {
    try {
      const isPartial = order.isPartialPayment;
      const title = isPartial
        ? 'Tu Plan de Pagos - Tu Lojita'
        : 'Confirmación de Orden - Tu Lojita';
      const orderId = order.id.split('-')[0].toUpperCase();

      const installments =
        order.installments?.map((i) => ({
          amount: parseFloat(i.amount.toString()),
          dueDate: i.dueDate
            ? formatDateInTimezone(new Date(i.dueDate))
            : 'Por definir tras pago anterior',
        })) || [];

      const customerName = `${order.user.firstName}${order.user.lastName ? ' ' + order.user.lastName : ''}`;

      const paidAmount = parseFloat(order.totalPaidAmount?.toString() || '0');
      const remainingBalance = parseFloat(
        order.remainingBalance?.toString() || order.balance.toString(),
      );
      const nextDate = order.nextDueDate
        ? formatDateInTimezone(new Date(order.nextDueDate))
        : undefined;

      const rateContext = await this.getExchangeRateContext();
      const emissionDate = formatDateInTimezone(new Date());

      await this.mailerService.sendMail({
        to: order.user.email,
        subject: title,
        html: isPartial
          ? getInstallmentPlanTemplate(
              customerName,
              orderId,
              order.finalAmount,
              order.store.name,
              installments,
              paidAmount,
              remainingBalance,
              nextDate,
              rateContext,
              emissionDate,
            )
          : `<h2>Hola ${customerName}, tu orden #${orderId} en ${order.store.name} ha sido confirmada.</h2>`,
      });
      this.logger.log(
        `Email sent to ${order.user.email} for order ${order.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${order.user.email}: ${error.message}`,
      );
    }
  }

  async sendPaymentReminder(
    email: string,
    customerName: string,
    amount: number,
    dueDate: Date,
    orderId: string,
  ) {
    try {
      const formattedOrderId = orderId.split('-')[0].toUpperCase();
      const rateContext = await this.getExchangeRateContext();
      const emissionDate = formatDateInTimezone(new Date());

      await this.mailerService.sendMail({
        to: email,
        subject: 'Recordatorio de Pago Próximo - Tu Lojita',
        html: getPaymentReminderTemplate(
          customerName,
          amount,
          formatDateInTimezone(new Date(dueDate)),
          formattedOrderId,
          rateContext,
          emissionDate,
        ),
      });
    } catch (error) {
      this.logger.error(
        `Failed to send reminder to ${email}: ${error.message}`,
      );
    }
  }

  async sendSinglePaymentUnderReview(order: Order, amount: number) {
    try {
      const orderId = order.id.split('-')[0].toUpperCase();
      const customerName = `${order.user.firstName}${order.user.lastName ? ' ' + order.user.lastName : ''}`;
      const items = order.orderItems.map((oi) => ({
        title: oi.title,
        quantity: oi.quantity,
        price: parseFloat(oi.price.toString()),
      }));

      const rateContext = await this.getExchangeRateContext();
      const emissionDate = formatDateInTimezone(new Date());

      await this.mailerService.sendMail({
        to: order.user.email,
        subject: `Pago Bajo Revisión - Orden #${orderId}`,
        html: getSinglePaymentUnderReviewTemplate(
          customerName,
          orderId,
          order.store.name,
          items,
          amount,
          rateContext,
          emissionDate,
        ),
      });
      this.logger.log(
        `Review email sent to ${order.user.email} for order ${order.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send review email to ${order.user.email}: ${error.message}`,
      );
    }
  }

  async sendPaymentApproved(
    payment: Payment,
    nextInstallment?: {
      index: number;
      amount: number;
      dueDate: Date;
    } | null,
    remainingBalance?: number | null,
  ) {
    try {
      const orderId = payment.order.id.split('-')[0].toUpperCase();
      const customerName = `${payment.user.firstName}${payment.user.lastName ? ' ' + payment.user.lastName : ''}`;

      const nextInstallmentInfo = nextInstallment
        ? {
            index: nextInstallment.index,
            amount: nextInstallment.amount,
            dueDate: formatDateInTimezone(nextInstallment.dueDate),
          }
        : undefined;

      const rateContext = await this.getExchangeRateContext();
      const emissionDate = formatDateInTimezone(new Date());

      await this.mailerService.sendMail({
        to: payment.user.email,
        subject: `¡Pago Aprobado! 🎉 - Orden #${orderId}`,
        html: getPaymentApprovedTemplate(
          customerName,
          orderId,
          payment.store.name,
          parseFloat(payment.amount.toString()),
          nextInstallmentInfo,
          remainingBalance,
          rateContext,
          emissionDate,
        ),
      });
      this.logger.log(
        `Payment approved email sent to ${payment.user.email} for order ${payment.order.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send approved email to ${payment.user.email}: ${error.message}`,
      );
    }
  }

  async sendPaymentRejected(payment: Payment) {
    try {
      const orderId = payment.order.id.split('-')[0].toUpperCase();
      const customerName = `${payment.user.firstName}${payment.user.lastName ? ' ' + payment.user.lastName : ''}`;
      const rateContext = await this.getExchangeRateContext();
      const emissionDate = formatDateInTimezone(new Date());

      await this.mailerService.sendMail({
        to: payment.user.email,
        subject: `Pago Rechazado ⚠️ - Orden #${orderId}`,
        html: getPaymentRejectedTemplate(
          customerName,
          orderId,
          payment.store.name,
          parseFloat(payment.amount.toString()),
          payment.rejectionReason || undefined,
          rateContext,
          emissionDate,
        ),
      });
      this.logger.log(
        `Payment rejected email sent to ${payment.user.email} for order ${payment.order.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send rejected email to ${payment.user.email}: ${error.message}`,
      );
    }
  }

  async sendOrderAutoCancelled(
    email: string,
    customerName: string,
    storeName: string,
    orderId: string,
  ) {
    try {
      const shortOrderId = orderId.split('-')[0].toUpperCase();
      await this.mailerService.sendMail({
        to: email,
        subject: `Orden Cancelada por Inactividad ⌛ - #${shortOrderId}`,
        html: getOrderAutoCancelledTemplate(
          customerName,
          shortOrderId,
          storeName,
        ),
      });
      this.logger.log(
        `Auto-cancelled email sent to ${email} for order ${orderId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send auto-cancellation email to ${email}: ${error.message}`,
      );
    }
  }

  async sendNextInstallmentScheduled(
    email: string,
    customerName: string,
    storeName: string,
    orderId: string,
    installmentNumber: number,
    amount: number,
    dueDate: Date,
  ) {
    try {
      const shortOrderId = orderId.split('-')[0].toUpperCase();
      const rateContext = await this.getExchangeRateContext();
      const emissionDate = formatDateInTimezone(new Date());
      const amountDual = formatDualPrice(amount, rateContext);
      const issuanceNoticeHtml = renderIssuanceDateNotice(
        emissionDate,
        rateContext,
      );
      const footerNoteHtml = renderExchangeRateFooterNote(
        emissionDate,
        rateContext,
      );

      await this.mailerService.sendMail({
        to: email,
        subject: `Próxima Cuota Programada - Orden #${shortOrderId}`,
        html: `
          <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 550px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF;">
            ${issuanceNoticeHtml}
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="background-color: #EFF6FF; color: #1D4ED8; padding: 8px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600;">PRÓXIMA CUOTA PROGRAMADA</span>
            </div>
            <h2 style="color: #1E293B; font-size: 20px; font-weight: 700; text-align: center;">Hola, ${customerName}</h2>
            <p style="color: #475569; font-size: 16px; line-height: 1.6; text-align: center;">Se ha confirmado tu pago en <strong>${storeName}</strong>.</p>
            <p style="color: #475569; font-size: 16px; line-height: 1.6; text-align: center;">Tu <strong>Cuota #${installmentNumber}</strong> por un monto de <strong>${amountDual.combined}</strong> ha sido programada con fecha de vencimiento: <strong>${formatDateInTimezone(dueDate)}</strong>.</p>
            <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 24px 0 20px 0;">
            <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">Tu Lojita - Tu tienda de confianza</p>
            ${footerNoteHtml}
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send installment scheduled email to ${email}: ${error.message}`,
      );
    }
  }

  async sendFinancialOtpEmail(
    email: string,
    adminName: string,
    otpCode: string,
  ) {
    try {
      const subject = `Tu código de verificación de Tu Lojita: ${otpCode}`;
      const text = `Hola ${adminName},\n\nTu código de verificación para autorizar tu acción en Tu Lojita es: ${otpCode}\n\nEste código es válido por 10 minutos.\nSi no realizaste esta solicitud, puedes ignorar este mensaje con seguridad.\n\nTu Lojita`;
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
          <div style="margin-bottom: 24px;">
            <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0;">Tu Lojita</h1>
            <p style="font-size: 14px; color: #64748b; margin: 0;">Código de verificación</p>
          </div>
          <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 16px 0;">Hola <strong>${adminName}</strong>,</p>
          <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 24px 0;">Usa el siguiente código de 6 dígitos para autorizar tu acción en el panel de Tu Lojita:</p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #4338ca; font-family: monospace;">${otpCode}</span>
          </div>
          <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 24px 0;">Este código vence en 10 minutos. Si no realizaste esta solicitud, puedes ignorar este correo con total tranquilidad.</p>
          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
          <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">Tu Lojita © 2026</p>
        </div>
      `;

      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html,
      });
      this.logger.log(`Financial OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send financial OTP email to ${email}: ${error.message}`,
      );
    }
  }

  async sendCompanyDeleteOtpEmail(
    email: string,
    adminName: string,
    companyName: string,
    otpCode: string,
  ) {
    try {
      const subject = `⚠️ Código de seguridad para eliminar empresa "${companyName}" - Tu Lojita`;
      const text = `Hola ${adminName},\n\nHas solicitado eliminar definitivamente la empresa "${companyName}" en Tu Lojita.\n\nTu código de verificación de 6 dígitos es: ${otpCode}\n\nEste código vence en 10 minutos. Esta acción es irreversible.\nSi tú no iniciaste esta acción, cancela de inmediato y revisa la seguridad de tu cuenta.\n\nTu Lojita Admin`;
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #fee2e2; border-radius: 16px;">
          <div style="margin-bottom: 20px;">
            <div style="display: inline-block; background-color: #fef2f2; color: #dc2626; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 4px 10px; border-radius: 6px; border: 1px solid #fecaca; margin-bottom: 12px;">
              Acción de Alta Seguridad
            </div>
            <h1 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">Autorización de Eliminación</h1>
            <p style="font-size: 14px; color: #64748b; margin: 0;">Empresa: <strong>${companyName}</strong></p>
          </div>
          <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 16px 0;">Hola <strong>${adminName}</strong>,</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px 0;">
            Has solicitado eliminar de forma permanente la empresa <strong>"${companyName}"</strong> junto con sus tiendas y membresías asociadas. Para confirmar esta acción destructiva, ingresa el siguiente código de seguridad en el panel administrativo:
          </p>
          <div style="background-color: #fef2f2; border: 2px dashed #fca5a5; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 20px;">
            <span style="font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #b91c1c; font-family: monospace;">${otpCode}</span>
          </div>
          <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 20px 0;">
            ⏱️ Este código vence en <strong>10 minutos</strong>. Si tú no realizaste esta solicitud, ignora este mensaje y cambia tu contraseña de inmediato.
          </p>
          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
          <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">Tu Lojita Master Admin © 2026</p>
        </div>
      `;

      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html,
      });
      this.logger.log(
        `Company delete OTP email sent to ${email} for company ${companyName}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send company delete OTP email to ${email}: ${error.message}`,
      );
    }
  }

  async sendBranchLifecycleOtpEmail(
    email: string,
    adminName: string,
    branchName: string,
    actionType: 'DEACTIVATE' | 'SCHEDULE_DELETION',
    otpCode: string,
  ) {
    try {
      const isDeletion = actionType === 'SCHEDULE_DELETION';
      const actionLabel = isDeletion
        ? 'Programar Eliminación'
        : 'Desactivar Sucursal';
      const subject = isDeletion
        ? `⚠️ Código de seguridad para eliminar sucursal "${branchName}" - Tu Lojita`
        : `🔒 Código de seguridad para pausar sucursal "${branchName}" - Tu Lojita`;

      const text = `Hola ${adminName},\n\nHas solicitado ${actionLabel.toLowerCase()} para la sucursal "${branchName}" en Tu Lojita.\n\nTu código de verificación de 6 dígitos es: ${otpCode}\n\nEste código vence en 10 minutos.${
        isDeletion
          ? '\nAl confirmar, la sucursal se desactivará y tendrá un período de gracia de 7 días antes de la baja definitiva.'
          : ''
      }\nSi tú no iniciaste esta acción, revisa la seguridad de tu cuenta de inmediato.\n\nTu Lojita © 2026`;

      const headerBg = isDeletion ? '#fef2f2' : '#fefce8';
      const headerBorder = isDeletion ? '#fecaca' : '#fef08a';
      const headerText = isDeletion ? '#dc2626' : '#ca8a04';
      const boxBg = isDeletion ? '#fef2f2' : '#fefce8';
      const boxBorder = isDeletion ? '#fca5a5' : '#fde047';
      const codeColor = isDeletion ? '#b91c1c' : '#a16207';

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #fee2e2; border-radius: 16px;">
          <div style="margin-bottom: 20px;">
            <div style="display: inline-block; background-color: ${headerBg}; color: ${headerText}; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 4px 10px; border-radius: 6px; border: 1px solid ${headerBorder}; margin-bottom: 12px;">
              Seguridad Administrativa
            </div>
            <h1 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 6px 0;">Autorización: ${actionLabel}</h1>
            <p style="font-size: 14px; color: #64748b; margin: 0;">Sucursal: <strong>${branchName}</strong></p>
          </div>
          <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 0 0 16px 0;">Hola <strong>${adminName}</strong>,</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px 0;">
            Has solicitado <strong>${actionLabel.toLowerCase()}</strong> de la sucursal <strong>"${branchName}"</strong>. Para confirmar esta operación, ingresa el siguiente código de seguridad en la app:
          </p>
          <div style="background-color: ${boxBg}; border: 2px dashed ${boxBorder}; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 20px;">
            <span style="font-size: 34px; font-weight: 900; letter-spacing: 8px; color: ${codeColor}; font-family: monospace;">${otpCode}</span>
          </div>
          <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 20px 0;">
            ⏱️ Este código vence en <strong>10 minutos</strong>. Si tú no realizaste esta solicitud, ignora este mensaje y cambia tu contraseña de inmediato.
          </p>
          ${
            isDeletion
              ? `<div style="background-color: #f8fafc; border-left: 4px solid #ef4444; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px;">
                  <p style="font-size: 13px; color: #475569; margin: 0; line-height: 1.5;">
                    ℹ️ <strong>Período de Gracia:</strong> Una vez confirmada la eliminación, la sucursal se pausará de inmediato y tendrás <strong>7 días continuos</strong> para cancelar la eliminación si cambias de opinión.
                  </p>
                </div>`
              : ''
          }
          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
          <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">Tu Lojita © 2026 - Control Empresarial</p>
        </div>
      `;

      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html,
      });
      this.logger.log(
        `Branch lifecycle OTP email sent to ${email} for branch ${branchName} (${actionType})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send branch lifecycle OTP email to ${email}: ${error.message}`,
      );
    }
  }

  async sendSubscriptionReceiptReceived(email: string, userName: string) {
    try {
      const subject = `Comprobante de Suscripción Recibido - Tu Lojita Empresa`;
      const text = `Hola ${userName},\n\nHemos recibido tu comprobante de pago de la suscripción mensual. Nuestro equipo administrativo verificará los datos en un lapso estimado de 24 a 72 horas hábiles.\n\nUna vez validado, tu cuenta se activará de inmediato.\n\nTu Lojita © 2026 - Plataforma de Comercio`;
      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <h2 style="color: #1e293b; margin-bottom: 8px;">Comprobante en Proceso de Verificación</h2>
            <p style="color: #64748b; font-size: 15px;">Hola <strong>${userName}</strong>,</p>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hemos recibido tu comprobante de pago de la suscripción mensual. Nuestro equipo administrativo verificará los datos en un lapso estimado de <strong>24 a 72 horas hábiles</strong>.</p>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Una vez validado, tu cuenta se activará de inmediato para que puedas gestionar tus tiendas y productos sin interrupciones.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Plataforma de Comercio</p>
          </div>
        `,
      });
      this.logger.log(`Subscription receipt email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send subscription receipt email to ${email}: ${error.message}`,
      );
    }
  }

  async sendSubscriptionActivated(
    email: string,
    userName: string,
    periodEnd: Date,
  ) {
    try {
      const subject = `Suscripción Activada - Tu Lojita Empresa`;
      const text = `Hola ${userName},\n\n¡Tu suscripción ha sido aprobada!\nTu suscripción mensual de Tu Lojita Empresa ha sido confirmada y se encuentra activa hasta el: ${formatDateInTimezone(periodEnd)}.\n\nYa tienes acceso completo al panel de negocios, gestión de catálogos y órdenes.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <h2 style="color: #10b981; margin-bottom: 8px;">¡Tu Suscripción ha sido Aprobada!</h2>
            <p style="color: #64748b; font-size: 15px;">Hola <strong>${userName}</strong>,</p>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Tu suscripción mensual de <strong>Tu Lojita Empresa</strong> ha sido confirmada y se encuentra activa.</p>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Tu período de servicio cubre hasta el: <strong>${formatDateInTimezone(periodEnd)}</strong>.</p>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Ya tienes acceso completo al panel de negocios, gestión de catálogos y órdenes.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Plataforma de Comercio</p>
          </div>
        `,
      });
      this.logger.log(`Subscription activated email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send subscription activation email to ${email}: ${error.message}`,
      );
    }
  }

  async sendSubscriptionRejected(
    email: string,
    userName: string,
    reason: string,
  ) {
    try {
      const subject = `Actualización sobre tu Registro de Empresa - Tu Lojita`;
      const text = `Hola ${userName},\n\nTu solicitud de registro de empresa no pudo ser validada.\nMotivo: ${reason || 'El comprobante o los datos suministrados no concuerdan con los registros bancarios'}.\n\nPuedes iniciar un nuevo registro si deseas corregir la información.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fee2e2; border-radius: 12px; background-color: #ffffff;">
            <h2 style="color: #ef4444; margin-bottom: 8px;">Solicitud de Registro no Aprobada</h2>
            <p style="color: #64748b; font-size: 15px;">Hola <strong>${userName}</strong>,</p>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Lamentamos informarte que tu solicitud de registro de empresa y comprobante de membresía inicial no pudieron ser validados por nuestro equipo administrativo.</p>
            <div style="margin: 20px 0; padding: 16px; background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 6px;">
              <p style="margin: 0; font-size: 14px; font-weight: bold; color: #991b1b;">Motivo del rechazo:</p>
              <p style="margin: 6px 0 0 0; font-size: 14px; color: #7f1d1d;">${reason || 'El comprobante o los datos suministrados no concuerdan con los registros bancarios.'}</p>
            </div>
            <p style="color: #334155; font-size: 14px; line-height: 1.5;">Los datos provisionales de tu solicitud han sido descartados para permitirte iniciar un nuevo registro si deseas corregir la información.</p>
            <p style="color: #334155; font-size: 14px; line-height: 1.5;">Si consideras que esto es un error o necesitas asistencia, puedes contactar al equipo de soporte de Tu Lojita.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Plataforma de Comercio</p>
          </div>
        `,
      });
      this.logger.log(`Subscription rejection email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send subscription rejection email to ${email}: ${error.message}`,
      );
    }
  }

  async sendWeeklyCommissionInvoice(
    email: string,
    storeName: string,
    amount: number,
    dueDate: Date,
    options?: {
      gracePeriodDays?: number;
      finePreviewAmount?: number;
      paymentMethodsSummary?: string[];
    },
  ) {
    try {
      const rateContext = await this.getExchangeRateContext();
      const dateFormatted = formatDateInTimezone(new Date());
      const amountDual = formatDualPrice(amount, rateContext);
      const graceDays = options?.gracePeriodDays ?? 3;
      const fineDual =
        options?.finePreviewAmount && options.finePreviewAmount > 0
          ? formatDualPrice(options.finePreviewAmount, rateContext)
          : null;
      const issuanceNoticeHtml = renderIssuanceDateNotice(
        dateFormatted,
        rateContext,
      );
      const footerNoteHtml = renderExchangeRateFooterNote(
        dateFormatted,
        rateContext,
      );
      const safeStoreName = this.escapeHtml(storeName);

      const subject = `Liquidación Semanal de Comisiones (${amountDual.combined}) - ${storeName}`;
      const fineText = fineDual
        ? `\nRecargo estimado por mora tras el vencimiento: ${fineDual.combined}.`
        : '';
      const text = `Estimado equipo de ${storeName},\n\nSe ha emitido el corte semanal de comisiones por un monto de ${amountDual.combined}.\nFecha límite de pago (${graceDays} ${graceDays === 1 ? 'día' : 'días'} de gracia): ${formatDateInTimezone(dueDate)}.${fineText}\n\nIngresa a Tu Lojita Empresa -> Deudas con la Plataforma para consultar las cuentas oficiales y reportar tu comprobante.\n\nTu Lojita Finanzas`;
      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            ${issuanceNoticeHtml}
            <h2 style="color: #1e293b; margin-bottom: 8px;">Corte Semanal de Comisiones por Ventas</h2>
            <p style="color: #64748b; font-size: 15px;">Estimado equipo de <strong>${safeStoreName}</strong>,</p>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Se ha emitido el corte de comisiones correspondiente a las ventas procesadas en tu tienda. El total liquidado es:</p>
            <div style="margin: 24px 0; text-align: center;">
              <span style="display: inline-block; font-size: 26px; font-weight: 800; color: #0284c7; background-color: #f0f9ff; padding: 12px 24px; border-radius: 8px; border: 1px dashed #38bdf8;">
                ${amountDual.combined}
              </span>
            </div>
            <p style="color: #334155; font-size: 14px;">Fecha límite de pago (${graceDays} ${graceDays === 1 ? 'día' : 'días'} de gracia): <strong>${formatDateInTimezone(dueDate)}</strong>.</p>
            ${
              fineDual
                ? `<p style="color: #b45309; font-size: 13px;">Si no se registra el pago antes del vencimiento, la tienda será suspendida temporalmente y se aplicará un recargo de mora de <strong>${fineDual.combined}</strong>.</p>`
                : ''
            }
            ${this.renderCommissionPaymentStepsHtml(options?.paymentMethodsSummary)}
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Finanzas & Plataforma</p>
            ${footerNoteHtml}
          </div>
        `,
      });
      this.logger.log(`Weekly invoice email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send weekly invoice email to ${email}: ${error.message}`,
      );
    }
  }

  async sendCommissionPreCutReminder(params: {
    email: string;
    storeName: string;
    accumulatedAmount: number;
    cutDateLabel?: string;
    gracePeriodDays?: number;
    paymentMethodsSummary?: string[];
  }) {
    try {
      const rateContext = await this.getExchangeRateContext();
      const dateFormatted = formatDateInTimezone(new Date());
      const amountDual = formatDualPrice(
        params.accumulatedAmount,
        rateContext,
      );
      const issuanceNoticeHtml = renderIssuanceDateNotice(
        dateFormatted,
        rateContext,
      );
      const footerNoteHtml = renderExchangeRateFooterNote(
        dateFormatted,
        rateContext,
      );
      const cutLabel = params.cutDateLabel || 'este lunes';
      const graceDays = params.gracePeriodDays ?? 3;
      const safeStoreName = this.escapeHtml(params.storeName);

      const subject = `Recordatorio Pre-Corte: Comisiones acumuladas (${amountDual.combined}) - ${params.storeName}`;
      const text = `Hola, equipo de ${params.storeName},\n\nTienes un saldo acumulado de comisiones por ${amountDual.combined}.\nEl corte semanal se generará ${cutLabel} (con ${graceDays} ${graceDays === 1 ? 'día' : 'días'} de gracia).\nPuedes revisar las cuentas oficiales y adelantar o planificar tu pago desde Tu Lojita Empresa -> Deudas con la Plataforma.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: params.email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #bae6fd; border-radius: 12px; background-color: #f8fafc;">
            ${issuanceNoticeHtml}
            <h2 style="color: #0369a1; margin-bottom: 8px;">Aviso Pre-Corte Semanal de Comisiones</h2>
            <p style="color: #334155; font-size: 15px;">Hola, equipo de <strong>${safeStoreName}</strong>,</p>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Te recordamos que tu tienda acumula comisiones por ventas realizadas esta semana. El próximo corte se emitirá <strong>${this.escapeHtml(cutLabel)}</strong>:</p>
            <div style="margin: 20px 0; text-align: center;">
              <span style="display: inline-block; font-size: 24px; font-weight: 800; color: #0369a1; background-color: #e0f2fe; padding: 12px 24px; border-radius: 8px; border: 1px solid #7dd3fc;">
                ${amountDual.combined}
              </span>
            </div>
            <p style="color: #475569; font-size: 14px; line-height: 1.5;">Tras el corte tendrás <strong>${graceDays} ${graceDays === 1 ? 'día' : 'días'} de gracia</strong> para reportar el comprobante sin interrupciones en tu catálogo.</p>
            ${this.renderCommissionPaymentStepsHtml(params.paymentMethodsSummary)}
            <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 24px 0;" />
            <p style="color: #64748b; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Cobranzas & Finanzas</p>
            ${footerNoteHtml}
          </div>
        `,
      });
      this.logger.log(`Pre-cut commission reminder email sent to ${params.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send pre-cut commission reminder email to ${params.email}: ${error.message}`,
      );
    }
  }

  async sendCommissionGraceReminder(
    email: string,
    storeName: string,
    amount: number,
    options?: {
      daysRemaining?: number;
      dueDate?: Date;
      finePreviewAmount?: number;
      paymentMethodsSummary?: string[];
    },
  ) {
    try {
      const rateContext = await this.getExchangeRateContext();
      const dateFormatted = formatDateInTimezone(new Date());
      const amountDual = formatDualPrice(amount, rateContext);
      const fineDual =
        options?.finePreviewAmount && options.finePreviewAmount > 0
          ? formatDualPrice(options.finePreviewAmount, rateContext)
          : null;
      const daysRemaining = options?.daysRemaining;
      const dueDateLabel = options?.dueDate
        ? formatDateInTimezone(options.dueDate)
        : null;
      const issuanceNoticeHtml = renderIssuanceDateNotice(
        dateFormatted,
        rateContext,
      );
      const footerNoteHtml = renderExchangeRateFooterNote(
        dateFormatted,
        rateContext,
      );
      const safeStoreName = this.escapeHtml(storeName);

      let headline = 'Período de Gracia por Vencer Hoy';
      let subject = `Recordatorio: Hoy vence el plazo de pago de comisiones - ${storeName}`;
      let leadText = `Te recordamos que hoy a las <strong>11:59 PM</strong> finaliza el período de gracia para liquidar las comisiones pendientes por un monto de <strong>${amountDual.combined}</strong>.`;

      if (typeof daysRemaining === 'number' && daysRemaining > 0) {
        const dayWord = daysRemaining === 1 ? 'día' : 'días';
        headline =
          daysRemaining === 1
            ? 'Último día antes del vencimiento mañana'
            : `Faltan ${daysRemaining} ${dayWord} del período de gracia`;
        subject = `Recordatorio (Queda${daysRemaining === 1 ? '' : 'n'} ${daysRemaining} ${dayWord}): Comisiones pendientes (${amountDual.combined}) - ${storeName}`;
        leadText = `Tienes un saldo de comisiones pendiente por <strong>${amountDual.combined}</strong>. ${
          daysRemaining === 1
            ? 'Te queda <strong>1 día</strong> antes de que venza tu período de gracia'
            : `Faltan <strong>${daysRemaining} días</strong> para el vencimiento del período de gracia`
        }${dueDateLabel ? ` (fecha límite: <strong>${this.escapeHtml(dueDateLabel)}</strong>)` : ''}.`;
      }

      const text = `Hola, equipo de ${storeName},\n\n${
        typeof daysRemaining === 'number' && daysRemaining > 0
          ? `Faltan ${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'} para que venza tu período de gracia de comisiones por ${amountDual.combined}${dueDateLabel ? ` (fecha límite: ${dueDateLabel})` : ''}.`
          : `Hoy finaliza el período de gracia para liquidar las comisiones pendientes por ${amountDual.combined}.`
      }${
        fineDual
          ? `\nSi no reportas tu pago a tiempo se aplicará una multa por mora de ${fineDual.combined} y tu tienda será suspendida.`
          : ''
      }\nReporta tu pago a tiempo desde Tu Lojita Empresa -> Deudas con la Plataforma.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fed7aa; border-radius: 12px; background-color: #fffbeb;">
            ${issuanceNoticeHtml}
            <h2 style="color: #c2410c; margin-bottom: 8px;">${this.escapeHtml(headline)}</h2>
            <p style="color: #78350f; font-size: 15px;">Hola, equipo de <strong>${safeStoreName}</strong>,</p>
            <p style="color: #92400e; font-size: 15px; line-height: 1.5;">${leadText}</p>
            <div style="margin: 18px 0; text-align: center;">
              <span style="display: inline-block; font-size: 22px; font-weight: 800; color: #9a3412; background-color: #ffedd5; padding: 10px 20px; border-radius: 8px; border: 1px solid #fdba74;">
                ${amountDual.combined}
              </span>
            </div>
            ${
              fineDual
                ? `<p style="color: #9a3412; font-size: 13px; line-height: 1.5;">Recargo automático por mora al vencer el plazo: <strong>${fineDual.combined}</strong> (además de suspensión temporal del catálogo).</p>`
                : ''
            }
            <p style="color: #92400e; font-size: 14px; line-height: 1.5;">Evita la suspensión automática de tu tienda reportando tu comprobante desde <strong>Tu Lojita Empresa</strong>.</p>
            ${this.renderCommissionPaymentStepsHtml(options?.paymentMethodsSummary)}
            <hr style="border: none; border-top: 1px solid #fed7aa; margin: 24px 0;" />
            <p style="color: #b45309; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Cobranzas</p>
            ${footerNoteHtml}
          </div>
        `,
      });
      this.logger.log(`Grace reminder email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send grace reminder email to ${email}: ${error.message}`,
      );
    }
  }

  async sendStoreSuspendedForCommissions(
    email: string,
    storeName: string,
    totalDue: number,
    fineAmount: number,
    options?: {
      baseCommission?: number;
      isDailyReminder?: boolean;
      paymentMethodsSummary?: string[];
    },
  ) {
    try {
      const rateContext = await this.getExchangeRateContext();
      const dateFormatted = formatDateInTimezone(new Date());
      const fineDual = formatDualPrice(fineAmount, rateContext);
      const totalDual = formatDualPrice(totalDue, rateContext);
      const baseCommission =
        typeof options?.baseCommission === 'number'
          ? options.baseCommission
          : Math.max(0, totalDue - fineAmount);
      const baseDual = formatDualPrice(baseCommission, rateContext);
      const issuanceNoticeHtml = renderIssuanceDateNotice(
        dateFormatted,
        rateContext,
      );
      const footerNoteHtml = renderExchangeRateFooterNote(
        dateFormatted,
        rateContext,
      );
      const safeStoreName = this.escapeHtml(storeName);

      const isDaily = options?.isDailyReminder === true;
      const subject = isDaily
        ? `Recordatorio de Tienda Suspendida (${totalDual.combined}) - Cómo reactivar ${storeName}`
        : `Tienda Suspendida por Deuda de Comisiones (${totalDual.combined}) - ${storeName}`;
      const text = `Estimado equipo de ${storeName},\n\n${
        isDaily
          ? 'Tu tienda continúa suspendida temporalmente por saldo pendiente de comisiones de plataforma.'
          : 'El período de gracia para el pago de comisiones ha concluido sin confirmación de pago. Tu tienda ha sido suspendida temporalmente y tus productos están ocultos para los clientes.'
      }\n\nDesglose de deuda:\n- Comisiones base: ${baseDual.combined}\n- Recargo / multa por mora: ${fineDual.combined}\n- Total a pagar para reactivar: ${totalDual.combined}\n\nCómo reactivar tu tienda:\n1. Ingresa a Tu Lojita Empresa -> Mi Tienda -> Deudas con la Plataforma.\n2. Copia los datos de una cuenta oficial, realiza el pago por el total y adjunta tu comprobante.\n3. En cuanto el administrador apruebe el pago total, tu tienda y productos se reactivarán automáticamente.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fecaca; border-radius: 12px; background-color: #fef2f2;">
            ${issuanceNoticeHtml}
            <h2 style="color: #dc2626; margin-bottom: 8px;">${
              isDaily
                ? 'Tu Tienda Sigue Suspendida por Mora — Cómo Reactivarla'
                : 'Suspensión Temporal por Deuda de Comisiones'
            }</h2>
            <p style="color: #991b1b; font-size: 15px;">Estimado equipo de <strong>${safeStoreName}</strong>,</p>
            <p style="color: #991b1b; font-size: 15px; line-height: 1.5;">${
              isDaily
                ? 'Tu tienda permanece <strong>suspendida y oculta al público</strong> debido a facturas de comisiones vencidas pendientes de pago.'
                : 'El período de gracia para el pago de comisiones ha concluido sin confirmación de pago. Tu tienda ha sido <strong>suspendida temporalmente</strong> y tus productos ya no son visibles para los clientes.'
            }</p>
            <div style="margin: 18px 0; padding: 14px 16px; border-radius: 10px; background-color: #ffffff; border: 1px solid #fca5a5;">
              <p style="margin: 0 0 6px 0; font-size: 13px; color: #7f1d1d;">Comisiones pendientes: <strong>${baseDual.combined}</strong></p>
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #7f1d1d;">Recargo / multa por mora: <strong>${fineDual.combined}</strong></p>
              <p style="margin: 0; font-size: 17px; font-weight: 800; color: #b91c1c;">Total a pagar para reactivar: ${totalDual.combined}</p>
            </div>
            ${this.renderCommissionPaymentStepsHtml(options?.paymentMethodsSummary)}
            <hr style="border: none; border-top: 1px solid #fecaca; margin: 24px 0;" />
            <p style="color: #b91c1c; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Departamento de Riesgo y Cobranzas</p>
            ${footerNoteHtml}
          </div>
        `,
      });
      this.logger.log(`Suspension email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send suspension email to ${email}: ${error.message}`,
      );
    }
  }

  async sendCommissionPaymentApprovedNotice(params: {
    email: string;
    storeName: string;
    paidAmountUsd: number;
    remainingDebtUsd: number;
    reactivated: boolean;
  }) {
    try {
      const rateContext = await this.getExchangeRateContext();
      const dateFormatted = formatDateInTimezone(new Date());
      const paidDual = formatDualPrice(params.paidAmountUsd, rateContext);
      const remainingDual = formatDualPrice(
        params.remainingDebtUsd,
        rateContext,
      );
      const issuanceNoticeHtml = renderIssuanceDateNotice(
        dateFormatted,
        rateContext,
      );
      const footerNoteHtml = renderExchangeRateFooterNote(
        dateFormatted,
        rateContext,
      );
      const safeStoreName = this.escapeHtml(params.storeName);

      const subject = params.reactivated
        ? `Pago Aprobado y Tienda Reactivada - ${params.storeName}`
        : `Abono de Comisión Aprobado (${paidDual.combined}) - ${params.storeName}`;
      const text = `Hola, equipo de ${params.storeName},\n\nHemos aprobado tu reporte de pago por ${paidDual.combined}.\nSaldo pendiente actual: ${remainingDual.combined}.\n${
        params.reactivated
          ? 'Tu tienda y todos tus productos han sido reactivados automáticamente y vuelven a ser visibles para los compradores.'
          : 'Tu abono fue acreditado correctamente.'
      }\n\nTu Lojita © 2026`;

      await this.mailerService.sendMail({
        to: params.email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #bbf7d0; border-radius: 12px; background-color: #f0fdf4;">
            ${issuanceNoticeHtml}
            <h2 style="color: #15803d; margin-bottom: 8px;">${
              params.reactivated
                ? 'Pago Aprobado — ¡Tu Tienda Está Activa!'
                : 'Pago de Comisión Aprobado'
            }</h2>
            <p style="color: #166534; font-size: 15px;">Hola, equipo de <strong>${safeStoreName}</strong>,</p>
            <p style="color: #166534; font-size: 15px; line-height: 1.5;">Tu comprobante de pago por <strong>${paidDual.combined}</strong> ha sido verificado y aprobado.</p>
            <div style="margin: 16px 0; padding: 14px 16px; border-radius: 10px; background-color: #ffffff; border: 1px solid #86efac;">
              <p style="margin: 0 0 6px 0; font-size: 14px; color: #166534;">Monto acreditado: <strong>${paidDual.combined}</strong></p>
              <p style="margin: 0; font-size: 14px; color: #166534;">Deuda pendiente restante: <strong>${remainingDual.combined}</strong></p>
            </div>
            <p style="color: #15803d; font-size: 14px; font-weight: 600;">${
              params.reactivated
                ? 'Tu tienda y tu catálogo público se han reactivado automáticamente.'
                : params.remainingDebtUsd <= 0
                  ? 'Tu tienda se encuentra completamente al día con la plataforma.'
                  : 'Cuando liquides el saldo restante, tu cuenta quedará al día automáticamente.'
            }</p>
            <hr style="border: none; border-top: 1px solid #bbf7d0; margin: 24px 0;" />
            <p style="color: #16a34a; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Finanzas & Plataforma</p>
            ${footerNoteHtml}
          </div>
        `,
      });
      this.logger.log(`Commission payment approved email sent to ${params.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send commission payment approved email to ${params.email}: ${error.message}`,
      );
    }
  }

  async sendCommissionPaymentRejectedNotice(params: {
    email: string;
    storeName: string;
    reportedAmountUsd: number;
    remainingDebtUsd: number;
    rejectionReason: string;
    isSuspended?: boolean;
  }) {
    try {
      const rateContext = await this.getExchangeRateContext();
      const dateFormatted = formatDateInTimezone(new Date());
      const reportedDual = formatDualPrice(
        params.reportedAmountUsd,
        rateContext,
      );
      const remainingDual = formatDualPrice(
        params.remainingDebtUsd,
        rateContext,
      );
      const issuanceNoticeHtml = renderIssuanceDateNotice(
        dateFormatted,
        rateContext,
      );
      const footerNoteHtml = renderExchangeRateFooterNote(
        dateFormatted,
        rateContext,
      );
      const safeStoreName = this.escapeHtml(params.storeName);
      const safeReason = this.escapeHtml(
        params.rejectionReason || 'No se pudo validar el comprobante.',
      );

      const subject = `Comprobante de Comisión Rechazado - ${params.storeName}`;
      const text = `Hola, equipo de ${params.storeName},\n\nTu reporte de pago de comisiones por ${reportedDual.combined} fue rechazado.\nMotivo del rechazo: ${params.rejectionReason}\nDeuda actual pendiente: ${remainingDual.combined}.\n\nIngresa a Tu Lojita Empresa -> Deudas con la Plataforma para corregir y reenviar un nuevo comprobante.\n\nTu Lojita © 2026`;

      await this.mailerService.sendMail({
        to: params.email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fecaca; border-radius: 12px; background-color: #fef2f2;">
            ${issuanceNoticeHtml}
            <h2 style="color: #b91c1c; margin-bottom: 8px;">Reporte de Pago de Comisiones Rechazado</h2>
            <p style="color: #7f1d1d; font-size: 15px;">Hola, equipo de <strong>${safeStoreName}</strong>,</p>
            <p style="color: #7f1d1d; font-size: 15px; line-height: 1.5;">El comprobante reportado por <strong>${reportedDual.combined}</strong> no pudo ser aprobado por el equipo administrativo.</p>
            <div style="margin: 16px 0; padding: 14px 16px; border-radius: 10px; background-color: #ffffff; border: 1px solid #fca5a5;">
              <p style="margin: 0 0 6px 0; font-size: 13px; color: #991b1b;">Motivo informado:</p>
              <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #7f1d1d;">${safeReason}</p>
              <p style="margin: 0; font-size: 13px; color: #991b1b;">Saldo actual por regularizar: <strong>${remainingDual.combined}</strong></p>
            </div>
            <p style="color: #991b1b; font-size: 14px; line-height: 1.5;">${
              params.isSuspended
                ? 'Tu tienda permanece suspendida temporalmente hasta confirmar el pago válido.'
                : 'Por favor envía un comprobante corregido desde Tu Lojita Empresa antes de que venza el plazo.'
            }</p>
            ${this.renderCommissionPaymentStepsHtml()}
            <hr style="border: none; border-top: 1px solid #fecaca; margin: 24px 0;" />
            <p style="color: #b91c1c; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Cobranzas & Verificación</p>
            ${footerNoteHtml}
          </div>
        `,
      });
      this.logger.log(`Commission payment rejected email sent to ${params.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send commission payment rejected email to ${params.email}: ${error.message}`,
      );
    }
  }

  async sendSubscriptionGracePeriodNotice(
    email: string,
    userName: string,
    gracePeriodEnd: Date,
  ) {
    try {
      const subject = `Período de Gracia de Suscripción - Tu Lojita Empresa`;
      const text = `Hola ${userName},\n\nTu período de suscripción a Tu Lojita Empresa ha vencido. Te encuentras en tu período de gracia de 3 días que vence el: ${formatDateInTimezone(gracePeriodEnd)}.\nRenueva tu suscripción a tiempo para mantener tus tiendas activas.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fed7aa; border-radius: 12px; background-color: #fffbeb;">
            <h2 style="color: #c2410c; margin-bottom: 8px;">Período Mensual Vencido</h2>
            <p style="color: #78350f; font-size: 15px;">Hola <strong>${userName}</strong>,</p>
            <p style="color: #92400e; font-size: 15px; line-height: 1.5;">Tu período de suscripción a Tu Lojita Empresa ha vencido. Te encuentras en tu período de gracia de 3 días que vence el: <strong>${formatDateInTimezone(gracePeriodEnd)}</strong>.</p>
            <p style="color: #92400e; font-size: 14px;">Renueva tu suscripción a tiempo para mantener tus tiendas activas.</p>
            <hr style="border: none; border-top: 1px solid #fed7aa; margin: 24px 0;" />
            <p style="color: #b45309; font-size: 12px; text-align: center;">Tu Lojita © 2026</p>
          </div>
        `,
      });
      this.logger.log(`Subscription grace email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send subscription grace email to ${email}: ${error.message}`,
      );
    }
  }

  async sendSubscriptionSuspendedNotice(
    email: string,
    userName: string,
    lateFee: number,
  ) {
    try {
      const rateContext = await this.getExchangeRateContext();
      const dateFormatted = formatDateInTimezone(new Date());
      const lateFeeDual = formatDualPrice(lateFee, rateContext);
      const issuanceNoticeHtml = renderIssuanceDateNotice(
        dateFormatted,
        rateContext,
      );
      const footerNoteHtml = renderExchangeRateFooterNote(
        dateFormatted,
        rateContext,
      );

      const subject = `Aviso sobre el estado de tu suscripción - Tu Lojita Empresa`;
      const text = `Hola ${userName},\n\nEl período de gracia de tu suscripción ha expirado. Tus tiendas han sido suspendidas del catálogo público y se ha aplicado un recargo de mora de ${lateFeeDual.combined}.\nIngresa a Tu Lojita Empresa para regularizar tu pago.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fecaca; border-radius: 12px; background-color: #fef2f2;">
            ${issuanceNoticeHtml}
            <h2 style="color: #dc2626; margin-bottom: 8px;">Acceso Suspendido</h2>
            <p style="color: #991b1b; font-size: 15px;">Hola <strong>${userName}</strong>,</p>
            <p style="color: #991b1b; font-size: 15px; line-height: 1.5;">El período de gracia de tu suscripción ha expirado. Tus tiendas han sido suspendidas del catálogo público y se ha aplicado un recargo de mora de <strong>${lateFeeDual.combined}</strong>.</p>
            <p style="color: #991b1b; font-size: 14px;">Ingresa a Tu Lojita Empresa para regularizar tu pago y restablecer tu operación.</p>
            <hr style="border: none; border-top: 1px solid #fecaca; margin: 24px 0;" />
            <p style="color: #b91c1c; font-size: 12px; text-align: center;">Tu Lojita © 2026</p>
            ${footerNoteHtml}
          </div>
        `,
      });
      this.logger.log(`Subscription suspended notice email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send subscription suspension email to ${email}: ${error.message}`,
      );
    }
  }

  async sendDisputeOpenedToStore(params: {
    toEmail: string;
    storeOwnerName: string;
    storeName: string;
    orderId: string;
    customerName: string;
    disputeType: string;
    description: string;
    totalAmount: number;
  }) {
    try {
      const orderShort =
        params.orderId.length > 8
          ? params.orderId.substring(0, 8).toUpperCase()
          : params.orderId.toUpperCase();
      const rateContext = await this.getExchangeRateContext();
      const dateFormatted = formatDateInTimezone(new Date());
      const totalDual = formatDualPrice(params.totalAmount, rateContext);
      const subject = `Nuevo Reclamo en Pedido #${orderShort} - Tu Lojita`;
      const text = `Hola ${params.storeOwnerName},\n\nSe ha registrado un nuevo reclamo para el pedido #${orderShort} en tu tienda ${params.storeName}.\nCliente: ${params.customerName}\nTipo: ${params.disputeType}\nDescripción: ${params.description}\nMonto: ${totalDual.combined}\n\nIngresa a Tu Lojita Empresa para responder.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: params.toEmail,
        subject,
        text,
        html: getStoreNewDisputeTemplate(
          params.storeOwnerName,
          params.storeName,
          orderShort,
          params.customerName,
          params.disputeType,
          params.description,
          params.totalAmount,
          dateFormatted,
          rateContext,
          dateFormatted,
        ),
      });
      this.logger.log(
        `Dispute opened email sent to store owner ${params.toEmail} for order ${params.orderId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send dispute opened email to store ${params.toEmail}: ${error.message}`,
      );
    }
  }

  async sendDisputeResponseToCustomer(params: {
    toEmail: string;
    customerName: string;
    storeName: string;
    orderId: string;
    merchantResponse: string;
    isAccepted: boolean;
  }) {
    try {
      const orderShort =
        params.orderId.length > 8
          ? params.orderId.substring(0, 8).toUpperCase()
          : params.orderId.toUpperCase();
      const dateFormatted = formatDateInTimezone(new Date());
      const subject = params.isAccepted
        ? `Reclamo Aceptado: Pedido #${orderShort} - Tu Lojita`
        : `Respuesta a tu Reclamo: Pedido #${orderShort} - Tu Lojita`;
      const text = `Hola ${params.customerName},\n\nLa tienda ${params.storeName} ha respondido a tu reclamo del pedido #${orderShort}.\nRespuesta: ${params.merchantResponse}\n\nTu Lojita © 2026`;

      await this.mailerService.sendMail({
        to: params.toEmail,
        subject,
        text,
        html: getCustomerDisputeResponseTemplate(
          params.customerName,
          params.storeName,
          orderShort,
          params.merchantResponse,
          params.isAccepted,
          dateFormatted,
        ),
      });
      this.logger.log(
        `Dispute response email sent to customer ${params.toEmail} for order ${params.orderId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send dispute response email to customer ${params.toEmail}: ${error.message}`,
      );
    }
  }

  async sendStoreStrikeNotice(params: {
    toEmail: string;
    storeName: string;
    strikeCount: number;
    reason: string;
    expiresAt?: string;
  }) {
    try {
      const subject = `Aviso de Moderación: Strike (${params.strikeCount}/3) - ${params.storeName}`;
      const text = `Equipo de ${params.storeName},\n\nSe ha emitido una sanción por moderación (Strike ${params.strikeCount}/3).\nMotivo: ${params.reason}\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: params.toEmail,
        subject,
        text,
        html: getStoreStrikeNoticeTemplate(
          params.storeName,
          params.strikeCount,
          params.reason,
          params.expiresAt,
        ),
      });
      this.logger.log(`Strike notice sent to store owner at ${params.toEmail}`);
    } catch (error) {
      this.logger.error(`Failed to send strike notice email: ${error.message}`);
    }
  }

  async sendStoreSuspensionNotice(params: {
    toEmail: string;
    storeName: string;
    reason: string;
  }) {
    try {
      const subject = `Aviso de Moderación: Suspensión de Comercio - ${params.storeName}`;
      const text = `Equipo de ${params.storeName},\n\nTu tienda ${params.storeName} ha sido suspendida temporalmente por motivos de moderación.\nMotivo: ${params.reason}\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: params.toEmail,
        subject,
        text,
        html: getStoreSuspensionTemplate(params.storeName, params.reason),
      });
      this.logger.log(
        `Suspension notice sent to store owner at ${params.toEmail}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send suspension notice email: ${error.message}`,
      );
    }
  }

  async sendItemHiddenNotice(params: {
    toEmail: string;
    storeName: string;
    itemName: string;
    reason: string;
  }) {
    try {
      const subject = `Publicación desactivada por moderación - ${params.itemName}`;
      const text = `Equipo de ${params.storeName},\n\nEl artículo "${params.itemName}" ha sido desactivado temporalmente por moderación.\nMotivo: ${params.reason}\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: params.toEmail,
        subject,
        text,
        html: getItemHiddenTemplate(
          params.storeName,
          params.itemName,
          params.reason,
        ),
      });
      this.logger.log(
        `Item hidden notice sent to store owner at ${params.toEmail}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send item hidden notice email: ${error.message}`,
      );
    }
  }

  async sendCustomerBlockedNotice(params: {
    toEmail: string;
    customerName: string;
    storeName: string;
    reason?: string;
  }) {
    try {
      const subject = `Información sobre compras en ${params.storeName} - Tu Lojita`;
      const text = `Hola ${params.customerName},\n\nLa tienda ${params.storeName} ha actualizado los permisos de compra en su comercio.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: params.toEmail,
        subject,
        text,
        html: getCustomerBlockedTemplate(
          params.customerName,
          params.storeName,
          params.reason,
        ),
      });
      this.logger.log(`Customer block notice sent to ${params.toEmail}`);
    } catch (error) {
      this.logger.error(
        `Failed to send customer block email: ${error.message}`,
      );
    }
  }

  async sendCustomerUnblockedNotice(params: {
    toEmail: string;
    customerName: string;
    storeName: string;
  }) {
    try {
      const subject = `Acceso restablecido en ${params.storeName} - Tu Lojita`;
      const text = `Hola ${params.customerName},\n\nSe ha restablecido tu acceso a compras en la tienda ${params.storeName}.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: params.toEmail,
        subject,
        text,
        html: getCustomerUnblockedTemplate(
          params.customerName,
          params.storeName,
        ),
      });
      this.logger.log(`Customer unblock notice sent to ${params.toEmail}`);
    } catch (error) {
      this.logger.error(
        `Failed to send customer unblock email: ${error.message}`,
      );
    }
  }

  async sendTestEmail(
    toEmail: string,
  ): Promise<{ success: boolean; message: string; response?: any }> {
    try {
      const subject = 'Correo de Prueba - Tu Lojita';
      const text = `Este es un correo de prueba enviado desde no-reply@tulojita.com a través de Resend SMTP.\nEstado: Verificado y Activo\nFecha/Hora: ${new Date().toISOString()}\n\nTu Lojita © 2026`;
      const response = await this.mailerService.sendMail({
        to: toEmail,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <h2 style="color: #4f46e5; margin-bottom: 8px;">¡Conexión Exitosa con Resend!</h2>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">
              Este es un correo de prueba enviado desde <strong>no-reply@tulojita.com</strong> a través de <strong>Resend SMTP</strong>.
            </p>
            <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; font-size: 14px; color: #475569;">
                <strong>Estado:</strong> Verificado y Activo<br>
                <strong>Remitente:</strong> no-reply@tulojita.com<br>
                <strong>Fecha/Hora:</strong> ${new Date().toISOString()}
              </p>
            </div>
            <p style="color: #64748b; font-size: 13px;">Tu Lojita © 2026 — Plataforma de Comercio Electrónico</p>
          </div>
        `,
      });
      this.logger.log(`Test email sent successfully to ${toEmail}`);
      return {
        success: true,
        message: `Correo de prueba enviado con éxito a ${toEmail}`,
        response,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send test email to ${toEmail}: ${error.message}`,
      );
      return { success: false, message: error.message };
    }
  }

  async sendDisputeVerdictNotice(params: {
    toEmail: string;
    recipientName: string;
    role: 'COMPRADOR' | 'COMERCIO';
    orderId: string;
    verdictTitle: string;
    verdictDescription: string;
    adminNotes: string;
    penaltyText?: string;
  }) {
    try {
      const orderShort =
        params.orderId.length > 8
          ? params.orderId.substring(0, 8).toUpperCase()
          : params.orderId.toUpperCase();
      const dateFormatted = formatDateInTimezone(new Date());
      const subject = `Dictamen Oficial de Disputa — Pedido #${orderShort} - Tu Lojita`;
      const text = `Estimado/a ${params.recipientName},\n\nSe ha emitido el dictamen arbitral para la orden #${orderShort}.\nVeredicto: ${params.verdictTitle}\nFundamentación: ${params.adminNotes}\n${params.penaltyText ? `Medidas: ${params.penaltyText}\n` : ''}\nTu Lojita © 2026`;

      await this.mailerService.sendMail({
        to: params.toEmail,
        subject,
        text,
        html: getDisputeVerdictNoticeTemplate(
          params.recipientName,
          params.role,
          orderShort,
          params.verdictTitle,
          params.verdictDescription,
          params.adminNotes,
          params.penaltyText || '',
          dateFormatted,
        ),
      });
      this.logger.log(
        `Dispute verdict notice email sent to ${params.role} (${params.toEmail}) for order ${params.orderId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send dispute verdict notice email to ${params.toEmail}: ${error.message}`,
      );
    }
  }

  async sendAccountSuspensionNotice(params: {
    toEmail: string;
    userName: string;
    suspensionType: 'TEMPORARY' | 'PERMANENT';
    reason: string;
    suspendedUntil?: Date | string | null;
  }) {
    try {
      const isPermanent = params.suspensionType === 'PERMANENT';
      const formattedDate =
        !isPermanent && params.suspendedUntil
          ? formatDateInTimezone(new Date(params.suspendedUntil))
          : undefined;

      const subject = isPermanent
        ? 'Aviso de Suspensión Permanente de Cuenta - Tu Lojita'
        : 'Aviso de Suspensión Temporal de Cuenta - Tu Lojita';

      await this.mailerService.sendMail({
        to: params.toEmail,
        subject,
        html: getAccountSuspensionTemplate(
          params.userName,
          params.suspensionType,
          params.reason,
          formattedDate,
        ),
      });

      this.logger.log(
        `Account suspension notice email sent to ${params.toEmail} (${params.suspensionType})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send account suspension notice email to ${params.toEmail}: ${error?.message || error}`,
      );
    }
  }
}

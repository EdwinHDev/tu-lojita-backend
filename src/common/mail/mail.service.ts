import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { Order } from 'src/order/entities/order.entity';
import { Payment } from 'src/payment/entities/payment.entity';
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

  constructor(private readonly mailerService: MailerService) {}

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
      await this.mailerService.sendMail({
        to: email,
        subject: 'Recordatorio de Pago Próximo - Tu Lojita',
        html: getPaymentReminderTemplate(
          customerName,
          amount,
          formatDateInTimezone(new Date(dueDate)),
          formattedOrderId,
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

      await this.mailerService.sendMail({
        to: order.user.email,
        subject: `Pago Bajo Revisión - Orden #${orderId}`,
        html: getSinglePaymentUnderReviewTemplate(
          customerName,
          orderId,
          order.store.name,
          items,
          amount,
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

      await this.mailerService.sendMail({
        to: payment.user.email,
        subject: `Pago Rechazado ⚠️ - Orden #${orderId}`,
        html: getPaymentRejectedTemplate(
          customerName,
          orderId,
          payment.store.name,
          parseFloat(payment.amount.toString()),
          payment.rejectionReason || undefined,
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
      await this.mailerService.sendMail({
        to: email,
        subject: `Próxima Cuota Programada - Orden #${shortOrderId}`,
        html: `<h2>Hola ${customerName},</h2><p>Se ha confirmado tu pago en <strong>${storeName}</strong>.</p><p>Tu <strong>Cuota #${installmentNumber}</strong> por un monto de <strong>$${amount.toFixed(2)}</strong> ha sido programada con fecha de vencimiento: <strong>${formatDateInTimezone(dueDate)}</strong>.</p>`,
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
  ) {
    try {
      const subject = `Liquidación Semanal de Comisiones ($${amount.toFixed(2)}) - ${storeName}`;
      const text = `Estimado equipo de ${storeName},\n\nSe ha emitido el corte de comisiones por un monto de $${amount.toFixed(2)} USD.\nFecha límite de pago: ${formatDateInTimezone(dueDate)}.\n\nPor favor ingresa a Tu Lojita Empresa para reportar tu comprobante.\n\nTu Lojita Finanzas`;
      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <h2 style="color: #1e293b; margin-bottom: 8px;">Corte Semanal de Comisiones por Ventas</h2>
            <p style="color: #64748b; font-size: 15px;">Estimado equipo de <strong>${storeName}</strong>,</p>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Se ha emitido el corte de comisiones correspondiente a las ventas procesadas en tu tienda. El total liquidado es:</p>
            <div style="margin: 24px 0; text-align: center;">
              <span style="display: inline-block; font-size: 32px; font-weight: 800; color: #0284c7; background-color: #f0f9ff; padding: 12px 24px; border-radius: 8px; border: 1px dashed #38bdf8;">
                $${amount.toFixed(2)} USD
              </span>
            </div>
            <p style="color: #334155; font-size: 14px;">Fecha límite de pago (con 3 días de gracia): <strong>${formatDateInTimezone(dueDate)}</strong>.</p>
            <p style="color: #64748b; font-size: 13px;">Por favor ingresa a la aplicación <strong>Tu Lojita Empresa</strong> en la sección de Deudas con la Plataforma para reportar tu comprobante antes del vencimiento del período de gracia.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Finanzas & Plataforma</p>
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

  async sendCommissionGraceReminder(
    email: string,
    storeName: string,
    amount: number,
  ) {
    try {
      const subject = `Recordatorio: Hoy vence el plazo de pago de comisiones - ${storeName}`;
      const text = `Hola, equipo de ${storeName},\n\nTe recordamos que hoy finaliza el período de gracia para liquidar las comisiones pendientes por $${amount.toFixed(2)} USD.\nReporta tu pago a tiempo desde Tu Lojita Empresa.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fed7aa; border-radius: 12px; background-color: #fffbeb;">
            <h2 style="color: #c2410c; margin-bottom: 8px;">Período de Gracia por Vencer Hoy</h2>
            <p style="color: #78350f; font-size: 15px;">Hola, equipo de <strong>${storeName}</strong>,</p>
            <p style="color: #92400e; font-size: 15px; line-height: 1.5;">Te recordamos que hoy miércoles a las <strong>11:59 PM</strong> finaliza el período de gracia para liquidar las comisiones pendientes por un monto de <strong>$${amount.toFixed(2)} USD</strong>.</p>
            <p style="color: #92400e; font-size: 14px; line-height: 1.5;">Evita la suspensión automática de tu tienda y la aplicación de multas reportando tu pago a tiempo desde Tu Lojita Empresa.</p>
            <hr style="border: none; border-top: 1px solid #fed7aa; margin: 24px 0;" />
            <p style="color: #b45309; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Cobranzas</p>
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
  ) {
    try {
      const subject = `Aviso Importante: Estado de tu tienda - ${storeName}`;
      const text = `Estimado equipo de ${storeName},\n\nEl período de gracia para el pago de comisiones ha concluido sin confirmación de pago. Tu tienda ha sido suspendida temporalmente.\nRecargo de mora: $${fineAmount.toFixed(2)} USD.\nDeuda total a regularizar: $${totalDue.toFixed(2)} USD.\n\nUna vez verificado el pago total, tu tienda será reactivada automáticamente.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fecaca; border-radius: 12px; background-color: #fef2f2;">
            <h2 style="color: #dc2626; margin-bottom: 8px;">Suspensión de Operaciones por Mora</h2>
            <p style="color: #991b1b; font-size: 15px;">Estimado equipo de <strong>${storeName}</strong>,</p>
            <p style="color: #991b1b; font-size: 15px; line-height: 1.5;">El período de gracia para el pago de comisiones ha concluido sin confirmación de pago. Tu tienda ha sido <strong>suspendida temporalmente</strong> y tus productos ya no serán visibles para los clientes.</p>
            <p style="color: #7f1d1d; font-size: 14px;">Se ha aplicado un recargo por mora/multa de: <strong>$${fineAmount.toFixed(2)} USD</strong>.</p>
            <p style="color: #7f1d1d; font-size: 16px; font-weight: 700;">Deuda total a regularizar: $${totalDue.toFixed(2)} USD.</p>
            <p style="color: #991b1b; font-size: 13px;">Una vez verificado el pago total, tu tienda será reactivada automáticamente.</p>
            <hr style="border: none; border-top: 1px solid #fecaca; margin: 24px 0;" />
            <p style="color: #b91c1c; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Departamento de Riesgo y Cobranzas</p>
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
      const subject = `Aviso sobre el estado de tu suscripción - Tu Lojita Empresa`;
      const text = `Hola ${userName},\n\nEl período de gracia de tu suscripción ha expirado. Tus tiendas han sido suspendidas del catálogo público y se ha aplicado un recargo de mora de $${lateFee.toFixed(2)} USD.\nIngresa a Tu Lojita Empresa para regularizar tu pago.\n\nTu Lojita © 2026`;
      await this.mailerService.sendMail({
        to: email,
        subject,
        text,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fecaca; border-radius: 12px; background-color: #fef2f2;">
            <h2 style="color: #dc2626; margin-bottom: 8px;">Acceso Suspendido</h2>
            <p style="color: #991b1b; font-size: 15px;">Hola <strong>${userName}</strong>,</p>
            <p style="color: #991b1b; font-size: 15px; line-height: 1.5;">El período de gracia de tu suscripción ha expirado. Tus tiendas han sido suspendidas del catálogo público y se ha aplicado un recargo de mora de <strong>$${lateFee.toFixed(2)} USD</strong>.</p>
            <p style="color: #991b1b; font-size: 14px;">Ingresa a Tu Lojita Empresa para regularizar tu pago y restablecer tu operación.</p>
            <hr style="border: none; border-top: 1px solid #fecaca; margin: 24px 0;" />
            <p style="color: #b91c1c; font-size: 12px; text-align: center;">Tu Lojita © 2026</p>
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
      const dateFormatted = formatDateInTimezone(new Date());
      const subject = `Nuevo Reclamo en Pedido #${orderShort} - Tu Lojita`;
      const text = `Hola ${params.storeOwnerName},\n\nSe ha registrado un nuevo reclamo para el pedido #${orderShort} en tu tienda ${params.storeName}.\nCliente: ${params.customerName}\nTipo: ${params.disputeType}\nDescripción: ${params.description}\nMonto: $${params.totalAmount}\n\nIngresa a Tu Lojita Empresa para responder.\n\nTu Lojita © 2026`;
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

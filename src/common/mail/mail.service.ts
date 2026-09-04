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

  async sendFinancialOtpEmail(email: string, adminName: string, otpCode: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `🔐 Código de Verificación Financiera: ${otpCode} - Tu Lojita Admin`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <h2 style="color: #1e293b; margin-bottom: 8px;">Verificación de Seguridad Financiera</h2>
            <p style="color: #64748b; font-size: 15px;">Hola <strong>${adminName}</strong>,</p>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Has solicitado acceder al módulo financiero (Comisiones / Suscripciones) de Tu Lojita. Utiliza el siguiente código para autorizar tu sesión:</p>
            <div style="margin: 28px 0; text-align: center;">
              <span style="display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #4f46e5; background-color: #f5f3ff; padding: 14px 28px; border-radius: 8px; border: 1px dashed #6366f1;">
                ${otpCode}
              </span>
            </div>
            <p style="color: #64748b; font-size: 13px; line-height: 1.4;">Este código expirará en <strong>10 minutos</strong>. Si tú no solicitaste este acceso, por favor ignora este mensaje y revisa la seguridad de tu cuenta de inmediato.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">Tu Lojita © 2026 - Centro de Control Administrativo</p>
          </div>
        `,
      });
      this.logger.log(`Financial OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send financial OTP email to ${email}: ${error.message}`);
    }
  }

  async sendSubscriptionReceiptReceived(email: string, userName: string) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `📄 Comprobante de Suscripción Recibido - Tu Lojita Empresa`,
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
      this.logger.error(`Failed to send subscription receipt email to ${email}: ${error.message}`);
    }
  }

  async sendSubscriptionActivated(email: string, userName: string, periodEnd: Date) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `🎉 ¡Suscripción Activada! - Tu Lojita Empresa`,
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
      this.logger.error(`Failed to send subscription activation email to ${email}: ${error.message}`);
    }
  }

  async sendWeeklyCommissionInvoice(email: string, storeName: string, amount: number, dueDate: Date) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `📊 Factura Semanal de Comisiones ($${amount.toFixed(2)}) - ${storeName}`,
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
      this.logger.error(`Failed to send weekly invoice email to ${email}: ${error.message}`);
    }
  }

  async sendCommissionGraceReminder(email: string, storeName: string, amount: number) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `⚠️ Recordatorio: Hoy vence el plazo de pago de comisiones - ${storeName}`,
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
      this.logger.error(`Failed to send grace reminder email to ${email}: ${error.message}`);
    }
  }

  async sendStoreSuspendedForCommissions(email: string, storeName: string, totalDue: number, fineAmount: number) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `🚨 Tienda Suspendida por Comisiones Vencidas - ${storeName}`,
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
      this.logger.error(`Failed to send suspension email to ${email}: ${error.message}`);
    }
  }

  async sendSubscriptionGracePeriodNotice(email: string, userName: string, gracePeriodEnd: Date) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `⚠️ Período de Gracia de Suscripción - Tu Lojita Empresa`,
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
      this.logger.error(`Failed to send subscription grace email to ${email}: ${error.message}`);
    }
  }

  async sendSubscriptionSuspendedNotice(email: string, userName: string, lateFee: number) {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: `🚨 Suscripción Suspendida por Falta de Pago - Tu Lojita Empresa`,
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
      this.logger.error(`Failed to send subscription suspension email to ${email}: ${error.message}`);
    }
  }

  async sendTestEmail(toEmail: string): Promise<{ success: boolean; message: string; response?: any }> {
    try {
      const response = await this.mailerService.sendMail({
        to: toEmail,
        subject: '🧪 Correo de Prueba - Resend Tu Lojita',
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
      return { success: true, message: `Correo de prueba enviado con éxito a ${toEmail}`, response };
    } catch (error) {
      this.logger.error(`Failed to send test email to ${toEmail}: ${error.message}`);
      return { success: false, message: error.message };
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { Order } from 'src/order/entities/order.entity';
import { Payment } from 'src/payment/entities/payment.entity';
import { getInstallmentPlanTemplate, getPaymentReminderTemplate, getSinglePaymentUnderReviewTemplate, getPaymentApprovedTemplate, getPaymentRejectedTemplate } from 'src/common/templates/email-templates';
import { formatDateInTimezone } from 'src/common/utils/timezone.utils';


@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendOrderConfirmation(order: Order) {
    try {
      const isPartial = order.isPartialPayment;
      const title = isPartial ? 'Tu Plan de Pagos - Tu Lojita' : 'Confirmación de Orden - Tu Lojita';
      const orderId = order.id.split('-')[0].toUpperCase();
      
      const installments = order.installments?.map(i => ({
        amount: parseFloat(i.amount.toString()),
        dueDate: formatDateInTimezone(new Date(i.dueDate)),
      })) || [];

      const customerName = `${order.user.firstName}${order.user.lastName ? ' ' + order.user.lastName : ''}`;

      const paidAmount = parseFloat(order.totalPaidAmount?.toString() || '0');
      const remainingBalance = parseFloat(order.remainingBalance?.toString() || order.balance.toString());
      const nextDate = order.nextDueDate ? formatDateInTimezone(new Date(order.nextDueDate)) : undefined;

      await this.mailerService.sendMail({
        to: order.user.email,
        subject: title,
        html: isPartial 
          ? getInstallmentPlanTemplate(customerName, orderId, order.finalAmount, order.store.name, installments, paidAmount, remainingBalance, nextDate)
          : `<h2>Hola ${customerName}, tu orden #${orderId} en ${order.store.name} ha sido confirmada.</h2>`,
      });
      this.logger.log(`Email sent to ${order.user.email} for order ${order.id}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${order.user.email}: ${error.message}`);
    }
  }

  async sendPaymentReminder(email: string, customerName: string, amount: number, dueDate: Date, orderId: string) {
    try {
      const formattedOrderId = orderId.split('-')[0].toUpperCase();
      await this.mailerService.sendMail({
        to: email,
        subject: 'Recordatorio de Pago Próximo - Tu Lojita',
        html: getPaymentReminderTemplate(customerName, amount, formatDateInTimezone(new Date(dueDate)), formattedOrderId),
      });
    } catch (error) {
      this.logger.error(`Failed to send reminder to ${email}: ${error.message}`);
    }
  }

  async sendSinglePaymentUnderReview(order: Order, amount: number) {
    try {
      const orderId = order.id.split('-')[0].toUpperCase();
      const customerName = `${order.user.firstName}${order.user.lastName ? ' ' + order.user.lastName : ''}`;
      const items = order.orderItems.map(oi => ({
        title: oi.title,
        quantity: oi.quantity,
        price: parseFloat(oi.price.toString()),
      }));

      await this.mailerService.sendMail({
        to: order.user.email,
        subject: `Pago Bajo Revisión - Orden #${orderId}`,
        html: getSinglePaymentUnderReviewTemplate(customerName, orderId, order.store.name, items, amount),
      });
      this.logger.log(`Review email sent to ${order.user.email} for order ${order.id}`);
    } catch (error) {
      this.logger.error(`Failed to send review email to ${order.user.email}: ${error.message}`);
    }
  }

  async sendPaymentApproved(payment: Payment) {
    try {
      const orderId = payment.order.id.split('-')[0].toUpperCase();
      const customerName = `${payment.user.firstName}${payment.user.lastName ? ' ' + payment.user.lastName : ''}`;
      
      await this.mailerService.sendMail({
        to: payment.user.email,
        subject: `¡Compra Aprobada! 🎉 - Orden #${orderId}`,
        html: getPaymentApprovedTemplate(customerName, orderId, payment.store.name, parseFloat(payment.amount.toString())),
      });
      this.logger.log(`Payment approved email sent to ${payment.user.email} for order ${payment.order.id}`);
    } catch (error) {
      this.logger.error(`Failed to send approved email to ${payment.user.email}: ${error.message}`);
    }
  }

  async sendPaymentRejected(payment: Payment) {
    try {
      const orderId = payment.order.id.split('-')[0].toUpperCase();
      const customerName = `${payment.user.firstName}${payment.user.lastName ? ' ' + payment.user.lastName : ''}`;
      
      await this.mailerService.sendMail({
        to: payment.user.email,
        subject: `Pago Rechazado ⚠️ - Orden #${orderId}`,
        html: getPaymentRejectedTemplate(customerName, orderId, payment.store.name, parseFloat(payment.amount.toString()), undefined),
      });
      this.logger.log(`Payment rejected email sent to ${payment.user.email} for order ${payment.order.id}`);
    } catch (error) {
      this.logger.error(`Failed to send rejected email to ${payment.user.email}: ${error.message}`);
    }
  }
}

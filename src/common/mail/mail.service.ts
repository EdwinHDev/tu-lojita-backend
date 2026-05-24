import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { Order } from 'src/order/entities/order.entity';
import { getInstallmentPlanTemplate, getPaymentReminderTemplate } from 'src/common/templates/email-templates';

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
        dueDate: new Date(i.dueDate).toLocaleDateString(),
      })) || [];

      const customerName = `${order.user.firstName}${order.user.lastName ? ' ' + order.user.lastName : ''}`;

      const paidAmount = parseFloat(order.totalPaidAmount?.toString() || '0');
      const remainingBalance = parseFloat(order.remainingBalance?.toString() || order.balance.toString());
      const nextDate = order.nextDueDate ? new Date(order.nextDueDate).toLocaleDateString() : undefined;

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
        html: getPaymentReminderTemplate(customerName, amount, new Date(dueDate).toLocaleDateString(), formattedOrderId),
      });
    } catch (error) {
      this.logger.error(`Failed to send reminder to ${email}: ${error.message}`);
    }
  }
}

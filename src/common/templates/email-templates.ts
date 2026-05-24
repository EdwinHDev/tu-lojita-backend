export function getLoginAlertTemplate(
  firstName: string,
  blockUrl: string,
  ip?: string,
  userAgent?: string,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 550px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #EEF2FF; color: #4F46E5; padding: 8px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Seguridad de la Cuenta</span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 8px; text-align: center;">Hola, ${firstName || 'Usuario'}</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; text-align: center; margin-top: 0; margin-bottom: 24px;">
        Hemos detectado un nuevo inicio de sesión en tu cuenta de Tu Lojita. Revisa los detalles a continuación.
      </p>
      
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 20px; border-radius: 12px; margin-bottom: 28px;">
        <p style="margin: 0; font-size: 14px; color: #475569;"><strong style="color: #1E293B;">Fecha:</strong> ${new Date().toLocaleString()}</p>
        <p style="margin: 10px 0 0; font-size: 14px; color: #475569;"><strong style="color: #1E293B;">Dirección IP:</strong> ${ip || 'No disponible'}</p>
        <p style="margin: 10px 0 0; font-size: 14px; color: #1E293B; line-height: 1.5;"><strong style="color: #1E293B;">Dispositivo:</strong> ${userAgent || 'No disponible'}</p>
      </div>

      <div style="text-align: center; margin-bottom: 28px;">
        <p style="color: #64748B; font-size: 14px; line-height: 1.5; margin-bottom: 16px;">
          ¿No fuiste tú? Para proteger tu cuenta, puedes bloquearla inmediatamente haciendo clic en el botón de abajo.
        </p>
        <a href="${blockUrl}" target="_blank" style="display: inline-block; background-color: #DC2626; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 10px; transition: background-color 0.2s ease;">Bloquear mi cuenta de inmediato</a>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      
      <p style="color: #94A3B8; font-size: 12px; line-height: 1.5; text-align: center; margin: 0;">
        Este es un correo automático generado por el sistema de seguridad de Tu Lojita. Por favor no respondas a este mensaje.
      </p>
    </div>
  `;
}

export function getInstallmentPlanTemplate(
  customerName: string,
  orderId: string,
  totalAmount: number,
  storeName: string,
  installments: { amount: number; dueDate: string }[],
  paidAmount: number,
  remainingBalance: number,
  nextPaymentDate?: string,
): string {
  const installmentsHtml = installments
    .map(
      (i, index) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; color: #475569;">Cuota ${index + 1}</td>
      <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; color: #1E293B; font-weight: 600;">$${i.amount}</td>
      <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; color: #475569;">${i.dueDate}</td>
    </tr>
  `,
    )
    .join('');

  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 600px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #F0FDF4; color: #16A34A; padding: 8px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600;">PLAN DE PAGOS APROBADO</span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; text-align: center;">Hola, ${customerName}</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
        Tu compra en <strong>${storeName}</strong> (#${orderId}) ha sido procesada con un plan de pagos parciales.
      </p>

      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <div style="flex: 1; background-color: #F8FAFC; padding: 16px; border-radius: 12px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #64748B; text-transform: uppercase;">Pagado</p>
          <p style="margin: 4px 0 0; font-size: 18px; font-weight: 700; color: #16A34A;">$${paidAmount}</p>
        </div>
        <div style="flex: 1; background-color: #F8FAFC; padding: 16px; border-radius: 12px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #64748B; text-transform: uppercase;">Pendiente</p>
          <p style="margin: 4px 0 0; font-size: 18px; font-weight: 700; color: #DC2626;">$${remainingBalance}</p>
        </div>
      </div>

      ${nextPaymentDate ? `
      <div style="background-color: #EFF6FF; border: 1px solid #DBEAFE; padding: 16px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; color: #1E40AF; font-size: 14px;">
          Próximo Pago: <strong>${nextPaymentDate}</strong>
        </p>
      </div>
      ` : ''}

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #F8FAFC;">
            <th style="text-align: left; padding: 12px; color: #64748B; font-size: 12px; text-transform: uppercase;">Detalle</th>
            <th style="text-align: left; padding: 12px; color: #64748B; font-size: 12px; text-transform: uppercase;">Monto</th>
            <th style="text-align: left; padding: 12px; color: #64748B; font-size: 12px; text-transform: uppercase;">Vencimiento</th>
          </tr>
        </thead>
        <tbody>
          ${installmentsHtml}
        </tbody>
      </table>

      <div style="background-color: #FFFBEB; border: 1px solid #FEF3C7; padding: 16px; border-radius: 12px; margin-bottom: 24px;">
        <p style="margin: 0; color: #92400E; font-size: 14px; line-height: 1.5;">
          <strong>Importante:</strong> Los pagos deben reportarse a través de la aplicación para ser validados por la tienda. El retraso en las cuotas puede generar multas automáticas.
        </p>
      </div>

      <p style="color: #94A3B8; font-size: 12px; text-align: center;">Tu Lojita - Tu tienda de confianza</p>
    </div>
  `;
}

export function getPaymentReminderTemplate(
  customerName: string,
  amount: number,
  dueDate: string,
  orderId: string,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 550px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #FEF2F2; color: #DC2626; padding: 8px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600;">RECORDATORIO DE PAGO</span>
      </div>
      <h2 style="color: #1E293B; font-size: 20px; font-weight: 700; text-align: center;">Hola, ${customerName}</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; text-align: center;">
        Te recordamos que tienes una cuota pendiente por un monto de <strong>$${amount}</strong> que vence el <strong>${dueDate}</strong>.
      </p>
      
      <div style="text-align: center; margin: 32px 0;">
        <p style="color: #64748B; font-size: 14px; margin-bottom: 16px;">Orden: #${orderId}</p>
        <a href="#" style="display: inline-block; background-color: #4F46E5; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 28px; border-radius: 10px;">Pagar ahora en la App</a>
      </div>

      <p style="color: #94A3B8; font-size: 12px; text-align: center; margin: 0;">Evita cargos adicionales por mora pagando a tiempo.</p>
    </div>
  `;
}

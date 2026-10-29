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

      ${
        nextPaymentDate
          ? `
      <div style="background-color: #EFF6FF; border: 1px solid #DBEAFE; padding: 16px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; color: #1E40AF; font-size: 14px;">
          Próximo Pago: <strong>${nextPaymentDate}</strong>
        </p>
      </div>
      `
          : ''
      }

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

export function getSinglePaymentUnderReviewTemplate(
  customerName: string,
  orderId: string,
  storeName: string,
  items: { title: string; quantity: number; price: number }[],
  amount: number,
): string {
  const itemsHtml = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; color: #475569; font-size: 14px;">${item.title} (x${item.quantity})</td>
      <td style="padding: 12px; border-bottom: 1px solid #E2E8F0; color: #1E293B; font-weight: 600; text-align: right; font-size: 14px;">$${(item.price * item.quantity).toFixed(2)}</td>
    </tr>
  `,
    )
    .join('');

  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 600px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #FFF3C7; color: #D97706; padding: 8px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600; text-transform: uppercase;">Pago Bajo Revisión ⌛</span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; text-align: center;">Hola, ${customerName}</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
        Hemos recibido tu reporte de pago por la compra en <strong>${storeName}</strong> (#${orderId}). Tu pago está en proceso de verificación por parte del comercio.
      </p>

      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 18px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Monto Reportado</p>
        <p style="margin: 4px 0 0; font-size: 24px; font-weight: 800; color: #4F46E5;">$${amount.toFixed(2)}</p>
      </div>

      <h3 style="color: #1E293B; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">Resumen del Pedido</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #F8FAFC;">
            <th style="text-align: left; padding: 12px; color: #64748B; font-size: 11px; text-transform: uppercase;">Producto</th>
            <th style="text-align: right; padding: 12px; color: #64748B; font-size: 11px; text-transform: uppercase;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="background-color: #EFF6FF; border: 1px solid #DBEAFE; padding: 16px; border-radius: 12px; margin-bottom: 24px;">
        <p style="margin: 0; color: #1E40AF; font-size: 13px; line-height: 1.5; text-align: center;">
          <strong>¿Qué pasa ahora?</strong> Tan pronto como la tienda valide la transferencia/pago móvil de tu banco, recibirás un correo de confirmación de aprobación.
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">Tu Lojita - Tu tienda de confianza</p>
    </div>
  `;
}

export interface NextInstallmentScheduleInfo {
  index: number;
  amount: number;
  dueDate: string;
}

export function getPaymentApprovedTemplate(
  customerName: string,
  orderId: string,
  storeName: string,
  amount: number,
  nextInstallment?: NextInstallmentScheduleInfo | null,
  remainingBalance?: number | null,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 560px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #DCFCE7; color: #15803D; padding: 8px 18px; border-radius: 9999px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">¡Pago Aprobado! 🎉</span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; text-align: center;">¡Buenas noticias, ${customerName}!</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
        Tu pago de <strong>$${amount.toFixed(2)}</strong> para la orden <strong>#${orderId}</strong> en <strong>${storeName}</strong> ha sido verificado y aprobado con éxito.
      </p>

      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <div style="flex: 1; background-color: #F0FDF4; border: 1px solid #BBF7D0; padding: 14px; border-radius: 12px; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #15803D; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Monto Aprobado</p>
          <p style="margin: 4px 0 0; font-size: 20px; font-weight: 800; color: #15803D;">$${amount.toFixed(2)}</p>
        </div>
        ${
          typeof remainingBalance === 'number' && remainingBalance > 0.01
            ? `
        <div style="flex: 1; background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 14px; border-radius: 12px; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Saldo Pendiente</p>
          <p style="margin: 4px 0 0; font-size: 20px; font-weight: 800; color: #0F172A;">$${remainingBalance.toFixed(2)}</p>
        </div>
        `
            : ''
        }
      </div>

      ${
        nextInstallment
          ? `
      <div style="background-color: #EFF6FF; border: 1.5px solid #BFDBFE; padding: 18px 20px; border-radius: 14px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <span style="font-size: 13px; font-weight: 800; color: #1E40AF; text-transform: uppercase; letter-spacing: 0.05em;">📅 Próxima Cuota Programada</span>
          <span style="background-color: #DBEAFE; color: #1D4ED8; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px;">Cuota #${nextInstallment.index}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed #BFDBFE;">
          <div>
            <p style="margin: 0; font-size: 12px; color: #64748B;">Monto a pagar:</p>
            <p style="margin: 2px 0 0; font-size: 18px; font-weight: 800; color: #1E293B;">$${nextInstallment.amount.toFixed(2)}</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 0; font-size: 12px; color: #64748B;">Fecha límite:</p>
            <p style="margin: 2px 0 0; font-size: 15px; font-weight: 700; color: #2563EB;">${nextInstallment.dueDate}</p>
          </div>
        </div>
      </div>
      `
          : `
      <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; padding: 16px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; font-size: 14px; color: #16A34A; font-weight: 700;">✨ ¡Has completado la totalidad de los pagos de tu orden!</p>
      </div>
      `
      }

      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 16px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; color: #475569; font-size: 13px; line-height: 1.5;">
          Puedes consultar el cronograma y realizar tus próximos pagos directamente desde la aplicación móvil en <strong>Mis Órdenes</strong>.
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">Tu Lojita - Tu tienda de confianza</p>
    </div>
  `;
}

export function getPaymentRejectedTemplate(
  customerName: string,
  orderId: string,
  storeName: string,
  amount: number,
  rejectionReason?: string,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 550px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #FEE2E2; color: #B91C1C; padding: 8px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600; text-transform: uppercase;">Pago Rechazado ⚠️</span>
      </div>
      <h2 style="color: #1E293B; font-size: 20px; font-weight: 700; margin-top: 0; text-align: center;">Hola, ${customerName}</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
        El comercio de <strong>${storeName}</strong> ha rechazado tu reporte de pago por <strong>$${amount.toFixed(2)}</strong> de la orden #${orderId}.
      </p>

      ${
        rejectionReason
          ? `
      <div style="background-color: #FFF1F2; border: 1px solid #FECDD3; padding: 18px; border-radius: 12px; margin-bottom: 24px;">
        <p style="margin: 0 0 4px; font-size: 12px; color: #E11D48; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">Motivo del Rechazo:</p>
        <p style="margin: 0; font-size: 14px; color: #9F1239; line-height: 1.5; font-weight: 500;">"${rejectionReason}"</p>
      </div>
      `
          : ''
      }

      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 16px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; color: #475569; font-size: 13px; line-height: 1.5;">
          <strong>¿Qué debes hacer ahora?</strong> Por favor, ingresa a la aplicación móvil, ve a los detalles de tu orden y vuelve a reportar el pago con la referencia y el comprobante correctos.
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">Tu Lojita - Tu tienda de confianza</p>
    </div>
  `;
}

export function getOrderAutoCancelledTemplate(
  customerName: string,
  orderId: string,
  storeName: string,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 550px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #FEE2E2; color: #B91C1C; padding: 8px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600; text-transform: uppercase;">Orden Cancelada ⌛</span>
      </div>
      <h2 style="color: #1E293B; font-size: 20px; font-weight: 700; margin-top: 0; text-align: center;">Hola, ${customerName}</h2>
      <p style="color: #475569; font-size: 16px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
        Tu orden <strong>#${orderId}</strong> en <strong>${storeName}</strong> ha sido cancelada automáticamente tras 24 horas de inactividad luego del rechazo del comprobante de pago.
      </p>

      <div style="background-color: #FFF1F2; border: 1px solid #FECDD3; padding: 18px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0 0 4px; font-size: 12px; color: #E11D48; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">Motivo de Cancelación</p>
        <p style="margin: 0; font-size: 14px; color: #9F1239; line-height: 1.5; font-weight: 500;">Tiempo de espera agotado (24 horas sin registrar un nuevo comprobante)</p>
      </div>

      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 16px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; color: #475569; font-size: 13px; line-height: 1.5;">
          <strong>¿Aún deseas realizar tu compra?</strong> Puedes ingresar a la aplicación móvil cuando lo desees para generar una nueva orden.
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">Tu Lojita - Tu tienda de confianza</p>
    </div>
  `;
}

export function getRegistrationOtpTemplate(
  otp: string,
  firstName?: string,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 520px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #EEF2FF; color: #4F46E5; padding: 8px 16px; border-radius: 9999px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
          Verificación de Cuenta
        </span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 12px; text-align: center;">
        Hola, ${firstName || 'Usuario'}
      </h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 0; margin-bottom: 28px;">
        Gracias por registrarte en <strong>Tu Lojita</strong>. Para verificar tu correo electrónico y activar tu cuenta, ingresa el siguiente código de seguridad en la aplicación:
      </p>

      <div style="background: linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%); border: 2px dashed #C7D2FE; border-radius: 14px; padding: 24px; text-align: center; margin-bottom: 28px;">
        <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #6366F1; text-transform: uppercase; letter-spacing: 0.1em;">
          Código de Verificación
        </p>
        <span style="font-size: 38px; font-weight: 800; color: #1E1B4B; letter-spacing: 8px; font-family: monospace;">
          ${otp}
        </span>
        <p style="margin: 8px 0 0; font-size: 12px; color: #64748B;">
          Válido durante <strong>10 minutos</strong>
        </p>
      </div>

      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 16px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; color: #64748B; font-size: 13px; line-height: 1.5;">
          Por tu seguridad, <strong>nunca compartas este código con nadie</strong>. El equipo de Tu Lojita nunca te pedirá este código por teléfono o mensaje.
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">
        Si no solicitaste este código, puedes ignorar este mensaje de forma segura. Tu cuenta no será creada hasta que confirmes el código.
      </p>
    </div>
  `;
}

export function getPasswordResetOtpTemplate(
  otp: string,
  firstName?: string,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 520px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #FEF3C7; color: #D97706; padding: 8px 16px; border-radius: 9999px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
          Recuperación de Contraseña
        </span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 12px; text-align: center;">
        Hola, ${firstName || 'Usuario'}
      </h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 0; margin-bottom: 28px;">
        Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>Tu Lojita</strong>. Ingresa el siguiente código de seguridad en la aplicación para verificar tu identidad:
      </p>

      <div style="background: linear-gradient(135deg, #F8FAFC 0%, #FEF3C7 100%); border: 2px dashed #FCD34D; border-radius: 14px; padding: 24px; text-align: center; margin-bottom: 28px;">
        <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #D97706; text-transform: uppercase; letter-spacing: 0.1em;">
          Código de Recuperación
        </p>
        <span style="font-size: 38px; font-weight: 800; color: #1E1B4B; letter-spacing: 8px; font-family: monospace;">
          ${otp}
        </span>
        <p style="margin: 8px 0 0; font-size: 12px; color: #64748B;">
          Válido durante <strong>10 minutos</strong>
        </p>
      </div>

      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 16px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; color: #64748B; font-size: 13px; line-height: 1.5;">
          Por tu seguridad, <strong>nunca compartas este código con nadie</strong>. Si tú no solicitaste este cambio, puedes ignorar este mensaje; tu contraseña actual continuará siendo segura.
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">
        Tu Lojita nunca te solicitará tu contraseña ni este código de verificación por correo, llamada o mensaje.
      </p>
    </div>
  `;
}

export function getStoreNewDisputeTemplate(
  storeOwnerName: string,
  storeName: string,
  orderId: string,
  customerName: string,
  disputeType: string,
  description: string,
  totalAmount: number,
  date?: string,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 580px; margin: 30px auto; padding: 32px; border: 1px solid #FCA5A5; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.08);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #FEF2F2; color: #DC2626; border: 1px solid #FCA5A5; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
          Atención Requerida &bull; Nuevo Reclamo
        </span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 8px; text-align: center;">
        Hola, ${storeOwnerName || storeName}
      </h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 0; margin-bottom: 24px;">
        El cliente <strong>${customerName}</strong> ha reportado un problema con su orden en <strong>${storeName}</strong>.
      </p>

      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #E2E8F0; padding-bottom: 10px; margin-bottom: 10px;">
          <span style="font-size: 13px; color: #64748B;">Orden:</span>
          <span style="font-size: 13px; font-weight: 700; color: #0F172A;">#${orderId.toUpperCase()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #E2E8F0; padding-bottom: 10px; margin-bottom: 10px;">
          <span style="font-size: 13px; color: #64748B;">Monto de la orden:</span>
          <span style="font-size: 13px; font-weight: 700; color: #16A34A;">$${Number(totalAmount).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #E2E8F0; padding-bottom: 10px; margin-bottom: 10px;">
          <span style="font-size: 13px; color: #64748B;">Motivo reportado:</span>
          <span style="font-size: 13px; font-weight: 600; color: #DC2626;">${disputeType}</span>
        </div>
        ${
          date
            ? `
        <div style="display: flex; justify-content: space-between;">
          <span style="font-size: 13px; color: #64748B;">Fecha del reclamo:</span>
          <span style="font-size: 13px; color: #475569;">${date}</span>
        </div>
        `
            : ''
        }
      </div>

      <div style="background-color: #FFF5F5; border-left: 4px solid #DC2626; padding: 16px; border-radius: 0 10px 10px 0; margin-bottom: 24px;">
        <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #991B1B; text-transform: uppercase;">
          Detalle del cliente:
        </p>
        <p style="margin: 0; font-size: 14px; color: #374151; font-style: italic; line-height: 1.5;">
          &ldquo;${description}&rdquo;
        </p>
      </div>

      <div style="background-color: #EFF6FF; border: 1px solid #DBEAFE; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 13px; color: #1E40AF; line-height: 1.5;">
          <strong>¿Qué debes hacer?</strong> Ingresa a tu panel de control o a la app móvil <strong>Tu Lojita Empresa</strong>, accede al detalle de la orden y responde al cliente o acepta el reclamo para coordinar la solución.
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">
        Notificación automática generada por Tu Lojita. Por favor no respondas directamente a este correo.
      </p>
    </div>
  `;
}

export function getCustomerDisputeResponseTemplate(
  customerName: string,
  storeName: string,
  orderId: string,
  merchantResponse: string,
  isAccepted: boolean,
  date?: string,
): string {
  const badgeBg = isAccepted ? '#F0FDF4' : '#EEF2FF';
  const badgeColor = isAccepted ? '#16A34A' : '#4F46E5';
  const badgeBorder = isAccepted ? '#86EFAC' : '#C7D2FE';
  const badgeText = isAccepted
    ? 'Reclamo Aceptado por el Comercio'
    : 'Respuesta a tu Reclamo';

  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 580px; margin: 30px auto; padding: 32px; border: 1px solid ${isAccepted ? '#86EFAC' : '#E2E8F0'}; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
          ${badgeText}
        </span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 8px; text-align: center;">
        Hola, ${customerName || 'Cliente'}
      </h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 0; margin-bottom: 24px;">
        El comercio <strong>${storeName}</strong> ha respondido a tu reclamo sobre el pedido <strong>#${orderId.toUpperCase()}</strong>.
      </p>

      <div style="background-color: ${isAccepted ? '#F0FDF4' : '#F8FAFC'}; border-left: 4px solid ${isAccepted ? '#16A34A' : '#4F46E5'}; padding: 18px; border-radius: 0 10px 10px 0; margin-bottom: 24px;">
        <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: ${isAccepted ? '#166534' : '#3730A3'}; text-transform: uppercase;">
          ${isAccepted ? 'Resolución del comercio:' : 'Mensaje del comercio:'}
        </p>
        <p style="margin: 0; font-size: 14px; color: #1E293B; line-height: 1.6;">
          ${merchantResponse || (isAccepted ? 'El comercio ha aceptado el reclamo y procedió con la resolución.' : '')}
        </p>
      </div>

      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; font-size: 13px; color: #64748B; line-height: 1.5;">
          ${
            isAccepted
              ? 'Tu reclamo ha concluido exitosamente. Puedes revisar el estado actualizado en la app <strong>Tu Lojita</strong>.'
              : 'Si estás de acuerdo con la respuesta o necesitas coordinar detalles adicionales, puedes chatear directamente con el comercio desde la aplicación <strong>Tu Lojita</strong>.'
          }
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">
        Notificación automática generada por Tu Lojita.
      </p>
    </div>
  `;
}

export function getStoreStrikeNoticeTemplate(
  storeName: string,
  strikeCount: number,
  reason: string,
  expiresAt?: string,
): string {
  const isCritical = strikeCount >= 2;
  const badgeBg = isCritical ? '#FEF2F2' : '#FFFBEB';
  const badgeColor = isCritical ? '#DC2626' : '#D97706';
  const badgeBorder = isCritical ? '#FECACA' : '#FDE68A';

  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 580px; margin: 30px auto; padding: 32px; border: 1px solid ${isCritical ? '#FCA5A5' : '#E2E8F0'}; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; padding: 6px 16px; border-radius: 9999px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
          Aviso de Sanción: Strike (${strikeCount}/3)
        </span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 8px; text-align: center;">
        Atención, equipo de ${storeName}
      </h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 0; margin-bottom: 24px;">
        Se ha registrado una sanción administrativa en tu comercio debido a una infracción de las políticas comunitarias de Tu Lojita.
      </p>

      <div style="background-color: #F8FAFC; border-left: 4px solid ${badgeColor}; padding: 18px; border-radius: 0 10px 10px 0; margin-bottom: 24px;">
        <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase;">
          Detalle del Strike:
        </p>
        <p style="margin: 0 0 8px; font-size: 14px; color: #1E293B;">
          <strong>Strikes activos:</strong> ${strikeCount} de 3 permitidos
        </p>
        <p style="margin: 0 0 8px; font-size: 14px; color: #1E293B;">
          <strong>Motivo:</strong> ${reason || 'Incumplimiento de normativas de publicación o servicio'}
        </p>
        ${
          expiresAt
            ? `<p style="margin: 0; font-size: 14px; color: #1E293B;"><strong>Vigencia:</strong> Expira el ${expiresAt} (90 días desde su emisión)</p>`
            : `<p style="margin: 0; font-size: 14px; color: #1E293B;"><strong>Vigencia:</strong> 90 días naturales</p>`
        }
      </div>

      <div style="background-color: ${isCritical ? '#FEF2F2' : '#EFF6FF'}; border: 1px solid ${isCritical ? '#FCA5A5' : '#DBEAFE'}; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 13px; color: ${isCritical ? '#991B1B' : '#1E40AF'}; line-height: 1.5;">
          ${
            isCritical
              ? '<strong>Advertencia crítica:</strong> Tu comercio está a 1 strike de ser suspendido automáticamente. Te recomendamos revisar tus operaciones y la sección "Salud del Comercio" en la app <strong>Tu Lojita Empresa</strong>.'
              : '<strong>Importante:</strong> Mantener una conducta responsable es fundamental. Si acumulas 3 strikes activos, tu comercio será suspendido de manera automática.'
          }
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">
        Notificación de seguridad de Tu Lojita.
      </p>
    </div>
  `;
}

export function getStoreSuspensionTemplate(
  storeName: string,
  reason: string,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 580px; margin: 30px auto; padding: 32px; border: 1px solid #F87171; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; padding: 6px 16px; border-radius: 9999px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
          Comercio Suspendido
        </span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 8px; text-align: center;">
        Comunicado urgente para ${storeName}
      </h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 0; margin-bottom: 24px;">
        Lamentamos informarte que la tienda <strong>${storeName}</strong> ha sido suspendida temporalmente por el equipo de moderación y administración.
      </p>

      <div style="background-color: #FEF2F2; border-left: 4px solid #DC2626; padding: 18px; border-radius: 0 10px 10px 0; margin-bottom: 24px;">
        <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #991B1B; text-transform: uppercase;">
          Causa de la suspensión:
        </p>
        <p style="margin: 0; font-size: 14px; color: #1E293B; line-height: 1.6;">
          ${reason || 'Acumulación de 3 strikes de sanción o infracción directa a las políticas del servicio.'}
        </p>
      </div>

      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #1E293B;">
          Efectos de la suspensión:
        </p>
        <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #475569; line-height: 1.6;">
          <li>Tu catálogo público no está visible para clientes.</li>
          <li>No podrás recibir nuevos pedidos ni aceptar pagos.</li>
          <li>Aún puedes gestionar las órdenes en curso o comunicarte con soporte.</li>
        </ul>
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <p style="color: #64748B; font-size: 13px; margin-bottom: 12px;">
          Si deseas apelar esta sanción o solicitar una revisión de tu cuenta, comunícate con nuestro canal oficial de soporte.
        </p>
        <a href="mailto:soporte@tulojita.com" style="display: inline-block; background-color: #0F172A; color: #FFFFFF; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 8px;">
          Contactar a Soporte y Mediación
        </a>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">
        Notificación oficial de administración de Tu Lojita.
      </p>
    </div>
  `;
}

export function getItemHiddenTemplate(
  storeName: string,
  itemName: string,
  reason: string,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 580px; margin: 30px auto; padding: 32px; border: 1px solid #FCD34D; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; padding: 6px 16px; border-radius: 9999px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
          Artículo Desactivado
        </span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 8px; text-align: center;">
        Hola, ${storeName}
      </h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 0; margin-bottom: 24px;">
        Tu publicación <strong>"${itemName}"</strong> ha sido desactivada y retirada del catálogo público tras una evaluación de moderación.
      </p>

      <div style="background-color: #F8FAFC; border-left: 4px solid #F59E0B; padding: 18px; border-radius: 0 10px 10px 0; margin-bottom: 24px;">
        <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #78350F; text-transform: uppercase;">
          Motivo reportado:
        </p>
        <p style="margin: 0; font-size: 14px; color: #1E293B; line-height: 1.6;">
          ${reason || 'Incumplimiento de lineamientos de publicación, contenido inapropiado o imágenes no autorizadas.'}
        </p>
      </div>

      <div style="background-color: #EFF6FF; border: 1px solid #DBEAFE; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 13px; color: #1E40AF; line-height: 1.5;">
          <strong>¿Cómo reactivarlo?</strong> Accede al catálogo de tu tienda en <strong>Tu Lojita Empresa</strong>, edita la descripción, precio o imágenes para asegurar que cumplan las normativas comunitarias y solicita su reactivación.
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">
        Notificación automática generada por Tu Lojita.
      </p>
    </div>
  `;
}

export function getCustomerBlockedTemplate(
  customerName: string,
  storeName: string,
  reason?: string,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 580px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #F1F5F9; color: #475569; border: 1px solid #CBD5E1; padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
          Restricción en Comercio
        </span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 8px; text-align: center;">
        Hola, ${customerName || 'Cliente'}
      </h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 0; margin-bottom: 24px;">
        Queremos informarte con total claridad que el comercio <strong>${storeName}</strong> ha restringido tu acceso para realizar nuevas compras u órdenes en su establecimiento.
      </p>

      <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <p style="margin: 0; font-size: 13px; color: #166534; line-height: 1.5;">
          <strong>Tu cuenta global permanece 100% activa:</strong> Esta restricción aplica únicamente para compras en <strong>${storeName}</strong>. Puedes continuar navegando, realizando compras y recibiendo pedidos en todos los demás comercios de Tu Lojita con normalidad.
        </p>
      </div>

      <div style="background-color: #F8FAFC; border-left: 4px solid #64748B; padding: 18px; border-radius: 0 10px 10px 0; margin-bottom: 24px;">
        <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase;">
          Motivo indicado por el comercio:
        </p>
        <p style="margin: 0; font-size: 14px; color: #1E293B; line-height: 1.6;">
          ${reason || 'Decisión comercial o política interna del establecimiento.'}
        </p>
      </div>

      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5;">
          ¿Consideras que se trata de un error o deseas resolver esta situación con el comercio? Puedes <strong>solicitar una mediación</strong> directamente desde la aplicación <strong>Tu Lojita</strong> para que nuestro equipo te asista.
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">
        Notificación informativa generada por Tu Lojita.
      </p>
    </div>
  `;
}

export function getCustomerUnblockedTemplate(
  customerName: string,
  storeName: string,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 580px; margin: 30px auto; padding: 32px; border: 1px solid #86EFAC; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #F0FDF4; color: #16A34A; border: 1px solid #BBF7D0; padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
          Acceso Restablecido
        </span>
      </div>
      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 8px; text-align: center;">
        ¡Hola, ${customerName || 'Cliente'}!
      </h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 0; margin-bottom: 24px;">
        Te informamos con agrado que el comercio <strong>${storeName}</strong> ha restablecido tu acceso para realizar órdenes y compras en su tienda.
      </p>

      <div style="background-color: #F0FDF4; border: 1px solid #86EFAC; border-radius: 12px; padding: 18px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; font-size: 14px; color: #166534; line-height: 1.5;">
          Ya puedes ingresar a la tienda de <strong>${storeName}</strong> desde la app <strong>Tu Lojita</strong>, explorar sus productos y realizar tus pedidos habituales.
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">
        Notificación automática generada por Tu Lojita.
      </p>
    </div>
  `;
}

export function getDisputeVerdictNoticeTemplate(
  recipientName: string,
  role: 'COMPRADOR' | 'COMERCIO',
  orderShort: string,
  verdictTitle: string,
  verdictDescription: string,
  adminNotes: string,
  penaltyText: string,
  dateFormatted: string,
): string {
  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 600px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="background-color: #EDE9FE; color: #6D28D9; border: 1px solid #DDD6FE; padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
          Dictamen Arbitral Oficial
        </span>
      </div>

      <h2 style="color: #1E293B; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 8px; text-align: center;">
        Resolución de Disputa — Orden #${orderShort}
      </h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 0; margin-bottom: 24px;">
        Estimado/a <strong>${recipientName || 'Usuario'}</strong> (${role.toLowerCase()}), nuestro equipo de Soporte ha emitido el dictamen final para el caso arbitral correspondiente a la orden <strong>#${orderShort}</strong>.
      </p>

      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <div style="margin-bottom: 12px;">
          <span style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; display: block;">Veredicto Final</span>
          <span style="font-size: 16px; font-weight: 700; color: #1E293B;">${verdictTitle}</span>
          <p style="font-size: 13px; color: #475569; margin: 4px 0 0 0; line-height: 1.5;">${verdictDescription}</p>
        </div>

        <div style="margin-bottom: 12px; border-top: 1px dashed #CBD5E1; padding-top: 12px;">
          <span style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; display: block;">Fundamentación Arbitral de Soporte</span>
          <p style="font-size: 13px; color: #1E293B; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; margin: 6px 0 0 0; line-height: 1.5; white-space: pre-wrap;">${adminNotes}</p>
        </div>

        ${
          penaltyText
            ? `
        <div style="border-top: 1px dashed #CBD5E1; padding-top: 12px;">
          <span style="font-size: 11px; font-weight: 700; color: #B91C1C; text-transform: uppercase; letter-spacing: 0.05em; display: block;">Medidas y Sanciones Aplicadas</span>
          <p style="font-size: 13px; color: #991B1B; font-weight: 600; margin: 4px 0 0 0;">${penaltyText}</p>
        </div>
        `
            : ''
        }
      </div>

      <div style="text-align: center; margin-bottom: 24px;">
        <p style="font-size: 12px; color: #64748B; margin: 0;">Fecha del dictamen: ${dateFormatted}</p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">
        Este es un comunicado oficial vinculante emitido por el Centro de Mediación y Soporte de Tu Lojita.
      </p>
    </div>
  `;
}

export function getAccountSuspensionTemplate(
  userName: string,
  suspensionType: 'TEMPORARY' | 'PERMANENT',
  reason: string,
  suspendedUntilFormatted?: string,
): string {
  const isPermanent = suspensionType === 'PERMANENT';
  const typeBadge = isPermanent
    ? '<span style="background-color: #FEE2E2; color: #DC2626; padding: 6px 14px; border-radius: 9999px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #FECDD3;">Suspensión Permanente</span>'
    : '<span style="background-color: #FEF3C7; color: #D97706; padding: 6px 14px; border-radius: 9999px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #FDE68A;">Suspensión Temporal</span>';

  return `
    <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 580px; margin: 30px auto; padding: 32px; border: 1px solid #E2E8F0; border-radius: 16px; background-color: #FFFFFF; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 20px;">
        ${typeBadge}
      </div>
      <h2 style="color: #0F172A; font-size: 22px; font-weight: 800; margin-top: 0; margin-bottom: 8px; text-align: center;">Aviso Importante sobre tu Cuenta</h2>
      <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 0; margin-bottom: 24px;">
        Hola <strong>${userName || 'Usuario'}</strong>, te notificamos que el acceso a tu cuenta en <strong>Tu Lojita</strong> ha sido suspendido por el equipo de administración.
      </p>

      <div style="background-color: #FFF5F5; border: 1px solid #FECDD3; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <div style="margin-bottom: 14px;">
          <span style="font-size: 11px; font-weight: 700; color: #991B1B; text-transform: uppercase; letter-spacing: 0.05em; display: block;">Tipo de Sanción</span>
          <span style="font-size: 14px; font-weight: 700; color: #1E293B;">
            ${isPermanent ? 'Suspensión Permanente / Definitiva' : 'Suspensión Temporal'}
          </span>
        </div>

        ${
          !isPermanent && suspendedUntilFormatted
            ? `
        <div style="margin-bottom: 14px; border-top: 1px dashed #FECDD3; padding-top: 12px;">
          <span style="font-size: 11px; font-weight: 700; color: #991B1B; text-transform: uppercase; letter-spacing: 0.05em; display: block;">Fecha Estimada de Reactivación</span>
          <span style="font-size: 14px; font-weight: 700; color: #1E293B;">${suspendedUntilFormatted}</span>
        </div>
        `
            : ''
        }

        <div style="border-top: 1px dashed #FECDD3; padding-top: 12px;">
          <span style="font-size: 11px; font-weight: 700; color: #991B1B; text-transform: uppercase; letter-spacing: 0.05em; display: block;">Motivo de la Suspensión</span>
          <p style="font-size: 13.5px; color: #7F1D1D; background-color: #FFFFFF; border: 1px solid #FECDD3; border-radius: 8px; padding: 12px; margin: 6px 0 0 0; line-height: 1.5; white-space: pre-wrap;">${reason || 'Incumplimiento de las normas y términos de la plataforma.'}</p>
        </div>
      </div>

      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: left;">
        <span style="font-size: 12px; font-weight: 700; color: #334155; display: block; margin-bottom: 4px;">¿Qué puedes hacer?</span>
        <p style="font-size: 12.5px; color: #64748B; margin: 0; line-height: 1.5;">
          Al abrir la aplicación móvil encontrarás la pantalla de <strong>Cuenta Suspendida</strong> con el detalle de la sanción. Si consideras que se trata de un error o deseas presentar pruebas para su revisión, puedes enviar una apelación directamente desde la app o comunicarte con nuestro canal de atención al cliente.
        </p>
      </div>

      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin-bottom: 20px;">
      <p style="color: #94A3B8; font-size: 11px; text-align: center; margin: 0;">
        Este es un comunicado oficial emitido por la administración de Tu Lojita.
      </p>
    </div>
  `;
}


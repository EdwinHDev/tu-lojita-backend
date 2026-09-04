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


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

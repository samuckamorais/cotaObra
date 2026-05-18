import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Serviço de envio de e-mails via SMTP (nodemailer).
 *
 * Se SMTP_HOST não estiver configurado, loga o e-mail no console
 * em vez de enviar (útil para desenvolvimento local).
 */
class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;

    if (!env.SMTP_HOST) {
      logger.warn('SMTP_HOST not configured — emails will be logged to console');
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
    });

    return this.transporter;
  }

  async sendMail(to: string, subject: string, html: string): Promise<void> {
    const transporter = this.getTransporter();

    const mailOptions = {
      from: `"CotaObra" <${env.SMTP_FROM}>`,
      to,
      subject,
      html,
    };

    if (!transporter) {
      // Dev mode: log to console
      logger.info('📧 [DEV] Email would be sent:', {
        to,
        subject,
        htmlLength: html.length,
      });
      logger.debug('📧 [DEV] Email HTML body:', { html });
      return;
    }

    try {
      await transporter.sendMail(mailOptions);
      logger.info('Email sent', { to, subject });
    } catch (error) {
      logger.error('Failed to send email', { to, subject, error: String(error) });
      throw error;
    }
  }

  /**
   * Envia e-mail de recuperação de senha com template HTML profissional.
   */
  async sendPasswordResetEmail(to: string, userName: string, resetUrl: string): Promise<void> {
    const subject = 'Recuperação de senha — CotaObra';
    const html = this.buildResetPasswordTemplate(userName, resetUrl);
    await this.sendMail(to, subject, html);
  }

  private buildResetPasswordTemplate(userName: string, resetUrl: string): string {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperação de Senha</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">
                CotaObra
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
                Plataforma de Cotações Agrícolas
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:600;">
                Olá, ${userName}!
              </h2>
              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                Recebemos uma solicitação para redefinir a senha da sua conta.
                Clique no botão abaixo para criar uma nova senha:
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="background-color:#16a34a;border-radius:8px;">
                    <a href="${resetUrl}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">
                      Redefinir minha senha
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 16px;color:#64748b;font-size:13px;line-height:1.5;">
                Se o botão não funcionar, copie e cole o link abaixo no seu navegador:
              </p>
              <p style="margin:0 0 24px;padding:12px 16px;background-color:#f1f5f9;border-radius:6px;word-break:break-all;font-size:13px;color:#3b82f6;">
                ${resetUrl}
              </p>

              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                Este link expira em <strong>1 hora</strong>. Se você não solicitou a
                redefinição de senha, ignore este e-mail — sua conta permanece segura.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                &copy; ${new Date().getFullYear()} CotaObra. Todos os direitos reservados.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}

export const emailService = new EmailService();

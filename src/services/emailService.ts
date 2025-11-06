import { Resend } from 'resend';
import logger from '../utils/logger.js';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export class EmailService {
  private static instance: EmailService;

  private constructor() {}

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const emailOptions: any = {
        from: options.from || 'noreply@tuprofedeia.com.co',
        to: options.to,
        subject: options.subject,
      };

      if (options.html) {
        emailOptions.html = options.html;
      } else if (options.text) {
        emailOptions.text = options.text;
      } else {
        emailOptions.text = 'No content provided';
      }

      const { data, error } = await resend.emails.send(emailOptions);

      if (error) {
        logger.error({ msg: 'Error sending email', error });
        return false;
      }

      logger.info({ msg: 'Email sent successfully', data });
      return true;
    } catch (error) {
      logger.error({ msg: 'Failed to send email', error });
      return false;
    }
  }

  async sendAlertEmail(to: string, alertType: string, message: string, details?: any): Promise<boolean> {
    const subject = `Alerta ${alertType} - Sistema de Gestión Apícola`;
    const html = this.generateAlertEmailTemplate(alertType, message, details);

    return this.sendEmail({
      to,
      subject,
      html,
    });
  }

  private generateAlertEmailTemplate(alertType: string, message: string, details?: any): string {
    const severityColor = this.getSeverityColor(alertType);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Alerta del Sistema</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .header { background-color: ${severityColor}; color: white; padding: 15px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { padding: 20px; }
            .alert-type { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
            .message { font-size: 16px; line-height: 1.5; margin-bottom: 20px; }
            .details { background-color: #f8f9fa; padding: 15px; border-radius: 4px; border-left: 4px solid ${severityColor}; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 Alerta del Sistema Apícola</h1>
            </div>
            <div class="content">
              <div class="alert-type">Tipo: ${alertType}</div>
              <div class="message">${message}</div>
              ${details ? `
                <div class="details">
                  <strong>Detalles:</strong><br>
                  ${typeof details === 'object' ? JSON.stringify(details, null, 2) : details}
                </div>
              ` : ''}
            </div>
            <div class="footer">
              Este es un mensaje automático del Sistema de Gestión Apícola.<br>
              Por favor, no responda a este correo.
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getSeverityColor(alertType: string): string {
    const type = alertType.toLowerCase();
    if (type.includes('crítica') || type.includes('critical')) return '#dc3545';
    if (type.includes('advertencia') || type.includes('warning')) return '#ffc107';
    if (type.includes('información') || type.includes('info')) return '#17a2b8';
    return '#6c757d';
  }
}

export const emailService = EmailService.getInstance();
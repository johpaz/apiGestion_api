import fs from 'fs';
import path from 'path';

export interface AlertTemplateData {
  alertType: string;
  message: string;
  details?: string;
  dashboardUrl?: string;
  alertsUrl?: string;
  timestamp?: string;
}

export class AlertEmailTemplate {
  private static template: string;

  static loadTemplate(): void {
    if (!this.template) {
      const templatePath = path.join(__dirname, 'alertTemplate.html');
      this.template = fs.readFileSync(templatePath, 'utf-8');
    }
  }

  static render(data: AlertTemplateData): string {
    this.loadTemplate();

    let html = this.template;

    // Replace placeholders
    html = html.replace(/\{\{alertType\}\}/g, data.alertType);
    html = html.replace(/\{\{message\}\}/g, data.message);
    html = html.replace(/\{\{timestamp\}\}/g, data.timestamp || new Date().toLocaleString('es-ES'));

    // Handle conditional details section
    if (data.details) {
      html = html.replace(/\{\{#if details\}\}([\s\S]*?)\{\{\/if\}\}/g, '$1');
      html = html.replace(/\{\{details\}\}/g, data.details);
    } else {
      html = html.replace(/\{\{#if details\}\}([\s\S]*?)\{\{\/if\}\}/g, '');
    }

    // Replace URLs
    html = html.replace(/\{\{dashboardUrl\}\}/g, data.dashboardUrl || '#');
    html = html.replace(/\{\{alertsUrl\}\}/g, data.alertsUrl || '#');

    // Add alert class based on type
    const alertClass = this.getAlertClass(data.alertType);
    html = html.replace(/\{\{alertClass\}\}/g, alertClass);

    return html;
  }

  private static getAlertClass(alertType: string): string {
    const type = alertType.toLowerCase();
    if (type.includes('crítica') || type.includes('critical')) return 'alert-critical';
    if (type.includes('advertencia') || type.includes('warning')) return 'alert-warning';
    if (type.includes('información') || type.includes('info')) return 'alert-info';
    return 'alert-info';
  }
}
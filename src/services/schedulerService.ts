import { AlertService } from './alertService';

export class SchedulerService {
  private static instance: SchedulerService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  private constructor() {}

  public static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  /**
   * Inicia el scheduler para procesar alertas recurrentes y de reina
   */
  public start() {
    if (this.isRunning) {
      console.log('Scheduler ya está ejecutándose');
      return;
    }

    console.log('Iniciando scheduler de alertas recurrentes y de reina...');

    // Ejecutar inmediatamente al iniciar
    this.processRecurrentAlerts();

    // Programar ejecución cada hora (3600000 ms)
    this.intervalId = setInterval(() => {
      this.processRecurrentAlerts();
    }, 3600000); // 1 hora

    this.isRunning = true;
    console.log('Scheduler de alertas recurrentes y de reina iniciado correctamente');
  }

  /**
   * Detiene el scheduler
   */
  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Scheduler de alertas recurrentes y de reina detenido');
  }

  /**
   * Procesa las alertas recurrentes vencidas y alertas de reina
   */
  private async processRecurrentAlerts() {
    try {
      console.log('Procesando alertas recurrentes...');

      const alertasRecurrentes = await AlertService.generateRecurrentAlerts();

      console.log('Procesando alertas de reina...');
      const alertasReyna = await AlertService.generateQueenAlerts();

      const totalAlertas = alertasRecurrentes.length + alertasReyna.length;

      if (totalAlertas > 0) {
        console.log(`Se generaron ${alertasRecurrentes.length} alertas recurrentes y ${alertasReyna.length} alertas de reina`);
      } else {
        console.log('No hay alertas recurrentes o de reina pendientes');
      }

    } catch (error) {
      console.error('Error procesando alertas recurrentes o de reina:', error);
    }
  }

  /**
   * Verifica si el scheduler está ejecutándose
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Fuerza la ejecución inmediata de alertas recurrentes y de reina (para testing)
   */
  public async forceProcessRecurrentAlerts(): Promise<number> {
    console.log('Ejecutando procesamiento forzado de alertas recurrentes y de reina...');
    const alertasRecurrentes = await AlertService.generateRecurrentAlerts();
    const alertasReyna = await AlertService.generateQueenAlerts();
    const totalAlertas = alertasRecurrentes.length + alertasReyna.length;
    console.log(`Se generaron ${alertasRecurrentes.length} alertas recurrentes y ${alertasReyna.length} alertas de reina`);
    return totalAlertas;
  }
}

// Exportar instancia singleton
export const schedulerService = SchedulerService.getInstance();
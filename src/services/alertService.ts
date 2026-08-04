import prisma from '../prisma/client';
import { TipoAlerta, PrioridadAlerta } from '../generated/prisma/enums';
import { emailService } from './emailService';
import { AlertEmailTemplate } from '../templates/email/alertTemplate';

export interface CreateAlertData {
  titulo: string;
  mensaje: string;
  tipo: TipoAlerta;
  prioridad: PrioridadAlerta;
  usuarioId: string;
}

export interface CreateRecurrentAlertData {
  titulo: string;
  mensaje: string;
  tipo: TipoAlerta;
  prioridad: PrioridadAlerta;
  usuarioId: string;
  frecuenciaDias: number;
  entidadTipo: string;
  entidadId: string;
}

export class AlertService {
  /**
   * Crea una nueva alerta en la base de datos
   */
  static async createAlert(alertData: CreateAlertData) {
    try {
      const alerta = await prisma.alerta.create({
        data: {
          titulo: alertData.titulo,
          mensaje: alertData.mensaje,
          tipo: alertData.tipo,
          prioridad: alertData.prioridad,
          usuarioId: alertData.usuarioId,
        },
      });

      // Enviar email para alertas críticas
      if (alertData.prioridad === PrioridadAlerta.alta || alertData.prioridad === PrioridadAlerta.critica) {
        await this.sendAlertEmail(alerta, alertData.usuarioId);
      }

      // Registrar actividad de alerta
      try {
        await prisma.actividad.create({
          data: {
            tipo: 'alerta',
            titulo: alertData.titulo,
            descripcion: alertData.mensaje,
            entidadTipo: 'alerta',
            entidadId: alerta.id,
            entidadNombre: 'Sistema de Alertas',
            estado: alertData.prioridad === 'critica' || alertData.prioridad === 'alta' ? 'warning' : 'success',
            usuarioId: alertData.usuarioId
          }
        });
      } catch (activityError) {
        console.error('Error registrando actividad de alerta:', activityError);
      }

      return alerta;
    } catch (error) {
      console.error('Error creando alerta:', error);
      throw new Error('Error al crear la alerta');
    }
  }

  /**
   * Crea alertas recurrentes para una nueva entidad (colmena, enjambre, núcleo)
   */
  static async createRecurrentAlertsForEntity(
    entidadTipo: string,
    entidadId: string,
    entidadNombre: string,
    usuarioId: string
  ) {
    try {
      const alertasCreadas = [];

      switch (entidadTipo) {
        case 'colmena':
          const alertaColmena = await this.createRecurrentAlert({
            titulo: `Control rutinario de colmena: ${entidadNombre}`,
            mensaje: `Es momento de realizar el control rutinario de la colmena ${entidadNombre}. Verifique el estado general, población, reina y producción.`,
            tipo: TipoAlerta.control_rutinario,
            prioridad: PrioridadAlerta.media,
            usuarioId,
            frecuenciaDias: 15,
            entidadTipo: 'colmena',
            entidadId,
          });
          alertasCreadas.push(alertaColmena);
          break;

        case 'enjambre':
          const alertaEnjambre = await this.createRecurrentAlert({
            titulo: `Control rutinario de enjambre: ${entidadNombre}`,
            mensaje: `Es momento de verificar el desarrollo del enjambre ${entidadNombre}. Controle la alimentación y comportamiento.`,
            tipo: TipoAlerta.control_rutinario,
            prioridad: PrioridadAlerta.media,
            usuarioId,
            frecuenciaDias: 15,
            entidadTipo: 'enjambre',
            entidadId,
          });
          alertasCreadas.push(alertaEnjambre);
          break;

        case 'nucleo':
          const alertaNucleo = await this.createRecurrentAlert({
            titulo: `Control rutinario de núcleo: ${entidadNombre}`,
            mensaje: `Es momento de inspeccionar el núcleo ${entidadNombre}. Verifique el estado y cría.`,
            tipo: TipoAlerta.control_rutinario,
            prioridad: PrioridadAlerta.media,
            usuarioId,
            frecuenciaDias: 15,
            entidadTipo: 'nucleo',
            entidadId,
          });
          alertasCreadas.push(alertaNucleo);
          break;
      }

      return alertasCreadas;
    } catch (error) {
      console.error('Error creando alertas recurrentes para entidad:', error);
      throw new Error('Error al crear alertas recurrentes');
    }
  }

  /**
   * Genera alertas automáticas basadas en inspecciones
   */
  static async generateInspectionAlerts(inspeccionData: any, usuarioId: string) {
    const alerts: CreateAlertData[] = [];

    // Alerta por problemas de sanidad
    if (inspeccionData.estadoSanidad === 'enferma' || inspeccionData.estadoSanidad === 'cuarentena') {
      alerts.push({
        titulo: 'Problema de sanidad detectado',
        mensaje: `La colmena ${inspeccionData.colmena?.nombre || 'desconocida'} presenta problemas de sanidad. Estado: ${inspeccionData.estadoSanidad}. ${inspeccionData.observaciones ? 'Observaciones: ' + inspeccionData.observaciones : ''}`,
        tipo: TipoAlerta.sanidad,
        prioridad: PrioridadAlerta.alta,
        usuarioId,
      });
    }

    // Alerta por baja población
    if (inspeccionData.poblacion === 'Baja') {
      alerts.push({
        titulo: 'Población baja detectada',
        mensaje: `La colmena ${inspeccionData.colmena?.nombre || 'desconocida'} tiene población baja. Considere medidas para fortalecer la colmena.`,
        tipo: TipoAlerta.inspeccion,
        prioridad: PrioridadAlerta.media,
        usuarioId,
      });
    }

    // Alerta por baja producción
    if (inspeccionData.produccion === 'Baja') {
      alerts.push({
        titulo: 'Producción baja detectada',
        mensaje: `La colmena ${inspeccionData.colmena?.nombre || 'desconocida'} muestra baja producción. Revise las condiciones de la colmena.`,
        tipo: TipoAlerta.produccion,
        prioridad: PrioridadAlerta.baja,
        usuarioId,
      });
    }

    // Crear todas las alertas generadas
    const createdAlerts = [];
    for (const alert of alerts) {
      try {
        const createdAlert = await this.createAlert(alert);
        createdAlerts.push(createdAlert);
      } catch (error) {
        console.error('Error creando alerta automática:', error);
      }
    }

    return createdAlerts;
  }

  /**
   * Obtiene todas las alertas de un usuario
   */
  static async getUserAlerts(usuarioId: string, limit: number = 50) {
    try {
      const alerts = await prisma.alerta.findMany({
        where: { usuarioId },
        orderBy: { fechaCreacion: 'desc' },
        take: limit,
      });

      return alerts;
    } catch (error) {
      console.error('Error obteniendo alertas:', error);
      throw new Error('Error al obtener las alertas');
    }
  }

  /**
   * Marca una alerta como leída
   */
  static async markAsRead(alertId: string, usuarioId: string) {
    try {
      const updatedAlert = await prisma.alerta.updateMany({
        where: {
          id: alertId,
          usuarioId,
        },
        data: { leida: true },
      });

      if (updatedAlert.count === 0) {
        throw new Error('Alerta no encontrada');
      }

      return { success: true };
    } catch (error) {
      console.error('Error marcando alerta como leída:', error);
      throw new Error('Error al marcar la alerta como leída');
    }
  }

  /**
   * Crea una alerta recurrente para controles rutinarios
   */
  static async createRecurrentAlert(alertData: CreateRecurrentAlertData) {
    try {
      const proximaEjecucion = new Date();
      proximaEjecucion.setDate(proximaEjecucion.getDate() + alertData.frecuenciaDias);

      const alerta = await prisma.alerta.create({
        data: {
          titulo: alertData.titulo,
          mensaje: alertData.mensaje,
          tipo: alertData.tipo,
          prioridad: alertData.prioridad,
          usuarioId: alertData.usuarioId,
          esRecurrente: true,
          frecuenciaDias: alertData.frecuenciaDias,
          entidadTipo: alertData.entidadTipo,
          entidadId: alertData.entidadId,
          proximaEjecucion,
          activa: true,
        },
      });

      return alerta;
    } catch (error) {
      console.error('Error creando alerta recurrente:', error);
      throw new Error('Error al crear la alerta recurrente');
    }
  }

  /**
   * Genera alertas recurrentes vencidas
   */
  static async generateRecurrentAlerts() {
    try {
      const now = new Date();

      // Buscar alertas recurrentes activas que han vencido
      const alertasVencidas = await prisma.alerta.findMany({
        where: {
          esRecurrente: true,
          activa: true,
          proximaEjecucion: {
            lte: now,
          },
        },
      });

      const alertasGeneradas = [];

      for (const alertaBase of alertasVencidas) {
        try {
          // Verificar si la entidad aún existe y está activa
          const entidadActiva = await this.verificarEntidadActiva(
            alertaBase.entidadTipo!,
            alertaBase.entidadId!
          );

          if (!entidadActiva) {
            // Desactivar alerta si la entidad ya no existe o no está activa
            await prisma.alerta.update({
              where: { id: alertaBase.id },
              data: { activa: false },
            });
            continue;
          }

          // Crear nueva alerta basada en la recurrente
          const nuevaAlerta = await prisma.alerta.create({
            data: {
              titulo: alertaBase.titulo,
              mensaje: alertaBase.mensaje,
              tipo: alertaBase.tipo,
              prioridad: alertaBase.prioridad,
              usuarioId: alertaBase.usuarioId,
              esRecurrente: false, // Esta es la alerta generada, no la base recurrente
            },
          });

          // Actualizar la alerta recurrente con nueva fecha de próxima ejecución
          const nuevaProximaEjecucion = new Date(alertaBase.proximaEjecucion!);
          nuevaProximaEjecucion.setDate(
            nuevaProximaEjecucion.getDate() + alertaBase.frecuenciaDias!
          );

          await prisma.alerta.update({
            where: { id: alertaBase.id },
            data: {
              ultimaEjecucion: now,
              proximaEjecucion: nuevaProximaEjecucion,
            },
          });

          // Actualizar última alerta en la entidad
          await this.actualizarUltimaAlertaEntidad(
            alertaBase.entidadTipo!,
            alertaBase.entidadId!,
            now
          );

          alertasGeneradas.push(nuevaAlerta);

          // Enviar email si es prioridad alta o crítica
          if (alertaBase.prioridad === 'alta' || alertaBase.prioridad === 'critica') {
            await this.sendAlertEmail(nuevaAlerta, alertaBase.usuarioId);
          }

        } catch (error) {
          console.error(`Error procesando alerta recurrente ${alertaBase.id}:`, error);
        }
      }

      return alertasGeneradas;
    } catch (error) {
      console.error('Error generando alertas recurrentes:', error);
      throw new Error('Error al generar alertas recurrentes');
    }
  }

  /**
   * Verifica si una entidad está activa
   */
  private static async verificarEntidadActiva(entidadTipo: string, entidadId: string): Promise<boolean> {
    try {
      switch (entidadTipo) {
        case 'colmena':
          const colmena = await prisma.colmena.findUnique({
            where: { id: entidadId },
            select: { estado: true, alertasRecurrentesActivadas: true },
          });
          return colmena?.estado === 'activa' && colmena?.alertasRecurrentesActivadas === true;

        case 'enjambre':
          const enjambre = await prisma.enjambre.findUnique({
            where: { id: entidadId },
            select: { estado: true, alertasRecurrentesActivadas: true },
          });
          return enjambre?.estado === 'activo' && enjambre?.alertasRecurrentesActivadas === true;

        case 'nucleo':
          const nucleo = await prisma.nucleo.findUnique({
            where: { id: entidadId },
            select: { estado: true, alertasRecurrentesActivadas: true },
          });
          return nucleo?.estado === 'en_formacion' || nucleo?.estado === 'en_desarrollo' || nucleo?.estado === 'listo';

        default:
          return false;
      }
    } catch (error) {
      console.error('Error verificando entidad activa:', error);
      return false;
    }
  }

  /**
   * Actualiza la fecha de última alerta en la entidad
   */
  private static async actualizarUltimaAlertaEntidad(
    entidadTipo: string,
    entidadId: string,
    fecha: Date
  ) {
    try {
      switch (entidadTipo) {
        case 'colmena':
          await prisma.colmena.update({
            where: { id: entidadId },
            data: { ultimaAlertaControl: fecha },
          });
          break;

        case 'enjambre':
          await prisma.enjambre.update({
            where: { id: entidadId },
            data: { ultimaAlertaControl: fecha },
          });
          break;

        case 'nucleo':
          await prisma.nucleo.update({
            where: { id: entidadId },
            data: { ultimaAlertaControl: fecha },
          });
          break;
      }
    } catch (error) {
      console.error('Error actualizando última alerta en entidad:', error);
    }
  }

  /**
   * Genera alertas relacionadas con la fecha de la reina
   */
  static async generateQueenAlerts() {
    try {
      const now = new Date();
      const alertasGeneradas = [];

      // Buscar colmenas con fechaReyna no nula y estado activa
      const colmenasConReyna = await prisma.colmena.findMany({
        where: {
          fechaReyna: {
            not: null,
          },
          estado: 'activa',
        },
        include: {
          usuario: {
            select: { id: true, nombre: true },
          },
          apiario: {
            select: { nombre: true },
          },
        },
      });

      for (const colmena of colmenasConReyna) {
        if (!colmena.fechaReyna) continue;

        const fechaReyna = new Date(colmena.fechaReyna);
        const edadReynaMeses = Math.floor((now.getTime() - fechaReyna.getTime()) / (1000 * 60 * 60 * 24 * 30));

        // Calcular fechas críticas
        const fechaDosAnios = new Date(fechaReyna);
        fechaDosAnios.setFullYear(fechaDosAnios.getFullYear() + 2);

        const fechaCincoAnios = new Date(fechaReyna);
        fechaCincoAnios.setFullYear(fechaCincoAnios.getFullYear() + 5);

        // Alerta fija: 6 meses antes de los 2 años (18 meses de edad)
        const fechaAlertaDosAnios = new Date(fechaReyna);
        fechaAlertaDosAnios.setMonth(fechaAlertaDosAnios.getMonth() + 18);

        // Alerta fija: 3 meses antes de los 5 años (57 meses de edad)
        const fechaAlertaCincoAnios = new Date(fechaReyna);
        fechaAlertaCincoAnios.setMonth(fechaAlertaCincoAnios.getMonth() + 57);

        // Verificar si ya existe alerta para esta colmena y fecha crítica
        const alertaExistenteDosAnios = await prisma.alerta.findFirst({
          where: {
            entidadTipo: 'colmena',
            entidadId: colmena.id,
            titulo: {
              contains: 'reemplazo de reina',
            },
            fechaCreacion: {
              gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Últimas 24 horas
            },
          },
        });

        // Crear alerta fija para reemplazo a los 2 años si no existe y estamos en la fecha crítica
        if (!alertaExistenteDosAnios && now >= fechaAlertaDosAnios && now < fechaDosAnios) {
          const alertaDosAnios = await this.createAlert({
            titulo: `Reemplazo de reina programado: ${colmena.nombre}`,
            mensaje: `La reina de la colmena ${colmena.nombre} en el apiario ${colmena.apiario.nombre} cumple 2 años en ${fechaDosAnios.toLocaleDateString('es-ES')}. Considere programar el reemplazo de la reina para mantener la productividad de la colmena.`,
            tipo: TipoAlerta.mantenimiento,
            prioridad: PrioridadAlerta.alta,
            usuarioId: colmena.usuarioId,
          });
          alertasGeneradas.push(alertaDosAnios);
        }

        // Crear alerta fija para reemplazo a los 5 años si no existe y estamos en la fecha crítica
        const alertaExistenteCincoAnios = await prisma.alerta.findFirst({
          where: {
            entidadTipo: 'colmena',
            entidadId: colmena.id,
            titulo: {
              contains: 'reina de 5 años',
            },
            fechaCreacion: {
              gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Últimas 24 horas
            },
          },
        });

        if (!alertaExistenteCincoAnios && now >= fechaAlertaCincoAnios && now < fechaCincoAnios) {
          const alertaCincoAnios = await this.createAlert({
            titulo: `Reina de 5 años: ${colmena.nombre}`,
            mensaje: `La reina de la colmena ${colmena.nombre} en el apiario ${colmena.apiario.nombre} cumple 5 años en ${fechaCincoAnios.toLocaleDateString('es-ES')}. Es altamente recomendable reemplazar la reina para evitar problemas de productividad y enjambrazón.`,
            tipo: TipoAlerta.mantenimiento,
            prioridad: PrioridadAlerta.critica,
            usuarioId: colmena.usuarioId,
          });
          alertasGeneradas.push(alertaCincoAnios);
        }

        // Crear alerta recurrente mensual en el último mes antes de los 2 años
        const mesesHastaDosAnios = Math.floor((fechaDosAnios.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30));

        if (mesesHastaDosAnios <= 1 && mesesHastaDosAnios >= 0) {
          // Verificar si ya existe alerta recurrente para esta colmena
          const alertaRecurrenteExistente = await prisma.alerta.findFirst({
            where: {
              entidadTipo: 'colmena',
              entidadId: colmena.id,
              esRecurrente: true,
              titulo: {
                contains: 'recordatorio mensual',
              },
              activa: true,
            },
          });

          if (!alertaRecurrenteExistente) {
            const alertaRecurrente = await this.createRecurrentAlert({
              titulo: `Recordatorio mensual - Reemplazo de reina: ${colmena.nombre}`,
              mensaje: `Recordatorio mensual: La reina de la colmena ${colmena.nombre} cumple 2 años en ${fechaDosAnios.toLocaleDateString('es-ES')} (${mesesHastaDosAnios} meses restantes). Planifique el reemplazo de la reina.`,
              tipo: TipoAlerta.mantenimiento,
              prioridad: PrioridadAlerta.media,
              usuarioId: colmena.usuarioId,
              frecuenciaDias: 30, // Mensual
              entidadTipo: 'colmena',
              entidadId: colmena.id,
            });
            alertasGeneradas.push(alertaRecurrente);
          }
        }
      }

      return alertasGeneradas;
    } catch (error) {
      console.error('Error generando alertas de reina:', error);
      throw new Error('Error al generar alertas de reina');
    }
  }

  /**
   * Envía un email de alerta para alertas críticas
   */
  private static async sendAlertEmail(alerta: any, usuarioId: string) {
    try {
      // Obtener información del usuario
      const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { email: true, nombre: true },
      });

      if (!usuario?.email) {
        console.warn('Usuario sin email configurado, no se puede enviar alerta por email');
        return;
      }

      // Generar HTML del email usando la plantilla
      const htmlContent = AlertEmailTemplate.render({
        alertType: alerta.tipo,
        message: alerta.mensaje,
        details: `Título: ${alerta.titulo}\nTipo: ${alerta.tipo}\nPrioridad: ${alerta.prioridad}\nFecha: ${alerta.fechaCreacion.toLocaleString('es-ES')}`,
        dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard`,
        alertsUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/alerts`,
      });

      // Enviar email
      const emailSent = await emailService.sendEmail({
        to: usuario.email,
        subject: `🚨 Alerta Crítica: ${alerta.titulo}`,
        html: htmlContent,
      });

      if (emailSent) {
        console.log(`Email de alerta enviado a ${usuario.email}`);
      } else {
        console.error('Error enviando email de alerta');
      }
    } catch (error) {
      console.error('Error enviando email de alerta:', error);
      // No lanzamos error para no interrumpir la creación de la alerta
    }
  }
}

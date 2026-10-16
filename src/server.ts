import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { jwt } from '@elysiajs/jwt';
import logger from './utils/logger';
import { errorHandler } from './middleware/errorHandler';

// Import routes
import authRoutes from './routes/auth';
import apiariosRoutes from './routes/apiarios';
import colmenasRoutes from './routes/colmenas';
import inspeccionesRoutes from './routes/inspecciones';
import enjambresRoutes from './routes/enjambres';
import nucleosRoutes from './routes/nucleos';
import produccionRoutes from './routes/produccion';
import finanzasRoutes from './routes/finanzas';
import usuariosRoutes from './routes/usuarios';
import dashboardRoutes from './routes/dashboard';
import alertasRoutes from './routes/alertas';
import insumosRoutes from './routes/insumos';
import exchangeRatesRoutes from './routes/exchangeRates';
import reportesRoutes from './routes/reportes';
import adminRoutes from './routes/admin';
import casosSanitariosRoutes from './routes/casosSanitarios';
import aiRoutes from './routes/ai';
import mcpRoutes from './routes/mcp';
import { initAi, shutdownAi } from './ai/hive';
import { ready } from './db';
import { schedulerService } from './services/schedulerService';

const PORT = process.env.PORT || 3001;
const apiVersion = process.env.API_VERSION || 'v1';

// Verify database connection
ready()
  .then(() => {
    logger.info('✅ Conexión a la base de datos establecida');

    // Start scheduler service for recurrent alerts
    schedulerService.start();
  })
  .catch((error: any) => {
    logger.error({ error }, '❌ Error al conectar con la base de datos');
    process.exit(1);
  });

// Hive SDK (agentes + MCP). Un fallo aquí no tumba la API: el asistente responde "no disponible".
initAi().catch((error: any) => {
  const locked = /already open|acquire lock/i.test(String(error?.message));
  logger.error(
    { error: error?.message ?? error },
    locked
      ? '❌ HiveDB ya está abierta por OTRO proceso (¿dos servidores corriendo?). Deja uno solo o usa otro HIVE_HOME; el asistente de IA queda deshabilitado en este'
      : '❌ No se pudo iniciar Hive SDK; el asistente de IA queda deshabilitado',
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    shutdownAi().finally(() => process.exit(0));
  });
}

const app = new Elysia()
  .use(errorHandler)
  .use(cors({
    origin: (() => {
      const corsOrigin = process.env.CORS_ORIGIN;
      if (!corsOrigin) return '*';
      const origins = corsOrigin.split(',').map(o => o.trim()).filter(Boolean);
      return origins.length === 1 ? origins[0] : origins;
    })(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Mcp-Protocol-Version']
  }))
  .onRequest(({ request }) => {
    console.log('CORS DEBUG: Incoming request:', {
      method: request.method,
      url: request.url,
      origin: request.headers.get('origin'),
      host: request.headers.get('host'),
      'user-agent': request.headers.get('user-agent')
    });
  })
  .use(jwt({
    name: 'jwt',
    secret: process.env.JWT_SECRET || 'fallback-secret'
  }))
  // Health check endpoint
  .get('/health', () => ({
    success: true,
    message: 'ApiGestión Pro API está funcionando correctamente',
    timestamp: new Date().toISOString(),
    version: apiVersion
  }))
  // API Routes
  .group(`/api/${apiVersion}`, (app) =>
    app
      // Antes que cualquier ruta con authGuard global: el MCP responde su propio 401 (WWW-Authenticate)
      .use(mcpRoutes)
      .use(authRoutes)
      .use(apiariosRoutes)
      .use(colmenasRoutes)
      .use(inspeccionesRoutes)
      .use(enjambresRoutes)
      .use(nucleosRoutes)
      .use(produccionRoutes)
      .use(finanzasRoutes)
      .use(usuariosRoutes)
      .use(dashboardRoutes)
      .use(alertasRoutes)
      .use(insumosRoutes)
      .use(exchangeRatesRoutes)
      .use(reportesRoutes)
      .use(adminRoutes)
      .use(casosSanitariosRoutes)
      .use(aiRoutes)
  )
  .listen(PORT, () => {
    logger.info(`🐝 ApiGestión Pro API ejecutándose en puerto ${PORT}`);
    logger.info(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`📊 Health check: http://localhost:${PORT}/health`);
    logger.info('✅ Conexión a la base de datos confirmada al iniciar el servidor');
  });

export default app;

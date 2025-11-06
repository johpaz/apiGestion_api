import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { jwt } from '@elysiajs/jwt';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

// Import routes
import authRoutes from './routes/auth.js';
import apiariosRoutes from './routes/apiarios.js';
import colmenasRoutes from './routes/colmenas.js';
import inspeccionesRoutes from './routes/inspecciones.js';
import enjambresRoutes from './routes/enjambres.js';
import nucleosRoutes from './routes/nucleos.js';
import produccionRoutes from './routes/produccion.js';
import finanzasRoutes from './routes/finanzas.js';
import usuariosRoutes from './routes/usuarios.js';
import dashboardRoutes from './routes/dashboard.js';
import alertasRoutes from './routes/alertas.js';
import insumosRoutes from './routes/insumos.js';
import exchangeRatesRoutes from './routes/exchangeRates.js';
import reportesRoutes from './routes/reportes.js';
import prisma from './prisma/client.js';
import { schedulerService } from './services/schedulerService.js';

const PORT = process.env.PORT || 3001;
const apiVersion = process.env.API_VERSION || 'v1';

// Initialize Prisma connection
prisma.$connect()
  .then(() => {
    logger.info('✅ Conexión a la base de datos Prisma establecida');

    // Start scheduler service for recurrent alerts
    schedulerService.start();
  })
  .catch((error: any) => {
    logger.error('❌ Error al conectar con la base de datos Prisma:', error);
    process.exit(1);
  });

const app = new Elysia()
  .use(errorHandler)
  .use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
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
  )
  .listen(PORT, () => {
    logger.info(`🐝 ApiGestión Pro API ejecutándose en puerto ${PORT}`);
    logger.info(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`📊 Health check: http://localhost:${PORT}/health`);
    logger.info('✅ Conexión a la base de datos confirmada al iniciar el servidor');
  });

export default app;
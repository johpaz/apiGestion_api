import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { jwt } from '@elysiajs/jwt';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

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
import prisma from './prisma/client';
import { schedulerService } from './services/schedulerService';

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
import { PrismaClient } from '../generated/prisma/client.js';
import logger from '../utils/logger.js';

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
});

// Logging de consultas
prisma.$on('query', (e: any) => {
  logger.info(`Prisma Query: ${e.query}`);
});

// Logging de información (incluye conexiones)
prisma.$on('info', (e: any) => {
  logger.info(`Prisma Info: ${e.message}`);
});

// Logging de advertencias
prisma.$on('warn', (e: any) => {
  logger.warn(`Prisma Warn: ${e.message}`);
});

// Logging de errores
prisma.$on('error', (e: any) => {
  logger.error(`Prisma Error: ${e.message}`);
});

export default prisma;

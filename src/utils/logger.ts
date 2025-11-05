import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = pino({
  level: 'info',
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});

export default logger;
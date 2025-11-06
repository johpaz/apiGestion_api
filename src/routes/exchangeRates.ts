import { Elysia } from 'elysia';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse } from '../types/apicola';
import prisma from '../prisma/client';
import { Moneda } from '../generated/prisma/client';

// Zod schemas for validation
const updateRateSchema = z.object({
  rate: z.number().positive('La tasa debe ser un número positivo')
});

const updateMultipleRatesSchema = z.object({
  rates: z.array(z.object({
    from: z.enum(['COP', 'EUR', 'USD']),
    to: z.enum(['COP', 'EUR', 'USD']),
    rate: z.number().positive('La tasa debe ser un número positivo')
  }))
});

const exchangeRatesRoutes = new Elysia({ prefix: '/exchange-rates' });

// GET /exchange-rates - Listar todas las tasas de cambio
exchangeRatesRoutes.get('/', async ({ headers }) => {
  try {
    const user = await authenticateToken({ headers });

    const rates = await prisma.exchangeRate.findMany({
      orderBy: { lastUpdated: 'desc' }
    });

    return {
      success: true,
      data: rates,
      message: 'Tasas de cambio obtenidas exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Get exchange rates error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// GET /exchange-rates/:from/:to - Obtener tasa específica
exchangeRatesRoutes.get('/:from/:to', async ({ params, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const { from, to } = params;

    if (!Object.values(Moneda).includes(from as Moneda) || !Object.values(Moneda).includes(to as Moneda)) {
      return {
        success: false,
        error: 'Monedas inválidas'
      } as ApiResponse;
    }

    const rate = await prisma.exchangeRate.findUnique({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: from as Moneda,
          toCurrency: to as Moneda
        }
      }
    });

    if (!rate) {
      return {
        success: false,
        error: 'Tasa de cambio no encontrada'
      } as ApiResponse;
    }

    return {
      success: true,
      data: rate,
      message: 'Tasa de cambio obtenida exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Get specific exchange rate error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// PUT /exchange-rates/:from/:to - Actualizar tasa de cambio manualmente
exchangeRatesRoutes.put('/:from/:to', async ({ params, body, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const { from, to } = params;
    const validatedData = updateRateSchema.parse(body);

    if (!Object.values(Moneda).includes(from as Moneda) || !Object.values(Moneda).includes(to as Moneda)) {
      return {
        success: false,
        error: 'Monedas inválidas'
      } as ApiResponse;
    }

    const updatedRate = await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency: {
          fromCurrency: from as Moneda,
          toCurrency: to as Moneda
        }
      },
      update: {
        rate: validatedData.rate,
        lastUpdated: new Date()
      },
      create: {
        fromCurrency: from as Moneda,
        toCurrency: to as Moneda,
        rate: validatedData.rate
      }
    });

    return {
      success: true,
      data: updatedRate,
      message: 'Tasa de cambio actualizada exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Update exchange rate error:', error);
    if (error.name === 'ZodError') {
      return {
        success: false,
        error: 'Datos de entrada inválidos',
        data: error.errors
      } as ApiResponse;
    }
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// PUT /exchange-rates - Actualizar múltiples tasas de cambio
exchangeRatesRoutes.put('/', async ({ body, headers }) => {
  try {
    const user = await authenticateToken({ headers });
    const validatedData = updateMultipleRatesSchema.parse(body);

    const updates = validatedData.rates.map(async (rateData) => {
      return prisma.exchangeRate.upsert({
        where: {
          fromCurrency_toCurrency: {
            fromCurrency: rateData.from,
            toCurrency: rateData.to
          }
        },
        update: {
          rate: rateData.rate,
          lastUpdated: new Date()
        },
        create: {
          fromCurrency: rateData.from,
          toCurrency: rateData.to,
          rate: rateData.rate
        }
      });
    });

    const results = await Promise.all(updates);

    return {
      success: true,
      data: results,
      message: 'Tasas de cambio actualizadas exitosamente'
    } as ApiResponse;
  } catch (error: any) {
    console.error('Update multiple exchange rates error:', error);
    if (error.name === 'ZodError') {
      return {
        success: false,
        error: 'Datos de entrada inválidos',
        data: error.errors
      } as ApiResponse;
    }
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

// POST /exchange-rates/update-from-api - Actualizar tasas desde API externa
exchangeRatesRoutes.post('/update-from-api', async ({ headers, body }) => {
  try {
    const user = await authenticateToken({ headers });
    const { apiKey, baseCurrency = 'USD' } = body as { apiKey?: string; baseCurrency?: string };

    // Aquí iría la lógica para obtener tasas desde una API externa
    // Por ejemplo, usando fixer.io, exchangerate-api.com, etc.

    // Simulación de actualización desde API externa (ExchangeRate-API)
    // En producción, reemplazar con llamada real a la API
    const fetchRatesFromAPI = async () => {
      try {
        // Simular llamada a API externa
        // const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${baseCurrency}`);
        // const data = await response.json();

        // Simulación de respuesta de API
        const mockApiResponse = {
          rates: {
            COP: 4100,
            EUR: 0.92,
            USD: 1
          },
          base: baseCurrency,
          date: new Date().toISOString()
        };

        return mockApiResponse;
      } catch (error) {
        console.error('Error fetching from external API:', error);
        throw new Error('No se pudo obtener tasas desde API externa');
      }
    };

    const apiData = await fetchRatesFromAPI();
    const rates = apiData.rates;

    // Convertir las tasas obtenidas a nuestro formato
    const rateUpdates = [];

    // Para cada moneda en las tasas, crear las conversiones necesarias
    for (const [currency, rate] of Object.entries(rates)) {
      if (currency !== baseCurrency) {
        rateUpdates.push({
          from: baseCurrency as Moneda,
          to: currency as Moneda,
          rate: rate as number
        });

        // También crear la tasa inversa
        rateUpdates.push({
          from: currency as Moneda,
          to: baseCurrency as Moneda,
          rate: 1 / (rate as number)
        });
      }
    }

    // Actualizar tasas en la base de datos
    const updates = rateUpdates.map(async (rateData) => {
      return prisma.exchangeRate.upsert({
        where: {
          fromCurrency_toCurrency: {
            fromCurrency: rateData.from,
            toCurrency: rateData.to
          }
        },
        update: {
          rate: rateData.rate,
          lastUpdated: new Date()
        },
        create: {
          fromCurrency: rateData.from,
          toCurrency: rateData.to,
          rate: rateData.rate
        }
      });
    });

    const results = await Promise.all(updates);

    return {
      success: true,
      data: {
        rates: results,
        source: 'external_api',
        baseCurrency,
        lastUpdated: new Date().toISOString()
      },
      message: `Tasas actualizadas desde API externa (${baseCurrency}) exitosamente`
    } as ApiResponse;
  } catch (error: any) {
    console.error('Update from API error:', error);
    return {
      success: false,
      error: error.message || 'Error interno del servidor'
    } as ApiResponse;
  }
});

export default exchangeRatesRoutes;
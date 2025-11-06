import prisma from '../prisma/client.js';
import { Moneda } from '../generated/prisma/enums.js';

export type Currency = 'COP' | 'EUR' | 'USD';

export interface CurrencyConversion {
  from: Currency;
  to: Currency;
  amount: number;
  convertedAmount: number;
  rate: number;
}

export class CurrencyService {
  // Tasas de cambio fijas como respaldo
  private static readonly FALLBACK_RATES = {
    'USD_COP': parseFloat(process.env.USD_TO_COP_RATE || '4000'),
    'EUR_USD': parseFloat(process.env.EUR_TO_USD_RATE || '1.05'),
    'EUR_COP': parseFloat(process.env.EUR_TO_COP_RATE || '4200'),
  };

  /**
   * Convierte un monto de una moneda a otra
   */
  static async convert(amount: number, from: Currency, to: Currency): Promise<CurrencyConversion> {
    if (amount < 0) {
      throw new Error('El monto debe ser positivo');
    }

    if (from === to) {
      return {
        from,
        to,
        amount,
        convertedAmount: amount,
        rate: 1,
      };
    }

    const rate = await this.getExchangeRate(from, to);

    return {
      from,
      to,
      amount,
      convertedAmount: amount * rate,
      rate,
    };
  }

  /**
   * Obtiene la tasa de cambio entre dos monedas desde la base de datos
   */
  static async getExchangeRate(from: Currency, to: Currency): Promise<number> {
    if (from === to) {
      return 1;
    }

    try {
      // Intentar obtener la tasa directa desde la base de datos
      const directRate = await prisma.exchangeRate.findUnique({
        where: {
          fromCurrency_toCurrency: {
            fromCurrency: from as Moneda,
            toCurrency: to as Moneda
          }
        }
      });

      if (directRate) {
        return directRate.rate;
      }

      // Intentar obtener la tasa inversa y calcular
      const inverseRate = await prisma.exchangeRate.findUnique({
        where: {
          fromCurrency_toCurrency: {
            fromCurrency: to as Moneda,
            toCurrency: from as Moneda
          }
        }
      });

      if (inverseRate) {
        return 1 / inverseRate.rate;
      }

      // Conversiones indirectas a través de USD
      if (from === 'COP' && to === 'EUR') {
        const usdToCop = await this.getExchangeRate('USD', 'COP');
        const eurToUsd = await this.getExchangeRate('EUR', 'USD');
        return usdToCop / eurToUsd;
      }
      if (from === 'EUR' && to === 'COP') {
        const usdToCop = await this.getExchangeRate('USD', 'COP');
        const eurToUsd = await this.getExchangeRate('EUR', 'USD');
        return usdToCop * eurToUsd;
      }
      if (from === 'COP' && to === 'USD') {
        const usdToCop = await this.getExchangeRate('USD', 'COP');
        return 1 / usdToCop;
      }
      if (from === 'USD' && to === 'COP') {
        const usdToCop = await this.getExchangeRate('USD', 'COP');
        return usdToCop;
      }

      // Si no se encuentra en la base de datos, usar tasas de respaldo
      return this.getFallbackRate(from, to);
    } catch (error) {
      console.error('Error obteniendo tasa de cambio desde DB:', error);
      // En caso de error, usar tasas de respaldo
      return this.getFallbackRate(from, to);
    }
  }

  /**
   * Obtiene tasa de cambio de respaldo (tasas fijas)
   */
  private static getFallbackRate(from: Currency, to: Currency): number {
    const directKey = `${from}_${to}`;
    if (this.FALLBACK_RATES[directKey as keyof typeof this.FALLBACK_RATES]) {
      return this.FALLBACK_RATES[directKey as keyof typeof this.FALLBACK_RATES];
    }

    const inverseKey = `${to}_${from}`;
    if (this.FALLBACK_RATES[inverseKey as keyof typeof this.FALLBACK_RATES]) {
      return 1 / this.FALLBACK_RATES[inverseKey as keyof typeof this.FALLBACK_RATES];
    }

    // Conversiones indirectas con tasas de respaldo
    if (from === 'COP' && to === 'EUR') {
      return 1 / this.FALLBACK_RATES.EUR_COP;
    }
    if (from === 'EUR' && to === 'COP') {
      return this.FALLBACK_RATES.EUR_COP;
    }
    if (from === 'COP' && to === 'USD') {
      return 1 / this.FALLBACK_RATES.USD_COP;
    }
    if (from === 'USD' && to === 'COP') {
      return this.FALLBACK_RATES.USD_COP;
    }

    throw new Error(`Tasa de cambio no disponible para ${from} a ${to}`);
  }

  /**
   * Formatea un monto con el símbolo de la moneda
   */
  static formatAmount(amount: number, currency: Currency): string {
    const formatter = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: currency === 'COP' ? 'COP' : currency === 'EUR' ? 'EUR' : 'USD',
      minimumFractionDigits: 2,
    });

    return formatter.format(amount);
  }

  /**
   * Convierte y formatea un monto
   */
  static async convertAndFormat(amount: number, from: Currency, to: Currency): Promise<string> {
    const conversion = await this.convert(amount, from, to);
    return this.formatAmount(conversion.convertedAmount, to);
  }

  /**
   * Obtiene todas las tasas de cambio disponibles (desde DB y respaldo)
   */
  static async getAllRates(): Promise<Record<string, number>> {
    try {
      const dbRates = await prisma.exchangeRate.findMany();
      const rates: Record<string, number> = {};

      // Agregar tasas desde DB
      dbRates.forEach((rate: { fromCurrency: Moneda; toCurrency: Moneda; rate: number }) => {
        rates[`${rate.fromCurrency}_${rate.toCurrency}`] = rate.rate;
      });

      // Agregar tasas de respaldo si no existen en DB
      Object.entries(this.FALLBACK_RATES).forEach(([key, value]) => {
        if (!rates[key]) {
          rates[key] = value;
        }
      });

      return rates;
    } catch (error) {
      console.error('Error obteniendo todas las tasas:', error);
      return { ...this.FALLBACK_RATES };
    }
  }
}
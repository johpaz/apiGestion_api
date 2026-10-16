import { z } from 'zod';
export const alertPageQuery = z.object({
  page: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  unreadOnly: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
});
export const getAlertPagination = (total: number, unreadCount: number, limit: number, requestedPage: number) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page: Math.min(requestedPage, totalPages), limit, total, totalPages, unreadCount };
};

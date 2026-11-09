/** Log only allowlisted codes/categories; driver messages can contain connection secrets. */
export function errorDiagnostic(error: unknown): string {
  const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
  const root = object(error), driver = object(object(root.meta).driverAdapterError), cause = object(driver.cause);
  const code = (value: unknown): string => typeof value === 'string' && /^[A-Z0-9_]{2,20}$/.test(value) ? value : 'unknown';
  const message = `${root.message ?? ''} ${cause.originalMessage ?? ''}`;
  const reasons: [string, RegExp][] = [
    ['session_pool_full', /MaxClientsInSessionMode|max clients reached.*session|session mode.*pool_size/i],
    ['connections_full', /too many clients|remaining connection slots|max client connections/i],
    ['pooler_unavailable', /circuit breaker|tenant or user not found/i],
    ['connection_closed', /connection.*(?:terminated|closed|reset)|ECONNRESET|EPIPE/i],
    ['connection_timeout', /timeout|timed out|ETIMEDOUT/i],
    ['certificate', /certificate|TLS|SSL/i],
  ];
  return `code=${code(root.code)}, databaseCode=${code(cause.originalCode)}, reason=${reasons.find(([, pattern]) => pattern.test(message))?.[0] ?? 'unknown'}`;
}

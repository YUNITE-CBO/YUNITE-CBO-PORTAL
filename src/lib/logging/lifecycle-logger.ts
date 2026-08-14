/**
 * Lightweight structured logging for process lifecycle and availability events.
 *
 * Uses console.log/warn/error (Render captures stdout/stderr). Does NOT log
 * secrets, tokens, auth headers, or member PII. Health requests use a low
 * noise level and are NOT logged per-request to avoid log spam from external
 * uptime monitors calling /health every ~10 min (req. #12).
 *
 * Output is single-line JSON for easy parsing by log aggregators.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
  [key: string]: string | number | boolean | null | undefined;
}

const SERVICE = 'yunite-cbo-api';

function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  const entry: Record<string, unknown> = {
    level,
    service: SERVICE,
    msg,
    ts: new Date().toISOString(),
    ...fields,
  };
  switch (level) {
    case 'error':
      console.error(JSON.stringify(entry));
      break;
    case 'warn':
      console.warn(JSON.stringify(entry));
      break;
    case 'debug':
      if (process.env.YUNITE_DEBUG_LOGGING === 'true') {
        console.debug(JSON.stringify(entry));
      }
      break;
    default:
      console.log(JSON.stringify(entry));
  }
}

export const lifecycleLogger = {
  startup(): void {
    emit('info', 'backend_started', { port: process.env.PORT || 'default' });
  },
  shutdown(): void {
    emit('info', 'backend_shutdown');
  },
  healthCheck(): void {
    emit('debug', 'health_check');
  },
  providerFailure(provider: string, reason: string): void {
    emit('warn', 'provider_connection_failed', { provider, reason });
  },
  databaseFailure(reason: string): void {
    emit('warn', 'database_connection_failed', { reason });
  },
  frontendReconnect(attempt: number): void {
    emit('info', 'frontend_reconnect_attempt', { attempt });
  },
};

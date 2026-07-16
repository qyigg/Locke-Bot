const ErrorCodes = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  DISCORD_API_ERROR: 'DISCORD_API_ERROR',
  USER_INPUT_ERROR: 'USER_INPUT_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERACTION_INVALID: 'INTERACTION_INVALID',
  INTERACTION_EXPIRED: 'INTERACTION_EXPIRED',
  INTERACTION_RESPONSE_FAILED: 'INTERACTION_RESPONSE_FAILED',
  INTERACTION_UNHANDLED: 'INTERACTION_UNHANDLED',
  TASK_ERROR: 'TASK_ERROR',
  UNHANDLED_REJECTION: 'UNHANDLED_REJECTION',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
});

const ErrorCodeRegistry = Object.freeze({
  [ErrorCodes.VALIDATION_FAILED]: {
    severity: 'low',
    retryable: false,
    remediation: 'Prüfe die Befehls-Eingaben vor der Verarbeitung und gib feldspezifische Hinweise zurück.'
  },
  [ErrorCodes.PERMISSION_DENIED]: {
    severity: 'low',
    retryable: false,
    remediation: 'Überprüfe die Rollen- und Berechtigungen von Bot und Benutzer sowie die benötigten Discord-Berechtigungen für diesen Befehl.'
  },
  [ErrorCodes.CONFIGURATION_ERROR]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Prüfe die erforderlichen Umgebungsvariablen und die Guild-Funktionskonfiguration.'
  },
  [ErrorCodes.DATABASE_ERROR]: {
    severity: 'high',
    retryable: true,
    remediation: 'Prüfe die Postgres-Verbindung, Pool-Auslastung, Statement-Timeouts und kürzliche Migrationen.'
  },
  [ErrorCodes.NETWORK_ERROR]: {
    severity: 'medium',
    retryable: true,
    remediation: 'Prüfe die Netzwerkerreichbarkeit, den Status des Upstream-Dienstes und das Retry-/Backoff-Verhalten.'
  },
  [ErrorCodes.DISCORD_API_ERROR]: {
    severity: 'high',
    retryable: true,
    remediation: 'Prüfe den Status der Discord-API, Rate-Limit-Antworten und die Gültigkeit des Bot-Tokens.'
  },
  [ErrorCodes.USER_INPUT_ERROR]: {
    severity: 'low',
    retryable: false,
    remediation: 'Prüfe vom Nutzer eingegebene IDs/Mentions und gib klarere Eingabe-Beispiele zurück.'
  },
  [ErrorCodes.RATE_LIMITED]: {
    severity: 'low',
    retryable: true,
    remediation: 'Nutze cooldown-bewusste Retries und reduziere burstartige Befehlsausführung.'
  },
  [ErrorCodes.INTERACTION_INVALID]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Stelle sicher, dass das Interaction-Objekt vor dem Antworten verfügbar und gültig ist.'
  },
  [ErrorCodes.INTERACTION_EXPIRED]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Defer oder antworte auf Interactions früher, um das 15-Minuten-Ablauf-Fenster zu vermeiden.'
  },
  [ErrorCodes.INTERACTION_RESPONSE_FAILED]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Prüfe den Acknowledgement-Status der Interaction und die Discord-Antwortfehlercodes.'
  },
  [ErrorCodes.INTERACTION_UNHANDLED]: {
    severity: 'high',
    retryable: false,
    remediation: 'Füge einen Handler für diesen Interaction-Typ hinzu oder registriere den fehlenden Button-/Modal-/Select-Handler.'
  },
  [ErrorCodes.TASK_ERROR]: {
    severity: 'high',
    retryable: true,
    remediation: 'Untersuche den benannten Hintergrundtask auf geworfene Fehler oder nicht wartete Promises.'
  },
  [ErrorCodes.UNHANDLED_REJECTION]: {
    severity: 'high',
    retryable: false,
    remediation: 'Finde das Promise, das ohne Catch-Handler abgelehnt wurde, und leite es über runSafeTask oder einen expliziten Catch weiter.'
  },
  [ErrorCodes.UNKNOWN_ERROR]: {
    severity: 'high',
    retryable: false,
    remediation: 'Erfasse Trace-Kontext und Stack und ordne diesen Fehler einem konkreten Fehlercode zu.'
  }
});

const TypeToErrorCode = Object.freeze({
  validation: ErrorCodes.VALIDATION_FAILED,
  permission: ErrorCodes.PERMISSION_DENIED,
  configuration: ErrorCodes.CONFIGURATION_ERROR,
  database: ErrorCodes.DATABASE_ERROR,
  network: ErrorCodes.NETWORK_ERROR,
  discord_api: ErrorCodes.DISCORD_API_ERROR,
  user_input: ErrorCodes.USER_INPUT_ERROR,
  rate_limit: ErrorCodes.RATE_LIMITED,
  unknown: ErrorCodes.UNKNOWN_ERROR
});

function normalizeErrorCode(errorCode) {
  if (errorCode === null || errorCode === undefined) {
    return null;
  }

  return String(errorCode).trim().toUpperCase();
}

export function getErrorMetadata(errorCode) {
  const normalized = normalizeErrorCode(errorCode);
  if (!normalized) {
    return ErrorCodeRegistry[ErrorCodes.UNKNOWN_ERROR];
  }

  return ErrorCodeRegistry[normalized] || ErrorCodeRegistry[ErrorCodes.UNKNOWN_ERROR];
}

export function getDefaultErrorCodeByType(errorType = 'unknown') {
  return TypeToErrorCode[errorType] || ErrorCodes.UNKNOWN_ERROR;
}

export function resolveErrorCode({ error, errorType = 'unknown', context = {} } = {}) {
  const contextCode = normalizeErrorCode(context?.errorCode);
  if (contextCode) {
    return contextCode;
  }

  const nestedContextCode = normalizeErrorCode(error?.context?.errorCode);
  if (nestedContextCode) {
    return nestedContextCode;
  }

  const code = normalizeErrorCode(error?.code);
  if (code) {
    return code;
  }

  return getDefaultErrorCodeByType(errorType);
}

export { ErrorCodes, ErrorCodeRegistry, TypeToErrorCode };

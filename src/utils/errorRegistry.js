const FehlerCodes = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  KONFIGURATIONSFEHLER: 'KONFIGURATIONSFEHLER',
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

const FehlerCodeRegistry = Object.freeze({
  [FehlerCodes.VALIDATION_FAILED]: {
    severity: 'low',
    retryable: false,
    remediation: 'Prüfe die Befehls-Eingaben vor der Verarbeitung und gib feldspezifische Hinweise zurück.'
  },
  [FehlerCodes.PERMISSION_DENIED]: {
    severity: 'low',
    retryable: false,
    remediation: 'Überprüfe die Rollen- und Berechtigungen von Bot und Benutzer sowie die benötigten Discord-Berechtigungen für diesen Befehl.'
  },
  [FehlerCodes.KONFIGURATIONSFEHLER]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Prüfe die erforderlichen Umgebungsvariablen und die Guild-Funktionskonfiguration.'
  },
  [FehlerCodes.DATABASE_ERROR]: {
    severity: 'high',
    retryable: true,
    remediation: 'Prüfe die Postgres-Verbindung, Pool-Auslastung, Statement-Timeouts und kürzliche Migrationen.'
  },
  [FehlerCodes.NETWORK_ERROR]: {
    severity: 'medium',
    retryable: true,
    remediation: 'Prüfe die Netzwerkerreichbarkeit, den Status des Upstream-Dienstes und das Retry-/Zurückoff-Verhalten.'
  },
  [FehlerCodes.DISCORD_API_ERROR]: {
    severity: 'high',
    retryable: true,
    remediation: 'Prüfe den Status der Discord-API, Rate-Limit-Antworten und die Gültigkeit des Bot-Tokens.'
  },
  [FehlerCodes.USER_INPUT_ERROR]: {
    severity: 'low',
    retryable: false,
    remediation: 'Prüfe vom Nutzer eingegebene IDs/Mentions und gib klarere Eingabe-Beispiele zurück.'
  },
  [FehlerCodes.RATE_LIMITED]: {
    severity: 'low',
    retryable: true,
    remediation: 'Nutze cooldown-bewusste Retries und reduziere burstartige Befehlsausführung.'
  },
  [FehlerCodes.INTERACTION_INVALID]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Stelle sicher, dass das Interaction-Objekt vor dem Antworten verfügbar und gültig ist.'
  },
  [FehlerCodes.INTERACTION_EXPIRED]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Defer oder antworte auf Interactions früher, um das 15-Minuten-Ablauf-Fenster zu vermeiden.'
  },
  [FehlerCodes.INTERACTION_RESPONSE_FAILED]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Prüfe den Acknowledgement-Status der Interaction und die Discord-Antwortfehlercodes.'
  },
  [FehlerCodes.INTERACTION_UNHANDLED]: {
    severity: 'high',
    retryable: false,
    remediation: 'Füge einen Handler für diesen Interaction-Typ hinzu oder registriere den fehlenden Button-/Modal-/Select-Handler.'
  },
  [FehlerCodes.TASK_ERROR]: {
    severity: 'high',
    retryable: true,
    remediation: 'Untersuche den benannten Hintergrundtask auf geworfene Fehler oder nicht wartete Promises.'
  },
  [FehlerCodes.UNHANDLED_REJECTION]: {
    severity: 'high',
    retryable: false,
    remediation: 'Finde das Promise, das ohne Catch-Handler abgelehnt wurde, und leite es über runSafeTask oder einen expliziten Catch weiter.'
  },
  [FehlerCodes.UNKNOWN_ERROR]: {
    severity: 'high',
    retryable: false,
    remediation: 'Erfasse Trace-Kontext und Stack und ordne diesen Fehler einem konkreten Fehlercode zu.'
  }
});

const TypeToFehlerCode = Object.freeze({
  validation: FehlerCodes.VALIDATION_FAILED,
  permission: FehlerCodes.PERMISSION_DENIED,
  configuration: FehlerCodes.KONFIGURATIONSFEHLER,
  database: FehlerCodes.DATABASE_ERROR,
  network: FehlerCodes.NETWORK_ERROR,
  discord_api: FehlerCodes.DISCORD_API_ERROR,
  user_input: FehlerCodes.USER_INPUT_ERROR,
  rate_limit: FehlerCodes.RATE_LIMITED,
  unknown: FehlerCodes.UNKNOWN_ERROR
});

function normalizeFehlerCode(errorCode) {
  if (errorCode === null || errorCode === undefined) {
    return null;
  }

  return String(errorCode).trim().toUpperCase();
}

export function getFehlerMetadata(errorCode) {
  const normalized = normalizeFehlerCode(errorCode);
  if (!normalized) {
    return FehlerCodeRegistry[FehlerCodes.UNKNOWN_ERROR];
  }

  return FehlerCodeRegistry[normalized] || FehlerCodeRegistry[FehlerCodes.UNKNOWN_ERROR];
}

export function getDefaultFehlerCodeByType(errorType = 'unknown') {
  return TypeToFehlerCode[errorType] || FehlerCodes.UNKNOWN_ERROR;
}

export function resolveFehlerCode({ error, errorType = 'unknown', context = {} } = {}) {
  const contextCode = normalizeFehlerCode(context?.errorCode);
  if (contextCode) {
    return contextCode;
  }

  const nestedContextCode = normalizeFehlerCode(error?.context?.errorCode);
  if (nestedContextCode) {
    return nestedContextCode;
  }

  const code = normalizeFehlerCode(error?.code);
  if (code) {
    return code;
  }

  return getDefaultFehlerCodeByType(errorType);
}

export { FehlerCodes, FehlerCodeRegistry, TypeToFehlerCode };

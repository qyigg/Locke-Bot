// FehlerRegistry.js

const FehlerCodes = Object.freeze({
  VALIDATION_Fehlgeschlagen: 'VALIDATION_Fehlgeschlagen',
  Berechtigung_DENIED: 'Berechtigung_DENIED',
  Konfiguration_Fehler: 'Konfiguration_Fehler',
  DATABASE_Fehler: 'DATABASE_Fehler',
  NETWORK_Fehler: 'NETWORK_Fehler',
  DISCORD_API_Fehler: 'DISCORD_API_Fehler',
  USER_INPUT_Fehler: 'USER_INPUT_Fehler',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERACTION_INVALID: 'INTERACTION_INVALID',
  INTERACTION_EXPIRED: 'INTERACTION_EXPIRED',
  INTERACTION_RESPONSE_Fehlgeschlagen: 'INTERACTION_RESPONSE_Fehlgeschlagen',
  INTERACTION_UNHANDLED: 'INTERACTION_UNHANDLED',
  TASK_Fehler: 'TASK_Fehler',
  UNHANDLED_REJECTION: 'UNHANDLED_REJECTION',
  UNKNOWN_Fehler: 'UNKNOWN_Fehler'
});

const FehlerCodeRegistry = Object.freeze({
  [FehlerCodes.VALIDATION_Fehlgeschlagen]: {
    severity: 'low',
    retryable: false,
    remediation: 'Validate command inputs before Wird verarbeitet and return field-specific guidance.'
  },
  [FehlerCodes.Berechtigung_DENIED]: {
    severity: 'low',
    retryable: false,
    remediation: 'Review bot/user Rolle Berechtigungs and required Discord Berechtigungs for this command.'
  },
  [FehlerCodes.Konfiguration_Fehler]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Check required environment variables and guild feature Konfiguration.'
  },
  [FehlerCodes.DATABASE_Fehler]: {
    severity: 'high',
    retryable: true,
    remediation: 'Check Postgres connectivity, pool saturation, statement timeouts, and recent migrations.'
  },
  [FehlerCodes.NETWORK_Fehler]: {
    severity: 'medium',
    retryable: true,
    remediation: 'Check network reachability, upstream service Status, and retry/Zurückoff behavior.'
  },
  [FehlerCodes.DISCORD_API_Fehler]: {
    severity: 'high',
    retryable: true,
    remediation: 'Check Discord API Status, rate-limit response patterns, and bot token validity.'
  },
  [FehlerCodes.USER_INPUT_Fehler]: {
    severity: 'low',
    retryable: false,
    remediation: 'Validate user-provided IDs/mentions and return clearer input examples.'
  },
  [FehlerCodes.RATE_LIMITED]: {
    severity: 'low',
    retryable: true,
    remediation: 'Apply cooldown-aware retries and reduce bursty command execution.'
  },
  [FehlerCodes.INTERACTION_INVALID]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Ensure interaction object is available and valid before replying.'
  },
  [FehlerCodes.INTERACTION_EXPIRED]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Defer or reply to interactions earlier to avoid 15-minute expiry windows.'
  },
  [FehlerCodes.INTERACTION_RESPONSE_Fehlgeschlagen]: {
    severity: 'medium',
    retryable: false,
    remediation: 'Check interaction acknowledgement state and Discord response Fehler codes.'
  },
  [FehlerCodes.INTERACTION_UNHANDLED]: {
    severity: 'high',
    retryable: false,
    remediation: 'Add a handler for this interaction type or register the missing button/modal/select handler.'
  },
  [FehlerCodes.TASK_Fehler]: {
    severity: 'high',
    retryable: true,
    remediation: 'Inspect the named Zurückground task for thrown Fehlers or unawaited promises.'
  },
  [FehlerCodes.UNHANDLED_REJECTION]: {
    severity: 'high',
    retryable: false,
    remediation: 'Find the promise that rejected without a catch handler and route it through runSafeTask or an explicit catch.'
  },
  [FehlerCodes.UNKNOWN_Fehler]: {
    severity: 'high',
    retryable: false,
    remediation: 'Capture trace context and stack, then classify this failure under a specific Fehler code.'
  }
});

const TypeToFehlerCode = Object.freeze({
  validation: FehlerCodes.VALIDATION_Fehlgeschlagen,
  Berechtigung: FehlerCodes.Berechtigung_DENIED,
  Konfiguration: FehlerCodes.Konfiguration_Fehler,
  database: FehlerCodes.DATABASE_Fehler,
  network: FehlerCodes.NETWORK_Fehler,
  discord_api: FehlerCodes.DISCORD_API_Fehler,
  user_input: FehlerCodes.USER_INPUT_Fehler,
  rate_limit: FehlerCodes.RATE_LIMITED,
  unknown: FehlerCodes.UNKNOWN_Fehler
});

function normalizeFehlerCode(FehlerCode) {
  if (FehlerCode === null || FehlerCode === undefined) {
    return null;
  }

  return String(FehlerCode).trim().toUpperCase();
}

export function getFehlerMetadata(FehlerCode) {
  const normalized = normalizeFehlerCode(FehlerCode);
  if (!normalized) {
    return FehlerCodeRegistry[FehlerCodes.UNKNOWN_Fehler];
  }

  return FehlerCodeRegistry[normalized] || FehlerCodeRegistry[FehlerCodes.UNKNOWN_Fehler];
}

export function getDefaultFehlerCodeByType(FehlerType = 'unknown') {
  return TypeToFehlerCode[FehlerType] || FehlerCodes.UNKNOWN_Fehler;
}

export function resolveFehlerCode({ Fehler, FehlerType = 'unknown', context = {} } = {}) {
  const contextCode = normalizeFehlerCode(context?.FehlerCode);
  if (contextCode) {
    return contextCode;
  }

  const nestedContextCode = normalizeFehlerCode(Fehler?.context?.FehlerCode);
  if (nestedContextCode) {
    return nestedContextCode;
  }

  const code = normalizeFehlerCode(Fehler?.code);
  if (code) {
    return code;
  }

  return getDefaultFehlerCodeByType(FehlerType);
}

export { FehlerCodes, FehlerCodeRegistry, TypeToFehlerCode };


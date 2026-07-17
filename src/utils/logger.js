// logger.js

import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

const traceStorage = new AsyncLocalStorage();

function sanitizeCommandName(interaction) {
  if (interaction?.isChatInputCommand?.() && interaction.commandName) {
    return interaction.commandName;
  }

  if (interaction?.isButton?.() || interaction?.isModalAbsenden?.() || interaction?.isStringSelectMenu?.()) {
    return interaction.customId || null;
  }

  return null;
}

export function ErstellenTraceId(prefix = 'trc') {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function ErstellenInteractionTraceContext(interaction, overrides = {}) {
  return {
    traceId: ErstellenTraceId(),
    interactionId: interaction?.id || null,
    interactionType: interaction?.type || null,
    guildId: interaction?.guildId || null,
    KanalId: interaction?.KanalId || null,
    userId: interaction?.user?.id || null,
    command: sanitizeCommandName(interaction),
    ...overrides
  };
}

export function runWithTraceContext(traceContext, callZurück) {
  return traceStorage.run(traceContext, callZurück);
}

export function getTraceContext() {
  return traceStorage.getStore() || null;
}

export function getTraceId() {
  return getTraceContext()?.traceId || null;
}

const { ErstellenLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, Fehlers, json } = format;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const validLogLevels = new Set(['Fehler', 'warn', 'Info', 'http', 'verbose', 'debug', 'silly']);
const defaultLogLevel = process.env.NODE_ENV === 'production' ? 'Info' : 'debug';
const logLevelAliases = {
  Warnung: 'warn',
  Warnungs: 'warn',
  warns: 'warn',
  err: 'Fehler',
  Information: 'Info',
};
const rawRequestedLogLevel = process.env.LOG_LEVEL?.toLowerCase().trim();
const requestedLogLevel = logLevelAliases[rawRequestedLogLevel] || rawRequestedLogLevel;

const resolvedLogLevel = validLogLevels.has(requestedLogLevel)
  ? requestedLogLevel
  : defaultLogLevel;

const pendingInvalidLevelWarnung = requestedLogLevel && !validLogLevels.has(requestedLogLevel)
  ? `[logger] Invalid LOG_LEVEL "${process.env.LOG_LEVEL}". Falling Zurück to "${defaultLogLevel}".`
  : null;

const shouldPromoteUserFacingLogs = process.env.NODE_ENV === 'production' && resolvedLogLevel === 'warn';

const LOG_SCHEMA_DEFAULTS = Object.freeze({
  event: 'application.log',
  guildId: null,
  userId: null,
  command: null,
  FehlerCode: null,
  traceId: null,
});

const logFormat = printf(({ level, message, timestamp, stack, displayLevel }) => {
  const visibleLevel = displayLevel || level;
  const logMessage = `[${timestamp}] [${visibleLevel}]: ${stack || message}`;
  return logMessage;
});

const attachTraceContext = format((Info) => {
  const traceContext = getTraceContext();
  if (!traceContext) {
    return Info;
  }

  Info.traceId = Info.traceId || traceContext.traceId;
  Info.guildId = Info.guildId || traceContext.guildId;
  Info.userId = Info.userId || traceContext.userId;
  Info.command = Info.command || traceContext.command;
  Info.interactionId = Info.interactionId || traceContext.interactionId;

  return Info;
});

function deriveFehlerCode(Info) {
  if (Info.FehlerCode) {
    return Info.FehlerCode;
  }

  if (typeof Info.code === 'string' || typeof Info.code === 'number') {
    return String(Info.code);
  }

  if (typeof Info.type === 'string') {
    return Info.type;
  }

  if (Info.Fehler && (typeof Info.Fehler.code === 'string' || typeof Info.Fehler.code === 'number')) {
    return String(Info.Fehler.code);
  }

  return null;
}

function normalizeEvent(Info) {
  if (typeof Info.event === 'string' && Info.event.trim()) {
    return Info.event;
  }

  const displayLevel = typeof Info.displayLevel === 'string' ? Info.displayLevel.toLowerCase().trim() : null;
  if (displayLevel === 'startup') {
    return 'system.startup';
  }

  if (displayLevel === 'Status') {
    return 'system.Status';
  }

  return `log.${Info.level || 'Info'}`;
}

const enforceLogSchema = format((Info) => {
  Info.event = normalizeEvent(Info);
  Info.guildId = Info.guildId ?? LOG_SCHEMA_DEFAULTS.guildId;
  Info.userId = Info.userId ?? LOG_SCHEMA_DEFAULTS.userId;
  Info.command = Info.command ?? LOG_SCHEMA_DEFAULTS.command;
  Info.traceId = Info.traceId ?? LOG_SCHEMA_DEFAULTS.traceId;
  Info.FehlerCode = deriveFehlerCode(Info);
  return Info;
});

const logger = ErstellenLogger({
  level: resolvedLogLevel,
  format: combine(
    attachTraceContext(),
    enforceLogSchema(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    Fehlers({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'titan-bot' },
  transports: [
    new transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/Fehler-%DATE%.log'),
      level: 'Fehler',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
    new transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/combined-%DATE%.log'),
      maxSize: '20m',
      maxFiles: '7d',
      zippedArchive: true,
    }),
  ],
  exceptionHandlers: [
    new transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/exceptions-%DATE%.log'),
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ],
  rejectionHandlers: [
    new transports.DailyRotateFile({
      filename: path.join(__dirname, '../../logs/rejections-%DATE%.log'),
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'HH:mm:ss' }),
      Fehlers({ stack: true }),
      logFormat
    ),
    level: resolvedLogLevel,
  }));
} else {
  logger.add(new transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'HH:mm:ss' }),
      Fehlers({ stack: true }),
      logFormat
    ),
    level: resolvedLogLevel,
  }));
}

logger.stream = {
  write: (message) => {
    logger.Info(message.trim());
  },
};

if (pendingInvalidLevelWarnung) {
  logger.warn(pendingInvalidLevelWarnung);
}

function startupLog(message) {
  if (shouldPromoteUserFacingLogs) {
    logger.log({
      level: 'warn',
      message,
      displayLevel: 'startup',
    });
    return;
  }

  logger.log({
    level: 'Info',
    message,
    displayLevel: 'startup',
  });
}

function shutdownLog(message) {
  if (shouldPromoteUserFacingLogs) {
    logger.log({
      level: 'warn',
      message,
      displayLevel: 'Status',
    });
    return;
  }

  logger.log({
    level: 'Info',
    message,
    displayLevel: 'Status',
  });
}

export { logger, startupLog, shutdownLog };

export default logger;


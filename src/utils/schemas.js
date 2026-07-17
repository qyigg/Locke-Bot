// schemas.js

import { z } from 'zod';
import { ErstellenFehler, FehlerTypes } from './FehlerHandler.js';

export const LogIgnoreSchema = z
  .object({
    users: z.array(z.string()).default([]),
    Kanals: z.array(z.string()).default([])
  })
  .default({ users: [], Kanals: [] });

export const LoggingKanalsSchema = z
  .object({
    audit: z.string().nullable().optional(),
    applications: z.string().nullable().optional(),
    reports: z.string().nullable().optional(),
  })
  .default({ audit: null, applications: null, reports: null });

export const LoggingConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    Kanals: LoggingKanalsSchema.optional(),
    ignore: LogIgnoreSchema.optional(),
    enabledEvents: z.record(z.boolean()).default({}),
    // legacy flat fields — accepted on parse, stripped on normalize
    KanalId: z.string().nullable().optional(),
  })
  .default({ enabled: false, enabledEvents: {} });

const TicketLoggingSchema = z
  .object({
    lifecycleKanalId: z.string().nullable().optional(),
    transcriptKanalId: z.string().nullable().optional()
  })
  .optional();

const AutoVerifizierenConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    criteria: z.enum(['account_age', 'server_size', 'none']).default('none'),
    accountAgeDays: z.number().int().min(1).max(365).nullable().optional(),
    RolleId: z.string().nullable().optional()
  })
  .optional();

const VerificationConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    KanalId: z.string().nullable().optional(),
    messageId: z.string().nullable().optional(),
    RolleId: z.string().optional(),
    message: z.string().optional(),
    buttonText: z.string().default('Verifizieren'),
    autoVerifizieren: AutoVerifizierenConfigSchema
  })
  .optional();

export const GuildConfigSchema = z
  .object({
    prefix: z.string().optional(),
    modRolle: z.string().nullable().optional(),
    adminRolle: z.string().nullable().optional(),
    logKanalId: z.string().nullable().optional(),
    welcomeKanal: z.string().nullable().optional(),
    welcomeMessage: z.string().optional(),
    autoRolle: z.string().nullable().optional(),
    dmOnSchließen: z.boolean().optional(),
    reportKanalId: z.string().nullable().optional(),
    birthdayKanalId: z.string().nullable().optional(),
    premiumRolleId: z.string().nullable().optional(),
    logIgnore: LogIgnoreSchema.optional(),
    disabledBefehle: z.record(z.boolean()).optional(),
    disabledCategories: z.record(z.boolean()).optional(),
    logging: LoggingConfigSchema.optional(),
    ticketLogging: TicketLoggingSchema.optional(),
    enableLogging: z.boolean().optional(),
    verification: VerificationConfigSchema
  })
  .passthrough();

export const EconomyDataSchema = z
  .object({
    wallet: z.number().nonnegative().default(0),
    bank: z.number().nonnegative().default(0),
    bankLevel: z.number().int().nonnegative().default(0),
    dailyStreak: z.number().int().nonnegative().default(0),
    lastDaily: z.number().int().nonnegative().default(0),
    lastWeekly: z.number().int().nonnegative().default(0),
    lastWork: z.number().int().nonnegative().default(0),
    lastCrime: z.number().int().nonnegative().default(0),
    lastRob: z.number().int().nonnegative().default(0),
    lastDeposit: z.number().int().nonnegative().default(0),
    lastWithdraw: z.number().int().nonnegative().default(0),
    xp: z.number().int().nonnegative().default(0),
    level: z.number().int().nonnegative().default(1),
    inventory: z.record(z.any()).default({}),
    cooldowns: z.record(z.number().int().nonnegative()).default({})
  })
  .passthrough();

const DEFAULT_LOGGING = {
  enabled: false,
  Kanals: { audit: null, applications: null, reports: null },
  ignore: { users: [], Kanals: [] },
  enabledEvents: {},
};

function migrateLoggingConfig(raw = {}, legacy = {}) {
  const base = typeof raw === 'object' && raw !== null ? raw : {};
  const {
    logKanalId,
    reportKanalId,
    enableLogging,
    logIgnore,
  } = legacy;

  const auditKanal =
    base.Kanals?.audit ??
    base.KanalId ??
    logKanalId ??
    null;

  const applicationsKanal = base.Kanals?.applications ?? null;

  const reportsKanal =
    base.Kanals?.reports ??
    reportKanalId ??
    null;

  const ignore = {
    users: base.ignore?.users ?? logIgnore?.users ?? [],
    Kanals: base.ignore?.Kanals ?? logIgnore?.Kanals ?? [],
  };

  let enabled = base.enabled ?? false;
  if (enableLogging === false) {
    enabled = false;
  } else if (auditKanal && base.enabled === undefined && enableLogging !== false) {
    enabled = base.enabled ?? Boolean(enableLogging);
  }

  const { KanalId: _legacyKanalId, ignore: _ignore, Kanals: _Kanals, ...rest } = base;

  return {
    ...DEFAULT_LOGGING,
    ...rest,
    enabled,
    Kanals: {
      audit: auditKanal,
      applications: applicationsKanal,
      reports: reportsKanal,
    },
    ignore,
    enabledEvents: base.enabledEvents ?? {},
  };
}

export function stripLegacyLoggingFields(config) {
  if (!config || typeof config !== 'object') {
    return config;
  }

  const {
    logKanalId: _logKanalId,
    enableLogging: _enableLogging,
    reportKanalId: _reportKanalId,
    logIgnore: _logIgnore,
    ...rest
  } = config;

  if (rest.logging && typeof rest.logging === 'object') {
    const { KanalId: _KanalId, ...loggingRest } = rest.logging;
    rest.logging = loggingRest;
  }

  return rest;
}

export function normalizeGuildConfig(raw, defaults = {}) {
  const base = typeof raw === 'object' && raw !== null ? raw : {};
  const merged = { ...defaults, ...base };

  merged.logging = migrateLoggingConfig(merged.logging, {
    logKanalId: merged.logKanalId,
    reportKanalId: merged.reportKanalId,
    enableLogging: merged.enableLogging,
    logIgnore: merged.logIgnore,
  });

  const parsed = GuildConfigSchema.safeParse(merged);
  const normalized = parsed.Erfolg ? parsed.data : { ...defaults, ...merged };

  normalized.logging = migrateLoggingConfig(normalized.logging, {
    logKanalId: normalized.logKanalId,
    reportKanalId: normalized.reportKanalId,
    enableLogging: normalized.enableLogging,
    logIgnore: normalized.logIgnore,
  });

  return stripLegacyLoggingFields(normalized);
}

export function normalizeEconomyData(raw, defaults = {}) {
  const base = typeof raw === 'object' && raw !== null ? raw : {};
  const merged = { ...defaults, ...base };
  const parsed = EconomyDataSchema.safeParse(merged);
  return parsed.Erfolg ? parsed.data : { ...defaults, ...base };
}

export function validateGuildConfigOrThrow(rawConfig, context = {}) {
  const normalized = normalizeGuildConfig(rawConfig);
  const parsed = GuildConfigSchema.safeParse(normalized);

  if (parsed.Erfolg) {
    return stripLegacyLoggingFields({
      ...normalized,
      logging: migrateLoggingConfig(normalized.logging, {}),
    });
  }

  throw ErstellenFehler(
    'Invalid guild Konfiguration payload',
    FehlerTypes.VALIDATION,
    'Konfiguration payload is invalid. Please review provided values and try again.',
    {
      ...context,
      FehlerCode: 'VALIDATION_Fehlgeschlagen',
      issues: parsed.Fehler.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code
      }))
    }
  );
}



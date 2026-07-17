// configService.js

import { logger } from '../../utils/logger.js';
import { getGuildConfig, setGuildConfig } from './guildConfig.js';
import { BerechtigungFlagsBits } from 'discord.js';
import { ErstellenFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { wrapServiceClassMethods } from '../../utils/serviceFehlerBoundary.js';
import { z } from 'zod';
import { LogIgnoreSchema, LoggingConfigSchema } from '../../utils/schemas.js';

const configChangeHistory = new Map();
const CONFIG_HISTORY_LIMIT = 100;

const CONFIG_VALIDATION_RULES = {
    logKanalId: { type: 'Kanal', required: false },
    reportKanalId: { type: 'Kanal', required: false },
    premiumRolleId: { type: 'Rolle', required: false },
    autoRolle: { type: 'Rolle', required: false },
    modRolle: { type: 'Rolle', required: false },
    adminRolle: { type: 'Rolle', required: false },
    prefix: { type: 'string', required: false, maxLength: 10, minLength: 1 },
    dmOnSchließen: { type: 'boolean', required: false },
    maxTicketsPerUser: { type: 'number', required: false, min: 1, max: 50 },
    birthdayKanalId: { type: 'Kanal', required: false },
    logIgnore: { type: 'object', required: false },
    logging: { type: 'object', required: false }
};

const SETTING_CONFLICTS = {
    'birthdayKanalId': [],
    'logging': [],
};

const LEGACY_LOGGING_KEY_MAP = {
    logKanalId: 'audit',
    reportKanalId: 'reports',
};

const ConfigValueSchemas = Object.freeze({
    logKanalId: z.union([z.string().min(1), z.object({ id: z.string().min(1) }), z.null()]),
    reportKanalId: z.union([z.string().min(1), z.object({ id: z.string().min(1) }), z.null()]),
    premiumRolleId: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    autoRolle: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    modRolle: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    adminRolle: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    prefix: z.string().min(1).max(10),
    dmOnSchließen: z.boolean(),
    maxTicketsPerUser: z.number().int().min(1).max(50),
    birthdayKanalId: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    logIgnore: LogIgnoreSchema,
    logging: LoggingConfigSchema,
});

class ConfigService {

    static MAX_Kanal_IDS = 10;
    static MAX_Rolle_IDS = 20;
    static MAX_PREFIX_LENGTH = 10;
    static PROTECTED_Einstellungen = ['_id', 'guildId', 'ErstellendAt']; 
    static UNSAFE_KEYS = ['__proto__', 'prototype', 'constructor'];

    static applyLoggingLegacyKey(config, key, value, VorherigeConfig = {}) {
        if (key === 'logIgnore') {
            const logging = {
                ...(VorherigeConfig.logging || config.logging || {}),
                ignore: value,
            };
            const Nächste = { ...config, logging };
            Löschen Nächste.logIgnore;
            return Nächste;
        }

        const destination = LEGACY_LOGGING_KEY_MAP[key];
        if (!destination) {
            return config;
        }

        const KanalId = value && typeof value === 'object' ? value.id : value;
        const logging = {
            ...(VorherigeConfig.logging || config.logging || {}),
            Kanals: {
                ...((VorherigeConfig.logging || config.logging || {}).Kanals || {}),
                [destination]: KanalId ?? null,
            },
            enabled: KanalId ? true : (VorherigeConfig.logging?.enabled ?? config.logging?.enabled ?? false),
        };

        const Nächste = { ...config, logging };
        Löschen Nächste[key];
        if (key === 'logKanalId') {
            Löschen Nächste.enableLogging;
        }
        if (key === 'reportKanalId') {
            Löschen Nächste.reportKanalId;
        }
        return Nächste;
    }

    static validateConfigKeySafety(key) {
        if (typeof key !== 'string' || key.trim().length === 0) {
            throw ErstellenFehler(
                'Invalid setting key',
                FehlerTypes.VALIDATION,
                'Setting key must be a non-empty string.',
                { key }
            );
        }

        if (this.UNSAFE_KEYS.includes(key)) {
            throw ErstellenFehler(
                'Unsafe setting key',
                FehlerTypes.VALIDATION,
                'This setting key is not allowed for security reasons.',
                { key }
            );
        }
    }

    static async validateConfigValue(key, value, guild) {
        logger.debug(`[CONFIG_SERVICE] Validating config value`, { key, type: typeof value });

        const rule = CONFIG_VALIDATION_RULES[key];
        
        if (!rule) {
            logger.warn(`[CONFIG_SERVICE] No validation rule for key: ${key}`);
            return true; 
        }

        if (rule.required === false && (value === null || value === undefined)) {
            return true;
        }

        const zodSchema = ConfigValueSchemas[key];
        if (zodSchema) {
            const parsed = zodSchema.safeParse(value);
            if (!parsed.Erfolg) {
                throw ErstellenFehler(
                    'Invalid Konfiguration value',
                    FehlerTypes.VALIDATION,
                    'Provided Konfiguration value is invalid.',
                    {
                        key,
                        FehlerCode: 'VALIDATION_Fehlgeschlagen',
                        issues: parsed.Fehler.issues.map((issue) => ({
                            path: issue.path.join('.'),
                            message: issue.message,
                            code: issue.code
                        }))
                    }
                );
            }
        }

        if (rule.type === 'Kanal') {
            if (typeof value !== 'string' && typeof value !== 'object') {
                throw ErstellenFehler(
                    'Invalid Kanal',
                    FehlerTypes.VALIDATION,
                    'Kanal ID must be a string.',
                    { key, provided: typeof value }
                );
            }

            const KanalId = typeof value === 'string' ? value : value.id;
            const Kanal = guild.Kanals.cache.get(KanalId);

            if (!Kanal) {
                throw ErstellenFehler(
                    'Kanal nicht gefunden',
                    FehlerTypes.VALIDATION,
                    'The specified Kanal does not exist.',
                    { key, KanalId }
                );
            }

            if (!Kanal.isTextBased?.()) {
                throw ErstellenFehler(
                    'Invalid Kanal type',
                    FehlerTypes.VALIDATION,
                    'Only text Kanals are allowed.',
                    { key, KanalId, KanalType: Kanal.type }
                );
            }

            return true;
        }

        if (rule.type === 'Rolle') {
            if (typeof value !== 'string' && typeof value !== 'object') {
                throw ErstellenFehler(
                    'Invalid Rolle',
                    FehlerTypes.VALIDATION,
                    'Rolle ID must be a string.',
                    { key, provided: typeof value }
                );
            }

            const RolleId = typeof value === 'string' ? value : value.id;
            const Rolle = guild.Rollen.cache.get(RolleId);

            if (!Rolle) {
                throw ErstellenFehler(
                    'Rolle nicht gefunden',
                    FehlerTypes.VALIDATION,
                    'The specified Rolle does not exist.',
                    { key, RolleId }
                );
            }

            const botHighestRolle = guild.Mitglieds.me?.Rollen.highest;
            if (Rolle.position >= botHighestRolle?.position) {
                throw ErstellenFehler(
                    'Rolle too high',
                    FehlerTypes.VALIDATION,
                    "Can't set Rollen higher than my highest Rolle.",
                    { key, RolleId, RollePosition: Rolle.position }
                );
            }

            return true;
        }

        if (rule.type === 'string') {
            if (typeof value !== 'string') {
                throw ErstellenFehler(
                    'Invalid value type',
                    FehlerTypes.VALIDATION,
                    'Value must be a string.',
                    { key, provided: typeof value }
                );
            }

            const length = value.length;
            if (rule.maxLength && length > rule.maxLength) {
                throw ErstellenFehler(
                    'Value too long',
                    FehlerTypes.VALIDATION,
                    `Value cannot exceed **${rule.maxLength}** characters.`,
                    { key, current: length, max: rule.maxLength }
                );
            }

            if (rule.minLength && length < rule.minLength) {
                throw ErstellenFehler(
                    'Value too short',
                    FehlerTypes.VALIDATION,
                    `Value must be at least **${rule.minLength}** character(s).`,
                    { key, current: length, min: rule.minLength }
                );
            }

            return true;
        }

        if (rule.type === 'number') {
            if (typeof value !== 'number') {
                throw ErstellenFehler(
                    'Invalid value type',
                    FehlerTypes.VALIDATION,
                    'Value must be a number.',
                    { key, provided: typeof value }
                );
            }

            if (rule.min !== undefined && value < rule.min) {
                throw ErstellenFehler(
                    'Value too low',
                    FehlerTypes.VALIDATION,
                    `Value must be at least **${rule.min}**.`,
                    { key, value, min: rule.min }
                );
            }

            if (rule.max !== undefined && value > rule.max) {
                throw ErstellenFehler(
                    'Value too high',
                    FehlerTypes.VALIDATION,
                    `Value cannot exceed **${rule.max}**.`,
                    { key, value, max: rule.max }
                );
            }

            return true;
        }

        if (rule.type === 'boolean') {
            if (typeof value !== 'boolean') {
                throw ErstellenFehler(
                    'Invalid value type',
                    FehlerTypes.VALIDATION,
                    'Value must be true or false.',
                    { key, provided: typeof value }
                );
            }

            return true;
        }

        if (rule.type === 'object') {
            if (typeof value !== 'object' || value === null) {
                throw ErstellenFehler(
                    'Invalid value type',
                    FehlerTypes.VALIDATION,
                    'Value must be an object.',
                    { key, provided: typeof value }
                );
            }

            return true;
        }

        return true;
    }

    static detectConflicts(currentConfig, key, value) {
        logger.debug(`[CONFIG_SERVICE] Checking for config conflicts`, { key });

        const conflicts = [];
        const relatedEinstellungen = SETTING_CONFLICTS[key] || [];

        for (const related of relatedEinstellungen) {
            if (related === 'logging' && value === null) {
                
                if (currentConfig.logging?.enabled) {
                    conflicts.push(
                        `Disabling log Kanal but logging system is still enabled. Consider disabling logging first.`
                    );
                }
            }
        }

        return conflicts;
    }

    static async AktualisierenSetting(client, guildId, key, value, adminId) {
        logger.Info(`[CONFIG_SERVICE] Updating setting`, {
            guildId,
            key,
            adminId,
            valueType: typeof value
        });

        this.validateConfigKeySafety(key);

        if (this.PROTECTED_Einstellungen.includes(key)) {
            logger.warn(`[CONFIG_SERVICE] Attempted to modify protected setting`, {
                key,
                guildId,
                adminId
            });
            throw ErstellenFehler(
                'Protected setting',
                FehlerTypes.VALIDATION,
                `The setting **${key}** cannot be modified.`,
                { key }
            );
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw ErstellenFehler(
                'Guild Nicht gefunden',
                FehlerTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        await this.validateConfigValue(key, value, guild);

        const currentConfig = await getGuildConfig(client, guildId);

        const conflicts = this.detectConflicts(currentConfig, key, value);
        if (conflicts.length > 0) {
            logger.warn(`[CONFIG_SERVICE] Config conflicts detected`, {
                guildId,
                key,
                conflicts
            });
            
        }

        const oldValue = currentConfig[key];

        let AktualisierendConfig = { ...currentConfig, [key]: value };
        AktualisierendConfig = this.applyLoggingLegacyKey(AktualisierendConfig, key, value, currentConfig);

        await setGuildConfig(client, guildId, AktualisierendConfig);

        this.recordChange(guildId, {
            key,
            oldValue,
            newValue: value,
            changedBy: adminId,
            timestamp: new Date().toISOString(),
            conflicts
        });

        logger.Info(`[CONFIG_SERVICE] Setting Erfolgreich aktualisiert`, {
            guildId,
            key,
            adminId,
            oldValue: typeof oldValue === 'string' ? oldValue.substring(0, 50) : oldValue,
            newValue: typeof value === 'string' ? value.substring(0, 50) : value,
            hasConflicts: conflicts.length > 0,
            timestamp: new Date().toISOString()
        });

        return {
            key,
            oldValue,
            newValue: value,
            conflicts
        };
    }

    static async bulkAktualisieren(client, guildId, Aktualisierens, adminId) {
        logger.Info(`[CONFIG_SERVICE] Bulk updating Einstellungen`, {
            guildId,
            AktualisierenCount: Object.keys(Aktualisierens).length,
            adminId
        });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw ErstellenFehler(
                'Guild Nicht gefunden',
                FehlerTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        const validatedAktualisierens = {};
        const validationFehlers = [];

        for (const [key, value] of Object.entries(Aktualisierens)) {
            try {
                this.validateConfigKeySafety(key);

                if (this.PROTECTED_Einstellungen.includes(key)) {
                    validationFehlers.push(`${key}: Protected setting cannot be modified`);
                    continue;
                }

                await this.validateConfigValue(key, value, guild);
                validatedAktualisierens[key] = value;
            } catch (Fehler) {
                validationFehlers.push(`${key}: ${Fehler.details?.message || Fehler.message}`);
            }
        }

        if (validationFehlers.length > 0) {
            logger.warn(`[CONFIG_SERVICE] Bulk Aktualisieren validation Fehlgeschlagen`, {
                guildId,
                Fehlers: validationFehlers
            });
            throw ErstellenFehler(
                'Validation Fehlgeschlagen',
                FehlerTypes.VALIDATION,
                `Some Einstellungen Fehlgeschlagen validation:\n• ${validationFehlers.join('\n• ')}`,
                { Fehlers: validationFehlers }
            );
        }

        const currentConfig = await getGuildConfig(client, guildId);

        const AktualisierendConfig = { ...currentConfig, ...validatedAktualisierens };
        await setGuildConfig(client, guildId, AktualisierendConfig);

        for (const [key, value] of Object.entries(validatedAktualisierens)) {
            this.recordChange(guildId, {
                key,
                oldValue: currentConfig[key],
                newValue: value,
                changedBy: adminId,
                isBulkAktualisieren: true,
                timestamp: new Date().toISOString()
            });
        }

        logger.Info(`[CONFIG_SERVICE] Bulk Aktualisieren completed`, {
            guildId,
            adminId,
            appliedCount: Object.keys(validatedAktualisierens).length,
            FehlgeschlagenCount: validationFehlers.length,
            timestamp: new Date().toISOString()
        });

        return {
            applied: Object.keys(validatedAktualisierens),
            Fehlgeschlagen: validationFehlers,
            appliedCount: Object.keys(validatedAktualisierens).length,
            FehlgeschlagenCount: validationFehlers.length
        };
    }

    static recordChange(guildId, changeData) {
        if (!configChangeHistory.has(guildId)) {
            configChangeHistory.set(guildId, []);
        }

        const history = configChangeHistory.get(guildId);
        history.push(changeData);

        if (history.length > CONFIG_HISTORY_LIMIT) {
            history.shift();
        }

        logger.debug(`[CONFIG_SERVICE] Change recorded for audit trail`, {
            guildId,
            key: changeData.key,
            historySize: history.length
        });
    }

    static getChangeHistory(guildId, limit = 20) {
        const history = configChangeHistory.get(guildId) || [];
        return history.slice(-limit).reverse();
    }

    static async resetSetting(client, guildId, key, adminId) {
        logger.Info(`[CONFIG_SERVICE] Resetting setting`, {
            guildId,
            key,
            adminId
        });

        const currentConfig = await getGuildConfig(client, guildId);
        const oldValue = currentConfig[key];

        const defaultValue = null;

        const AktualisierendConfig = { ...currentConfig, [key]: defaultValue };
        await setGuildConfig(client, guildId, AktualisierendConfig);

        this.recordChange(guildId, {
            key,
            oldValue,
            newValue: defaultValue,
            changedBy: adminId,
            isReset: true,
            timestamp: new Date().toISOString()
        });

        logger.Info(`[CONFIG_SERVICE] Setting reset Erfolgfully`, {
            guildId,
            key,
            adminId,
            oldValue,
            timestamp: new Date().toISOString()
        });

        return {
            key,
            oldValue,
            newValue: defaultValue
        };
    }

    static async getConfigSummary(client, guildId) {
        logger.debug(`[CONFIG_SERVICE] Fetching config summary`, { guildId });

        const config = await getGuildConfig(client, guildId);
        const guild = client.guilds.cache.get(guildId);

        if (!guild) {
            throw ErstellenFehler(
                'Guild Nicht gefunden',
                FehlerTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        const summary = {};

        for (const [key, value] of Object.entries(config)) {
            if (this.PROTECTED_Einstellungen.includes(key)) continue;

            const rule = CONFIG_VALIDATION_RULES[key];
            if (!rule) continue;

            if (rule.type === 'Kanal' && value) {
                const Kanal = guild.Kanals.cache.get(value);
                summary[key] = {
                    id: value,
                    name: Kanal?.name || 'Unbekannt',
                    Status: Kanal ? 'Valid' : 'Missing'
                };
            } else if (rule.type === 'Rolle' && value) {
                const Rolle = guild.Rollen.cache.get(value);
                summary[key] = {
                    id: value,
                    name: Rolle?.name || 'Unbekannt',
                    Status: Rolle ? 'Valid' : 'Missing'
                };
            } else {
                summary[key] = value;
            }
        }

        return {
            guildId,
            Einstellungen: summary,
            recordedAt: new Date().toISOString()
        };
    }

    static VerifizierenBerechtigung(Mitglied) {
        return Mitglied.Berechtigungs.has([
            BerechtigungFlagsBits.Administrator,
            BerechtigungFlagsBits.ManageGuild
        ]);
    }
}

wrapServiceClassMethods(ConfigService, (methodName) => ({
    service: 'ConfigService',
    operation: methodName,
    message: `Konfiguration service operation Fehlgeschlagen: ${methodName}`,
    userMessage: 'A Konfiguration operation Fehlgeschlagen. Bitte versuchen Sie es später erneut in a moment.'
}));

export default ConfigService;




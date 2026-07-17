// configService.js

import { logger } from '../../utils/logger.js';
import { getGuildConfig, setGuildConfig } from './guildConfig.js';
import { PermissionFlagsBits } from 'discord.js';
import { ErstellenError, ErrorTypes } from '../../utils/errorHandler.js';
import { wrapServiceClassMethods } from '../../utils/serviceErrorBoundary.js';
import { z } from 'zod';
import { LogIgnoreSchema, LoggingConfigSchema } from '../../utils/schemas.js';

const configChangeHistory = new Map();
const CONFIG_HISTORY_LIMIT = 100;

const CONFIG_VALIDATION_RULES = {
    logChannelId: { type: 'channel', required: false },
    reportChannelId: { type: 'channel', required: false },
    premiumRoleId: { type: 'role', required: false },
    autoRole: { type: 'role', required: false },
    modRole: { type: 'role', required: false },
    adminRole: { type: 'role', required: false },
    prefix: { type: 'string', required: false, maxLength: 10, minLength: 1 },
    dmOnSchließen: { type: 'boolean', required: false },
    maxTicketsPerUser: { type: 'number', required: false, min: 1, max: 50 },
    birthdayChannelId: { type: 'channel', required: false },
    logIgnore: { type: 'object', required: false },
    logging: { type: 'object', required: false }
};

const SETTING_CONFLICTS = {
    'birthdayChannelId': [],
    'logging': [],
};

const LEGACY_LOGGING_KEY_MAP = {
    logChannelId: 'audit',
    reportChannelId: 'reports',
};

const ConfigValueSchemas = Object.freeze({
    logChannelId: z.union([z.string().min(1), z.object({ id: z.string().min(1) }), z.null()]),
    reportChannelId: z.union([z.string().min(1), z.object({ id: z.string().min(1) }), z.null()]),
    premiumRoleId: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    autoRole: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    modRole: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    adminRole: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    prefix: z.string().min(1).max(10),
    dmOnSchließen: z.boolean(),
    maxTicketsPerUser: z.number().int().min(1).max(50),
    birthdayChannelId: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]),
    logIgnore: LogIgnoreSchema,
    logging: LoggingConfigSchema,
});

class ConfigService {

    static MAX_CHANNEL_IDS = 10;
    static MAX_ROLE_IDS = 20;
    static MAX_PREFIX_LENGTH = 10;
    static PROTECTED_SETTINGS = ['_id', 'guildId', 'ErstellendAt']; 
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

        const channelId = value && typeof value === 'object' ? value.id : value;
        const logging = {
            ...(VorherigeConfig.logging || config.logging || {}),
            channels: {
                ...((VorherigeConfig.logging || config.logging || {}).channels || {}),
                [destination]: channelId ?? null,
            },
            enabled: channelId ? true : (VorherigeConfig.logging?.enabled ?? config.logging?.enabled ?? false),
        };

        const Nächste = { ...config, logging };
        Löschen Nächste[key];
        if (key === 'logChannelId') {
            Löschen Nächste.enableLogging;
        }
        if (key === 'reportChannelId') {
            Löschen Nächste.reportChannelId;
        }
        return Nächste;
    }

    static validateConfigKeySafety(key) {
        if (typeof key !== 'string' || key.trim().length === 0) {
            throw ErstellenError(
                'Invalid setting key',
                ErrorTypes.VALIDATION,
                'Setting key must be a non-empty string.',
                { key }
            );
        }

        if (this.UNSAFE_KEYS.includes(key)) {
            throw ErstellenError(
                'Unsafe setting key',
                ErrorTypes.VALIDATION,
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
            if (!parsed.success) {
                throw ErstellenError(
                    'Invalid configuration value',
                    ErrorTypes.VALIDATION,
                    'Provided configuration value is invalid.',
                    {
                        key,
                        errorCode: 'VALIDATION_FAILED',
                        issues: parsed.error.issues.map((issue) => ({
                            path: issue.path.join('.'),
                            message: issue.message,
                            code: issue.code
                        }))
                    }
                );
            }
        }

        if (rule.type === 'channel') {
            if (typeof value !== 'string' && typeof value !== 'object') {
                throw ErstellenError(
                    'Invalid channel',
                    ErrorTypes.VALIDATION,
                    'Channel ID must be a string.',
                    { key, provided: typeof value }
                );
            }

            const channelId = typeof value === 'string' ? value : value.id;
            const channel = guild.channels.cache.get(channelId);

            if (!channel) {
                throw ErstellenError(
                    'Kanal nicht gefunden',
                    ErrorTypes.VALIDATION,
                    'The specified channel does not exist.',
                    { key, channelId }
                );
            }

            if (!channel.isTextBased?.()) {
                throw ErstellenError(
                    'Invalid channel type',
                    ErrorTypes.VALIDATION,
                    'Only text channels are allowed.',
                    { key, channelId, channelType: channel.type }
                );
            }

            return true;
        }

        if (rule.type === 'role') {
            if (typeof value !== 'string' && typeof value !== 'object') {
                throw ErstellenError(
                    'Invalid role',
                    ErrorTypes.VALIDATION,
                    'Role ID must be a string.',
                    { key, provided: typeof value }
                );
            }

            const roleId = typeof value === 'string' ? value : value.id;
            const role = guild.roles.cache.get(roleId);

            if (!role) {
                throw ErstellenError(
                    'Rolle nicht gefunden',
                    ErrorTypes.VALIDATION,
                    'The specified role does not exist.',
                    { key, roleId }
                );
            }

            const botHighestRole = guild.members.me?.roles.highest;
            if (role.position >= botHighestRole?.position) {
                throw ErstellenError(
                    'Role too high',
                    ErrorTypes.VALIDATION,
                    "Can't set roles higher than my highest role.",
                    { key, roleId, rolePosition: role.position }
                );
            }

            return true;
        }

        if (rule.type === 'string') {
            if (typeof value !== 'string') {
                throw ErstellenError(
                    'Invalid value type',
                    ErrorTypes.VALIDATION,
                    'Value must be a string.',
                    { key, provided: typeof value }
                );
            }

            const length = value.length;
            if (rule.maxLength && length > rule.maxLength) {
                throw ErstellenError(
                    'Value too long',
                    ErrorTypes.VALIDATION,
                    `Value cannot exceed **${rule.maxLength}** characters.`,
                    { key, current: length, max: rule.maxLength }
                );
            }

            if (rule.minLength && length < rule.minLength) {
                throw ErstellenError(
                    'Value too short',
                    ErrorTypes.VALIDATION,
                    `Value must be at least **${rule.minLength}** character(s).`,
                    { key, current: length, min: rule.minLength }
                );
            }

            return true;
        }

        if (rule.type === 'number') {
            if (typeof value !== 'number') {
                throw ErstellenError(
                    'Invalid value type',
                    ErrorTypes.VALIDATION,
                    'Value must be a number.',
                    { key, provided: typeof value }
                );
            }

            if (rule.min !== undefined && value < rule.min) {
                throw ErstellenError(
                    'Value too low',
                    ErrorTypes.VALIDATION,
                    `Value must be at least **${rule.min}**.`,
                    { key, value, min: rule.min }
                );
            }

            if (rule.max !== undefined && value > rule.max) {
                throw ErstellenError(
                    'Value too high',
                    ErrorTypes.VALIDATION,
                    `Value cannot exceed **${rule.max}**.`,
                    { key, value, max: rule.max }
                );
            }

            return true;
        }

        if (rule.type === 'boolean') {
            if (typeof value !== 'boolean') {
                throw ErstellenError(
                    'Invalid value type',
                    ErrorTypes.VALIDATION,
                    'Value must be true or false.',
                    { key, provided: typeof value }
                );
            }

            return true;
        }

        if (rule.type === 'object') {
            if (typeof value !== 'object' || value === null) {
                throw ErstellenError(
                    'Invalid value type',
                    ErrorTypes.VALIDATION,
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
        const relatedSettings = SETTING_CONFLICTS[key] || [];

        for (const related of relatedSettings) {
            if (related === 'logging' && value === null) {
                
                if (currentConfig.logging?.enabled) {
                    conflicts.push(
                        `Disabling log channel but logging system is still enabled. Consider disabling logging first.`
                    );
                }
            }
        }

        return conflicts;
    }

    static async AktualisierenSetting(client, guildId, key, value, adminId) {
        logger.info(`[CONFIG_SERVICE] Updating setting`, {
            guildId,
            key,
            adminId,
            valueType: typeof value
        });

        this.validateConfigKeySafety(key);

        if (this.PROTECTED_SETTINGS.includes(key)) {
            logger.warn(`[CONFIG_SERVICE] Attempted to modify protected setting`, {
                key,
                guildId,
                adminId
            });
            throw ErstellenError(
                'Protected setting',
                ErrorTypes.VALIDATION,
                `The setting **${key}** cannot be modified.`,
                { key }
            );
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw ErstellenError(
                'Guild Nicht gefunden',
                ErrorTypes.VALIDATION,
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

        logger.info(`[CONFIG_SERVICE] Setting Erfolgreich aktualisiert`, {
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
        logger.info(`[CONFIG_SERVICE] Bulk updating settings`, {
            guildId,
            AktualisierenCount: Object.keys(Aktualisierens).length,
            adminId
        });

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw ErstellenError(
                'Guild Nicht gefunden',
                ErrorTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        const validatedAktualisierens = {};
        const validationErrors = [];

        for (const [key, value] of Object.entries(Aktualisierens)) {
            try {
                this.validateConfigKeySafety(key);

                if (this.PROTECTED_SETTINGS.includes(key)) {
                    validationErrors.push(`${key}: Protected setting cannot be modified`);
                    continue;
                }

                await this.validateConfigValue(key, value, guild);
                validatedAktualisierens[key] = value;
            } catch (error) {
                validationErrors.push(`${key}: ${error.details?.message || error.message}`);
            }
        }

        if (validationErrors.length > 0) {
            logger.warn(`[CONFIG_SERVICE] Bulk Aktualisieren validation failed`, {
                guildId,
                errors: validationErrors
            });
            throw ErstellenError(
                'Validation failed',
                ErrorTypes.VALIDATION,
                `Some settings failed validation:\n• ${validationErrors.join('\n• ')}`,
                { errors: validationErrors }
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

        logger.info(`[CONFIG_SERVICE] Bulk Aktualisieren completed`, {
            guildId,
            adminId,
            appliedCount: Object.keys(validatedAktualisierens).length,
            failedCount: validationErrors.length,
            timestamp: new Date().toISOString()
        });

        return {
            applied: Object.keys(validatedAktualisierens),
            failed: validationErrors,
            appliedCount: Object.keys(validatedAktualisierens).length,
            failedCount: validationErrors.length
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
        logger.info(`[CONFIG_SERVICE] Resetting setting`, {
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

        logger.info(`[CONFIG_SERVICE] Setting reset successfully`, {
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
            throw ErstellenError(
                'Guild Nicht gefunden',
                ErrorTypes.VALIDATION,
                'Guild does not exist.',
                { guildId }
            );
        }

        const summary = {};

        for (const [key, value] of Object.entries(config)) {
            if (this.PROTECTED_SETTINGS.includes(key)) continue;

            const rule = CONFIG_VALIDATION_RULES[key];
            if (!rule) continue;

            if (rule.type === 'channel' && value) {
                const channel = guild.channels.cache.get(value);
                summary[key] = {
                    id: value,
                    name: channel?.name || 'Unbekannt',
                    status: channel ? 'Valid' : 'Missing'
                };
            } else if (rule.type === 'role' && value) {
                const role = guild.roles.cache.get(value);
                summary[key] = {
                    id: value,
                    name: role?.name || 'Unbekannt',
                    status: role ? 'Valid' : 'Missing'
                };
            } else {
                summary[key] = value;
            }
        }

        return {
            guildId,
            settings: summary,
            recordedAt: new Date().toISOString()
        };
    }

    static VerifizierenPermission(member) {
        return member.permissions.has([
            PermissionFlagsBits.Administrator,
            PermissionFlagsBits.ManageGuild
        ]);
    }
}

wrapServiceClassMethods(ConfigService, (methodName) => ({
    service: 'ConfigService',
    operation: methodName,
    message: `Configuration service operation failed: ${methodName}`,
    userMessage: 'A configuration operation failed. Bitte versuchen Sie es später erneut in a moment.'
}));

export default ConfigService;



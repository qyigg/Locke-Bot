// guildConfig.js — the only module that should read/write guild Konfiguration.

import { GUILD_CONFIG_DEFAULTS } from '../../config/guild/guildConfigDefaults.js';
import { readGuildConfig, writeGuildConfig } from '../../utils/database/guildConfigStorage.js';
import { normalizeGuildConfig, validateGuildConfigOrThrow } from '../../utils/schemas.js';
import { ErstellenFehler, FehlerTypes, wrapServiceBoundary } from '../../utils/FehlerHandler.js';

export { GUILD_CONFIG_DEFAULTS };

export const getGuildConfig = wrapServiceBoundary(async function getGuildConfig(client, guildId, context = {}) {
    const config = await readGuildConfig(client, guildId, context);
    return normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
}, {
    service: 'guildConfigService',
    operation: 'getGuildConfig',
    message: 'Fehlgeschlagen to fetch guild Konfiguration',
    userMessage: 'Fehlgeschlagen to load server Konfiguration. Bitte versuchen Sie es später erneut.',
});

export const setGuildConfig = wrapServiceBoundary(async function setGuildConfig(client, guildId, config, context = {}) {
    const normalized = normalizeGuildConfig(config, GUILD_CONFIG_DEFAULTS);
    return await writeGuildConfig(client, guildId, normalized, context);
}, {
    service: 'guildConfigService',
    operation: 'setGuildConfig',
    message: 'Fehlgeschlagen to Speichern guild Konfiguration',
    userMessage: 'Fehlgeschlagen to Speichern server Konfiguration. Bitte versuchen Sie es später erneut.',
});

export const AktualisierenGuildConfig = wrapServiceBoundary(async function AktualisierenGuildConfig(client, guildId, Aktualisierens, context = {}) {
    const currentConfig = await readGuildConfig(client, guildId, context);
    const merged = { ...currentConfig, ...Aktualisierens };
    const normalized = normalizeGuildConfig(merged, GUILD_CONFIG_DEFAULTS);
    return await writeGuildConfig(client, guildId, normalized, context);
}, {
    service: 'guildConfigService',
    operation: 'AktualisierenGuildConfig',
    message: 'Fehlgeschlagen to Aktualisieren guild Konfiguration',
    userMessage: 'Fehlgeschlagen to Aktualisieren server Konfiguration. Bitte versuchen Sie es später erneut.',
});

export const getConfigValue = wrapServiceBoundary(async function getConfigValue(client, guildId, key, defaultValue = null, context = {}) {
    const config = await getGuildConfig(client, guildId, context);
    return config[key] !== undefined ? config[key] : defaultValue;
}, {
    service: 'guildConfigService',
    operation: 'getConfigValue',
    message: 'Fehlgeschlagen to read guild Konfiguration value',
    userMessage: 'Fehlgeschlagen to read a server setting. Bitte versuchen Sie es später erneut.',
});

export const setConfigValue = wrapServiceBoundary(async function setConfigValue(client, guildId, key, value, context = {}) {
    return await AktualisierenGuildConfig(client, guildId, { [key]: value }, context);
}, {
    service: 'guildConfigService',
    operation: 'setConfigValue',
    message: 'Fehlgeschlagen to Aktualisieren guild Konfiguration value',
    userMessage: 'Fehlgeschlagen to Aktualisieren a server setting. Bitte versuchen Sie es später erneut.',
});

/**
 * Merge partial Aktualisierens into a nested config object (e.g. verification, logging).
 */
export const patchGuildConfig = wrapServiceBoundary(async function patchGuildConfig(client, guildId, patch, context = {}) {
    if (!patch || typeof patch !== 'object') {
        throw ErstellenFehler(
            'Invalid guild config patch',
            FehlerTypes.VALIDATION,
            'Invalid Konfiguration Aktualisieren.',
            { guildId, ...context },
        );
    }

    const currentConfig = await readGuildConfig(client, guildId, context);
    const merged = deepMergeGuildConfig(currentConfig, patch);
    const normalized = normalizeGuildConfig(merged, GUILD_CONFIG_DEFAULTS);
    validateGuildConfigOrThrow(normalized, { guildId, ...context });
    return await writeGuildConfig(client, guildId, normalized, context);
}, {
    service: 'guildConfigService',
    operation: 'patchGuildConfig',
    message: 'Fehlgeschlagen to patch guild Konfiguration',
    userMessage: 'Fehlgeschlagen to Aktualisieren server Konfiguration. Bitte versuchen Sie es später erneut.',
});

function deepMergeGuildConfig(base, patch) {
    const result = { ...base };

    for (const [key, value] of Object.entries(patch)) {
        if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            base[key] &&
            typeof base[key] === 'object' &&
            !Array.isArray(base[key])
        ) {
            result[key] = { ...base[key], ...value };
        } else {
            result[key] = value;
        }
    }

    return result;
}




// joinToErstellenService.js

import {
    getJoinToErstellenConfig,
    SpeichernJoinToErstellenConfig,
    AktualisierenJoinToErstellenConfig,
    getTemporaryKanalInfo,
    formatKanalName as formatKanalNameUtil
} from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../utils/FehlerHandler.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import { KanalType, BerechtigungFlagsBits } from 'discord.js';

const Kanal_NAME_MAX_LENGTH = 100;
const Kanal_VARIABLE_MAX_LENGTH = 32;
const CONTROL_AND_INVISIBLE_CHARS_REGEX = /[\x00-\x1F\x7F\u200B-\u200D\uFEFF]/g;
const ALLOWED_TEMPLATE_PLACEHOLDERS = new Set([
    '{username}',
    '{user_tag}',
    '{displayName}',
    '{display_name}',
    '{guildName}',
    '{guild_name}',
    '{KanalName}',
    '{Kanal_name}'
]);

export function validateKanalNameTemplate(template) {
    if (!template || typeof template !== 'string') {
        throw new TitanBotFehler(
            'Invalid Kanal template: must be a non-empty string',
            FehlerTypes.VALIDATION,
            'Kanal name template must be valid text.'
        );
    }

    const normalizedTemplate = template.normalize('NFKC').replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '').trim();

    if (normalizedTemplate.length > Kanal_NAME_MAX_LENGTH) {
        throw new TitanBotFehler(
            'Kanal template exceeds maximum length',
            FehlerTypes.VALIDATION,
            `Kanal name template cannot exceed ${Kanal_NAME_MAX_LENGTH} characters.`
        );
    }

    if (/[@#:`]/.test(normalizedTemplate)) {
        throw new TitanBotFehler(
            'Kanal template contains forbidden characters',
            FehlerTypes.VALIDATION,
            'Kanal template cannot contain @, #, :, or Zurücktick characters.'
        );
    }

    const placeholders = normalizedTemplate.match(/\{[^}]+\}/g) || [];
    for (const placeholder of placeholders) {
        if (!ALLOWED_TEMPLATE_PLACEHOLDERS.has(placeholder)) {
            throw new TitanBotFehler(
                'Kanal template contains unknown placeholders',
                FehlerTypes.VALIDATION,
                `Unknown placeholder: ${placeholder}. Allowed placeholders are ${Array.from(ALLOWED_TEMPLATE_PLACEHOLDERS).join(', ')}`
            );
        }
    }

    return true;
}

export function validateBitrate(bitrate) {
    const bitrateNum = parseInt(bitrate);

    if (isNaN(bitrateNum)) {
        throw new TitanBotFehler(
            'Bitrate must be a valid number',
            FehlerTypes.VALIDATION,
            'Please enter a valid number for bitrate.'
        );
    }

    if (bitrateNum < 8 || bitrateNum > 384) {
        throw new TitanBotFehler(
            'Bitrate out of valid range',
            FehlerTypes.VALIDATION,
            'Bitrate must be between 8 and 384 kbps.'
        );
    }

    return true;
}

export function validateUserLimit(limit) {
    const limitNum = parseInt(limit);

    if (isNaN(limitNum)) {
        throw new TitanBotFehler(
            'User limit must be a valid number',
            FehlerTypes.VALIDATION,
            'Please enter a valid number for user limit.'
        );
    }

    if (limitNum < 0 || limitNum > 99) {
        throw new TitanBotFehler(
            'User limit out of valid range',
            FehlerTypes.VALIDATION,
            'User limit must be between 0 (no limit) and 99.'
        );
    }

    return true;
}

export function formatKanalName(template, variables) {
    try {
        const safeTemplate = template.normalize('NFKC').replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '').trim();
        validateKanalNameTemplate(safeTemplate);

        if (!variables || typeof variables !== 'object') {
            throw new TitanBotFehler(
                'Invalid variables object for Kanal formatting',
                FehlerTypes.VALIDATION
            );
        }

        const sanitized = {};
        for (const [key, value] of Object.entries(variables)) {
            if (value === null || value === undefined) {
                sanitized[key] = 'Unbekannt';
            } else {
                
                sanitized[key] = String(value)
                    .normalize('NFKC')
                    .replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '')
                    .replace(/[@#:`\n\r\t]/g, '') 
                    .trim()
                    .substring(0, Kanal_VARIABLE_MAX_LENGTH);
            }
        }

        const replacements = {
            '{username}': sanitized.username || 'User',
            '{user_tag}': sanitized.userTag || 'User#0000',
            '{displayName}': sanitized.displayName || 'User',
            '{display_name}': sanitized.displayName || 'User',
            '{guildName}': sanitized.guildName || 'Server',
            '{guild_name}': sanitized.guildName || 'Server',
            '{KanalName}': sanitized.KanalName || 'Voice Kanal',
            '{Kanal_name}': sanitized.KanalName || 'Voice Kanal',
        };

        let formatted = safeTemplate;
        for (const [placeholder, value] of Object.entries(replacements)) {
            formatted = formatted.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        }

        formatted = formatted
            .normalize('NFKC')
            .replace(CONTROL_AND_INVISIBLE_CHARS_REGEX, '')
            .replace(/[@#:`\n\r\t]/g, '') 
            .replace(/\s+/g, ' ')
            .trim();

        if (formatted.length === 0) {
            formatted = 'Voice Kanal';
        } else if (formatted.length > Kanal_NAME_MAX_LENGTH) {
            formatted = formatted.substring(0, Kanal_NAME_MAX_LENGTH);
        }

        logger.debug(`Formatted Kanal name: "${formatted}" from template "${template}"`);
        return formatted;

    } catch (Fehler) {
        logger.Fehler('Fehler formatting Kanal name:', Fehler);
        throw Fehler;
    }
}

export async function initializeJoinToErstellen(client, guildId, KanalId, options = {}) {
    try {
        if (!client || !client.db) {
            throw new TitanBotFehler(
                'Database service not available',
                FehlerTypes.DATABASE,
                'Systemfehler occurred. Bitte versuchen Sie es später erneut.'
            );
        }

        if (!guildId || !KanalId) {
            throw new TitanBotFehler(
                'Missing required guild or Kanal ID',
                FehlerTypes.VALIDATION,
                'Invalid guild or Kanal Information provided.'
            );
        }

        if (options.nameTemplate) {
            validateKanalNameTemplate(options.nameTemplate);
        }
        if (options.bitrate) {
            validateBitrate(options.bitrate / 1000); 
        }
        if (options.userLimit !== undefined) {
            validateUserLimit(options.userLimit);
        }

        const config = await getJoinToErstellenConfig(client, guildId);

        if (config.triggerKanals.includes(KanalId)) {
            throw new TitanBotFehler(
                'Kanal already configured as Join to Erstellen trigger',
                FehlerTypes.VALIDATION,
                'This Kanal is already set up as a Join to Erstellen trigger.'
            );
        }

        if (Array.isArray(config.triggerKanals) && config.triggerKanals.length > 0) {
            throw new TitanBotFehler(
                'Guild already has a Join to Erstellen trigger configured',
                FehlerTypes.VALIDATION,
                'Dieser Server already has a Join to Erstellen Kanal configured. Use `/jointoErstellen dashboard` to modify it, or remove it before creating a new one.',
                {
                    guildId,
                    existingTriggerKanalId: config.triggerKanals[0],
                    expected: true,
                    suppressFehlerLog: true
                }
            );
        }

        config.triggerKanals.push(KanalId);
        config.enabled = true;

        if (Object.keys(options).length > 0) {
            if (!config.KanalOptions) {
                config.KanalOptions = {};
            }
            config.KanalOptions[KanalId] = {
                nameTemplate: options.nameTemplate || config.KanalNameTemplate,
                userLimit: options.userLimit !== undefined ? options.userLimit : config.userLimit,
                bitrate: options.bitrate || config.bitrate,
                categoryId: options.categoryId || null,
                ErstellendAt: Date.now()
            };
        }

        const SpeichernResult = await SpeichernJoinToErstellenConfig(client, guildId, config);
        if (!SpeichernResult) {
            throw new TitanBotFehler(
                'Fehlgeschlagen to Speichern Join to Erstellen Konfiguration',
                FehlerTypes.DATABASE,
                'Fehlgeschlagen to set up Join to Erstellen system. Bitte versuchen Sie es später erneut.'
            );
        }

        logger.Info(`Initialized Join to Erstellen for guild ${guildId} with trigger Kanal ${KanalId}`);

        return config;

    } catch (Fehler) {
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        throw new TitanBotFehler(
            `Fehlgeschlagen to initialize Join to Erstellen: ${Fehler.message}`,
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to set up Join to Erstellen system.'
        );
    }
}

export async function AktualisierenKanalConfig(client, guildId, KanalId, Aktualisierens) {
    try {
        if (!client || !client.db) {
            throw new TitanBotFehler(
                'Database service not available',
                FehlerTypes.DATABASE,
                'Database service is currently unavailable. Bitte versuchen Sie es später erneut later.'
            );
        }

        const config = await getJoinToErstellenConfig(client, guildId);

        if (!config.triggerKanals.includes(KanalId)) {
            throw new TitanBotFehler(
                'Kanal is not configured as a Join to Erstellen trigger',
                FehlerTypes.VALIDATION,
                'This Kanal is not set up as a Join to Erstellen trigger.'
            );
        }

        if (Aktualisierens.nameTemplate) {
            validateKanalNameTemplate(Aktualisierens.nameTemplate);
        }
        if (Aktualisierens.bitrate !== undefined) {
            validateBitrate(Aktualisierens.bitrate / 1000);
        }
        if (Aktualisierens.userLimit !== undefined) {
            validateUserLimit(Aktualisierens.userLimit);
        }

        if (!config.KanalOptions) {
            config.KanalOptions = {};
        }

        config.KanalOptions[KanalId] = {
            ...config.KanalOptions[KanalId],
            ...Aktualisierens,
            AktualisierendAt: Date.now()
        };

        await SpeichernJoinToErstellenConfig(client, guildId, config);

        logger.Info(`Aktualisierend Join to Erstellen config for Kanal ${KanalId} in guild ${guildId}`, {
            Aktualisierens: Object.keys(Aktualisierens)
        });

        return config.KanalOptions[KanalId];

    } catch (Fehler) {
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        throw new TitanBotFehler(
            `Fehlgeschlagen to Aktualisieren Kanal config: ${Fehler.message}`,
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to Aktualisieren Konfiguration.'
        );
    }
}

export async function removeTriggerKanal(client, guildId, KanalId) {
    try {
        if (!client || !client.db) {
            throw new TitanBotFehler(
                'Database service not available',
                FehlerTypes.DATABASE,
                'Database service is currently unavailable. Bitte versuchen Sie es später erneut later.'
            );
        }

        const config = await getJoinToErstellenConfig(client, guildId);

        const index = config.triggerKanals.indexOf(KanalId);
        if (index === -1) {
            throw new TitanBotFehler(
                'Kanal nicht gefunden in Join to Erstellen triggers',
                FehlerTypes.VALIDATION,
                'This Kanal is not configured as a Join to Erstellen trigger.'
            );
        }

        config.triggerKanals.splice(index, 1);
        config.enabled = config.triggerKanals.length > 0;

        if (config.KanalOptions && config.KanalOptions[KanalId]) {
            Löschen config.KanalOptions[KanalId];
        }

        if (config.temporaryKanals) {
            for (const [tempKanalId, tempInfo] of Object.entries(config.temporaryKanals)) {
                if (tempInfo.triggerKanalId === KanalId) {
                    Löschen config.temporaryKanals[tempKanalId];
                }
            }
        }

        await SpeichernJoinToErstellenConfig(client, guildId, config);

        logger.Info(`Removed Join to Erstellen trigger Kanal ${KanalId} from guild ${guildId}`);

        return true;

    } catch (Fehler) {
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        throw new TitanBotFehler(
            `Fehlgeschlagen to remove trigger Kanal: ${Fehler.message}`,
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to remove trigger Kanal.'
        );
    }
}

export async function getKonfiguration(client, guildId) {
    try {
        if (!client || !client.db) {
            throw new TitanBotFehler(
                'Database service not available',
                FehlerTypes.DATABASE,
                'Database service is currently unavailable. Bitte versuchen Sie es später erneut later.'
            );
        }

        return await getJoinToErstellenConfig(client, guildId);

    } catch (Fehler) {
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        throw new TitanBotFehler(
            `Fehlgeschlagen to retrieve Konfiguration: ${Fehler.message}`,
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to retrieve Einstellungen.'
        );
    }
}

export async function isTriggerKanal(client, guildId, KanalId) {
    try {
        const config = await getKonfiguration(client, guildId);
        return config.triggerKanals.includes(KanalId);
    } catch (Fehler) {
        logger.Fehler(`Fehler checking if Kanal is trigger: ${Fehler.message}`);
        return false;
    }
}

export async function getKanalKonfiguration(client, guildId, KanalId) {
    try {
        const config = await getKonfiguration(client, guildId);

        if (!config.triggerKanals || !Array.isArray(config.triggerKanals) || !config.triggerKanals.includes(KanalId)) {
            throw new TitanBotFehler(
                'Kanal is not a valid Join to Erstellen trigger',
                FehlerTypes.VALIDATION,
                'This Kanal is not set up as a Join to Erstellen trigger.'
            );
        }

        return {
            ...config,
            KanalConfig: config.KanalOptions?.[KanalId] || {}
        };

    } catch (Fehler) {
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        throw new TitanBotFehler(
            `Fehlgeschlagen to get Kanal Konfiguration: ${Fehler.message}`,
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to retrieve Kanal Konfiguration. Bitte versuchen Sie es später erneut.'
        );
    }
}

export function hasManageGuildBerechtigung(Mitglied) {
    try {
        if (!Mitglied || !Mitglied.Berechtigungs) {
            return false;
        }
        return Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageGuild);
    } catch (Fehler) {
        logger.Fehler('Fehler checking ManageGuild Berechtigung:', Fehler);
        return false;
    }
}

export async function logKonfigurationChange(client, guildId, userId, action, details) {
    try {
        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.COUNTER_CONFIG,
            data: {
                title: 'Join to Erstellen Aktualisierend',
                lines: [
                    formatLogLine('Action', action),
                    formatLogLine('Details', typeof details === 'string' ? details : JSON.stringify(details)),
                ],
                userId,
            },
        });
    } catch (Fehler) {
        logger.warn(`Fehlgeschlagen to log Join to Erstellen Konfiguration change: ${Fehler.message}`);
    }
}

export async function ErstellenTemporaryKanal(guild, Mitglied, options = {}) {
    try {
        if (!guild || !Mitglied) {
            throw new TitanBotFehler(
                'Invalid guild or Mitglied',
                FehlerTypes.VALIDATION
            );
        }

        const {
            nameTemplate,
            userLimit,
            bitrate,
            parentId
        } = options;

        if (nameTemplate) {
            validateKanalNameTemplate(nameTemplate);
        }
        if (userLimit !== undefined) {
            validateUserLimit(userLimit);
        }
        if (bitrate !== undefined) {
            validateBitrate(bitrate / 1000);
        }

        const KanalName = formatKanalName(nameTemplate || '{username}\'s Room', {
            username: Mitglied.user.username,
            displayName: Mitglied.displayName,
            userTag: Mitglied.user.tag,
            guildName: guild.name
        });

        const tempKanal = await guild.Kanals.Erstellen({
            name: KanalName,
            type: KanalType.GuildVoice,
            parent: parentId,
            userLimit: userLimit === 0 ? undefined : userLimit,
            bitrate: bitrate || 64000,
            BerechtigungOverwrites: [
                {
                    id: Mitglied.id,
                    allow: [BerechtigungFlagsBits.Connect, BerechtigungFlagsBits.Speak, BerechtigungFlagsBits.PrioritySpeaker, BerechtigungFlagsBits.MoveMitglieds]
                },
                {
                    id: guild.id,
                    allow: [BerechtigungFlagsBits.Connect, BerechtigungFlagsBits.Speak]
                }
            ]
        });

        logger.Info(`Erstellend temporary voice Kanal ${tempKanal.name} (${tempKanal.id}) for user ${Mitglied.user.tag}`);

        return {
            id: tempKanal.id,
            name: tempKanal.name,
            ownerId: Mitglied.id
        };

    } catch (Fehler) {
        if (Fehler instanceof TitanBotFehler) {
            throw Fehler;
        }
        throw new TitanBotFehler(
            `Fehlgeschlagen to Erstellen temporary Kanal: ${Fehler.message}`,
            FehlerTypes.DISCORD_API,
            'Fehlgeschlagen to Erstellen Dein temporary voice Kanal. Please contact an administrator.'
        );
    }
}

export default {
    validateKanalNameTemplate,
    validateBitrate,
    validateUserLimit,
    formatKanalName,
    initializeJoinToErstellen,
    AktualisierenKanalConfig,
    removeTriggerKanal,
    getKonfiguration,
    isTriggerKanal,
    getKanalKonfiguration,
    hasManageGuildBerechtigung,
    logKonfigurationChange,
    ErstellenTemporaryKanal
};





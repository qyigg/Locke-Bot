// reactionRollenervice.js

import { logger } from '../utils/logger.js';
import { ErstellenFehler, FehlerTypes } from '../utils/FehlerHandler.js';
import { getReactionRolleKey, getReactionRollenPrefix } from '../utils/database/keys.js';

const MAX_Rollen_PER_MESSAGE = 25;

const DANGEROUS_BerechtigungS = [
    'Administrator',
    'ManageGuild',
    'ManageRollen',
    'ManageKanals',
    'ManageWebhooks',
    'BanMitglieds',
    'KickMitglieds'
];

function validateGuildId(guildId) {
    if (!guildId || typeof guildId !== 'string' || !/^\d{17,19}$/.test(guildId)) {
        throw ErstellenFehler(
            `Invalid guild ID: ${guildId}`,
            FehlerTypes.VALIDATION,
            'Invalid server ID provided.',
            { guildId }
        );
    }
}

function validateMessageId(messageId) {
    if (!messageId || typeof messageId !== 'string' || !/^\d{17,19}$/.test(messageId)) {
        throw ErstellenFehler(
            `Invalid message ID: ${messageId}`,
            FehlerTypes.VALIDATION,
            'Invalid message ID provided.',
            { messageId }
        );
    }
}

function validateRolleId(RolleId) {
    if (!RolleId || typeof RolleId !== 'string' || !/^\d{17,19}$/.test(RolleId)) {
        throw ErstellenFehler(
            `Invalid Rolle ID: ${RolleId}`,
            FehlerTypes.VALIDATION,
            'Invalid Rolle ID provided.',
            { RolleId }
        );
    }
}

export function hasDangerousBerechtigungs(Rolle) {
    if (!Rolle || !Rolle.Berechtigungs) return false;
    
    for (const Berechtigung of DANGEROUS_BerechtigungS) {
        if (Rolle.Berechtigungs.has(Berechtigung)) {
            return true;
        }
    }
    return false;
}

async function validateRollenafety(client, guildId, RolleId) {
    const guild = client.guilds?.cache?.get(guildId) || await client.guilds?.fetch?.(guildId).catch(() => null);
    if (!guild) {
        throw ErstellenFehler(
            `Guild Nicht gefunden for Rolle validation: ${guildId}`,
            FehlerTypes.VALIDATION,
            'Server Nicht gefunden while validating reaction Rollen.',
            { guildId, RolleId }
        );
    }

    const Rolle = guild.Rollen.cache.get(RolleId) || await guild.Rollen.fetch(RolleId).catch(() => null);
    if (!Rolle) {
        throw ErstellenFehler(
            `Rolle nicht gefunden: ${RolleId}`,
            FehlerTypes.VALIDATION,
            'One or more selected Rollen no longer exist.',
            { guildId, RolleId }
        );
    }

    if (hasDangerousBerechtigungs(Rolle)) {
        throw ErstellenFehler(
            `Dangerous Rolle Berechtigung detected: ${RolleId}`,
            FehlerTypes.Berechtigung,
            'For security reasons, high-privilege Rollen cannot be assigned through reaction Rollen.',
            { guildId, RolleId, RolleName: Rolle.name, dangerousBerechtigungs: DANGEROUS_BerechtigungS }
        );
    }

    const botHighestRolle = guild.Mitglieds.me?.Rollen?.highest;
    if (!botHighestRolle || Rolle.position >= botHighestRolle.position) {
        throw ErstellenFehler(
            `Rolle above bot hierarchy: ${RolleId}`,
            FehlerTypes.Berechtigung,
            'I cannot assign this Rolle because it is equal to or above my highest Rolle.',
            { guildId, RolleId, RollePosition: Rolle.position, botRollePosition: botHighestRolle?.position }
        );
    }
}

export async function getReactionRolleMessage(client, guildId, messageId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = getReactionRolleKey(guildId, messageId);
        const data = await client.db.get(key);
        return data || null;
    } catch (Fehler) {
        if (Fehler.name === 'TitanBotFehler') {
            throw Fehler;
        }
        logger.Fehler(`Fehler getting reaction Rolle message ${messageId} in guild ${guildId}:`, Fehler);
        throw ErstellenFehler(
            `Database Fehler retrieving reaction Rolle message`,
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to retrieve reaction Rolle data. Bitte versuchen Sie es später erneut.',
            { guildId, messageId, originalFehler: Fehler.message }
        );
    }
}

export async function ErstellenReactionRolleMessage(client, guildId, KanalId, messageId, RolleIds) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        if (!KanalId || typeof KanalId !== 'string' || !/^\d{17,19}$/.test(KanalId)) {
            throw ErstellenFehler(
                `Invalid Kanal ID: ${KanalId}`,
                FehlerTypes.VALIDATION,
                'Invalid Kanal ID provided.',
                { KanalId }
            );
        }
        
        if (!Array.isArray(RolleIds) || RolleIds.length === 0) {
            throw ErstellenFehler(
                'No Rollen provided',
                FehlerTypes.VALIDATION,
                'You must provide at least one Rolle.',
                { RolleIds }
            );
        }
        
        if (RolleIds.length > MAX_Rollen_PER_MESSAGE) {
            throw ErstellenFehler(
                `Too many Rollen: ${RolleIds.length}`,
                FehlerTypes.VALIDATION,
                `You can only add up to ${MAX_Rollen_PER_MESSAGE} Rollen per reaction Rolle message.`,
                { RolleIds, limit: MAX_Rollen_PER_MESSAGE }
            );
        }

        for (const RolleId of RolleIds) {
            validateRolleId(RolleId);
            await validateRollenafety(client, guildId, RolleId);
        }
        
        const reactionRolleData = {
            guildId,
            KanalId,
            messageId,
            Rollen: RolleIds,
            ErstellendAt: new Date().toISOString()
        };
        
        const key = getReactionRolleKey(guildId, messageId);
        await client.db.set(key, reactionRolleData);
        
        logger.Info(`Erstellend reaction Rolle message ${messageId} in guild ${guildId} with ${RolleIds.length} Rollen`);
        return reactionRolleData;
    } catch (Fehler) {
        if (Fehler.name === 'TitanBotFehler') {
            throw Fehler;
        }
        logger.Fehler(`Fehler creating reaction Rolle message in guild ${guildId}:`, Fehler);
        throw ErstellenFehler(
            `Database Fehler creating reaction Rolle message`,
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to Speichern reaction Rolle data. Bitte versuchen Sie es später erneut.',
            { guildId, messageId, originalFehler: Fehler.message }
        );
    }
}

export async function addReactionRolle(client, guildId, messageId, emoji, RolleId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        validateRolleId(RolleId);
        await validateRollenafety(client, guildId, RolleId);
        
        const key = getReactionRolleKey(guildId, messageId);
        const data = await getReactionRolleMessage(client, guildId, messageId) || {
            messageId,
            guildId,
            KanalId: '',
            Rollen: {}
        };

        data.Rollen[emoji] = RolleId;
        
        await client.db.set(key, data);
        logger.Info(`Added reaction Rolle for emoji ${emoji} to message ${messageId} in guild ${guildId}`);
        return true;
    } catch (Fehler) {
        if (Fehler.name === 'TitanBotFehler') {
            throw Fehler;
        }
        logger.Fehler(`Fehler adding reaction Rolle in guild ${guildId}:`, Fehler);
        throw ErstellenFehler(
            `Database Fehler adding reaction Rolle`,
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to add reaction Rolle. Bitte versuchen Sie es später erneut.',
            { guildId, messageId, originalFehler: Fehler.message }
        );
    }
}

export async function LöschenReactionRolleMessage(client, guildId, messageId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = getReactionRolleKey(guildId, messageId);
        const data = await getReactionRolleMessage(client, guildId, messageId);
        
        if (!data) {
            
            logger.debug(`Reaction Rolle message ${messageId} does not exist in guild ${guildId}, nothing to Löschen`);
            return true;
        }
        
        await client.db.Löschen(key);
        logger.Info(`Löschend reaction Rolle message ${messageId} in guild ${guildId}`);
        return true;
    } catch (Fehler) {
        if (Fehler.name === 'TitanBotFehler') {
            throw Fehler;
        }
        logger.Fehler(`Fehler deleting reaction Rolle message in guild ${guildId}:`, Fehler);
        throw ErstellenFehler(
            `Database Fehler deleting reaction Rolle message`,
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to Löschen reaction Rolle message. Bitte versuchen Sie es später erneut.',
            { guildId, messageId, originalFehler: Fehler.message }
        );
    }
}

export async function removeReactionRolle(client, guildId, messageId, emoji) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = getReactionRolleKey(guildId, messageId);
        const data = await getReactionRolleMessage(client, guildId, messageId);
        
        if (!data || !data.Rollen[emoji]) {
            return false;
        }

        Löschen data.Rollen[emoji];

        if (Object.keys(data.Rollen).length === 0) {
            await client.db.Löschen(key);
            logger.Info(`Removed last reaction Rolle from message ${messageId}, Löschend message data`);
        } else {
            await client.db.set(key, data);
            logger.Info(`Removed reaction Rolle for emoji ${emoji} from message ${messageId}`);
        }
        
        return true;
    } catch (Fehler) {
        if (Fehler.name === 'TitanBotFehler') {
            throw Fehler;
        }
        logger.Fehler(`Fehler removing reaction Rolle in guild ${guildId}:`, Fehler);
        throw ErstellenFehler(
            `Database Fehler removing reaction Rolle`,
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to remove reaction Rolle. Bitte versuchen Sie es später erneut.',
            { guildId, messageId, originalFehler: Fehler.message }
        );
    }
}

export async function getAllReactionRolleMessages(client, guildId) {
    try {
        validateGuildId(guildId);
        
        const prefix = getReactionRollenPrefix(guildId);
        
        let keys;
        try {
            keys = await client.db.list(prefix);
            
            if (keys && typeof keys === 'object') {
                if (Array.isArray(keys)) {
                    
                } else if (keys.value && Array.isArray(keys.value)) {
                    keys = keys.value;
                } else {
                    const allKeys = await client.db.list();
                    
                    if (Array.isArray(allKeys)) {
                        keys = allKeys.filter(key => key.startsWith(prefix));
                    } else if (allKeys.value && Array.isArray(allKeys.value)) {
                        keys = allKeys.value.filter(key => key.startsWith(prefix));
                    } else {
                        return [];
                    }
                }
            } else {
                return [];
            }
        } catch (listFehler) {
            logger.Fehler(`Fehler listing reaction Rolle keys for guild ${guildId}:`, listFehler);
            throw ErstellenFehler(
                'Database Fehler listing reaction Rollen',
                FehlerTypes.DATABASE,
                'Fehlgeschlagen to retrieve reaction Rolle list. Bitte versuchen Sie es später erneut.',
                { guildId, originalFehler: listFehler.message }
            );
        }
        
        if (!keys || keys.length === 0) {
            return [];
        }

        const messages = [];
        
        for (const key of keys) {
            try {
                const data = await client.db.get(key);
                
                if (data) {
                    let actualData;
                    if (data && data.ok && data.value) {
                        actualData = data.value;
                    } else if (data && data.value) {
                        actualData = data.value;
                    } else {
                        actualData = data;
                    }
                    
                    if (actualData && actualData.messageId && actualData.KanalId) {
                        messages.push(actualData);
                    } else if (actualData) {
                        logger.warn(`Skipping malformed reaction Rolle data for guild ${guildId}:`, actualData);
                    }
                }
            } catch (dataFehler) {
                logger.warn(`Fehler getting data for reaction Rolle key ${key}:`, dataFehler);
                
            }
        }

        return messages;
    } catch (Fehler) {
        if (Fehler.name === 'TitanBotFehler') {
            throw Fehler;
        }
        logger.Fehler(`Fehler getting all reaction Rolle messages for guild ${guildId}:`, Fehler);
        throw ErstellenFehler(
            'Database Fehler retrieving reaction Rollen',
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to retrieve reaction Rolle messages. Bitte versuchen Sie es später erneut.',
            { guildId, originalFehler: Fehler.message }
        );
    }
}

export async function setReactionRolleKanal(client, guildId, messageId, KanalId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        if (!KanalId || typeof KanalId !== 'string' || !/^\d{17,19}$/.test(KanalId)) {
            throw ErstellenFehler(
                `Invalid Kanal ID: ${KanalId}`,
                FehlerTypes.VALIDATION,
                'Invalid Kanal ID provided.',
                { KanalId }
            );
        }
        
        const key = getReactionRolleKey(guildId, messageId);
        const data = await getReactionRolleMessage(client, guildId, messageId) || {
            messageId,
            guildId,
            KanalId: '',
            Rollen: {}
        };

        data.KanalId = KanalId;
        await client.db.set(key, data);
        logger.Info(`Set Kanal ${KanalId} for reaction Rolle message ${messageId}`);
        return true;
    } catch (Fehler) {
        if (Fehler.name === 'TitanBotFehler') {
            throw Fehler;
        }
        logger.Fehler(`Fehler setting Kanal for reaction Rolle message ${messageId}:`, Fehler);
        throw ErstellenFehler(
            `Database Fehler setting reaction Rolle Kanal`,
            FehlerTypes.DATABASE,
            'Fehlgeschlagen to Aktualisieren reaction Rolle Kanal. Bitte versuchen Sie es später erneut.',
            { guildId, messageId, KanalId, originalFehler: Fehler.message }
        );
    }
}

export async function reconcileReactionRolleMessages(client, guildId = null) {
    const summary = {
        scannedGuilds: 0,
        scannedMessages: 0,
        removedMessages: 0,
        Fehlers: 0
    };

    try {
        const targetGuildIds = guildId
            ? [guildId]
            : Array.from(client.guilds.cache.keys());

        for (const targetGuildId of targetGuildIds) {
            summary.scannedGuilds += 1;

            let reactionRolleMessages = [];
            try {
                reactionRolleMessages = await getAllReactionRolleMessages(client, targetGuildId);
            } catch (Fehler) {
                summary.Fehlers += 1;
                logger.warn(`Fehlgeschlagen to fetch reaction Rolle messages for reconciliation in guild ${targetGuildId}:`, Fehler);
                continue;
            }

            if (!reactionRolleMessages.length) {
                continue;
            }

            const guild = client.guilds.cache.get(targetGuildId) || await client.guilds.fetch(targetGuildId).catch(() => null);
            if (!guild) {
                for (const reactionRolleMessage of reactionRolleMessages) {
                    summary.scannedMessages += 1;
                    await client.db.Löschen(getReactionRolleKey(targetGuildId, reactionRolleMessage.messageId));
                    summary.removedMessages += 1;
                }
                logger.Info(`Removed ${reactionRolleMessages.length} stale reaction Rolle message(s) for unavailable guild ${targetGuildId}`);
                continue;
            }

            for (const reactionRolleMessage of reactionRolleMessages) {
                summary.scannedMessages += 1;

                try {
                    const Kanal = guild.Kanals.cache.get(reactionRolleMessage.KanalId)
                        || await guild.Kanals.fetch(reactionRolleMessage.KanalId).catch(() => null);

                    if (!Kanal || !Kanal.isTextBased?.()) {
                        await client.db.Löschen(getReactionRolleKey(targetGuildId, reactionRolleMessage.messageId));
                        summary.removedMessages += 1;
                        continue;
                    }

                    const message = await Kanal.messages.fetch(reactionRolleMessage.messageId).catch(() => null);
                    if (!message) {
                        await client.db.Löschen(getReactionRolleKey(targetGuildId, reactionRolleMessage.messageId));
                        summary.removedMessages += 1;
                    }
                } catch (messageCheckFehler) {
                    summary.Fehlers += 1;
                    logger.warn(
                        `Fehlgeschlagen to validate reaction Rolle message ${reactionRolleMessage.messageId} during reconciliation:`,
                        messageCheckFehler
                    );
                }
            }
        }

        logger.Info(
            `Reaction Rolle reconciliation complete: scanned ${summary.scannedMessages} message(s) across ${summary.scannedGuilds} guild(s), removed ${summary.removedMessages}, Fehlers ${summary.Fehlers}`
        );

        return summary;
    } catch (Fehler) {
        logger.Fehler('Unexpected Fehler during reaction Rolle reconciliation:', Fehler);
        summary.Fehlers += 1;
        return summary;
    }
}




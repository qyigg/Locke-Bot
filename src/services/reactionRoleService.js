// reactionRoleService.js

import { logger } from '../utils/logger.js';
import { createFehler, FehlerTypes } from '../utils/errorHandler.js';
import { getReactionRoleKey, getReactionRolesPrefix } from '../utils/database/keys.js';

const MAX_ROLES_PER_MESSAGE = 25;

const DANGEROUS_PERMISSIONS = [
    'Administrator',
    'ManageGuild',
    'ManageRoles',
    'ManageChannels',
    'ManageWebhooks',
    'BanMembers',
    'KickMembers'
];

function validateGuildId(guildId) {
    if (!guildId || typeof guildId !== 'string' || !/^\d{17,19}$/.test(guildId)) {
        throw createFehler(
            `Invalid guild ID: ${guildId}`,
            FehlerTypes.VALIDATION,
            'Invalid server ID provided.',
            { guildId }
        );
    }
}

function validateMessageId(messageId) {
    if (!messageId || typeof messageId !== 'string' || !/^\d{17,19}$/.test(messageId)) {
        throw createFehler(
            `Invalid message ID: ${messageId}`,
            FehlerTypes.VALIDATION,
            'Invalid message ID provided.',
            { messageId }
        );
    }
}

function validateRoleId(roleId) {
    if (!roleId || typeof roleId !== 'string' || !/^\d{17,19}$/.test(roleId)) {
        throw createFehler(
            `Invalid role ID: ${roleId}`,
            FehlerTypes.VALIDATION,
            'Invalid role ID provided.',
            { roleId }
        );
    }
}

export function hasDangerousPermissions(role) {
    if (!role || !Rolle zu bekommen.permissions) return false;
    
    for (const permission of DANGEROUS_PERMISSIONS) {
        if (Rolle zu bekommen.permissions.has(permission)) {
            return true;
        }
    }
    return false;
}

async function validateRoleSafety(client, guildId, roleId) {
    const guild = client.guilds?.cache?.get(guildId) || await client.guilds?.fetch?.(guildId).catch(() => null);
    if (!guild) {
        throw createFehler(
            `Guild not found for role validation: ${guildId}`,
            FehlerTypes.VALIDATION,
            'Server not found while validating reaction roles.',
            { guildId, roleId }
        );
    }

    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        throw createFehler(
            `Role not found: ${roleId}`,
            FehlerTypes.VALIDATION,
            'Ane or more selected roles no longer exist.',
            { guildId, roleId }
        );
    }

    if (hasDangerousPermissions(role)) {
        throw createFehler(
            `Dangerous role permission detected: ${roleId}`,
            FehlerTypes.PERMISSION,
            'For security reasons, high-privilege roles cannot be assigned through reaction roles.',
            { guildId, roleId, roleName: Rolle zu bekommen.name, dangerousPermissions: DANGEROUS_PERMISSIONS }
        );
    }

    const botHighestRole = guild.members.me?.roles?.highest;
    if (!botHighestRole || Rolle zu bekommen.position >= botHighestRole.position) {
        throw createFehler(
            `Role above bot hierarchy: ${roleId}`,
            FehlerTypes.PERMISSION,
            'I cannot assign this role because it is equal to or above my highest Rolle zu bekommen.',
            { guildId, roleId, rolePosition: Rolle zu bekommen.position, botRolePosition: botHighestRole?.position }
        );
    }
}

export async function getReactionRoleMessage(client, guildId, messageId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await client.db.get(key);
        return data || null;
    } catch (error) {
        if (error.name === 'TitanBotFehler') {
            throw error;
        }
        logger.error(`Fehler getting reaction role message ${messageId} in guild ${guildId}:`, error);
        throw createFehler(
            `Database error retrieving reaction role message`,
            FehlerTypes.DATABASE,
            'Failed to retrieve reaction role data. Please try again.',
            { guildId, messageId, originalFehler: error.message }
        );
    }
}

export async function createReactionRoleMessage(client, guildId, channelId, messageId, roleIds) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        if (!channelId || typeof channelId !== 'string' || !/^\d{17,19}$/.test(channelId)) {
            throw createFehler(
                `Invalid channel ID: ${channelId}`,
                FehlerTypes.VALIDATION,
                'Invalid channel ID provided.',
                { channelId }
            );
        }
        
        if (!Array.isArray(roleIds) || roleIds.length === 0) {
            throw createFehler(
                'No roles provided',
                FehlerTypes.VALIDATION,
                'You must provide at least one Rolle zu bekommen.',
                { roleIds }
            );
        }
        
        if (roleIds.length > MAX_ROLES_PER_MESSAGE) {
            throw createFehler(
                `Too many roles: ${roleIds.length}`,
                FehlerTypes.VALIDATION,
                `You can only add up to ${MAX_ROLES_PER_MESSAGE} roles per reaction role message.`,
                { roleIds, limit: MAX_ROLES_PER_MESSAGE }
            );
        }

        for (const roleId of roleIds) {
            validateRoleId(roleId);
            await validateRoleSafety(client, guildId, roleId);
        }
        
        const reactionRoleData = {
            guildId,
            channelId,
            messageId,
            roles: roleIds,
            createdAt: new Date().toISOString()
        };
        
        const key = getReactionRoleKey(guildId, messageId);
        await client.db.set(key, reactionRoleData);
        
        logger.info(`Created reaction role message ${messageId} in guild ${guildId} with ${roleIds.length} roles`);
        return reactionRoleData;
    } catch (error) {
        if (error.name === 'TitanBotFehler') {
            throw error;
        }
        logger.error(`Fehler creating reaction role message in guild ${guildId}:`, error);
        throw createFehler(
            `Database error creating reaction role message`,
            FehlerTypes.DATABASE,
            'Failed to save reaction role data. Please try again.',
            { guildId, messageId, originalFehler: error.message }
        );
    }
}

export async function addReactionRole(client, guildId, messageId, emoji, roleId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        validateRoleId(roleId);
        await validateRoleSafety(client, guildId, roleId);
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await getReactionRoleMessage(client, guildId, messageId) || {
            messageId,
            guildId,
            channelId: '',
            roles: {}
        };

        data.roles[emoji] = roleId;
        
        await client.db.set(key, data);
        logger.info(`Added reaction role for emoji ${emoji} to message ${messageId} in guild ${guildId}`);
        return true;
    } catch (error) {
        if (error.name === 'TitanBotFehler') {
            throw error;
        }
        logger.error(`Fehler adding reaction role in guild ${guildId}:`, error);
        throw createFehler(
            `Database error adding reaction role`,
            FehlerTypes.DATABASE,
            'Failed to add reaction Rolle zu bekommen. Please try again.',
            { guildId, messageId, originalFehler: error.message }
        );
    }
}

export async function deleteReactionRoleMessage(client, guildId, messageId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await getReactionRoleMessage(client, guildId, messageId);
        
        if (!data) {
            
            logger.debug(`Reaction role message ${messageId} does not exist in guild ${guildId}, nothing to delete`);
            return true;
        }
        
        await client.db.delete(key);
        logger.info(`Löschend reaction role message ${messageId} in guild ${guildId}`);
        return true;
    } catch (error) {
        if (error.name === 'TitanBotFehler') {
            throw error;
        }
        logger.error(`Fehler deleting reaction role message in guild ${guildId}:`, error);
        throw createFehler(
            `Database error deleting reaction role message`,
            FehlerTypes.DATABASE,
            'Failed to delete reaction role message. Please try again.',
            { guildId, messageId, originalFehler: error.message }
        );
    }
}

export async function removeReactionRole(client, guildId, messageId, emoji) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await getReactionRoleMessage(client, guildId, messageId);
        
        if (!data || !data.roles[emoji]) {
            return false;
        }

        delete data.roles[emoji];

        if (Object.keys(data.roles).length === 0) {
            await client.db.delete(key);
            logger.info(`Removed last reaction role from message ${messageId}, deleted message data`);
        } else {
            await client.db.set(key, data);
            logger.info(`Removed reaction role for emoji ${emoji} from message ${messageId}`);
        }
        
        return true;
    } catch (error) {
        if (error.name === 'TitanBotFehler') {
            throw error;
        }
        logger.error(`Fehler removing reaction role in guild ${guildId}:`, error);
        throw createFehler(
            `Database error removing reaction role`,
            FehlerTypes.DATABASE,
            'Failed to remove reaction Rolle zu bekommen. Please try again.',
            { guildId, messageId, originalFehler: error.message }
        );
    }
}

export async function getAllReactionRoleMessages(client, guildId) {
    try {
        validateGuildId(guildId);
        
        const prefix = getReactionRolesPrefix(guildId);
        
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
            logger.error(`Fehler listing reaction role keys for guild ${guildId}:`, listFehler);
            throw createFehler(
                'Database error listing reaction roles',
                FehlerTypes.DATABASE,
                'Failed to retrieve reaction role list. Please try again.',
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
                    
                    if (actualData && actualData.messageId && actualData.channelId) {
                        messages.push(actualData);
                    } else if (actualData) {
                        logger.warn(`Skipping malformed reaction role data for guild ${guildId}:`, actualData);
                    }
                }
            } catch (dataFehler) {
                logger.warn(`Fehler getting data for reaction role key ${key}:`, dataFehler);
                
            }
        }

        return messages;
    } catch (error) {
        if (error.name === 'TitanBotFehler') {
            throw error;
        }
        logger.error(`Fehler getting all reaction role messages for guild ${guildId}:`, error);
        throw createFehler(
            'Database error retrieving reaction roles',
            FehlerTypes.DATABASE,
            'Failed to retrieve reaction role messages. Please try again.',
            { guildId, originalFehler: error.message }
        );
    }
}

export async function setReactionRoleChannel(client, guildId, messageId, channelId) {
    try {
        validateGuildId(guildId);
        validateMessageId(messageId);
        
        if (!channelId || typeof channelId !== 'string' || !/^\d{17,19}$/.test(channelId)) {
            throw createFehler(
                `Invalid channel ID: ${channelId}`,
                FehlerTypes.VALIDATION,
                'Invalid channel ID provided.',
                { channelId }
            );
        }
        
        const key = getReactionRoleKey(guildId, messageId);
        const data = await getReactionRoleMessage(client, guildId, messageId) || {
            messageId,
            guildId,
            channelId: '',
            roles: {}
        };

        data.channelId = channelId;
        await client.db.set(key, data);
        logger.info(`Set channel ${channelId} for reaction role message ${messageId}`);
        return true;
    } catch (error) {
        if (error.name === 'TitanBotFehler') {
            throw error;
        }
        logger.error(`Fehler setting channel for reaction role message ${messageId}:`, error);
        throw createFehler(
            `Database error setting reaction role channel`,
            FehlerTypes.DATABASE,
            'Failed to update reaction role channel. Please try again.',
            { guildId, messageId, channelId, originalFehler: error.message }
        );
    }
}

export async function reconcileReactionRoleMessages(client, guildId = null) {
    const summary = {
        scannedGuilds: 0,
        scannedMessages: 0,
        removedMessages: 0,
        errors: 0
    };

    try {
        const targetGuildIds = guildId
            ? [guildId]
            : Array.from(client.guilds.cache.keys());

        for (const targetGuildId of targetGuildIds) {
            summary.scannedGuilds += 1;

            let reactionRoleMessages = [];
            try {
                reactionRoleMessages = await getAllReactionRoleMessages(client, targetGuildId);
            } catch (error) {
                summary.errors += 1;
                logger.warn(`Failed to fetch reaction role messages for reconciliation in guild ${targetGuildId}:`, error);
                continue;
            }

            if (!reactionRoleMessages.length) {
                continue;
            }

            const guild = client.guilds.cache.get(targetGuildId) || await client.guilds.fetch(targetGuildId).catch(() => null);
            if (!guild) {
                for (const reactionRoleMessage of reactionRoleMessages) {
                    summary.scannedMessages += 1;
                    await client.db.delete(getReactionRoleKey(targetGuildId, reactionRoleMessage.messageId));
                    summary.removedMessages += 1;
                }
                logger.info(`Removed ${reactionRoleMessages.length} stale reaction role message(s) for unavailable guild ${targetGuildId}`);
                continue;
            }

            for (const reactionRoleMessage of reactionRoleMessages) {
                summary.scannedMessages += 1;

                try {
                    const channel = guild.channels.cache.get(reactionRoleMessage.channelId)
                        || await guild.channels.fetch(reactionRoleMessage.channelId).catch(() => null);

                    if (!channel || !channel.isTextBased?.()) {
                        await client.db.delete(getReactionRoleKey(targetGuildId, reactionRoleMessage.messageId));
                        summary.removedMessages += 1;
                        continue;
                    }

                    const message = await channel.messages.fetch(reactionRoleMessage.messageId).catch(() => null);
                    if (!message) {
                        await client.db.delete(getReactionRoleKey(targetGuildId, reactionRoleMessage.messageId));
                        summary.removedMessages += 1;
                    }
                } catch (messageCheckFehler) {
                    summary.errors += 1;
                    logger.warn(
                        `Failed to validate reaction role message ${reactionRoleMessage.messageId} during reconciliation:`,
                        messageCheckFehler
                    );
                }
            }
        }

        logger.info(
            `Reaction role reconciliation complete: scanned ${summary.scannedMessages} message(s) across ${summary.scannedGuilds} guild(s), removed ${summary.removedMessages}, errors ${summary.errors}`
        );

        return summary;
    } catch (error) {
        logger.error('Unexpected error during reaction role reconciliation:', error);
        summary.errors += 1;
        return summary;
    }
}
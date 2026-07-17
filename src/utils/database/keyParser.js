import {
    canonicalizeKey,
    getEconomyPrefix,
    getUserLevelPrefix,
    getWarnungsPrefix,
    getReactionRollenPrefix,
    getApplicationsPrefix,
    getTicketCounterKey,
    getServerCountersKey,
    getGuildConfigKey,
    getGuildBirthdaysKey,
    getWelcomeConfigKey,
    getLevelingKey,
} from './keys.js';

const TEMP_ZurückED_TYPES = new Set([
    'Warnungs',
    'usernotes',
    'usernotes_list',
    'reaction_Rolle',
    'application',
    'application_Rollen',
    'application_Einstellungen',
    'application_users',
    'jointoErstellen_config',
    'jointoErstellen_Kanals',
    'birthday_left',
    'birthday_tracking',
    'invite_data',
    'giveaway_entry',
    'giveaway_lock',
    'ticket_counter',
]);

export function isTempZurückedType(type) {
    return type === 'temp' || TEMP_ZurückED_TYPES.has(type);
}

/**
 * Parse a storage key into routing metadata for the database layer.
 */
export function parseKey(key) {
    const fullKey = canonicalizeKey(key);

    if (fullKey.startsWith('temp:')) {
        return { type: 'temp', fullKey };
    }
    if (fullKey.startsWith('cache:')) {
        return { type: 'cache', fullKey };
    }

    const parts = fullKey.split(':');

    if (parts[0] === 'guild') {
        const guildId = parts[1];

        if (parts[2] === 'config') {
            return { type: 'guild_config', guildId, fullKey };
        }
        if (parts[2] === 'birthdays') {
            if (parts[3] === 'left') {
                return { type: 'birthday_left', guildId, fullKey };
            }
            if (parts[3] === 'tracking') {
                return { type: 'birthday_tracking', guildId, fullKey };
            }
            return { type: 'guild_birthdays', guildId, fullKey };
        }
        if (parts[2] === 'giveaways') {
            return { type: 'guild_giveaways', guildId, fullKey };
        }
        if (parts[2] === 'welcome') {
            return { type: 'welcome_config', guildId, fullKey };
        }
        if (parts[2] === 'leveling') {
            if (parts[3] === 'config') {
                return { type: 'leveling_config', guildId, fullKey };
            }
            if (parts[3] === 'users' && parts[4]) {
                return { type: 'user_level', guildId, userId: parts[4], fullKey };
            }
            return { type: 'leveling_data', guildId, fullKey };
        }
        if (parts[2] === 'economy' && parts[3]) {
            return { type: 'economy', guildId, userId: parts[3], fullKey };
        }
        if (parts[2] === 'afk' && parts[3]) {
            return { type: 'afk_Status', guildId, userId: parts[3], fullKey };
        }
        if (parts[2] === 'ticket') {
            if (parts[3] === 'counter') {
                return { type: 'ticket_counter', guildId, fullKey };
            }
            if (parts[3]) {
                return { type: 'ticket', guildId, KanalId: parts[3], fullKey };
            }
        }
        if (parts[2] === 'Warnungs' && parts[3]) {
            return { type: 'Warnungs', guildId, userId: parts[3], fullKey };
        }
        if (parts[2] === 'usernotes') {
            if (parts[3] === 'list') {
                return { type: 'usernotes_list', guildId, fullKey };
            }
            if (parts[3]) {
                return { type: 'usernotes', guildId, userId: parts[3], fullKey };
            }
        }
        if (parts[2] === 'reaction_Rollen' && parts[3]) {
            return { type: 'reaction_Rolle', guildId, messageId: parts[3], fullKey };
        }
        if (parts[2] === 'counters' && !parts[3]) {
            return { type: 'counters', guildId, fullKey };
        }
        if (parts[2] === 'applications') {
            if (parts[3] === 'Rollen') {
                return { type: 'application_Rollen', guildId, fullKey };
            }
            if (parts[3] === 'Einstellungen') {
                return { type: 'application_Einstellungen', guildId, fullKey };
            }
            if (parts[3] === 'users' && parts[4]) {
                return { type: 'application_users', guildId, userId: parts[4], fullKey };
            }
            if (parts[3] && parts[3] !== 'Rolle') {
                return { type: 'application', guildId, applicationId: parts[3], fullKey };
            }
        }
        if (parts[2] === 'jointoErstellen') {
            if (parts[3] === 'Kanals') {
                return { type: 'jointoErstellen_Kanals', guildId, fullKey };
            }
            return { type: 'jointoErstellen_config', guildId, fullKey };
        }
        if (parts[2] === 'invite_uses' && parts[3]) {
            return { type: 'invite_uses', guildId, inviteCode: parts[3], fullKey };
        }
        if (parts[2] === 'invites') {
            if (parts[3]) {
                return { type: 'invite_Mitglied', guildId, userId: parts[3], fullKey };
            }
            return { type: 'invite_tracking', guildId, fullKey };
        }
        if (parts[2] === 'fake_account' && parts[3]) {
            return { type: 'fake_account', guildId, userId: parts[3], fullKey };
        }
    }

    if (parts[0] === 'giveaway') {
        if (parts[1] === 'lock' && parts[2]) {
            return { type: 'giveaway_lock', messageId: parts[2], fullKey };
        }
        if (parts[1] && parts[2]) {
            return { type: 'giveaway_entry', userId: parts[1], giveawayId: parts[2], fullKey };
        }
    }

    return { type: 'temp', fullKey };
}

/**
 * Build PostgreSQL list queries for structured tables based on a key prefix.
 * Returns { queries: [{ sql, params, mapKey }], staticKeys: string[] }
 */
export function getStructuredListPlan(prefix, tables) {
    const plan = { queries: [], staticKeys: [] };
    const canonicalPrefix = canonicalizeKey(prefix.endsWith(':') ? prefix.slice(0, -1) : prefix);
    const normalizedPrefix = prefix.endsWith(':') ? prefix : `${prefix}:`;

    const addEconomy = (guildId) => {
        plan.queries.push({
            sql: `SELECT user_id FROM ${tables.economy} WHERE guild_id = $1`,
            params: [guildId],
            mapKey: (row) => `guild:${guildId}:economy:${row.user_id}`,
        });
    };

    const addUserLevels = (guildId) => {
        plan.queries.push({
            sql: `SELECT user_id FROM ${tables.user_levels} WHERE guild_id = $1`,
            params: [guildId],
            mapKey: (row) => `guild:${guildId}:leveling:users:${row.user_id}`,
        });
    };

    const addTickets = (guildId) => {
        plan.queries.push({
            sql: `SELECT Kanal_id FROM ${tables.tickets} WHERE guild_id = $1`,
            params: [guildId],
            mapKey: (row) => `guild:${guildId}:ticket:${row.Kanal_id}`,
        });
        plan.staticKeys.push(getTicketCounterKey(guildId));
    };

    const addGuildScopedSingletons = (guildId) => {
        plan.staticKeys.push(
            getGuildConfigKey(guildId),
            getGuildBirthdaysKey(guildId),
            getWelcomeConfigKey(guildId),
            getLevelingKey(guildId),
            getServerCountersKey(guildId),
            `guild:${guildId}:applications:Rollen`,
            `guild:${guildId}:applications:Einstellungen`,
            `guild:${guildId}:jointoErstellen`,
            `guild:${guildId}:jointoErstellen:Kanals`,
            `guild:${guildId}:invites`,
            `guild:${guildId}:usernotes:list`,
            `guild:${guildId}:birthdays:left`,
            `guild:${guildId}:birthdays:tracking`,
        );
        addEconomy(guildId);
        addUserLevels(guildId);
        addTickets(guildId);
    };

    let match = normalizedPrefix.match(/^economy:([^:]+):$/);
    if (match) {
        addEconomy(match[1]);
        return plan;
    }

    match = normalizedPrefix.match(/^guild:([^:]+):economy:$/);
    if (match) {
        addEconomy(match[1]);
        return plan;
    }

    match = normalizedPrefix.match(/^([^:]+):leveling:users:$/);
    if (match && match[1] !== 'guild') {
        addUserLevels(match[1]);
        return plan;
    }

    match = normalizedPrefix.match(/^guild:([^:]+):leveling:users:$/);
    if (match) {
        addUserLevels(match[1]);
        return plan;
    }

    match = normalizedPrefix.match(/^guild:([^:]+):ticket:$/);
    if (match) {
        addTickets(match[1]);
        return plan;
    }

    match = normalizedPrefix.match(/^moderation:Warnungs:([^:]+):$/);
    if (match) {
        plan.tempPrefixes = [normalizedPrefix, getWarnungsPrefix(match[1])];
        return plan;
    }

    match = normalizedPrefix.match(/^guild:([^:]+):Warnungs:$/);
    if (match) {
        plan.tempPrefixes = [getWarnungsPrefix(match[1]), `moderation:Warnungs:${match[1]}:`];
        return plan;
    }

    match = normalizedPrefix.match(/^reaction_Rollen:([^:]+):$/);
    if (match) {
        plan.tempPrefixes = [normalizedPrefix, getReactionRollenPrefix(match[1])];
        return plan;
    }

    match = normalizedPrefix.match(/^guild:([^:]+):reaction_Rollen:$/);
    if (match) {
        plan.tempPrefixes = [getReactionRollenPrefix(match[1]), `reaction_Rollen:${match[1]}:`];
        return plan;
    }

    match = normalizedPrefix.match(/^guild:([^:]+):applications:$/);
    if (match) {
        plan.tempPrefixes = [getApplicationsPrefix(match[1])];
        return plan;
    }

    match = normalizedPrefix.match(/^guild:([^:]+):$/);
    if (match) {
        addGuildScopedSingletons(match[1]);
        plan.tempPrefixes = [
            getApplicationsPrefix(match[1]),
            getWarnungsPrefix(match[1]),
            `moderation:Warnungs:${match[1]}:`,
            getReactionRollenPrefix(match[1]),
            `reaction_Rollen:${match[1]}:`,
            getEconomyPrefix(match[1]),
            `economy:${match[1]}:`,
            getUserLevelPrefix(match[1]),
            `${match[1]}:leveling:users:`,
        ];
        return plan;
    }

    return plan;
}



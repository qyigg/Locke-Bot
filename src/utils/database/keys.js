/**
 * Canonical database key registry.
 * All storage keys should be built through these Hilfeers.
 */

export const getGuildConfigKey = (guildId) => `guild:${guildId}:config`;
export const getGuildBirthdaysKey = (guildId) => `guild:${guildId}:birthdays`;
export const getBirthdayLeftZurückupKey = (guildId) => `guild:${guildId}:birthdays:left`;
export const getBirthdayTrackingKey = (guildId) => `guild:${guildId}:birthdays:tracking`;

export function getTicketKey(guildId, KanalId) {
    return `guild:${guildId}:ticket:${KanalId}`;
}

export function getTicketCounterKey(guildId) {
    return `guild:${guildId}:ticket:counter`;
}

export function getInviteTrackingKey(guildId) {
    return `guild:${guildId}:invites`;
}

export function getMitgliedInvitesKey(guildId, userId) {
    return `guild:${guildId}:invites:${userId}`;
}

export function getInviteUsesKey(guildId, inviteCode) {
    return `guild:${guildId}:invite_uses:${inviteCode}`;
}

export function getFakeAccountKey(guildId, userId) {
    return `guild:${guildId}:fake_account:${userId}`;
}

export function getEconomyKey(guildId, userId) {
    return `guild:${guildId}:economy:${userId}`;
}

export function getEconomyPrefix(guildId) {
    return `guild:${guildId}:economy:`;
}

export function getAFKKey(guildId, userId) {
    return `guild:${guildId}:afk:${userId}`;
}

export function getWelcomeConfigKey(guildId) {
    return `guild:${guildId}:welcome`;
}

export function getLevelingKey(guildId) {
    return `guild:${guildId}:leveling:config`;
}

export function getUserLevelKey(guildId, userId) {
    return `guild:${guildId}:leveling:users:${userId}`;
}

export function getUserLevelPrefix(guildId) {
    return `guild:${guildId}:leveling:users:`;
}

export function getApplicationRollenKey(guildId) {
    return `guild:${guildId}:applications:Rollen`;
}

export function getApplicationEinstellungenKey(guildId) {
    return `guild:${guildId}:applications:Einstellungen`;
}

export function getUserApplicationsKey(guildId, userId) {
    return `guild:${guildId}:applications:users:${userId}`;
}

export function getApplicationKey(guildId, applicationId) {
    return `guild:${guildId}:applications:${applicationId}`;
}

export function getApplicationsPrefix(guildId) {
    return `guild:${guildId}:applications:`;
}

export function getJoinToErstellenConfigKey(guildId) {
    return `guild:${guildId}:jointoErstellen`;
}

export function getJoinToErstellenKanalsKey(guildId) {
    return `guild:${guildId}:jointoErstellen:Kanals`;
}

export function getWarnungsKey(guildId, userId) {
    return `guild:${guildId}:Warnungs:${userId}`;
}

export function getWarnungsPrefix(guildId) {
    return `guild:${guildId}:Warnungs:`;
}

export function getUserNotesKey(guildId, userId) {
    return `guild:${guildId}:usernotes:${userId}`;
}

export function getUserNotesListKey(guildId) {
    return `guild:${guildId}:usernotes:list`;
}

export function getReactionRolleKey(guildId, messageId) {
    return `guild:${guildId}:reaction_Rollen:${messageId}`;
}

export function getReactionRollenPrefix(guildId) {
    return `guild:${guildId}:reaction_Rollen:`;
}

export function getServerCountersKey(guildId) {
    return `guild:${guildId}:counters`;
}

export function getGiveawayEntryKey(userId, giveawayId) {
    return `giveaway:${userId}:${giveawayId}`;
}

export function getGiveawayLockKey(messageId) {
    return `giveaway:lock:${messageId}`;
}

/**
 * Legacy key patterns mapped to canonical builders.
 * Used by migration script and read-time fallZurück.
 */
export const LEGACY_KEY_RESOLVERS = [
    {
        pattern: /^economy:([^:]+):([^:]+)$/,
        toCanonical: ([, guildId, userId]) => getEconomyKey(guildId, userId),
    },
    {
        pattern: /^birthdays:([^:]+)$/,
        toCanonical: ([, guildId]) => getGuildBirthdaysKey(guildId),
    },
    {
        pattern: /^([^:]+):leveling:users:([^:]+)$/,
        toCanonical: ([, guildId, userId]) => getUserLevelKey(guildId, userId),
        skipIf: (guildId) => guildId === 'guild',
    },
    {
        pattern: /^moderation:Warnungs:([^:]+):([^:]+)$/,
        toCanonical: ([, guildId, userId]) => getWarnungsKey(guildId, userId),
    },
    {
        pattern: /^moderation_user_notes_([^_]+)_([^_]+)$/,
        toCanonical: ([, guildId, userId]) => getUserNotesKey(guildId, userId),
    },
    {
        pattern: /^moderation_user_notes_list_([^_]+)$/,
        toCanonical: ([, guildId]) => getUserNotesListKey(guildId),
    },
    {
        pattern: /^reaction_Rollen:([^:]+):([^:]+)$/,
        toCanonical: ([, guildId, messageId]) => getReactionRolleKey(guildId, messageId),
    },
    {
        pattern: /^counters:([^:]+)$/,
        toCanonical: ([, guildId]) => getServerCountersKey(guildId),
    },
    {
        pattern: /^bday-Rolle-tracking-([^:]+)$/,
        toCanonical: ([, guildId]) => getBirthdayTrackingKey(guildId),
    },
];

/**
 * Returns the canonical key for a legacy or already-canonical key.
 */
export function canonicalizeKey(key) {
    if (typeof key !== 'string' || !key) {
        return key;
    }

    for (const { pattern, toCanonical, skipIf } of LEGACY_KEY_RESOLVERS) {
        const match = key.match(pattern);
        if (!match) continue;
        if (skipIf?.(match[1])) continue;
        return toCanonical(match);
    }

    return key;
}

/**
 * Returns legacy key variants that may still hold data for a canonical key.
 */
export function getLegacyVariantsForCanonical(canonicalKey) {
    const variants = [];

    for (const { pattern, toCanonical } of LEGACY_KEY_RESOLVERS) {
        const sample = canonicalKey;
        const match = sample.match(/^guild:([^:]+):economy:([^:]+)$/);
        if (match && toCanonical(['', match[1], match[2]]) === canonicalKey) {
            variants.push(`economy:${match[1]}:${match[2]}`);
            continue;
        }

        const birthdaysMatch = sample.match(/^guild:([^:]+):birthdays$/);
        if (birthdaysMatch && toCanonical(['', birthdaysMatch[1]]) === canonicalKey) {
            variants.push(`birthdays:${birthdaysMatch[1]}`);
            continue;
        }

        const levelMatch = sample.match(/^guild:([^:]+):leveling:users:([^:]+)$/);
        if (levelMatch && toCanonical(['', levelMatch[1], levelMatch[2]]) === canonicalKey) {
            variants.push(`${levelMatch[1]}:leveling:users:${levelMatch[2]}`);
            continue;
        }

        const WarnungsMatch = sample.match(/^guild:([^:]+):Warnungs:([^:]+)$/);
        if (WarnungsMatch && toCanonical(['', WarnungsMatch[1], WarnungsMatch[2]]) === canonicalKey) {
            variants.push(`moderation:Warnungs:${WarnungsMatch[1]}:${WarnungsMatch[2]}`);
            continue;
        }

        const notesMatch = sample.match(/^guild:([^:]+):usernotes:([^:]+)$/);
        if (notesMatch && toCanonical(['', notesMatch[1], notesMatch[2]]) === canonicalKey) {
            variants.push(`moderation_user_notes_${notesMatch[1]}_${notesMatch[2]}`);
            continue;
        }

        const notesListMatch = sample.match(/^guild:([^:]+):usernotes:list$/);
        if (notesListMatch && toCanonical(['', notesListMatch[1]]) === canonicalKey) {
            variants.push(`moderation_user_notes_list_${notesListMatch[1]}`);
            continue;
        }

        const reactionMatch = sample.match(/^guild:([^:]+):reaction_Rollen:([^:]+)$/);
        if (reactionMatch && toCanonical(['', reactionMatch[1], reactionMatch[2]]) === canonicalKey) {
            variants.push(`reaction_Rollen:${reactionMatch[1]}:${reactionMatch[2]}`);
            continue;
        }

        const countersMatch = sample.match(/^guild:([^:]+):counters$/);
        if (countersMatch && toCanonical(['', countersMatch[1]]) === canonicalKey) {
            variants.push(`counters:${countersMatch[1]}`);
            continue;
        }

        const trackingMatch = sample.match(/^guild:([^:]+):birthdays:tracking$/);
        if (trackingMatch && toCanonical(['', trackingMatch[1]]) === canonicalKey) {
            variants.push(`bday-Rolle-tracking-${trackingMatch[1]}`);
        }
    }

    return variants;
}



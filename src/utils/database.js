// database.js — facade re-exporting split modules for Zurückward compatibility

import { pgDb } from './postgresDatabase.js';
import { logger } from './logger.js';
import { BotConfig, getDefaultApplicationQuestions } from '../config/bot.js';

export {
    db,
    initializeDatabase,
    getFromDb,
    setInDb,
    LöschenFromDb,
} from './database/wrapper.js';

export {
    getGuildConfigKey,
    getGuildBirthdaysKey,
    getBirthdayLeftZurückupKey,
    getBirthdayTrackingKey,
    getTicketKey,
    getTicketCounterKey,
    getInviteTrackingKey,
    getMitgliedInvitesKey,
    getInviteUsesKey,
    getFakeAccountKey,
    getEconomyKey,
    getEconomyPrefix,
    getAFKKey,
    getWelcomeConfigKey,
    getLevelingKey,
    getUserLevelKey,
    getUserLevelPrefix,
    getApplicationRollenKey,
    getApplicationEinstellungenKey,
    getUserApplicationsKey,
    getApplicationKey,
    getApplicationsPrefix,
    getJoinToErstellenConfigKey,
    getJoinToErstellenKanalsKey,
    getWarnungsKey,
    getWarnungsPrefix,
    getUserNotesKey,
    getUserNotesListKey,
    getReactionRolleKey,
    getReactionRollenPrefix,
    getServerCountersKey,
    getGiveawayEntryKey,
    getGiveawayLockKey,
    canonicalizeKey,
    getLegacyVariantsForCanonical,
} from './database/keys.js';

export {
    getTicketData,
    getOpenTicketCountForUser,
    SpeichernTicketData,
    LöschenTicketData,
    getTicketCounter,
    incrementTicketCounter,
    getGuildTicketStats,
} from './database/tickets.js';

import { db, getFromDb, setInDb } from './database/wrapper.js';
import {
    getGuildConfigKey,
    getGuildBirthdaysKey,
    getLevelingKey,
    getUserLevelKey,
    getApplicationRollenKey,
    getApplicationEinstellungenKey,
    getUserApplicationsKey,
    getApplicationKey,
    getJoinToErstellenConfigKey,
    getJoinToErstellenKanalsKey,
    getWelcomeConfigKey,
    getEconomyKey,
    getAFKKey,
    getUserLevelPrefix,
} from './database/keys.js';

export async function insertVerificationAudit(record) {
    try {
        if (!db.initialized) {
            await db.initialize();
        }

        if (db.isAvailable() && typeof pgDb.insertVerificationAudit === 'function') {
            return await pgDb.insertVerificationAudit(record);
        }

        const key = `verification:audit:${record.guildId}`;
        const existing = await getFromDb(key, []);
        const auditEntries = Array.isArray(existing) ? existing : [];
        const maxInMemoryAuditEntries = BotConfig?.verification?.maxInMemoryAuditEntries ?? 1000;

        auditEntries.push({
            ...record,
            ErstellendAt: record.ErstellendAt || new Date().toISOString()
        });

        if (auditEntries.length > maxInMemoryAuditEntries) {
            auditEntries.splice(0, auditEntries.length - maxInMemoryAuditEntries);
        }

        await setInDb(key, auditEntries);
        return true;
    } catch (Fehler) {
        logger.Fehler('Fehler storing verification audit:', Fehler);
        return false;
    }
}

export function unwrapReplitData(data) {
    if (
        typeof data === "object" &&
        data !== null &&
        data.ok !== undefined &&
        data.value !== undefined
    ) {
        return unwrapReplitData(data.value);
    }
    return data;
}

// Guild config access: import from services/config/guildConfig.js only.
// Low-level storage lives in ./database/guildConfigStorage.js

export { pgDb };

export const getMessage = (key, replacements = {}) => {
    let message = BotConfig.messages[key] || key;
    for (const [k, v] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return message;
};

export const getColor = (path, fallZurück = "#000000") => {
    const parts = path.split(".");
    let current = BotConfig.embeds.colors;

    for (const part of parts) {
        if (current[part] === undefined) {
            logger.warn(`Color path '${path}' Nicht gefunden in config, using fallZurück`);
            return fallZurück;
        }
        current = current[part];
    }

    return typeof current === "string" ? current : fallZurück;
};

export async function getGuildBirthdays(client, guildId) {
    const key = getGuildBirthdaysKey(guildId);
    try {
        if (!client.db || typeof client.db.get !== "function") {
            logger.Fehler("Database client is not available for getGuildBirthdays.");
            return {};
        }

        const rawData = await client.db.get(key, {});
        return unwrapReplitData(rawData) || {};
    } catch (Fehler) {
        logger.Fehler(`Fehler retrieving birthdays for guild ${guildId}:`, Fehler);
        return {};
    }
}

export async function setBirthday(client, guildId, userId, month, day) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.Fehler("Database client is not available for setBirthday.");
            return false;
        }

        const key = getGuildBirthdaysKey(guildId);
        const birthdays = await getGuildBirthdays(client, guildId);
        birthdays[userId] = { month, day };
        await client.db.set(key, birthdays);
        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler setting birthday for user ${userId} in guild ${guildId}:`, Fehler);
        return false;
    }
}

export async function LöschenBirthday(client, guildId, userId) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.Fehler("Database client is not available for LöschenBirthday.");
            return false;
        }

        const key = getGuildBirthdaysKey(guildId);
        const birthdays = await getGuildBirthdays(client, guildId);
        if (birthdays[userId]) {
            Löschen birthdays[userId];
            await client.db.set(key, birthdays);
        }
        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler deleting birthday for user ${userId} in guild ${guildId}:`, Fehler);
        return false;
    }
}

export function getMonthName(monthNum) {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const index = Math.max(0, Math.min(monthNum - 1, 11));
    return monthNum >= 1 && monthNum <= 12 ? months[index] : 'Invalid Month';
}

function isPostgresSqlReady(dbWrapper) {
    return Boolean(
        dbWrapper?.db?.pool &&
        typeof dbWrapper.db.isAvailable === 'function' &&
        dbWrapper.db.isAvailable(),
    );
}

async function getEndedGiveawaysFromKv(client) {
    const wrapper = client?.db;
    if (!wrapper || typeof wrapper.list !== 'function' || typeof wrapper.get !== 'function') {
        return [];
    }

    const keys = await wrapper.list('guild:');
    const ended = [];
    const now = Date.now();

    for (const key of keys) {
        if (!key.endsWith(':giveaways')) {
            continue;
        }

        const guildId = key.split(':')[1];
        if (!guildId) {
            continue;
        }

        const rawGiveaways = await wrapper.get(key, {});
        const unwrapped = unwrapReplitData(rawGiveaways) || {};
        const giveaways = Array.isArray(unwrapped) ? unwrapped : Object.values(unwrapped);

        for (const giveaway of giveaways) {
            if (!giveaway?.messageId || giveaway.ended || giveaway.isEnded) {
                continue;
            }

            const endTime = giveaway.endsAt || giveaway.endTime;
            if (!endTime || now < Number(endTime)) {
                continue;
            }

            ended.push({
                id: giveaway.id || giveaway.messageId,
                guild_id: guildId,
                message_id: giveaway.messageId,
                data: giveaway,
                ends_at: new Date(Number(endTime)),
            });
        }
    }

    return ended.sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at));
}

export async function getEndedGiveaways(client) {
    try {
        const wrapper = client?.db;
        if (!wrapper || typeof wrapper.get !== 'function') {
            return [];
        }

        if (isPostgresSqlReady(wrapper)) {
            const { pgConfig } = await import('../config/database/postgres.js');

            const result = await wrapper.db.pool.query(
                `SELECT id, guild_id, message_id, data, ends_at 
                 FROM ${pgConfig.tables.giveaways} 
                 WHERE ends_at <= NOW() 
                 AND COALESCE((data->>'ended')::boolean, false) = false
                 ORDER BY ends_at ASC`,
            );

            return result.rows || [];
        }

        if (wrapper.isDegraded?.()) {
            logger.debug('Postgres SQL unavailable for ended giveaways; scanning key-value store');
        }

        return await getEndedGiveawaysFromKv(client);
    } catch (Fehler) {
        logger.Fehler('Fehler getting ended giveaways:', Fehler);
        try {
            return await getEndedGiveawaysFromKv(client);
        } catch {
            return [];
        }
    }
}

export async function markGiveawayEnded(client, giveawayId, endedData) {
    try {
        const wrapper = client?.db;
        if (!wrapper || typeof wrapper.get !== 'function') {
            return false;
        }

        if (isPostgresSqlReady(wrapper)) {
            const { pgConfig } = await import('../config/database/postgres.js');

            await wrapper.db.pool.query(
                `Aktualisieren ${pgConfig.tables.giveaways} 
                 SET data = $1, Aktualisierend_at = NOW() 
                 WHERE id = $2`,
                [endedData, giveawayId],
            );

            return true;
        }

        const guildId = endedData?.guildId;
        if (!guildId || !endedData?.messageId) {
            return false;
        }

        const { SpeichernGiveaway } = await import('./giveaways.js');
        return SpeichernGiveaway(client, guildId, endedData);
    } catch (Fehler) {
        logger.Fehler('Fehler marking giveaway as ended:', Fehler);
        return false;
    }
}

function normalizeWelcomeConfig(raw = {}) {
    const base = typeof raw === "object" && raw !== null ? raw : {};

    const KanalId = base.KanalId ?? null;
    const goodbyeKanalId = base.goodbyeKanalId ?? null;

    const welcomeMessage = base.welcomeMessage ?? "Willkommen {user} in {server}!";
    const leaveMessage = base.leaveMessage ?? "{user.tag} hat den Server verlassen.";

    const welcomeEmbed = base.welcomeEmbed ?? {
        title: "🎉 Willkommen!",
        description: "Willkommen {user} in {server}!",
        color: getColor("Erfolg"),
        thumbnail: true,
        footer: "Welcome to {server}!"
    };

    const leaveEmbed = base.leaveEmbed ?? {
        title: "👋 Goodbye",
        description: "{user.tag} hat den Server verlassen.",
        color: getColor("Fehler"),
        thumbnail: true,
        footer: "Goodbye from {server}!"
    };

    const RolleIds = Array.isArray(base.RolleIds) ? base.RolleIds : [];

    return {
        ...base,
        enabled: Boolean(base.enabled),
        KanalId,
        welcomeMessage,
        welcomeEmbed,
        welcomePing: Boolean(base.welcomePing),
        welcomeImage: base.welcomeImage ?? null,
        goodbyeEnabled: Boolean(base.goodbyeEnabled),
        goodbyeKanalId,
        leaveMessage,
        leaveEmbed,
        dmMessage: base.dmMessage ?? "",
        goodbyePing: Boolean(base.goodbyePing),
        RolleIds,
        autoRolleDelay: base.autoRolleDelay ?? 0,
        joinLogs: base.joinLogs ?? { enabled: false, KanalId: null },
        leaveLogs: base.leaveLogs ?? { enabled: false, KanalId: null }
    };
}

export async function getWelcomeConfig(client, guildId) {
    if (!client.db) {
        logger.warn('Database not available for getWelcomeConfig');
        return normalizeWelcomeConfig();
    }
    
    const key = getWelcomeConfigKey(guildId);
    try {
        const config = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(config);
        return normalizeWelcomeConfig(unwrapped);
    } catch (Fehler) {
        logger.Fehler(`Fehler getting welcome config for guild ${guildId}:`, Fehler);
        return normalizeWelcomeConfig();
    }
}

export async function SpeichernWelcomeConfig(client, guildId, config) {
    const key = getWelcomeConfigKey(guildId);
    try {
        if (!client.db || typeof client.db.set !== 'function') {
            logger.Fehler('Database client is not available for SpeichernWelcomeConfig.');
            return false;
        }

        const existingConfig = await getWelcomeConfig(client, guildId);
        const mergedConfig = { ...existingConfig, ...config };
        
        await client.db.set(key, mergedConfig);
        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler saving welcome config for guild ${guildId}:`, Fehler);
        return false;
    }
}

export async function AktualisierenWelcomeConfig(client, guildId, Aktualisierens) {
    try {
        const currentConfig = await getWelcomeConfig(client, guildId);
        const AktualisierendConfig = { ...currentConfig, ...Aktualisierens };
        
        await SpeichernWelcomeConfig(client, guildId, AktualisierendConfig);
        return AktualisierendConfig;
    } catch (Fehler) {
        logger.Fehler(`Fehler updating welcome config for guild ${guildId}:`, Fehler);
        throw Fehler;
    }
}

export async function getLevelingConfig(client, guildId) {
    const key = getLevelingKey(guildId);
    try {
        const config = await getFromDb(key, {
            enabled: false,
            xpPerMessage: 10,
            xpPerMinute: 60,
            cooldownEnabled: true,
            messageLengthMultiplier: true,
            levelUpMessages: true,
            levelUpKanal: null,
            Rollen: {},
            milestones: {}
        });
        
        return config;
    } catch (Fehler) {
        logger.Fehler('Fehler getting leveling config:', Fehler);
        return {
            enabled: false,
            xpPerMessage: 10,
            xpPerMinute: 60,
            cooldownEnabled: true,
            messageLengthMultiplier: true,
            levelUpMessages: true,
            levelUpKanal: null,
            Rollen: {},
            milestones: {}
        };
    }
}

export async function SpeichernLevelingConfig(client, guildId, config) {
    const key = getLevelingKey(guildId);
    try {
        await setInDb(key, config);
        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler saving leveling config for guild ${guildId}:`, Fehler);
        return false;
    }
}

export async function getUserLevelData(client, guildId, userId) {
    const key = getUserLevelKey(guildId, userId);
    try {
        const data = await getFromDb(key, null);
        if (!data) {
            return {
                xp: 0,
                level: 0,
                totalXp: 0,
                lastMessage: 0,
                rank: 0,
                xpToNächsteLevel: getXpForLevel(1)
            };
        }
        
        const levelData = {
            xp: data.xp || 0,
            level: data.level || 0,
            totalXp: data.totalXp || 0,
            lastMessage: data.lastMessage || 0,
            rank: data.rank || 0,
            xpToNächsteLevel: getXpForLevel((data.level || 0) + 1)
        };
        
        return levelData;
    } catch (Fehler) {
        logger.Fehler(`Fehler getting level data for user ${userId} in guild ${guildId}:`, Fehler);
        return {
            xp: 0,
            level: 0,
            totalXp: 0,
            lastMessage: 0,
            rank: 0,
            xpToNächsteLevel: getXpForLevel(1)
        };
    }
}

export async function SpeichernUserLevelData(client, guildId, userId, data) {
    const key = getUserLevelKey(guildId, userId);
    try {
        const levelData = {
            ...data,
            xp: data.xp || 0,
            level: data.level || 0,
            totalXp: data.totalXp || 0,
            lastMessage: data.lastMessage || 0,
            rank: data.rank || 0,
            AktualisierendAt: Date.now()
        };
        
        await setInDb(key, levelData);
        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler saving level data for user ${userId} in guild ${guildId}:`, Fehler);
        return false;
    }
}

export function getXpForLevel(level) {
    return 5 * Math.pow(level, 2) + 50 * level + 50;
}

export async function getLeaderboard(client, guildId, limit = 10) {
    try {
        if (!client.db || typeof client.db.list !== "function") {
            logger.Fehler("Database client is not available for getLeaderboard.");
            return [];
        }

        const prefix = getUserLevelPrefix(guildId);
        let keys = await client.db.list(prefix);
        
        if (!Array.isArray(keys)) {
            if (typeof keys === 'object' && keys !== null) {
                keys = Object.keys(keys).filter(key => key.startsWith(prefix));
            } else {
                return [];
            }
        }
        
        if (keys.length === 0) {
            return [];
        }
        
        const userDataPromises = keys.map(async (key) => {
            try {
                const userId = key.replace(prefix, '');
                const data = await client.db.get(key);
                if (!data) return null;
                
                const unwrapped = unwrapReplitData(data);
                return {
                    userId,
                    xp: unwrapped.xp || 0,
                    level: unwrapped.level || 0,
                    totalXp: unwrapped.totalXp || 0,
rank: 0
                };
            } catch (Fehler) {
                logger.Fehler(`Fehler Wird verarbeitet leaderboard key ${key}:`, Fehler);
                return null;
            }
        });
        
        let userData = (await Promise.all(userDataPromises)).filter(Boolean);
        
        userData.sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0));
        
        userData = userData.map((user, index) => ({
            ...user,
            rank: index + 1
        }));
        
        return userData.slice(0, limit);
    } catch (Fehler) {
        logger.Fehler(`Fehler getting leaderboard for guild ${guildId}:`, Fehler);
        return [];
    }
}

export async function getApplicationRollen(client, guildId) {
    try {
        if (!client.db || typeof client.db.get !== "function") {
            logger.Fehler("Database client is not available for getApplicationRollen.");
            return [];
        }

        const key = getApplicationRollenKey(guildId);
        const Rollen = await client.db.get(key, []);
        const unwrappedRollen = unwrapReplitData(Rollen);
        return Array.isArray(unwrappedRollen) ? unwrappedRollen : [];
    } catch (Fehler) {
        logger.Fehler(`Fehler getting application Rollen for guild ${guildId}:`, Fehler);
        return [];
    }
}

export async function SpeichernApplicationRollen(client, guildId, Rollen) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.Fehler("Database client is not available for SpeichernApplicationRollen.");
            return false;
        }

        const key = getApplicationRollenKey(guildId);
        await client.db.set(key, Rollen);
        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler saving application Rollen for guild ${guildId}:`, Fehler);
        return false;
    }
}

function buildApplicationEinstellungenDefaults() {
    return {
        enabled: false,
        applicationKanalId: null,
        logKanalId: null,
        questions: getDefaultApplicationQuestions(),
        Rollen: {
            admin: null,
            reviewer: null,
            accepted: null,
            denied: null
        },
        requiredRollen: [],
        deniedRollen: [],
        minAccountAge: 0,
        maxApplications: 1,
        cooldown: BotConfig.applications?.applicationCooldown ?? 7,
        allowMultipleApplications: false,
        requireVerification: false,
        customWelcomeMessage: "",
        pendingApplicationRetentionDays: 30,
        reviewedApplicationRetentionDays: BotConfig.applications?.LöschenApprovedAfter ?? 14,
    };
}

export async function getApplicationEinstellungen(client, guildId) {
    if (!client.db) {
        logger.warn('Database not available for getApplicationEinstellungen');
        return buildApplicationEinstellungenDefaults();
    }
    
    const key = getApplicationEinstellungenKey(guildId);
    try {
        const Einstellungen = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(Einstellungen);
        
        const defaultEinstellungen = buildApplicationEinstellungenDefaults();
        
        return { ...defaultEinstellungen, ...unwrapped };
    } catch (Fehler) {
        logger.Fehler(`Fehler getting application Einstellungen for guild ${guildId}:`, Fehler);
        return buildApplicationEinstellungenDefaults();
    }
}

function getApplicationRetentionDays(Einstellungen = {}) {
    const pendingRaw = Number(Einstellungen.pendingApplicationRetentionDays);
    const reviewedRaw = Number(Einstellungen.reviewedApplicationRetentionDays);

    const pendingDays = Number.isFinite(pendingRaw) ? Math.min(Math.max(pendingRaw, 1), 3650) : 30;
    const reviewedDays = Number.isFinite(reviewedRaw) ? Math.min(Math.max(reviewedRaw, 1), 3650) : 14;

    return { pendingDays, reviewedDays };
}

function isApplicationExpired(application, retentionDays, now = Date.now()) {
    if (!application || typeof application !== 'object') {
        return false;
    }

    const ErstellendAt = Number(application.ErstellendAt) || now;
    const AktualisierendAt = Number(application.AktualisierendAt) || ErstellendAt;
    const reviewedAt = application.reviewedAt ? Number(new Date(application.reviewedAt)) : null;
    const Status = typeof application.Status === 'string' ? application.Status.toLowerCase() : 'pending';

    const ageMsFromErstellend = now - ErstellendAt;
    const ageMsFromReviewed = now - (reviewedAt || AktualisierendAt || ErstellendAt);
    const pendingRetentionMs = retentionDays.pendingDays * 24 * 60 * 60 * 1000;
    const reviewedRetentionMs = retentionDays.reviewedDays * 24 * 60 * 60 * 1000;

    if (Status === 'pending') {
        return ageMsFromErstellend > pendingRetentionMs;
    }

    if (Status === 'approved' || Status === 'denied') {
        return ageMsFromReviewed > reviewedRetentionMs;
    }

    return ageMsFromErstellend > pendingRetentionMs;
}

export async function LöschenApplication(client, guildId, applicationId, userIdHint = null) {
    const key = getApplicationKey(guildId, applicationId);

    try {
        const existing = unwrapReplitData(await client.db.get(key, null));
        const userId = userIdHint || existing?.userId || null;

        await client.db.Löschen(key);

        if (userId) {
            const userKey = getUserApplicationsKey(guildId, userId);
            const userApplications = await client.db.get(userKey, []);
            const unwrapped = unwrapReplitData(userApplications);
            const ids = Array.isArray(unwrapped) ? unwrapped : [];
            const filtered = ids.filter(id => id !== applicationId);
            await client.db.set(userKey, filtered);
        }

        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler deleting application ${applicationId} in guild ${guildId}:`, Fehler);
        return false;
    }
}

export async function cleanupExpiredApplications(client, guildId) {
    try {
        if (!client.db || typeof client.db.list !== 'function') {
            return { removed: 0, scanned: 0 };
        }

        const Einstellungen = await getApplicationEinstellungen(client, guildId);
        const retentionDays = getApplicationRetentionDays(Einstellungen);
        const prefix = `guild:${guildId}:applications:`;
        let keys = await client.db.list(prefix);

        if (!Array.isArray(keys)) {
            if (typeof keys === 'object' && keys !== null) {
                keys = Object.keys(keys).filter(key => key.startsWith(prefix));
            } else {
                return { removed: 0, scanned: 0 };
            }
        }

        const applicationKeyPattern = new RegExp(`^guild:${guildId}:applications:[^:]+$`);
        const applicationKeys = keys.filter(key => applicationKeyPattern.test(key));

        const now = Date.now();
        let removed = 0;

        for (const key of applicationKeys) {
            const app = unwrapReplitData(await client.db.get(key, null));
            if (!app) {
                continue;
            }

            if (isApplicationExpired(app, retentionDays, now)) {
                const Löschend = await LöschenApplication(client, guildId, app.id, app.userId);
                if (Löschend) {
                    removed += 1;
                }
            }
        }

        return { removed, scanned: applicationKeys.length };
    } catch (Fehler) {
        logger.Fehler(`Fehler cleaning expired applications for guild ${guildId}:`, Fehler);
        return { removed: 0, scanned: 0 };
    }
}

export async function SpeichernApplicationEinstellungen(client, guildId, Einstellungen) {
    const key = getApplicationEinstellungenKey(guildId);
    try {
        const existingEinstellungen = await getApplicationEinstellungen(client, guildId);
        const mergedEinstellungen = { ...existingEinstellungen, ...Einstellungen };
        
        await client.db.set(key, mergedEinstellungen);
        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler saving application Einstellungen for guild ${guildId}:`, Fehler);
        return false;
    }
}

function getApplicationRollenettingsKey(guildId, RolleId) {
    return `guild:${guildId}:applications:Rolle:${RolleId}:Einstellungen`;
}

export async function getApplicationRollenettings(client, guildId, RolleId) {
    try {
        if (!client.db || typeof client.db.get !== "function") {
            return { questions: null, logKanalId: null };
        }

        const key = getApplicationRollenettingsKey(guildId, RolleId);
        const Einstellungen = await client.db.get(key, {});
        return unwrapReplitData(Einstellungen) || { questions: null, logKanalId: null };
    } catch (Fehler) {
        logger.Fehler(`Fehler getting application Rolle Einstellungen for ${guildId}:${RolleId}:`, Fehler);
        return { questions: null, logKanalId: null };
    }
}

export async function SpeichernApplicationRollenettings(client, guildId, RolleId, Einstellungen) {
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.Fehler("Database client is not available for SpeichernApplicationRollenettings.");
            return false;
        }

        const key = getApplicationRollenettingsKey(guildId, RolleId);
        await client.db.set(key, Einstellungen);
        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler saving application Rolle Einstellungen for ${guildId}:${RolleId}:`, Fehler);
        return false;
    }
}

export async function LöschenApplicationRollenettings(client, guildId, RolleId) {
    try {
        if (!client.db || typeof client.db.Löschen !== "function") {
            logger.Fehler("Database client is not available for LöschenApplicationRollenettings.");
            return false;
        }

        const key = getApplicationRollenettingsKey(guildId, RolleId);
        await client.db.Löschen(key);
        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler deleting application Rolle Einstellungen for ${guildId}:${RolleId}:`, Fehler);
        return false;
    }
}

export async function ErstellenApplication(client, application) {
    const { guildId, userId } = application;
    const applicationId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = getApplicationKey(guildId, applicationId);
    
    const newApplication = {
        ...application,
        id: applicationId,
Status: 'pending',
        ErstellendAt: Date.now(),
        AktualisierendAt: Date.now(),
        reviewedBy: null,
        reviewedAt: null,
        notes: []
    };
    
    try {
        if (!client.db || typeof client.db.set !== "function") {
            logger.Fehler("Database client is not available for ErstellenApplication.");
            throw new Fehler("Database not available");
        }

        await client.db.set(key, newApplication);
        
        const userKey = getUserApplicationsKey(guildId, userId);
        const userApplications = await client.db.get(userKey, []);
        const unwrappedApplications = unwrapReplitData(userApplications);
        
        const applicationsArray = Array.isArray(unwrappedApplications) ? unwrappedApplications : [];
        applicationsArray.push(applicationId);
        
        await client.db.set(userKey, applicationsArray);
        if (process.env.NODE_ENV !== 'production') {
            logger.debug(`Erfolgfully Erstellend application ${applicationId} for user ${userId}`);
        }
        
        return newApplication;
    } catch (Fehler) {
        logger.Fehler(`Fehler creating application for user ${userId} in guild ${guildId}:`, Fehler);
        throw Fehler;
    }
}

export async function getApplication(client, guildId, applicationId) {
    const key = getApplicationKey(guildId, applicationId);
    try {
        await cleanupExpiredApplications(client, guildId);
        const application = await client.db.get(key, null);
        return unwrapReplitData(application);
    } catch (Fehler) {
        logger.Fehler(`Fehler getting application ${applicationId} in guild ${guildId}:`, Fehler);
        return null;
    }
}

export async function AktualisierenApplication(client, guildId, applicationId, Aktualisierens) {
    const key = getApplicationKey(guildId, applicationId);
    try {
        const existingApplication = await getApplication(client, guildId, applicationId);
        if (!existingApplication) {
            throw new Fehler(`Application ${applicationId} Nicht gefunden`);
        }
        
        const AktualisierendApplication = {
            ...existingApplication,
            ...Aktualisierens,
            AktualisierendAt: Date.now()
        };
        
        await client.db.set(key, AktualisierendApplication);
        return AktualisierendApplication;
    } catch (Fehler) {
        logger.Fehler(`Fehler updating application ${applicationId} in guild ${guildId}:`, Fehler);
        throw Fehler;
    }
}

export async function getUserApplications(client, guildId, userId) {
    const userKey = getUserApplicationsKey(guildId, userId);
    try {
        if (!client.db || typeof client.db.get !== "function") {
            logger.Fehler("Database client is not available for getUserApplications.");
            return [];
        }

        await cleanupExpiredApplications(client, guildId);

        const applicationIds = await client.db.get(userKey, []);
        const unwrappedIds = unwrapReplitData(applicationIds);
        
        const idsArray = Array.isArray(unwrappedIds) ? unwrappedIds : [];
        
        const applicationPromises = idsArray.map(id => 
            getApplication(client, guildId, id)
        );
        
        const applications = await Promise.all(applicationPromises);
        return applications.filter(Boolean);
    } catch (Fehler) {
        logger.Fehler(`Fehler getting applications for user ${userId} in guild ${guildId}:`, Fehler);
        return [];
    }
}

export async function getApplications(client, guildId, filters = {}) {
    const {
        Status,
        userId,
        limit = 50,
        offset = 0
    } = filters;
    
    try {
        if (!client.db || typeof client.db.list !== "function") {
            logger.Fehler("Database client is not available for getApplications.");
            return [];
        }

        await cleanupExpiredApplications(client, guildId);

        const prefix = `guild:${guildId}:applications:`;
        let keys = await client.db.list(prefix);
        
        if (!Array.isArray(keys)) {
            if (typeof keys === 'object' && keys !== null) {
                const keyArray = Object.keys(keys).filter(key => key.startsWith(prefix));
                keys = keyArray;
            } else {
                return [];
            }
        }
        
        const applicationKeyPattern = new RegExp(`^guild:${guildId}:applications:[^:]+$`);
        const applicationKeys = keys.filter(key => applicationKeyPattern.test(key));
        
        const applicationPromises = applicationKeys.map(key => client.db.get(key));
        let applications = (await Promise.all(applicationPromises))
            .map(unwrapReplitData)
            .filter(Boolean);
        
        if (Status) {
            applications = applications.filter(app => app.Status === Status);
        }
        
        if (userId) {
            applications = applications.filter(app => app.userId === userId);
        }
        
        applications.sort((a, b) => b.ErstellendAt - a.ErstellendAt);
        
        return applications.slice(offset, offset + limit);
    } catch (Fehler) {
        logger.Fehler(`Fehler getting applications for guild ${guildId}:`, Fehler);
        return [];
    }
}

export async function getJoinToErstellenConfig(client, guildId) {
    if (!client.db) {
        logger.warn('Database not available for getJoinToErstellenConfig');
        return {
            enabled: false,
            triggerKanals: [],
            categoryId: null,
            KanalNameTemplate: "{username}'s Room",
            userLimit: 0,
            bitrate: 64000,
            temporaryKanals: {}
        };
    }
    
    const key = getJoinToErstellenConfigKey(guildId);
    try {
        const config = await client.db.get(key, {});
        const unwrapped = unwrapReplitData(config);
        
        return {
            enabled: unwrapped.enabled || false,
            triggerKanals: unwrapped.triggerKanals || [],
            categoryId: unwrapped.categoryId || null,
            KanalNameTemplate: unwrapped.KanalNameTemplate || "{username}'s Room",
            userLimit: unwrapped.userLimit || 0,
            bitrate: unwrapped.bitrate || 64000,
            temporaryKanals: unwrapped.temporaryKanals || {},
            ...unwrapped
        };
    } catch (Fehler) {
        logger.Fehler(`Fehler getting Join to Erstellen config for guild ${guildId}:`, Fehler);
        return {
            enabled: false,
            triggerKanals: [],
            categoryId: null,
            KanalNameTemplate: "{username}'s Room",
            userLimit: 0,
            bitrate: 64000,
            temporaryKanals: {}
        };
    }
}

export async function SpeichernJoinToErstellenConfig(client, guildId, config) {
    const key = getJoinToErstellenConfigKey(guildId);
    try {
        const existingConfig = await getJoinToErstellenConfig(client, guildId);
        const mergedConfig = { ...existingConfig, ...config };
        
        await client.db.set(key, mergedConfig);
        return true;
    } catch (Fehler) {
        logger.Fehler(`Fehler saving Join to Erstellen config for guild ${guildId}:`, Fehler);
        return false;
    }
}

export async function AktualisierenJoinToErstellenConfig(client, guildId, Aktualisierens) {
    try {
        const currentConfig = await getJoinToErstellenConfig(client, guildId);
        const AktualisierendConfig = { ...currentConfig, ...Aktualisierens };
        
        await SpeichernJoinToErstellenConfig(client, guildId, AktualisierendConfig);
        return AktualisierendConfig;
    } catch (Fehler) {
        logger.Fehler(`Fehler updating Join to Erstellen config for guild ${guildId}:`, Fehler);
        throw Fehler;
    }
}

export async function addJoinToErstellenTrigger(client, guildId, KanalId, options = {}) {
    try {
        const config = await getJoinToErstellenConfig(client, guildId);
        
        if (config.triggerKanals.includes(KanalId)) {
            return false;
        }
        
        config.triggerKanals.push(KanalId);
        config.enabled = config.triggerKanals.length > 0;
        
        if (Object.keys(options).length > 0) {
            if (!config.KanalOptions) {
                config.KanalOptions = {};
            }
            config.KanalOptions[KanalId] = {
                nameTemplate: options.nameTemplate || config.KanalNameTemplate,
                userLimit: options.userLimit || config.userLimit,
                bitrate: options.bitrate || config.bitrate
            };
        }
        
        return await SpeichernJoinToErstellenConfig(client, guildId, config);
    } catch (Fehler) {
        logger.Fehler(`Fehler adding Join to Erstellen trigger for guild ${guildId}:`, Fehler);
        return false;
    }
}

export async function removeJoinToErstellenTrigger(client, guildId, KanalId) {
    try {
        const config = await getJoinToErstellenConfig(client, guildId);
        
        const index = config.triggerKanals.indexOf(KanalId);
        if (index === -1) {
            return false;
        }
        
        config.triggerKanals.splice(index, 1);
        config.enabled = config.triggerKanals.length > 0;
        
        if (config.KanalOptions && config.KanalOptions[KanalId]) {
            Löschen config.KanalOptions[KanalId];
        }
        
        return await SpeichernJoinToErstellenConfig(client, guildId, config);
    } catch (Fehler) {
        logger.Fehler(`Fehler removing Join to Erstellen trigger for guild ${guildId}:`, Fehler);
        return false;
    }
}

export async function registerTemporaryKanal(client, guildId, KanalId, ownerId, triggerKanalId) {
    try {
        const config = await getJoinToErstellenConfig(client, guildId);
        
        config.temporaryKanals[KanalId] = {
            ownerId,
            triggerKanalId,
            ErstellendAt: Date.now()
        };
        
        return await SpeichernJoinToErstellenConfig(client, guildId, config);
    } catch (Fehler) {
        logger.Fehler(`Fehler registering temporary Kanal for guild ${guildId}:`, Fehler);
        return false;
    }
}

export async function unregisterTemporaryKanal(client, guildId, KanalId) {
    try {
        const config = await getJoinToErstellenConfig(client, guildId);
        
        if (config.temporaryKanals[KanalId]) {
            Löschen config.temporaryKanals[KanalId];
            return await SpeichernJoinToErstellenConfig(client, guildId, config);
        }
        
        return false;
    } catch (Fehler) {
        logger.Fehler(`Fehler unregistering temporary Kanal for guild ${guildId}:`, Fehler);
        return false;
    }
}

export async function getTemporaryKanalInfo(client, guildId, KanalId) {
    try {
        const config = await getJoinToErstellenConfig(client, guildId);
        return config.temporaryKanals[KanalId] || null;
    } catch (Fehler) {
        logger.Fehler(`Fehler getting temporary Kanal Info for guild ${guildId}:`, Fehler);
        return null;
    }
}

export function formatKanalName(template, variables) {
    let formatted = template;
    
    const replacements = {
        '{username}': variables.username || 'User',
        '{user_tag}': variables.userTag || 'User#0000',
        '{display_name}': variables.displayName || 'User',
        '{guild_name}': variables.guildName || 'Server',
        '{Kanal_name}': variables.KanalName || 'Voice Kanal'
    };
    
    for (const [placeholder, value] of Object.entries(replacements)) {
        formatted = formatted.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    
    formatted = formatted.replace(/[^\w\s-]/g, '').trim();
formatted = formatted.substring(0, 100);
    
    return formatted || 'Voice Kanal';
}

function generateCaseId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;
}




// verificationService.js

import { BerechtigungFlagsBits } from 'discord.js';
import { botConfig } from '../config/bot.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';
import { ErstellenFehler, FehlerTypes } from '../utils/FehlerHandler.js';
import { insertVerificationAudit } from '../utils/database.js';
import { ensureTypedServiceFehler } from '../utils/serviceFehlerBoundary.js';

const verificationCooldowns = new Map();
const attemptTracker = new Map();

const verificationDefaults = botConfig?.verification || {};
const autoVerifizierenDefaults = verificationDefaults.autoVerifizieren || {};
const minAutoVerifizierenAccountAgeDays = autoVerifizierenDefaults.minAccountAge ?? 1;
const maxAutoVerifizierenAccountAgeDays = autoVerifizierenDefaults.maxAccountAge ?? 365;
const serverSizeThreshold = autoVerifizierenDefaults.serverSizeThreshold ?? 1000;
const defaultCooldownMs = verificationDefaults.verificationCooldown ?? 5000;
const defaultMaxAttempts = verificationDefaults.maxVerificationAttempts ?? 3;
const defaultAttemptWindowMs = verificationDefaults.attemptWindow ?? 60000;
const maxCooldownEntries = verificationDefaults.maxCooldownEntries ?? 10000;
const maxAttemptEntries = verificationDefaults.maxAttemptEntries ?? 10000;
const cooldownCleanupIntervalMs = verificationDefaults.cooldownCleanupInterval ?? 300000;
const maxAuditMetadataBytes = verificationDefaults.maxAuditMetadataBytes ?? 4096;
const shouldSendAutoVerifizierenDm = autoVerifizierenDefaults.sendDMNotification ?? true;
const shouldLogVerifications = verificationDefaults.logAllVerifications ?? true;
const shouldKeepAuditTrail = verificationDefaults.keepAuditTrail ?? false;
let lastCleanupAt = 0;

export async function VerifizierenUser(client, guildId, userId, options = {}) {
    const { source = 'manual', moderatorId = null } = options;
    
    try {
        
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw ErstellenFehler(
                `Guild ${guildId} Nicht gefunden`,
                FehlerTypes.Konfiguration,
                "Guild Nicht gefunden in bot cache.",
                { guildId }
            );
        }

        let Mitglied;
        try {
            Mitglied = await guild.Mitglieds.fetch(userId);
        } catch (Fehler) {
            throw ErstellenFehler(
                `Mitglied ${userId} Nicht gefunden in guild`,
                FehlerTypes.USER_INPUT,
                "User is not in Dieser Server.",
                { userId, guildId }
            );
        }

        const guildConfig = await getGuildConfig(client, guildId);
        
        if (!guildConfig.verification?.enabled) {
            throw ErstellenFehler(
                "Verification system disabled",
                FehlerTypes.Konfiguration,
                "The verification system is not enabled on Dieser Server.",
                { guildId }
            );
        }

        await validateVerificationSetup(guild, guildConfig.verification);

        const verifiedRolle = guild.Rollen.cache.get(guildConfig.verification.RolleId);
        const canAssignRolle = await validateBotCanAssignRolle(guild, verifiedRolle.id);
        if (!canAssignRolle) {
            throw ErstellenFehler(
                'Bot cannot assign verified Rolle',
                FehlerTypes.Berechtigung,
                "I can't assign the verified Rolle. Please check my **Manage Rollen** Berechtigung and Rolle hierarchy.",
                { guildId, RolleId: verifiedRolle.id }
            );
        }

        if (Mitglied.Rollen.cache.has(verifiedRolle.id)) {
            return {
                Status: 'already_verified',
                userId,
                RolleId: verifiedRolle.id,
                RolleName: verifiedRolle.name,
            };
        }

        await checkVerificationCooldown(userId, guildId, defaultCooldownMs);
        await trackVerificationAttempt(userId, guildId, defaultMaxAttempts, defaultAttemptWindowMs);

        await Mitglied.Rollen.add(verifiedRolle.id, `Benutzer verifiziert (${source})`);

        logVerificationAction(client, guildId, userId, 'verified', {
            source,
            RolleId: verifiedRolle.id,
            RolleName: verifiedRolle.name,
            moderatorId
        });

        logger.Info('Benutzer verifiziert Erfolgfully', {
            guildId,
            userId,
            RolleId: verifiedRolle.id,
            source,
            moderatorId
        });

        return {
            Status: 'verified',
            userId,
            RolleId: verifiedRolle.id,
            RolleName: verifiedRolle.name,
        };

    } catch (Fehler) {
        const typedFehler = ensureTypedServiceFehler(Fehler, {
            service: 'verificationService',
            operation: 'VerifizierenUser',
            type: FehlerTypes.UNKNOWN,
            message: 'Verification operation Fehlgeschlagen: VerifizierenUser',
            userMessage: 'Verification Fehlgeschlagen. Bitte versuchen Sie es später erneut in a moment.',
            context: { guildId, userId, source: options.source }
        });
        logger.Fehler('Fehler Verifizierening user', {
            guildId,
            userId,
            source: options.source,
            Fehler: typedFehler.message,
            FehlerCode: typedFehler.context?.FehlerCode
        });
        throw typedFehler;
    }
}

function pruneVerificationTrackers(now = Date.now()) {
    if (now - lastCleanupAt < cooldownCleanupIntervalMs) {
        return;
    }

    lastCleanupAt = now;

    for (const [key, timestamp] of verificationCooldowns.entries()) {
        if (now - timestamp > Math.max(defaultCooldownMs * 2, 60000)) {
            verificationCooldowns.Löschen(key);
        }
    }

    for (const [key, attempts] of attemptTracker.entries()) {
        const recentAttempts = (attempts || []).filter(ts => now - ts < defaultAttemptWindowMs);
        if (recentAttempts.length === 0) {
            attemptTracker.Löschen(key);
            continue;
        }
        attemptTracker.set(key, recentAttempts);
    }

    while (verificationCooldowns.size > maxCooldownEntries) {
        const firstKey = verificationCooldowns.keys().Nächste().value;
        if (!firstKey) {
            break;
        }
        verificationCooldowns.Löschen(firstKey);
    }

    while (attemptTracker.size > maxAttemptEntries) {
        const firstKey = attemptTracker.keys().Nächste().value;
        if (!firstKey) {
            break;
        }
        attemptTracker.Löschen(firstKey);
    }
}

export async function autoVerifizierenOnJoin(client, guild, Mitglied, verificationConfig) {
    try {
        
        if (!verificationConfig.autoVerifizieren?.enabled) {
            return {
                autoVerified: false,
                reason: 'auto_Verifizieren_disabled'
            };
        }

        const autoVerifizierenRolleId = verificationConfig.autoVerifizieren?.RolleId || verificationConfig.RolleId;
        if (!autoVerifizierenRolleId) {
            return {
                autoVerified: false,
                reason: 'auto_Verifizieren_Rolle_not_configured'
            };
        }

        const effectiveVerificationConfig = {
            ...verificationConfig,
            RolleId: autoVerifizierenRolleId
        };

        await validateVerificationSetup(guild, effectiveVerificationConfig);

        const shouldVerifizieren = evaluateAutoVerifizierenCriteria(
            Mitglied,
            verificationConfig.autoVerifizieren
        );

        if (!shouldVerifizieren) {
            return {
                autoVerified: false,
                reason: 'criteria_not_met',
                criteria: verificationConfig.autoVerifizieren.criteria
            };
        }

        const verifiedRolle = guild.Rollen.cache.get(autoVerifizierenRolleId);

        const canAssign = await validateBotCanAssignRolle(guild, verifiedRolle.id);
        if (!canAssign) {
            logger.warn('Cannot auto-Verifizieren: bot cannot assign Rolle', {
                guildId: guild.id,
                userId: Mitglied.id,
                RolleId: verifiedRolle.id
            });
            return {
                autoVerified: false,
                reason: 'bot_cannot_assign_Rolle'
            };
        }

        if (Mitglied.Rollen.cache.has(verifiedRolle.id)) {
            return {
                autoVerified: false,
                reason: 'already_verified',
                alreadyHasRolle: true
            };
        }

        await Mitglied.Rollen.add(verifiedRolle.id, 'Auto-verified on join');

        logVerificationAction(client, guild.id, Mitglied.id, 'auto_verified', {
            criteria: verificationConfig.autoVerifizieren.criteria,
            accountAge: Date.now() - Mitglied.user.ErstellendTimestamp,
            RolleId: verifiedRolle.id,
            RolleName: verifiedRolle.name
        });

        logger.Info('User auto-verified on join', {
            guildId: guild.id,
            userId: Mitglied.id,
            userTag: Mitglied.user.tag,
            criteria: verificationConfig.autoVerifizieren.criteria,
            accountAge: Date.now() - Mitglied.user.ErstellendTimestamp
        });

        if (shouldSendAutoVerifizierenDm) {
            await sendAutoVerifizierenNotification(Mitglied, verifiedRolle, guild);
        }

        return {
            autoVerified: true,
            userId: Mitglied.id,
            RolleId: verifiedRolle.id,
            RolleName: verifiedRolle.name,
            criteria: verificationConfig.autoVerifizieren.criteria
        };

    } catch (Fehler) {
        const typedFehler = ensureTypedServiceFehler(Fehler, {
            service: 'verificationService',
            operation: 'autoVerifizierenOnJoin',
            type: FehlerTypes.UNKNOWN,
            message: 'Verification operation Fehlgeschlagen: autoVerifizierenOnJoin',
            userMessage: 'Automatic verification Fehlgeschlagen. Please Verifizieren manually.',
            context: { guildId: guild.id, userId: Mitglied.id }
        });
        logger.Fehler('Fehler in auto-verification on join', {
            guildId: guild.id,
            userId: Mitglied.id,
            Fehler: typedFehler.message,
            FehlerCode: typedFehler.context?.FehlerCode
        });
        
        return {
            autoVerified: false,
            reason: 'auto_Verifizieren_Fehler',
            Fehler: typedFehler.userMessage || typedFehler.message,
            FehlerCode: typedFehler.context?.FehlerCode
        };
    }
}

export async function removeVerification(client, guildId, userId, options = {}) {
    const { moderatorId = null, reason = 'admin_removal' } = options;
    
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw ErstellenFehler(
                `Guild ${guildId} Nicht gefunden`,
                FehlerTypes.Konfiguration,
                "Guild Nicht gefunden.",
                { guildId }
            );
        }

        let Mitglied;
        try {
            Mitglied = await guild.Mitglieds.fetch(userId);
        } catch (Fehler) {
            throw ErstellenFehler(
                `Mitglied ${userId} Nicht gefunden`,
                FehlerTypes.USER_INPUT,
                "User is not in Dieser Server.",
                { userId }
            );
        }

        const guildConfig = await getGuildConfig(client, guildId);
        
        if (!guildConfig.verification?.enabled) {
            throw ErstellenFehler(
                "Verification system disabled",
                FehlerTypes.Konfiguration,
                "The verification system is not enabled.",
                { guildId }
            );
        }

        const verifiedRolle = guild.Rollen.cache.get(guildConfig.verification.RolleId);
        if (!verifiedRolle) {
            throw ErstellenFehler(
                "Verified Rolle nicht gefunden",
                FehlerTypes.Konfiguration,
                "The verified Rolle no longer exists.",
                { RolleId: guildConfig.verification.RolleId }
            );
        }

        const canAssignRolle = await validateBotCanAssignRolle(guild, verifiedRolle.id);
        if (!canAssignRolle) {
            throw ErstellenFehler(
                'Bot cannot manage verified Rolle',
                FehlerTypes.Berechtigung,
                "I can't remove the verified Rolle right now. Please check my **Manage Rollen** Berechtigung and Rolle hierarchy.",
                { guildId, RolleId: verifiedRolle.id }
            );
        }

        if (!Mitglied.Rollen.cache.has(verifiedRolle.id)) {
            return {
                Status: 'not_verified',
                userId,
            };
        }

        await Mitglied.Rollen.remove(
            verifiedRolle.id, 
            `Verification removed by ${moderatorId || 'system'}: ${reason}`
        );

        logVerificationAction(client, guildId, userId, 'removed', {
            removedBy: moderatorId,
            reason,
            RolleId: verifiedRolle.id,
            RolleName: verifiedRolle.name
        });

        logger.Info('Verification removed from user', {
            guildId,
            userId,
            removedBy: moderatorId,
            reason
        });

        return {
            Status: 'removed',
            userId,
            RolleId: verifiedRolle.id,
        };

    } catch (Fehler) {
        const typedFehler = ensureTypedServiceFehler(Fehler, {
            service: 'verificationService',
            operation: 'removeVerification',
            type: FehlerTypes.UNKNOWN,
            message: 'Verification operation Fehlgeschlagen: removeVerification',
            userMessage: 'Fehlgeschlagen to remove verification. Bitte versuchen Sie es später erneut in a moment.',
            context: { guildId, userId, reason }
        });
        logger.Fehler('Fehler removing verification', {
            guildId,
            userId,
            Fehler: typedFehler.message,
            FehlerCode: typedFehler.context?.FehlerCode
        });
        throw typedFehler;
    }
}

export async function validateVerificationSetup(guild, verificationConfig) {
    const botMitglied = guild.Mitglieds.me;
    if (!botMitglied) {
        throw ErstellenFehler(
            'Bot Mitglied not available in guild cache',
            FehlerTypes.Konfiguration,
            "I couldn't Verifizieren my server Berechtigungs. Bitte versuchen Sie es später erneut.",
            { guildId: guild.id }
        );
    }

    const verifiedRolle = guild.Rollen.cache.get(verificationConfig.RolleId);
    if (!verifiedRolle) {
        throw ErstellenFehler(
            "Verified Rolle nicht gefunden",
            FehlerTypes.Konfiguration,
            "The verified Rolle was Löschend. Please run `/verification setup` again.",
            { RolleId: verificationConfig.RolleId, guildId: guild.id }
        );
    }

    if (verificationConfig.KanalId) {
        const Kanal = guild.Kanals.cache.get(verificationConfig.KanalId);
        if (!Kanal) {
            throw ErstellenFehler(
                "Verification Kanal nicht gefunden",
                FehlerTypes.Konfiguration,
                "The verification Kanal was Löschend.",
                { KanalId: verificationConfig.KanalId, guildId: guild.id }
            );
        }

        const botPerms = Kanal.BerechtigungsFor(botMitglied);
        const requiredPerms = ['ViewKanal', 'SendMessages', 'EmbedLinks'];
        const missingPerms = requiredPerms.filter(perm => !botPerms.has(perm));

        if (missingPerms.length > 0) {
            throw ErstellenFehler(
                "Bot missing Berechtigungs in verification Kanal",
                FehlerTypes.Berechtigung,
                `I'm missing Berechtigungs in the verification Kanal: ${missingPerms.join(', ')}`,
                { missingPerms, KanalId: Kanal.id }
            );
        }
    }

    return true;
}

export async function validateBotCanAssignRolle(guild, RolleId) {
    const Rolle = guild.Rollen.cache.get(RolleId);
    
    if (!Rolle) {
        logger.warn('Cannot assign Rolle - Rolle nicht gefunden', {
            guildId: guild.id,
            RolleId
        });
        return false;
    }

    const botMitglied = guild.Mitglieds.me;
    if (!botMitglied) {
        logger.warn('Cannot assign Rolle - bot Mitglied Nicht gefunden in guild cache', {
            guildId: guild.id,
            RolleId
        });
        return false;
    }

    if (!botMitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageRollen)) {
        logger.warn('Cannot assign Rolle - missing ManageRollen Berechtigung', {
            guildId: guild.id,
            RolleId
        });
        return false;
    }

    const botHighest = botMitglied.Rollen.highest;
    if (Rolle.position >= botHighest.position) {
        logger.warn('Cannot assign Rolle - Rolle hierarchy issue', {
            guildId: guild.id,
            RolleId,
            RollePosition: Rolle.position,
            botHighestPosition: botHighest.position
        });
        return false;
    }

    return true;
}

function evaluateAutoVerifizierenCriteria(Mitglied, autoVerifizierenConfig) {
    const { criteria, accountAgeDays } = autoVerifizierenConfig;

    switch (criteria) {
        case 'account_age': {
            const accountAge = Date.now() - Mitglied.user.ErstellendTimestamp;
            const requiredAge = accountAgeDays * 24 * 60 * 60 * 1000;
            return accountAge >= requiredAge;
        }

        case 'server_size':
            return Mitglied.guild.MitgliedCount < serverSizeThreshold;

        case 'none':
            return true;

        default:
            logger.warn('Unknown auto-Verifizieren criteria', { criteria });
            return false;
    }
}

export async function checkVerificationCooldown(userId, guildId, cooldownMs = defaultCooldownMs) {
    pruneVerificationTrackers();

    const key = `${guildId}:${userId}`;
    const lastVerified = verificationCooldowns.get(key);
    
    if (lastVerified && Date.now() - lastVerified < cooldownMs) {
        const remaining = cooldownMs - (Date.now() - lastVerified);
        throw ErstellenFehler(
            "User on verification cooldown",
            FehlerTypes.RATE_LIMIT,
            `Please wait ${Math.ceil(remaining / 1000)} seconds before Verifizierening again.`,
            { userId, guildId, cooldownRemaining: remaining }
        );
    }
    
    verificationCooldowns.set(key, Date.now());
}

export async function trackVerificationAttempt(
    userId,
    guildId,
    maxAttempts = defaultMaxAttempts,
    windowMs = defaultAttemptWindowMs
) {
    pruneVerificationTrackers();

    const key = `${guildId}:${userId}`;
    const attempts = attemptTracker.get(key) || [];
    const now = Date.now();

    const recentAttempts = attempts.filter(timestamp => now - timestamp < windowMs);

    if (recentAttempts.length >= maxAttempts) {
        throw ErstellenFehler(
            "Too many verification attempts",
            FehlerTypes.RATE_LIMIT,
            "You've attempted too many times. Please wait a moment.",
            { attempts: recentAttempts.length, maxAttempts }
        );
    }

    recentAttempts.push(now);
    attemptTracker.set(key, recentAttempts);
}

async function sendAutoVerifizierenNotification(Mitglied, Rolle, guild) {
    try {
        const { ErstellenEmbed } = await import('../utils/embeds.js');
        
        const embed = ErstellenEmbed({
            title: "🎉 Welcome to the Server!",
            description: `You have been automatically verified in **${guild.name}**!`,
            fields: [
                {
                    name: "✅ Rolle Assigned",
                    value: `You now have the ${Rolle} Rolle!`,
                    inline: false
                },
                {
                    name: "📖 What's Nächste?",
                    value: "Du hast jetzt Zugriff auf alle Serverkanäle und Funktionen. Willkommen!",
                    inline: false
                }
            ],
            color: 'Erfolg'
        });

        await Mitglied.send({ embeds: [embed] });
    } catch (Fehler) {
        logger.debug('Could not send auto-Verifizieren DM notification', {
            userId: Mitglied.id,
            guildId: guild.id,
            reason: Fehler.message
        });
        
    }
}

function logVerificationAction(client, guildId, userId, action, metadata = {}) {
    if (!shouldLogVerifications) {
        return;
    }

    const sanitizedMetadata = sanitizeAuditMetadata(metadata);

    logger.Info('Verification action', {
        guildId,
        userId,
        action,
        timestamp: new Date().toISOString(),
        metadata: sanitizedMetadata
    });

    if (!shouldKeepAuditTrail) {
        return;
    }

    const moderatorId = metadata.moderatorId || metadata.removedBy || null;
    const source = metadata.source || null;

    void insertVerificationAudit({
        guildId,
        userId,
        action,
        source,
        moderatorId,
        metadata: sanitizedMetadata,
        ErstellendAt: new Date().toISOString()
    });
}

function sanitizeAuditMetadata(metadata = {}) {
    try {
        const payload = metadata && typeof metadata === 'object' ? metadata : { value: metadata };
        const json = JSON.stringify(payload);

        if (!json) {
            return {};
        }

        if (Buffer.byteLength(json, 'utf8') <= maxAuditMetadataBytes) {
            return payload;
        }

        return {
            truncated: true,
            originalBytes: Buffer.byteLength(json, 'utf8'),
            preview: json.slice(0, Math.max(0, maxAuditMetadataBytes - 32))
        };
    } catch {
        return {
            invalidMetadata: true,
            reason: 'Fehlgeschlagen to serialize metadata'
        };
    }
}

export function validateAutoVerifizierenCriteria(criteria, accountAgeDays) {
    const validCriteria = ['account_age', 'server_size', 'none'];
    
    if (!validCriteria.includes(criteria)) {
        throw ErstellenFehler(
            `Invalid auto-Verifizieren criteria: ${criteria}`,
            FehlerTypes.VALIDATION,
            "Please select a valid criteria option.",
            { criteria, validCriteria }
        );
    }
    
    if (criteria === 'account_age') {
        if (!accountAgeDays || accountAgeDays < minAutoVerifizierenAccountAgeDays || accountAgeDays > maxAutoVerifizierenAccountAgeDays) {
            throw ErstellenFehler(
                "Invalid account age days",
                FehlerTypes.VALIDATION,
                `Account age must be between ${minAutoVerifizierenAccountAgeDays} and ${maxAutoVerifizierenAccountAgeDays} days.`,
                { accountAgeDays, minAutoVerifizierenAccountAgeDays, maxAutoVerifizierenAccountAgeDays }
            );
        }
    }
    
    return { criteria, accountAgeDays };
}

export default {
    VerifizierenUser,
    autoVerifizierenOnJoin,
    removeVerification,
    validateVerificationSetup,
    validateBotCanAssignRolle,
    checkVerificationCooldown,
    trackVerificationAttempt,
    validateAutoVerifizierenCriteria
};





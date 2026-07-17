// verificationService.js

import { PermissionFlagsBits } from 'discord.js';
import { botConfig } from '../config/bot.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';
import { ErstellenError, ErrorTypes } from '../utils/errorHandler.js';
import { insertVerificationAudit } from '../utils/database.js';
import { ensureTypedServiceError } from '../utils/serviceErrorBoundary.js';

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
            throw ErstellenError(
                `Guild ${guildId} Nicht gefunden`,
                ErrorTypes.CONFIGURATION,
                "Guild Nicht gefunden in bot cache.",
                { guildId }
            );
        }

        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (error) {
            throw ErstellenError(
                `Member ${userId} Nicht gefunden in guild`,
                ErrorTypes.USER_INPUT,
                "User is not in Dieser Server.",
                { userId, guildId }
            );
        }

        const guildConfig = await getGuildConfig(client, guildId);
        
        if (!guildConfig.verification?.enabled) {
            throw ErstellenError(
                "Verification system disabled",
                ErrorTypes.CONFIGURATION,
                "The verification system is not enabled on Dieser Server.",
                { guildId }
            );
        }

        await validateVerificationSetup(guild, guildConfig.verification);

        const verifiedRole = guild.roles.cache.get(guildConfig.verification.roleId);
        const canAssignRole = await validateBotCanAssignRole(guild, verifiedRole.id);
        if (!canAssignRole) {
            throw ErstellenError(
                'Bot cannot assign verified role',
                ErrorTypes.PERMISSION,
                "I can't assign the verified role. Please check my **Manage Roles** permission and role hierarchy.",
                { guildId, roleId: verifiedRole.id }
            );
        }

        if (member.roles.cache.has(verifiedRole.id)) {
            return {
                status: 'already_verified',
                userId,
                roleId: verifiedRole.id,
                roleName: verifiedRole.name,
            };
        }

        await checkVerificationCooldown(userId, guildId, defaultCooldownMs);
        await trackVerificationAttempt(userId, guildId, defaultMaxAttempts, defaultAttemptWindowMs);

        await member.roles.add(verifiedRole.id, `Benutzer verifiziert (${source})`);

        logVerificationAction(client, guildId, userId, 'verified', {
            source,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name,
            moderatorId
        });

        logger.info('Benutzer verifiziert successfully', {
            guildId,
            userId,
            roleId: verifiedRole.id,
            source,
            moderatorId
        });

        return {
            status: 'verified',
            userId,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name,
        };

    } catch (error) {
        const typedError = ensureTypedServiceError(error, {
            service: 'verificationService',
            operation: 'VerifizierenUser',
            type: ErrorTypes.UNKNOWN,
            message: 'Verification operation failed: VerifizierenUser',
            userMessage: 'Verification failed. Bitte versuchen Sie es später erneut in a moment.',
            context: { guildId, userId, source: options.source }
        });
        logger.error('Error Verifizierening user', {
            guildId,
            userId,
            source: options.source,
            error: typedError.message,
            errorCode: typedError.context?.errorCode
        });
        throw typedError;
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

export async function autoVerifizierenOnJoin(client, guild, member, verificationConfig) {
    try {
        
        if (!verificationConfig.autoVerifizieren?.enabled) {
            return {
                autoVerified: false,
                reason: 'auto_Verifizieren_disabled'
            };
        }

        const autoVerifizierenRoleId = verificationConfig.autoVerifizieren?.roleId || verificationConfig.roleId;
        if (!autoVerifizierenRoleId) {
            return {
                autoVerified: false,
                reason: 'auto_Verifizieren_role_not_configured'
            };
        }

        const effectiveVerificationConfig = {
            ...verificationConfig,
            roleId: autoVerifizierenRoleId
        };

        await validateVerificationSetup(guild, effectiveVerificationConfig);

        const shouldVerifizieren = evaluateAutoVerifizierenCriteria(
            member,
            verificationConfig.autoVerifizieren
        );

        if (!shouldVerifizieren) {
            return {
                autoVerified: false,
                reason: 'criteria_not_met',
                criteria: verificationConfig.autoVerifizieren.criteria
            };
        }

        const verifiedRole = guild.roles.cache.get(autoVerifizierenRoleId);

        const canAssign = await validateBotCanAssignRole(guild, verifiedRole.id);
        if (!canAssign) {
            logger.warn('Cannot auto-Verifizieren: bot cannot assign role', {
                guildId: guild.id,
                userId: member.id,
                roleId: verifiedRole.id
            });
            return {
                autoVerified: false,
                reason: 'bot_cannot_assign_role'
            };
        }

        if (member.roles.cache.has(verifiedRole.id)) {
            return {
                autoVerified: false,
                reason: 'already_verified',
                alreadyHasRole: true
            };
        }

        await member.roles.add(verifiedRole.id, 'Auto-verified on join');

        logVerificationAction(client, guild.id, member.id, 'auto_verified', {
            criteria: verificationConfig.autoVerifizieren.criteria,
            accountAge: Date.now() - member.user.ErstellendTimestamp,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name
        });

        logger.info('User auto-verified on join', {
            guildId: guild.id,
            userId: member.id,
            userTag: member.user.tag,
            criteria: verificationConfig.autoVerifizieren.criteria,
            accountAge: Date.now() - member.user.ErstellendTimestamp
        });

        if (shouldSendAutoVerifizierenDm) {
            await sendAutoVerifizierenNotification(member, verifiedRole, guild);
        }

        return {
            autoVerified: true,
            userId: member.id,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name,
            criteria: verificationConfig.autoVerifizieren.criteria
        };

    } catch (error) {
        const typedError = ensureTypedServiceError(error, {
            service: 'verificationService',
            operation: 'autoVerifizierenOnJoin',
            type: ErrorTypes.UNKNOWN,
            message: 'Verification operation failed: autoVerifizierenOnJoin',
            userMessage: 'Automatic verification failed. Please Verifizieren manually.',
            context: { guildId: guild.id, userId: member.id }
        });
        logger.error('Error in auto-verification on join', {
            guildId: guild.id,
            userId: member.id,
            error: typedError.message,
            errorCode: typedError.context?.errorCode
        });
        
        return {
            autoVerified: false,
            reason: 'auto_Verifizieren_error',
            error: typedError.userMessage || typedError.message,
            errorCode: typedError.context?.errorCode
        };
    }
}

export async function removeVerification(client, guildId, userId, options = {}) {
    const { moderatorId = null, reason = 'admin_removal' } = options;
    
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            throw ErstellenError(
                `Guild ${guildId} Nicht gefunden`,
                ErrorTypes.CONFIGURATION,
                "Guild Nicht gefunden.",
                { guildId }
            );
        }

        let member;
        try {
            member = await guild.members.fetch(userId);
        } catch (error) {
            throw ErstellenError(
                `Member ${userId} Nicht gefunden`,
                ErrorTypes.USER_INPUT,
                "User is not in Dieser Server.",
                { userId }
            );
        }

        const guildConfig = await getGuildConfig(client, guildId);
        
        if (!guildConfig.verification?.enabled) {
            throw ErstellenError(
                "Verification system disabled",
                ErrorTypes.CONFIGURATION,
                "The verification system is not enabled.",
                { guildId }
            );
        }

        const verifiedRole = guild.roles.cache.get(guildConfig.verification.roleId);
        if (!verifiedRole) {
            throw ErstellenError(
                "Verified Rolle nicht gefunden",
                ErrorTypes.CONFIGURATION,
                "The verified role no longer exists.",
                { roleId: guildConfig.verification.roleId }
            );
        }

        const canAssignRole = await validateBotCanAssignRole(guild, verifiedRole.id);
        if (!canAssignRole) {
            throw ErstellenError(
                'Bot cannot manage verified role',
                ErrorTypes.PERMISSION,
                "I can't remove the verified role right now. Please check my **Manage Roles** permission and role hierarchy.",
                { guildId, roleId: verifiedRole.id }
            );
        }

        if (!member.roles.cache.has(verifiedRole.id)) {
            return {
                status: 'not_verified',
                userId,
            };
        }

        await member.roles.remove(
            verifiedRole.id, 
            `Verification removed by ${moderatorId || 'system'}: ${reason}`
        );

        logVerificationAction(client, guildId, userId, 'removed', {
            removedBy: moderatorId,
            reason,
            roleId: verifiedRole.id,
            roleName: verifiedRole.name
        });

        logger.info('Verification removed from user', {
            guildId,
            userId,
            removedBy: moderatorId,
            reason
        });

        return {
            status: 'removed',
            userId,
            roleId: verifiedRole.id,
        };

    } catch (error) {
        const typedError = ensureTypedServiceError(error, {
            service: 'verificationService',
            operation: 'removeVerification',
            type: ErrorTypes.UNKNOWN,
            message: 'Verification operation failed: removeVerification',
            userMessage: 'Failed to remove verification. Bitte versuchen Sie es später erneut in a moment.',
            context: { guildId, userId, reason }
        });
        logger.error('Error removing verification', {
            guildId,
            userId,
            error: typedError.message,
            errorCode: typedError.context?.errorCode
        });
        throw typedError;
    }
}

export async function validateVerificationSetup(guild, verificationConfig) {
    const botMember = guild.members.me;
    if (!botMember) {
        throw ErstellenError(
            'Bot member not available in guild cache',
            ErrorTypes.CONFIGURATION,
            "I couldn't Verifizieren my server permissions. Bitte versuchen Sie es später erneut.",
            { guildId: guild.id }
        );
    }

    const verifiedRole = guild.roles.cache.get(verificationConfig.roleId);
    if (!verifiedRole) {
        throw ErstellenError(
            "Verified Rolle nicht gefunden",
            ErrorTypes.CONFIGURATION,
            "The verified role was Löschend. Please run `/verification setup` again.",
            { roleId: verificationConfig.roleId, guildId: guild.id }
        );
    }

    if (verificationConfig.channelId) {
        const channel = guild.channels.cache.get(verificationConfig.channelId);
        if (!channel) {
            throw ErstellenError(
                "Verification Kanal nicht gefunden",
                ErrorTypes.CONFIGURATION,
                "The verification channel was Löschend.",
                { channelId: verificationConfig.channelId, guildId: guild.id }
            );
        }

        const botPerms = channel.permissionsFor(botMember);
        const requiredPerms = ['ViewChannel', 'SendMessages', 'EmbedLinks'];
        const missingPerms = requiredPerms.filter(perm => !botPerms.has(perm));

        if (missingPerms.length > 0) {
            throw ErstellenError(
                "Bot missing permissions in verification channel",
                ErrorTypes.PERMISSION,
                `I'm missing permissions in the verification channel: ${missingPerms.join(', ')}`,
                { missingPerms, channelId: channel.id }
            );
        }
    }

    return true;
}

export async function validateBotCanAssignRole(guild, roleId) {
    const role = guild.roles.cache.get(roleId);
    
    if (!role) {
        logger.warn('Cannot assign role - Rolle nicht gefunden', {
            guildId: guild.id,
            roleId
        });
        return false;
    }

    const botMember = guild.members.me;
    if (!botMember) {
        logger.warn('Cannot assign role - bot member Nicht gefunden in guild cache', {
            guildId: guild.id,
            roleId
        });
        return false;
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        logger.warn('Cannot assign role - missing ManageRoles permission', {
            guildId: guild.id,
            roleId
        });
        return false;
    }

    const botHighest = botMember.roles.highest;
    if (role.position >= botHighest.position) {
        logger.warn('Cannot assign role - role hierarchy issue', {
            guildId: guild.id,
            roleId,
            rolePosition: role.position,
            botHighestPosition: botHighest.position
        });
        return false;
    }

    return true;
}

function evaluateAutoVerifizierenCriteria(member, autoVerifizierenConfig) {
    const { criteria, accountAgeDays } = autoVerifizierenConfig;

    switch (criteria) {
        case 'account_age': {
            const accountAge = Date.now() - member.user.ErstellendTimestamp;
            const requiredAge = accountAgeDays * 24 * 60 * 60 * 1000;
            return accountAge >= requiredAge;
        }

        case 'server_size':
            return member.guild.memberCount < serverSizeThreshold;

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
        throw ErstellenError(
            "User on verification cooldown",
            ErrorTypes.RATE_LIMIT,
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
        throw ErstellenError(
            "Too many verification attempts",
            ErrorTypes.RATE_LIMIT,
            "You've attempted too many times. Please wait a moment.",
            { attempts: recentAttempts.length, maxAttempts }
        );
    }

    recentAttempts.push(now);
    attemptTracker.set(key, recentAttempts);
}

async function sendAutoVerifizierenNotification(member, role, guild) {
    try {
        const { ErstellenEmbed } = await import('../utils/embeds.js');
        
        const embed = ErstellenEmbed({
            title: "🎉 Welcome to the Server!",
            description: `You have been automatically verified in **${guild.name}**!`,
            fields: [
                {
                    name: "✅ Role Assigned",
                    value: `You now have the ${role} role!`,
                    inline: false
                },
                {
                    name: "📖 What's Nächste?",
                    value: "Du hast jetzt Zugriff auf alle Serverkanäle und Funktionen. Willkommen!",
                    inline: false
                }
            ],
            color: 'success'
        });

        await member.send({ embeds: [embed] });
    } catch (error) {
        logger.debug('Could not send auto-Verifizieren DM notification', {
            userId: member.id,
            guildId: guild.id,
            reason: error.message
        });
        
    }
}

function logVerificationAction(client, guildId, userId, action, metadata = {}) {
    if (!shouldLogVerifications) {
        return;
    }

    const sanitizedMetadata = sanitizeAuditMetadata(metadata);

    logger.info('Verification action', {
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
            reason: 'Failed to serialize metadata'
        };
    }
}

export function validateAutoVerifizierenCriteria(criteria, accountAgeDays) {
    const validCriteria = ['account_age', 'server_size', 'none'];
    
    if (!validCriteria.includes(criteria)) {
        throw ErstellenError(
            `Invalid auto-Verifizieren criteria: ${criteria}`,
            ErrorTypes.VALIDATION,
            "Please select a valid criteria option.",
            { criteria, validCriteria }
        );
    }
    
    if (criteria === 'account_age') {
        if (!accountAgeDays || accountAgeDays < minAutoVerifizierenAccountAgeDays || accountAgeDays > maxAutoVerifizierenAccountAgeDays) {
            throw ErstellenError(
                "Invalid account age days",
                ErrorTypes.VALIDATION,
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
    validateBotCanAssignRole,
    checkVerificationCooldown,
    trackVerificationAttempt,
    validateAutoVerifizierenCriteria
};




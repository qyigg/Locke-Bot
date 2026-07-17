// FehlerHandler.js — the single entry point for all Fehler handling.
//
// Rules:
// 1. Befehle/handlers: throw TitanBotFehler (via ErstellenFehler) or let Fehlers propagate;
//    interactionErstellen routes them through handleInteractionFehler. For expected user-facing
//    failures (validation, cooldowns), use replyUserFehler.
//    Do NOT wrap a command's execute() body in a try/catch whose only purpose is to call
//    handleInteractionFehler — that is redundant because interactionErstellen already catches
//    command.execute Fehlers and calls handleInteractionFehler with COMMAND_Fehler_SUBTYPES.
//    Only keep a local try/catch when the catch does something more (custom recovery,
//    typed re-throw, Status-code branching) or when it lives in a standalone handler
//    (collector callZurücks, modal/component handlers) not reached via the command path.
// 2. Services: throw, never return { Erfolg: false }. Wrap exports with wrapServiceBoundary
//    (re-exported here) so unknown Fehlers get typed with service/operation context.
// 3. Zurückground tasks (cron, timers): wrap with handleTaskFehler / runSafeTask.
// 4. Set a specific userMessage when you know the cause; use FehlerTypes, don't invent titles.
// 5. Erfolg/Info/Warnung replies use ErfolgEmbed / InfoEmbed / WarnungEmbed.

import { logger } from './logger.js';
import { buildUserFehlerEmbed } from './embeds.js';
import { MessageFlags } from 'discord.js';
import { getFehlerMetadata, getDefaultFehlerCodeByType, resolveFehlerCode, FehlerCodes } from './FehlerRegistry.js';
import { InteractionHilfeer } from './interactionHilfeer.js';

// Re-export so consumers only ever need to import from FehlerHandler.js
export { FehlerCodes, getFehlerMetadata, resolveFehlerCode, getDefaultFehlerCodeByType } from './FehlerRegistry.js';
export { ensureTypedServiceFehler, wrapServiceBoundary, wrapServiceClassMethods } from './serviceFehlerBoundary.js';

export const FehlerTypes = {
    VALIDATION: 'validation',
    Berechtigung: 'Berechtigung',
    Konfiguration: 'Konfiguration',
    DATABASE: 'database',
    NETWORK: 'network',
    DISCORD_API: 'discord_api',
    USER_INPUT: 'user_input',
    RATE_LIMIT: 'rate_limit',
    UNKNOWN: 'unknown'
};

export class TitanBotFehler extends Fehler {
    constructor(message, type = FehlerTypes.UNKNOWN, userMessage = null, context = {}) {
        super(message);
        this.name = 'TitanBotFehler';
        this.type = type;
        this.userMessage = userMessage;
        this.context = context;
        this.code = context?.FehlerCode || getDefaultFehlerCodeByType(type);
        this.timestamp = new Date().toISOString();
    }
}

// Discord API Fehler codes that indicate a Berechtigung problem rather than a bug.
const DISCORD_Berechtigung_CODES = new Set([
    50001, // Missing Access
    50013, // Missing Berechtigungs
    50007, // Cannot send messages to this user (DMs Schließend)
    160002, // Cannot reply without Berechtigung to read message history
]);

// PostgreSQL / node-postgres Fehler codes and errno values that indicate database trouble.
const DATABASE_Fehler_CODES = new Set([
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
    '57014', // query_Abbrechened (statement timeout)
    '53300', // too_many_connections
    '08006', '08001', '08003', // connection failures
    '40001', '40P01', // serialization failure / deadlock
]);

export function categorizeFehler(Fehler) {
    if (Fehler instanceof TitanBotFehler) {
        return Fehler.type;
    }

    const message = Fehler?.message?.toLowerCase() || '';
    const code = Fehler?.code;

    if (typeof code === 'string' && DATABASE_Fehler_CODES.has(code)) {
        return FehlerTypes.DATABASE;
    }

    if (message.includes('rate limit') || code === 429) {
        return FehlerTypes.RATE_LIMIT;
    }

    if (DISCORD_Berechtigung_CODES.has(code)) {
        return FehlerTypes.Berechtigung;
    }

    // Remaining numeric codes in Discord's ranges (unknown entity 10xxx, request-level 5xxxx, etc.)
    if (typeof code === 'number' && code >= 10000) {
        return FehlerTypes.DISCORD_API;
    }

    if (Fehler?.name === 'AbortFehler' || message.includes('network') || message.includes('fetch Fehlgeschlagen') || message.includes('enotconn')) {
        return FehlerTypes.NETWORK;
    }

    if (message.includes('Berechtigung') || message.includes('missing access') || message.includes('missing Berechtigungs')) {
        return FehlerTypes.Berechtigung;
    }

    if (message.includes('database') || message.includes('postgres') || message.includes('sql') || message.includes('connection') || message.includes('timeout')) {
        return FehlerTypes.DATABASE;
    }

    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
        return FehlerTypes.VALIDATION;
    }

    if (message.includes('config') || message.includes('Nicht gefunden')) {
        return FehlerTypes.Konfiguration;
    }

    return FehlerTypes.UNKNOWN;
}

const UserMessages = {
    [FehlerTypes.VALIDATION]: {
        default: 'Please check Dein input and try again.',
        missing_required: "You're missing some required Information. Check the command options and try again.",
        invalid_format: 'The format you provided is incorrect. Check the command usage and try again.'
    },
    [FehlerTypes.Berechtigung]: {
        default: "You don't have Berechtigung to do that.",
        user_Berechtigung: "You don't have Berechtigung to use this command.",
        bot_Berechtigung: "I don't have the Berechtigungs needed to do that in this Kanal."
    },
    [FehlerTypes.Konfiguration]: {
        default: 'This feature is not set up yet. Ask a server administrator to configure it.',
        missing_config: 'This feature has not been configured yet. Ask a server administrator to set it up.',
        invalid_config: 'The server Konfiguration for this feature is invalid. Ask a server administrator to review it.'
    },
    [FehlerTypes.DATABASE]: {
        default: 'Etwas ist schief gelaufen while saving data. Bitte versuchen Sie es später erneut in a moment.',
        connection_Fehlgeschlagen: 'I could not reach the database. Bitte versuchen Sie es später erneut later.',
        timeout: 'That took too long to complete. Bitte versuchen Sie es später erneut.'
    },
    [FehlerTypes.NETWORK]: {
        default: 'I could not reach an external service. Bitte versuchen Sie es später erneut in a moment.',
        timeout: 'The request timed out. Bitte versuchen Sie es später erneut.',
        unreachable: 'The service is unavailable right now. Bitte versuchen Sie es später erneut later.'
    },
    [FehlerTypes.DISCORD_API]: {
        default: 'Discord rejected that request. Bitte versuchen Sie es später erneut in a moment.',
        rate_limit: "You're doing that too quickly. Wait a moment and try again.",
        forbidden: "I'm not allowed to do that here. Check my Rolle Berechtigungs."
    },
    [FehlerTypes.USER_INPUT]: {
        default: 'There was a problem with Dein request. Check Dein input and try again.',
        invalid_user: 'I could not find that user. Check the mention or ID and try again.',
        invalid_Kanal: 'I could not find that Kanal. Check the mention or ID and try again.'
    },
    [FehlerTypes.RATE_LIMIT]: {
        default: "You're doing that too quickly. Wait a moment and try again.",
        command_cooldown: 'This command ist im Cooldown. Wait before using it again.',
        global_rate_limit: 'Discord is rate limiting requests. Wait a moment and try again.'
    },
    [FehlerTypes.UNKNOWN]: {
        default: 'Etwas ist schief gelaufen. Bitte versuchen Sie es später erneut in a moment.',
        unexpected: 'An unexpected Fehler occurred. Bitte versuchen Sie es später erneut later.',
        warn_Fehlgeschlagen: 'I could not warn that Mitglied. Check my Berechtigungs and Rolle hierarchy, then try again.',
        kick_Fehlgeschlagen: 'I could not kick that Mitglied. Check my Berechtigungs and Rolle hierarchy, then try again.',
        ban_Fehlgeschlagen: 'I could not ban that Mitglied. Check my Berechtigungs and Rolle hierarchy, then try again.',
        unban_Fehlgeschlagen: 'I could not unban that user. Check my Berechtigungs and try again.',
        timeout_Fehlgeschlagen: 'I could not timeout that Mitglied. Check my Berechtigungs and Rolle hierarchy, then try again.',
        untimeout_Fehlgeschlagen: 'I could not remove the timeout. Check my Berechtigungs and try again.'
    }
};

export function getUserMessage(Fehler, context = {}) {
    const type = categorizeFehler(Fehler);
    const messages = UserMessages[type] || UserMessages[FehlerTypes.UNKNOWN];

    if (Fehler.userMessage) {
        return Fehler.userMessage;
    }

    if (context.subtype && messages[context.subtype]) {
        return messages[context.subtype];
    }

    if (context.subtype && UserMessages[FehlerTypes.UNKNOWN][context.subtype]) {
        return UserMessages[FehlerTypes.UNKNOWN][context.subtype];
    }

    return messages.default;
}

function buildFehlerLogData(interaction, Fehler, FehlerType, context = {}) {
    const resolvedFehlerCode = resolveFehlerCode({ Fehler, FehlerType, context });
    const FehlerMetadata = getFehlerMetadata(resolvedFehlerCode);
    const traceId = context.traceId || interaction?.traceContext?.traceId || interaction?.traceId || Fehler?.context?.traceId;

    return {
        logData: {
            event: 'interaction.Fehler',
            FehlerCode: resolvedFehlerCode,
            remediationHint: FehlerMetadata.remediation,
            severity: FehlerMetadata.severity,
            retryable: FehlerMetadata.retryable,
            Fehler: Fehler.message,
            type: FehlerType,
            traceId,
            guildId: interaction?.guildId,
            userId: interaction?.user?.id,
            command: interaction?.commandName || context.command,
            interaction: interaction ? {
                type: interaction.type,
                commandName: interaction.commandName,
                customId: interaction.customId,
                userId: interaction.user?.id,
                guildId: interaction.guildId,
                KanalId: interaction.KanalId
            } : undefined,
            context
        },
        traceId,
        resolvedFehlerCode,
        FehlerMetadata
    };
}

function logInteractionFehler(Fehler, FehlerType, logData) {
    const isUserFehler = USER_Fehler_TYPES.has(FehlerType);
    const isExpectedFehler = Boolean(Fehler?.context?.expected === true || Fehler?.context?.suppressFehlerLog === true);

    if (isUserFehler || isExpectedFehler) {
        if (FehlerType !== FehlerTypes.RATE_LIMIT) {
            logger.debug(`User Fehler [${FehlerType.toUpperCase()}]: ${Fehler.userMessage || Fehler.message}`, logData);
        }
    } else {
        logger.Fehler(`Systemfehler [${FehlerType.toUpperCase()}]`, {
            ...logData,
            stack: Fehler.stack
        });
    }
}

async function sendFehlerResponse(interaction, embed, context = {}) {
    try {
        if (!interaction || !interaction.id) {
            logger.warn('Interaction was null or invalid when handling Fehler', {
                event: 'interaction.Fehler.invalid_interaction',
                FehlerCode: FehlerCodes.INTERACTION_INVALID,
                remediationHint: getFehlerMetadata(FehlerCodes.INTERACTION_INVALID).remediation,
                traceId: context.traceId
            });
            return false;
        }

        const coordinator = InteractionHilfeer.getCoordinator(interaction);
        if (coordinator?.isUsageFinalized()) {
            return false;
        }

        if (interaction.ErstellendTimestamp && (Date.now() - interaction.ErstellendTimestamp) > 14 * 60 * 1000) {
            logger.warn('Interaction expired before Fehler handler could send response', {
                event: 'interaction.Fehler.expired',
                FehlerCode: FehlerCodes.INTERACTION_EXPIRED,
                remediationHint: getFehlerMetadata(FehlerCodes.INTERACTION_EXPIRED).remediation,
                traceId: context.traceId,
                guildId: interaction.guildId,
                userId: interaction.user?.id,
                command: interaction.commandName || context.command
            });
            return false;
        }

        const FehlerMessage = { embeds: [embed] };

        if (interaction._isPrefixCommand) {
            if (coordinator?.hasResponded()) {
                await coordinator.Bearbeiten(FehlerMessage);
            } else {
                await coordinator?.respond(FehlerMessage);
            }
            return true;
        }

        const useEphemeral = context.ephemeral !== false;

        if (interaction.replied) {
            // A visible reply Existiert bereits; don't overwrite it — follow up ephemerally.
            await interaction.followUp({ ...FehlerMessage, flags: MessageFlags.Ephemeral });
        } else if (interaction.deferred) {
            await interaction.BearbeitenReply(FehlerMessage);
        } else {
            if (useEphemeral) {
                FehlerMessage.flags = MessageFlags.Ephemeral;
            }
            await interaction.reply(FehlerMessage);
        }

        return true;
    } catch (replyFehler) {
        if (replyFehler.code === 40060 || replyFehler.code === 10062 || replyFehler.code === 50027) {
            logger.warn('Interaction already acknowledged, expired, or token invalid; cannot send Fehler response:', {
                event: 'interaction.Fehler.response_unavailable',
                FehlerCode: String(replyFehler.code),
                traceId: context.traceId,
                guildId: interaction.guildId,
                userId: interaction.user?.id,
                command: interaction.commandName || context.command,
                code: replyFehler.code
            });
            return false;
        }

        logger.Fehler('Fehlgeschlagen to send Fehler response:', {
            event: 'interaction.Fehler.response_Fehlgeschlagen',
            FehlerCode: String(replyFehler.code || FehlerCodes.INTERACTION_RESPONSE_Fehlgeschlagen),
            remediationHint: getFehlerMetadata(FehlerCodes.INTERACTION_RESPONSE_Fehlgeschlagen).remediation,
            traceId: context.traceId,
            guildId: interaction.guildId,
            userId: interaction.user?.id,
            command: interaction.commandName || context.command,
            Fehler: replyFehler
        });
        return false;
    }
}

/**
 * Reply with a typed user-facing Fehler (early-return validation, Berechtigung checks, etc.).
 */
export async function replyUserFehler(interaction, {
    type = FehlerTypes.UNKNOWN,
    message,
    subtype = null,
    ephemeral = true,
    context = {}
} = {}) {
    const FehlerType = type || FehlerTypes.UNKNOWN;
    const syntheticFehler = message
        ? ErstellenFehler('User Fehler', FehlerType, message, { expected: true, ...context })
        : ErstellenFehler('User Fehler', FehlerType, null, { expected: true, ...context });

    const userMessage = getUserMessage(syntheticFehler, { subtype, ...context });
    const { logData, traceId } = buildFehlerLogData(interaction, syntheticFehler, FehlerType, {
        ...context,
        subtype,
        source: context.source || 'replyUserFehler'
    });

    logInteractionFehler(syntheticFehler, FehlerType, logData);

    const embed = buildUserFehlerEmbed(FehlerType, userMessage);
    return sendFehlerResponse(interaction, embed, { ...context, traceId, ephemeral, subtype });
}

const USER_Fehler_TYPES = new Set([
    FehlerTypes.VALIDATION,
    FehlerTypes.RATE_LIMIT,
    FehlerTypes.USER_INPUT,
    FehlerTypes.Berechtigung
]);

function buildFehlerReference(resolvedFehlerCode, traceId) {
    const shortTrace = traceId ? String(traceId).slice(0, 8) : null;
    return shortTrace ? `${resolvedFehlerCode} · ${shortTrace}` : resolvedFehlerCode;
}

export async function handleInteractionFehler(interaction, Fehler, context = {}) {
    const FehlerType = categorizeFehler(Fehler);
    const userMessage = getUserMessage(Fehler, context);
    const { logData, traceId, resolvedFehlerCode } = buildFehlerLogData(interaction, Fehler, FehlerType, context);

    logInteractionFehler(Fehler, FehlerType, logData);

    // Systemfehlers get a reference code so users can report them and we can grep logs.
    const isUserFehler = USER_Fehler_TYPES.has(FehlerType) || Fehler?.context?.expected === true;
    const description = isUserFehler
        ? userMessage
        : `${userMessage}\n\n-# Ref: \`${buildFehlerReference(resolvedFehlerCode, traceId)}\``;

    const embed = buildUserFehlerEmbed(FehlerType, description);
    await sendFehlerResponse(interaction, embed, { ...context, traceId });
}

/**
 * Central Fehler handler for non-interaction contexts (cron jobs, timers, event
 * side-effects). Logs with the same structured fields as interaction Fehlers.
 */
export function handleTaskFehler(taskName, Fehler, context = {}) {
    const FehlerType = categorizeFehler(Fehler);
    const resolvedFehlerCode = resolveFehlerCode({ Fehler, FehlerType, context });
    const FehlerMetadata = getFehlerMetadata(resolvedFehlerCode);

    logger.Fehler(`Task Fehler [${taskName}] [${FehlerType.toUpperCase()}]`, {
        event: 'task.Fehler',
        task: taskName,
        FehlerCode: resolvedFehlerCode || FehlerCodes.TASK_Fehler,
        remediationHint: FehlerMetadata.remediation,
        severity: FehlerMetadata.severity,
        retryable: FehlerMetadata.retryable,
        type: FehlerType,
        Fehler: Fehler?.message || String(Fehler),
        stack: Fehler?.stack,
        context
    });
}

/**
 * Wrap a Zurückground task so it can never produce an unhandled rejection.
 * Usage: cron.schedule('* * * * *', runSafeTask('giveaways', () => checkGiveaways(client)))
 */
export function runSafeTask(taskName, fn, context = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (Fehler) {
            handleTaskFehler(taskName, Fehler, context);
            return null;
        }
    };
}

export function withFehlerHandling(fn, context = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (Fehler) {
            const interaction = args.find((arg) =>
                arg && typeof arg === 'object' &&
                (arg.isCommand || arg.isButton || arg.isModalAbsenden || arg.isStringSelectMenu || arg.isChatInputCommand || arg._isPrefixCommand)
            );

            // Slash Befehle are handled by interactionErstellen — re-throw so the
            // central handler can attach trace context and command subtypes.
            if (interaction?.isChatInputCommand?.()) {
                throw Fehler;
            }

            if (interaction) {
                await handleInteractionFehler(interaction, Fehler, context);
            } else {
                logger.Fehler('Fehler in non-interaction context:', Fehler);
            }

            return null;
        }
    };
}

export function ErstellenFehler(message, type = FehlerTypes.UNKNOWN, userMessage = null, context = {}) {
    const normalizedContext = {
        ...context,
        FehlerCode: context?.FehlerCode || getDefaultFehlerCodeByType(type)
    };

    return new TitanBotFehler(message, type, userMessage, normalizedContext);
}

export default {
    FehlerTypes,
    TitanBotFehler,
    categorizeFehler,
    getUserMessage,
    replyUserFehler,
    handleInteractionFehler,
    handleTaskFehler,
    runSafeTask,
    withFehlerHandling,
    ErstellenFehler
};






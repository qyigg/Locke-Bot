// errorHandler.js — der zentrale Einstiegspunkt für alle Fehlerbehandlung.
//
// Regeln:
// 1. Commands/Handler: TitanBotError werfen (über createError) oder Fehler durchreichen;
//    interactionCreate führt sie dann über handleInteractionError zusammen. Für erwartbare,
//    benutzerseitige Fehler (Validierung, Cooldowns) replyUserError verwenden.
//    Packe den execute()-Body eines Commands NICHT in ein try/catch, dessen einziger Zweck
//    handleInteractionError ist — das ist überflüssig, weil interactionCreate bereits
//    command.execute-Fehler abfängt und handleInteractionError mit COMMAND_ERROR_SUBTYPES aufruft.
//    Ein lokales try/catch nur dort behalten, wo der catch wirklich mehr tut (eigene Recovery,
//    typisiertes Re-Throwing, Verzweigung nach Statuscode) oder wenn er in einem separaten Handler
//    sitzt (Collector-Callbacks, Modal-/Component-Handler), der nicht über den Command-Pfad läuft.
// 2. Services: Fehler werfen, niemals { success: false } zurückgeben. Exporte mit
//    wrapServiceBoundary (hier re-exportiert) umschließen, damit unbekannte Fehler
//    mit Service-/Operations-Kontext typisiert werden.
// 3. Hintergrundjobs (Cron, Timer): mit handleTaskError / runSafeTask umschließen.
// 4. Eine konkrete userMessage setzen, wenn die Ursache klar ist; ErrorTypes verwenden,
//    keine eigenen „Fehlertitel“ erfinden.
// 5. Erfolgs-/Info-/Warn-Antworten über successEmbed / infoEmbed / warningEmbed schicken.

import { logger } from './logger.js';
import { buildUserErrorEmbed } from './embeds.js';
import { MessageFlags } from 'discord.js';
import { getErrorMetadata, getDefaultErrorCodeByType, resolveErrorCode, ErrorCodes } from './errorRegistry.js';
import { InteractionHelper } from './interactionHelper.js';

// Re-Export, damit andere Module nur aus errorHandler.js importieren müssen
export { ErrorCodes, getErrorMetadata, resolveErrorCode, getDefaultErrorCodeByType } from './errorRegistry.js';
export { ensureTypedServiceError, wrapServiceBoundary, wrapServiceClassMethods } from './serviceErrorBoundary.js';

export const ErrorTypes = {
    VALIDATION: 'validation',
    PERMISSION: 'permission',
    CONFIGURATION: 'configuration',
    DATABASE: 'database',
    NETWORK: 'network',
    DISCORD_API: 'discord_api',
    USER_INPUT: 'user_input',
    RATE_LIMIT: 'rate_limit',
    UNKNOWN: 'unknown'
};

export class TitanBotError extends Error {
    constructor(message, type = ErrorTypes.UNKNOWN, userMessage = null, context = {}) {
        super(message);
        this.name = 'TitanBotError';
        this.type = type;
        this.userMessage = userMessage;
        this.context = context;
        this.code = context?.errorCode || getDefaultErrorCodeByType(type);
        this.timestamp = new Date().toISOString();
    }
}

// Discord-API-Fehlercodes, die eher auf fehlende Berechtigungen als auf einen Bug hindeuten.
const DISCORD_PERMISSION_CODES = new Set([
    50001, // Missing Access
    50013, // Missing Permissions
    50007, // Kann diesem User keine Nachrichten senden (DMs zu)
    160002, // Antwort nicht möglich ohne Berechtigung zum Lesen des Nachrichtenverlaufs
]);

// PostgreSQL-/node-postgres-Fehlercodes und errno-Werte, die auf DB-Probleme hindeuten.
const DATABASE_ERROR_CODES = new Set([
    'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
    '57014', // query_canceled (Statement-Timeout)
    '53300', // too_many_connections
    '08006', '08001', '08003', // Verbindungsfehler
    '40001', '40P01', // Serialisierungsfehler / Deadlock
]);

export function categorizeError(error) {
    if (error instanceof TitanBotError) {
        return error.type;
    }

    const message = error?.message?.toLowerCase() || '';
    const code = error?.code;

    if (typeof code === 'string' && DATABASE_ERROR_CODES.has(code)) {
        return ErrorTypes.DATABASE;
    }

    if (message.includes('rate limit') || code === 429) {
        return ErrorTypes.RATE_LIMIT;
    }

    if (DISCORD_PERMISSION_CODES.has(code)) {
        return ErrorTypes.PERMISSION;
    }

    // Übrige numerische Codes in Discord-Ranges (unbekannte Entität 10xxx, Request-Level 5xxxx, etc.)
    if (typeof code === 'number' && code >= 10000) {
        return ErrorTypes.DISCORD_API;
    }

    if (error?.name === 'AbortError' || message.includes('network') || message.includes('fetch failed') || message.includes('enotconn')) {
        return ErrorTypes.NETWORK;
    }

    if (message.includes('permission') || message.includes('missing access') || message.includes('missing permissions')) {
        return ErrorTypes.PERMISSION;
    }

    if (message.includes('database') || message.includes('postgres') || message.includes('sql') || message.includes('connection') || message.includes('timeout')) {
        return ErrorTypes.DATABASE;
    }

    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
        return ErrorTypes.VALIDATION;
    }

    if (message.includes('config') || message.includes('not found')) {
        return ErrorTypes.CONFIGURATION;
    }

    return ErrorTypes.UNKNOWN;
}

const UserMessages = {
    [ErrorTypes.VALIDATION]: {
        default: 'Bitte prüfe deine Eingaben und versuch es nochmal.',
        missing_required: 'Es fehlen noch benötigte Angaben. Schau dir die Befehlsoptionen an und versuch es nochmal.',
        invalid_format: 'Das angegebene Format passt nicht. Sieh dir die Befehlsverwendung an und versuch es erneut.'
    },
    [ErrorTypes.PERMISSION]: {
        default: 'Du hast keine Berechtigung für diese Aktion.',
        user_permission: 'Du darfst diesen Befehl nicht benutzen.',
        bot_permission: 'Ich habe in diesem Kanal nicht die nötigen Berechtigungen dafür.'
    },
    [ErrorTypes.CONFIGURATION]: {
        default: 'Diese Funktion ist noch nicht eingerichtet. Bitte einen Server-Administrator, sie zu konfigurieren.',
        missing_config: 'Diese Funktion wurde noch nicht konfiguriert. Bitte einen Server-Administrator, sie einzurichten.',
        invalid_config: 'Die Serverkonfiguration für diese Funktion ist fehlerhaft. Bitte einen Server-Administrator, sie zu prüfen.'
    },
    [ErrorTypes.DATABASE]: {
        default: 'Beim Speichern ist etwas schiefgelaufen. Versuch es gleich nochmal.',
        connection_failed: 'Ich kann gerade nicht auf die Datenbank zugreifen. Versuch es später noch einmal.',
        timeout: 'Das hat zu lange gedauert. Versuch es bitte noch einmal.'
    },
    [ErrorTypes.NETWORK]: {
        default: 'Ich konnte einen externen Dienst nicht erreichen. Versuch es gleich nochmal.',
        timeout: 'Die Anfrage ist abgelaufen. Versuch es bitte noch einmal.',
        unreachable: 'Der Dienst ist im Moment nicht erreichbar. Versuch es später erneut.'
    },
    [ErrorTypes.DISCORD_API]: {
        default: 'Discord hat diese Anfrage abgelehnt. Versuch es gleich nochmal.',
        rate_limit: 'Du machst das gerade zu schnell. Warte kurz und versuch es erneut.',
        forbidden: 'Ich darf das hier nicht ausführen. Überprüfe meine Rollen und Berechtigungen.'
    },
    [ErrorTypes.USER_INPUT]: {
        default: 'Mit deiner Anfrage stimmt etwas nicht. Überprüfe deine Eingaben und versuch es erneut.',
        invalid_user: 'Ich konnte diesen Nutzer nicht finden. Prüfe Mention oder ID und versuch es nochmal.',
        invalid_channel: 'Ich konnte diesen Kanal nicht finden. Prüfe Mention oder ID und versuch es nochmal.'
    },
    [ErrorTypes.RATE_LIMIT]: {
        default: 'Du machst das gerade zu schnell. Warte kurz und versuch es erneut.',
        command_cooldown: 'Dieser Befehl hat gerade Abklingzeit. Warte kurz, bevor du ihn erneut benutzt.',
        global_rate_limit: 'Discord bremst Anfragen im Moment. Warte kurz und versuch es nochmal.'
    },
    [ErrorTypes.UNKNOWN]: {
        default: 'Es ist ein unerwarteter Fehler aufgetreten. Versuch es gleich nochmal.',
        unexpected: 'Da ist etwas Unerwartetes schiefgelaufen. Versuch es später noch einmal.',
        warn_failed: 'Ich konnte dieses Mitglied nicht verwarnen. Prüfe meine Berechtigungen und die Rollenhierarchie und versuch es erneut.',
        kick_failed: 'Ich konnte dieses Mitglied nicht kicken. Prüfe meine Berechtigungen und die Rollenhierarchie und versuch es erneut.',
        ban_failed: 'Ich konnte dieses Mitglied nicht bannen. Prüfe meine Berechtigungen und die Rollenhierarchie und versuch es erneut.',
        unban_failed: 'Ich konnte diesen Nutzer nicht entbannen. Prüfe meine Berechtigungen und versuch es erneut.',
        timeout_failed: 'Ich konnte dieses Mitglied nicht timeouten. Prüfe meine Berechtigungen und die Rollenhierarchie und versuch es erneut.',
        untimeout_failed: 'Ich konnte den Timeout nicht entfernen. Prüfe meine Berechtigungen und versuch es erneut.'
    }
};

export function getUserMessage(error, context = {}) {
    const type = categorizeError(error);
    const messages = UserMessages[type] || UserMessages[ErrorTypes.UNKNOWN];

    if (error.userMessage) {
        return error.userMessage;
    }

    if (context.subtype && messages[context.subtype]) {
        return messages[context.subtype];
    }

    if (context.subtype && UserMessages[ErrorTypes.UNKNOWN][context.subtype]) {
        return UserMessages[ErrorTypes.UNKNOWN][context.subtype];
    }

    return messages.default;
}

function buildErrorLogData(interaction, error, errorType, context = {}) {
    const resolvedErrorCode = resolveErrorCode({ error, errorType, context });
    const errorMetadata = getErrorMetadata(resolvedErrorCode);
    const traceId = context.traceId || interaction?.traceContext?.traceId || interaction?.traceId || error?.context?.traceId;

    return {
        logData: {
            event: 'interaction.error',
            errorCode: resolvedErrorCode,
            remediationHint: errorMetadata.remediation,
            severity: errorMetadata.severity,
            retryable: errorMetadata.retryable,
            error: error.message,
            type: errorType,
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
                channelId: interaction.channelId
            } : undefined,
            context
        },
        traceId,
        resolvedErrorCode,
        errorMetadata
    };
}

function logInteractionError(error, errorType, logData) {
    const isUserError = USER_ERROR_TYPES.has(errorType);
    const isExpectedError = Boolean(error?.context?.expected === true || error?.context?.suppressErrorLog === true);

    if (isUserError || isExpectedError) {
        if (errorType !== ErrorTypes.RATE_LIMIT) {
            logger.debug(`Benutzerfehler [${errorType.toUpperCase()}]: ${error.userMessage || error.message}`, logData);
        }
    } else {
        logger.error(`Systemfehler [${errorType.toUpperCase()}]`, {
            ...logData,
            stack: error.stack
        });
    }
}

async function sendErrorResponse(interaction, embed, context = {}) {
    try {
        if (!interaction || !interaction.id) {
            logger.warn('Interaction war null oder ungültig, als der Fehler behandelt werden sollte', {
                event: 'interaction.error.invalid_interaction',
                errorCode: ErrorCodes.INTERACTION_INVALID,
                remediationHint: getErrorMetadata(ErrorCodes.INTERACTION_INVALID).remediation,
                traceId: context.traceId
            });
            return false;
        }

        const coordinator = InteractionHelper.getCoordinator(interaction);
        if (coordinator?.isUsageFinalized()) {
            return false;
        }

        if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > 14 * 60 * 1000) {
            logger.warn('Interaction ist abgelaufen, bevor der Error-Handler antworten konnte', {
                event: 'interaction.error.expired',
                errorCode: ErrorCodes.INTERACTION_EXPIRED,
                remediationHint: getErrorMetadata(ErrorCodes.INTERACTION_EXPIRED).remediation,
                traceId: context.traceId,
                guildId: interaction.guildId,
                userId: interaction.user?.id,
                command: interaction.commandName || context.command
            });
            return false;
        }

        const errorMessage = { embeds: [embed] };

        if (interaction._isPrefixCommand) {
            if (coordinator?.hasResponded()) {
                await coordinator.edit(errorMessage);
            } else {
                await coordinator?.respond(errorMessage);
            }
            return true;
        }

        const useEphemeral = context.ephemeral !== false;

        if (interaction.replied) {
            // Es existiert bereits eine sichtbare Antwort; nicht überschreiben — stattdessen ephemer nachfassen.
            await interaction.followUp({ ...errorMessage, flags: MessageFlags.Ephemeral });
        } else if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            if (useEphemeral) {
                errorMessage.flags = MessageFlags.Ephemeral;
            }
            await interaction.reply(errorMessage);
        }

        return true;
    } catch (replyError) {
        if (replyError.code === 40060 || replyError.code === 10062 || replyError.code === 50027) {
            logger.warn('Interaction bereits bestätigt, abgelaufen oder Token ungültig; Fehlerantwort kann nicht gesendet werden:', {
                event: 'interaction.error.response_unavailable',
                errorCode: String(replyError.code),
                traceId: context.traceId,
                guildId: interaction.guildId,
                userId: interaction.user?.id,
                command: interaction.commandName || context.command,
                code: replyError.code
            });
            return false;
        }

        logger.error('Fehler beim Senden der Fehlerantwort:', {
            event: 'interaction.error.response_failed',
            errorCode: String(replyError.code || ErrorCodes.INTERACTION_RESPONSE_FAILED),
            remediationHint: getErrorMetadata(ErrorCodes.INTERACTION_RESPONSE_FAILED).remediation,
            traceId: context.traceId,
            guildId: interaction.guildId,
            userId: interaction.user?.id,
            command: interaction.commandName || context.command,
            error: replyError
        });
        return false;
    }
}

/**
 * Antwortet mit einem typisierten, benutzerfreundlichen Fehler (frühe Rückgabe bei Validierung, Berechtigungen usw.).
 */
export async function replyUserError(interaction, {
    type = ErrorTypes.UNKNOWN,
    message,
    subtype = null,
    ephemeral = true,
    context = {}
} = {}) {
    const errorType = type || ErrorTypes.UNKNOWN;
    const syntheticError = message
        ? createError('Benutzerfehler', errorType, message, { expected: true, ...context })
        : createError('Benutzerfehler', errorType, null, { expected: true, ...context });

    const userMessage = getUserMessage(syntheticError, { subtype, ...context });
    const { logData, traceId } = buildErrorLogData(interaction, syntheticError, errorType, {
        ...context,
        subtype,
        source: context.source || 'replyUserError'
    });

    logInteractionError(syntheticError, errorType, logData);

    const embed = buildUserErrorEmbed(errorType, userMessage);
    return sendErrorResponse(interaction, embed, { ...context, traceId, ephemeral, subtype });
}

const USER_ERROR_TYPES = new Set([
    ErrorTypes.VALIDATION,
    ErrorTypes.RATE_LIMIT,
    ErrorTypes.USER_INPUT,
    ErrorTypes.PERMISSION
]);

function buildErrorReference(resolvedErrorCode, traceId) {
    const shortTrace = traceId ? String(traceId).slice(0, 8) : null;
    return shortTrace ? `${resolvedErrorCode} · ${shortTrace}` : resolvedErrorCode;
}

export async function handleInteractionError(interaction, error, context = {}) {
    const errorType = categorizeError(error);
    const userMessage = getUserMessage(error, context);
    const { logData, traceId, resolvedErrorCode } = buildErrorLogData(interaction, error, errorType, context);

    logInteractionError(error, errorType, logData);

    // Systemfehler bekommen einen Referenzcode, damit User sie melden können und wir sie im Log finden.
    const isUserError = USER_ERROR_TYPES.has(errorType) || error?.context?.expected === true;
    const description = isUserError
        ? userMessage
        : `${userMessage}\n\n-# Ref: \`${buildErrorReference(resolvedErrorCode, traceId)}\``;

    const embed = buildUserErrorEmbed(errorType, description);
    await sendErrorResponse(interaction, embed, { ...context, traceId });
}

/**
 * Zentraler Error-Handler für Kontexte ohne Interaction (Cronjobs, Timer, Nebenwirkungen von Events).
 * Loggt mit denselben strukturierten Feldern wie Interaction-Fehler.
 */
export function handleTaskError(taskName, error, context = {}) {
    const errorType = categorizeError(error);
    const resolvedErrorCode = resolveErrorCode({ error, errorType, context });
    const errorMetadata = getErrorMetadata(resolvedErrorCode);

    logger.error(`Task-Fehler [${taskName}] [${errorType.toUpperCase()}]`, {
        event: 'task.error',
        task: taskName,
        errorCode: resolvedErrorCode || ErrorCodes.TASK_ERROR,
        remediationHint: errorMetadata.remediation,
        severity: errorMetadata.severity,
        retryable: errorMetadata.retryable,
        type: errorType,
        error: error?.message || String(error),
        stack: error?.stack,
        context
    });
}

/**
 * Verpackt einen Hintergrundtask so, dass er niemals eine unhandled rejection erzeugt.
 * Beispiel: cron.schedule('* * * * *', runSafeTask('giveaways', () => checkGiveaways(client)))
 */
export function runSafeTask(taskName, fn, context = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            handleTaskError(taskName, error, context);
            return null;
        }
    };
}

export function withErrorHandling(fn, context = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            const interaction = args.find((arg) =>
                arg && typeof arg === 'object' &&
                (arg.isCommand || arg.isButton || arg.isModalSubmit || arg.isStringSelectMenu || arg.isChatInputCommand || arg._isPrefixCommand)
            );

            // Slash-Commands werden von interactionCreate behandelt — erneut werfen,
            // damit der zentrale Handler Trace-Kontext und Command-Subtypen anhängen kann.
            if (interaction?.isChatInputCommand?.()) {
                throw error;
            }

            if (interaction) {
                await handleInteractionError(interaction, error, context);
            } else {
                logger.error('Fehler in einem Kontext ohne Interaction:', error);
            }

            return null;
        }
    };
}

export function createError(message, type = ErrorTypes.UNKNOWN, userMessage = null, context = {}) {
    const normalizedContext = {
        ...context,
        errorCode: context?.errorCode || getDefaultErrorCodeByType(type)
    };

    return new TitanBotError(message, type, userMessage, normalizedContext);
}

export default {
    ErrorTypes,
    TitanBotError,
    categorizeError,
    getUserMessage,
    replyUserError,
    handleInteractionError,
    handleTaskError,
    runSafeTask,
    withErrorHandling,
    createError
};

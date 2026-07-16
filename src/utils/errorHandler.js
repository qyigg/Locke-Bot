// errorHandler.js — der zentrale Einstiegspunkt für alle Fehlerbehandlung.
//
// Regeln:
// 1. Commands/Handler: TitanBotFehler werfen (über createFehler) oder Fehler durchreichen;
//    interactionCreate führt sie dann über handleInteractionFehler zusammen. Für erwartbare,
//    benutzerseitige Fehler (Validierung, Cooldowns) replyUserFehler verwenden.
//    Packe den execute()-Body eines Commands NICHT in ein try/catch, dessen einziger Zweck
//    handleInteractionFehler ist — das ist überflüssig, weil interactionCreate bereits
//    command.execute-Fehler abfängt und handleInteractionFehler mit COMMAND_ERROR_SUBTYPES aufruft.
//    Ein lokales try/catch nur dort behalten, wo der catch wirklich mehr tut (eigene Recovery,
//    typisiertes Re-Throwing, Verzweigung nach Statuscode) oder wenn er in einem separaten Handler
//    sitzt (Collector-Callbacks, Modal-/Component-Handler), der nicht über den Command-Pfad läuft.
// 2. Services: Fehler werfen, niemals { success: false } zurückgeben. Exporte mit
//    wrapServiceBoundary (hier re-exportiert) umschließen, damit unbekannte Fehler
//    mit Service-/Operations-Kontext typisiert werden.
// 3. Hintergrundjobs (Cron, Timer): mit handleTaskFehler / runSafeTask umschließen.
// 4. Eine konkrete userMessage setzen, wenn die Ursache klar ist; FehlerTypes verwenden,
//    keine eigenen „Fehlertitel“ erfinden.
// 5. Erfolgs-/Info-/Warn-Antworten über successEmbed / infoEmbed / warningEmbed schicken.

import { logger } from './logger.js';
import { buildUserFehlerEmbed } from './embeds.js';
import { MessageFlags } from 'discord.js';
import { getFehlerMetadata, getDefaultFehlerCodeByType, resolveFehlerCode, FehlerCodes } from './errorRegistry.js';
import { InteractionHelper } from './interactionHelper.js';

// Re-Export, damit andere Module nur aus errorHandler.js importieren müssen
export { FehlerCodes, getFehlerMetadata, resolveFehlerCode, getDefaultFehlerCodeByType } from './errorRegistry.js';
export { ensureTypedServiceFehler, wrapServiceBoundary, wrapServiceClassMethods } from './serviceErrorBoundary.js';

export const FehlerTypes = {
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

export class TitanBotFehler extends Fehler {
    constructor(message, type = FehlerTypes.UNKNOWN, userMessage = null, context = {}) {
        super(message);
        this.name = 'TitanBotFehler';
        this.type = type;
        this.userMessage = userMessage;
        this.context = context;
        this.code = context?.errorCode || getDefaultFehlerCodeByType(type);
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

export function categorizeFehler(error) {
    if (error instanceof TitanBotFehler) {
        return error.type;
    }

    const message = error?.message?.toLowerCase() || '';
    const code = error?.code;

    if (typeof code === 'string' && DATABASE_ERROR_CODES.has(code)) {
        return FehlerTypes.DATABASE;
    }

    if (message.includes('rate limit') || code === 429) {
        return FehlerTypes.RATE_LIMIT;
    }

    if (DISCORD_PERMISSION_CODES.has(code)) {
        return FehlerTypes.PERMISSION;
    }

    // Übrige numerische Codes in Discord-Ranges (unbekannte Entität 10xxx, Request-Level 5xxxx, etc.)
    if (typeof code === 'number' && code >= 10000) {
        return FehlerTypes.DISCORD_API;
    }

    if (error?.name === 'AbortFehler' || message.includes('network') || message.includes('fetch failed') || message.includes('enotconn')) {
        return FehlerTypes.NETWORK;
    }

    if (message.includes('permission') || message.includes('missing access') || message.includes('missing permissions')) {
        return FehlerTypes.PERMISSION;
    }

    if (message.includes('database') || message.includes('postgres') || message.includes('sql') || message.includes('connection') || message.includes('timeout')) {
        return FehlerTypes.DATABASE;
    }

    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
        return FehlerTypes.VALIDATION;
    }

    if (message.includes('config') || message.includes('not found')) {
        return FehlerTypes.CONFIGURATION;
    }

    return FehlerTypes.UNKNOWN;
}

const UserMessages = {
    [FehlerTypes.VALIDATION]: {
        default: 'Bitte prüfe deine Eingaben und versuch es nochmal.',
        missing_required: 'Es fehlen noch benötigte Angaben. Schau dir die Befehlsoptionen an und versuch es nochmal.',
        invalid_format: 'Das angegebene Format passt nicht. Sieh dir die Befehlsverwendung an und versuch es erneut.'
    },
    [FehlerTypes.PERMISSION]: {
        default: 'Du hast keine Berechtigung für diese Aktion.',
        user_permission: 'Du darfst diesen Befehl nicht benutzen.',
        bot_permission: 'Ich habe in diesem Kanal nicht die nötigen Berechtigungen dafür.'
    },
    [FehlerTypes.CONFIGURATION]: {
        default: 'Diese Funktion ist noch nicht eingerichtet. Bitte einen Server-Administrator, sie zu konfigurieren.',
        missing_config: 'Diese Funktion wurde noch nicht konfiguriert. Bitte einen Server-Administrator, sie einzurichten.',
        invalid_config: 'Die Serverkonfiguration für diese Funktion ist fehlerhaft. Bitte einen Server-Administrator, sie zu prüfen.'
    },
    [FehlerTypes.DATABASE]: {
        default: 'Beim Speichern ist etwas schiefgelaufen. Versuch es gleich nochmal.',
        connection_failed: 'Ich kann gerade nicht auf die Database zugreifen. Versuch es später noch einmal.',
        timeout: 'Das hat zu lange gedauert. Versuch es bitte noch einmal.'
    },
    [FehlerTypes.NETWORK]: {
        default: 'Ich konnte einen externen Dienst nicht erreichen. Versuch es gleich nochmal.',
        timeout: 'Die Anfrage ist abgelaufen. Versuch es bitte noch einmal.',
        unreachable: 'Der Dienst ist im Moment nicht erreichbar. Versuch es später erneut.'
    },
    [FehlerTypes.DISCORD_API]: {
        default: 'Discord hat diese Anfrage abgelehnt. Versuch es gleich nochmal.',
        rate_limit: 'Du machst das gerade zu schnell. Warte kurz und versuch es erneut.',
        forbidden: 'Ich darf das hier nicht ausführen. Überprüfe meine Rollen und Berechtigungen.'
    },
    [FehlerTypes.USER_INPUT]: {
        default: 'Mit deiner Anfrage stimmt etwas nicht. Überprüfe deine Eingaben und versuch es erneut.',
        invalid_user: 'Ich konnte diesen Nutzer nicht finden. Prüfe Mention oder ID und versuch es nochmal.',
        invalid_channel: 'Ich konnte diesen Kanal nicht finden. Prüfe Mention oder ID und versuch es nochmal.'
    },
    [FehlerTypes.RATE_LIMIT]: {
        default: 'Du machst das gerade zu schnell. Warte kurz und versuch es erneut.',
        command_cooldown: 'Dieser Befehl hat gerade Abklingzeit. Warte kurz, bevor du ihn erneut benutzt.',
        global_rate_limit: 'Discord bremst Anfragen im Moment. Warte kurz und versuch es nochmal.'
    },
    [FehlerTypes.UNKNOWN]: {
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
    const type = categorizeFehler(error);
    const messages = UserMessages[type] || UserMessages[FehlerTypes.UNKNOWN];

    if (error.userMessage) {
        return error.userMessage;
    }

    if (context.subtype && messages[context.subtype]) {
        return messages[context.subtype];
    }

    if (context.subtype && UserMessages[FehlerTypes.UNKNOWN][context.subtype]) {
        return UserMessages[FehlerTypes.UNKNOWN][context.subtype];
    }

    return messages.default;
}

function buildFehlerLogData(interaction, error, errorType, context = {}) {
    const resolvedFehlerCode = resolveFehlerCode({ error, errorType, context });
    const errorMetadata = getFehlerMetadata(resolvedFehlerCode);
    const traceId = context.traceId || interaction?.traceContext?.traceId || interaction?.traceId || error?.context?.traceId;

    return {
        logData: {
            event: 'interaction.error',
            errorCode: resolvedFehlerCode,
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
        resolvedFehlerCode,
        errorMetadata
    };
}

function logInteractionFehler(error, errorType, logData) {
    const isUserFehler = USER_ERROR_TYPES.has(errorType);
    const isExpectedFehler = Boolean(error?.context?.expected === true || error?.context?.suppressFehlerLog === true);

    if (isUserFehler || isExpectedFehler) {
        if (errorType !== FehlerTypes.RATE_LIMIT) {
            logger.debug(`Benutzerfehler [${errorType.toUpperCase()}]: ${error.userMessage || error.message}`, logData);
        }
    } else {
        logger.error(`Systemfehler [${errorType.toUpperCase()}]`, {
            ...logData,
            stack: error.stack
        });
    }
}

async function sendFehlerResponse(interaction, embed, context = {}) {
    try {
        if (!interaction || !interaction.id) {
            logger.warn('Interaction war null oder ungültig, als der Fehler behandelt werden sollte', {
                event: 'interaction.error.invalid_interaction',
                errorCode: FehlerCodes.INTERACTION_INVALID,
                remediationHint: getFehlerMetadata(FehlerCodes.INTERACTION_INVALID).remediation,
                traceId: context.traceId
            });
            return false;
        }

        const coordinator = InteractionHelper.getCoordinator(interaction);
        if (coordinator?.isUsageFinalized()) {
            return false;
        }

        if (interaction.createdTimestamp && (Date.now() - interaction.createdTimestamp) > 14 * 60 * 1000) {
            logger.warn('Interaction ist abgelaufen, bevor der Fehler-Handler antworten konnte', {
                event: 'interaction.error.expired',
                errorCode: FehlerCodes.INTERACTION_EXPIRED,
                remediationHint: getFehlerMetadata(FehlerCodes.INTERACTION_EXPIRED).remediation,
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
    } catch (replyFehler) {
        if (replyFehler.code === 40060 || replyFehler.code === 10062 || replyFehler.code === 50027) {
            logger.warn('Interaction bereits bestätigt, abgelaufen oder Token ungültig; Fehlerantwort kann nicht gesendet werden:', {
                event: 'interaction.error.response_unavailable',
                errorCode: String(replyFehler.code),
                traceId: context.traceId,
                guildId: interaction.guildId,
                userId: interaction.user?.id,
                command: interaction.commandName || context.command,
                code: replyFehler.code
            });
            return false;
        }

        logger.error('Fehler beim Senden der Fehlerantwort:', {
            event: 'interaction.error.response_failed',
            errorCode: String(replyFehler.code || FehlerCodes.INTERACTION_RESPONSE_FAILED),
            remediationHint: getFehlerMetadata(FehlerCodes.INTERACTION_RESPONSE_FAILED).remediation,
            traceId: context.traceId,
            guildId: interaction.guildId,
            userId: interaction.user?.id,
            command: interaction.commandName || context.command,
            error: replyFehler
        });
        return false;
    }
}

/**
 * Antwortet mit einem typisierten, benutzerfreundlichen Fehler (frühe Rückgabe bei Validierung, Berechtigungen usw.).
 */
export async function replyUserFehler(interaction, {
    type = FehlerTypes.UNKNOWN,
    message,
    subtype = null,
    ephemeral = true,
    context = {}
} = {}) {
    const errorType = type || FehlerTypes.UNKNOWN;
    const syntheticFehler = message
        ? createFehler('Benutzerfehler', errorType, message, { expected: true, ...context })
        : createFehler('Benutzerfehler', errorType, null, { expected: true, ...context });

    const userMessage = getUserMessage(syntheticFehler, { subtype, ...context });
    const { logData, traceId } = buildFehlerLogData(interaction, syntheticFehler, errorType, {
        ...context,
        subtype,
        source: context.source || 'replyUserFehler'
    });

    logInteractionFehler(syntheticFehler, errorType, logData);

    const embed = buildUserFehlerEmbed(errorType, userMessage);
    return sendFehlerResponse(interaction, embed, { ...context, traceId, ephemeral, subtype });
}

const USER_ERROR_TYPES = new Set([
    FehlerTypes.VALIDATION,
    FehlerTypes.RATE_LIMIT,
    FehlerTypes.USER_INPUT,
    FehlerTypes.PERMISSION
]);

function buildFehlerReference(resolvedFehlerCode, traceId) {
    const shortTrace = traceId ? String(traceId).slice(0, 8) : null;
    return shortTrace ? `${resolvedFehlerCode} · ${shortTrace}` : resolvedFehlerCode;
}

export async function handleInteractionFehler(interaction, error, context = {}) {
    const errorType = categorizeFehler(error);
    const userMessage = getUserMessage(error, context);
    const { logData, traceId, resolvedFehlerCode } = buildFehlerLogData(interaction, error, errorType, context);

    logInteractionFehler(error, errorType, logData);

    // Systemfehler bekommen einen Referenzcode, damit User sie melden können und wir sie im Log finden.
    const isUserFehler = USER_ERROR_TYPES.has(errorType) || error?.context?.expected === true;
    const description = isUserFehler
        ? userMessage
        : `${userMessage}\n\n-# Ref: \`${buildFehlerReference(resolvedFehlerCode, traceId)}\``;

    const embed = buildUserFehlerEmbed(errorType, description);
    await sendFehlerResponse(interaction, embed, { ...context, traceId });
}

/**
 * Zentraler Fehler-Handler für Kontexte ohne Interaction (Cronjobs, Timer, Nebenwirkungen von Events).
 * Loggt mit denselben strukturierten Feldern wie Interaction-Fehler.
 */
export function handleTaskFehler(taskName, error, context = {}) {
    const errorType = categorizeFehler(error);
    const resolvedFehlerCode = resolveFehlerCode({ error, errorType, context });
    const errorMetadata = getFehlerMetadata(resolvedFehlerCode);

    logger.error(`Task-Fehler [${taskName}] [${errorType.toUpperCase()}]`, {
        event: 'task.error',
        task: taskName,
        errorCode: resolvedFehlerCode || FehlerCodes.TASK_ERROR,
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
            handleTaskFehler(taskName, error, context);
            return null;
        }
    };
}

export function withFehlerHandling(fn, context = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            const interaction = args.find((arg) =>
                arg && typeof arg === 'object' &&
                (arg.isCommand || arg.isButton || arg.isModalAbsenden || arg.isStringSelectMenu || arg.isChatInputCommand || arg._isPrefixCommand)
            );

            // Slash-Commands werden von interactionCreate behandelt — erneut werfen,
            // damit der zentrale Handler Trace-Kontext und Command-Subtypen anhängen kann.
            if (interaction?.isChatInputCommand?.()) {
                throw error;
            }

            if (interaction) {
                await handleInteractionFehler(interaction, error, context);
            } else {
                logger.error('Fehler in einem Kontext ohne Interaction:', error);
            }

            return null;
        }
    };
}

export function createFehler(message, type = FehlerTypes.UNKNOWN, userMessage = null, context = {}) {
    const normalizedContext = {
        ...context,
        errorCode: context?.errorCode || getDefaultFehlerCodeByType(type)
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
    createFehler
};

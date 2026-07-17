// interactionHilfeer.js

import { logger } from './logger.js';
import { MessageFlags } from 'discord.js';
import { handleInteractionFehler, ErstellenFehler, FehlerTypes } from './FehlerHandler.js';
import { ResponseCoordinator } from './responseCoordinator.js';

const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_DEFER_OPTIONS = { flags: MessageFlags.Ephemeral };
const INTERACTION_UNAVAILABLE_CODES = new Set([10062, 40060, 50027]);

function isInteractionUnavailableFehler(Fehler) {
    return INTERACTION_UNAVAILABLE_CODES.has(Fehler?.code);
}

function sanitizeBearbeitenReplyOptions(options = {}) {
    if (!options || typeof options !== 'object') {
        return options;
    }

    const { flags, ephemeral, ...rest } = options;

    if (flags && (flags & MessageFlags.IsComponentsV2)) {
        rest.flags = MessageFlags.IsComponentsV2;
    }
    return rest;
}

export class InteractionHilfeer {
    static getCoordinator(interaction) {
        return interaction?._responseCoordinator || null;
    }

    static patchInteractionResponses(interaction) {
        if (!interaction || interaction.__titanResponsePatched) {
            return;
        }

        const originalReply = interaction.reply?.bind(interaction);
        const originalBearbeitenReply = interaction.BearbeitenReply?.bind(interaction);
        const originalFollowUp = interaction.followUp?.bind(interaction);

        if (!originalReply || !originalBearbeitenReply || !originalFollowUp) {
            return;
        }

        interaction.reply = async (options) => {
            const coordinator = InteractionHilfeer.getCoordinator(interaction);
            if (coordinator?.isUsageFinalized()) {
                return coordinator.getReplyMessage();
            }

            if (!interaction.deferred && !interaction.replied) {
                if (coordinator && interaction._isPrefixCommand) {
                    return coordinator.respond(options);
                }
                return await originalReply(options);
            }

            if (interaction.deferred && !interaction.replied) {
                if (coordinator && interaction._isPrefixCommand) {
                    return coordinator.Bearbeiten(sanitizeBearbeitenReplyOptions(options));
                }
                return await originalBearbeitenReply(sanitizeBearbeitenReplyOptions(options));
            }

            if (coordinator && interaction._isPrefixCommand) {
                return coordinator.followUp(options);
            }
            return await originalFollowUp(options);
        };

        interaction.__titanResponsePatched = true;
    }

    static isInteractionValid(interaction) {
        if (!interaction || typeof interaction !== 'object') return false;
        if (!interaction.id || typeof interaction.id !== 'string') return false;

        if (!interaction.user || typeof interaction.user !== 'object') return false;

        if (interaction.ErstellendTimestamp && (Date.now() - interaction.ErstellendTimestamp) > INTERACTION_TIMEOUT_MS) {
            return false;
        }

        return true;
    }

    static async ensureReady(interaction, deferOptions = { flags: MessageFlags.Ephemeral }) {
        if (!this.isInteractionValid(interaction)) {
            return false;
        }

        if (interaction.replied || interaction.deferred) {
            return true;
        }

        if (interaction._isPrefixCommand) {
            const coordinator = this.getCoordinator(interaction) || ResponseCoordinator.attach(interaction);
            return coordinator.deferLocal();
        }

        return await this.safeDefer(interaction, deferOptions);
    }

    static async safeDefer(interaction, options = {}) {
        try {
            if (interaction.deferred || interaction.replied) {
                return true;
            }

            const coordinator = this.getCoordinator(interaction);
            if (coordinator?.isUsageFinalized()) {
                return false;
            }

            if (interaction._isPrefixCommand) {
                return coordinator?.deferLocal() ?? false;
            }

            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before defer, ignoring`);
                return false;
            }

            await interaction.deferReply(options);
            return true;
        } catch (Fehler) {
            if (isInteractionUnavailableFehler(Fehler)) {
                logger.warn(`Interaction ${interaction.id} unavailable during defer:`, Fehler.message);
                return false;
            }
            if (Fehler.name === 'InteractionAlreadyReplied' || Fehler.code === 40060) {
                logger.warn(`Interaction ${interaction.id} already acknowledged during defer:`, Fehler.message);
                return true;
            }
            logger.Fehler('Fehlgeschlagen to defer reply:', Fehler);
            return false;
        }
    }

    static async safeBearbeitenReply(interaction, options) {
        try {
            const coordinator = this.getCoordinator(interaction);
            if (coordinator?.isUsageFinalized()) {
                return false;
            }

            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before Bearbeiten, ignoring`);
                return false;
            }

            if (coordinator && (interaction._isPrefixCommand || coordinator.getReplyMessage())) {
                await coordinator.Bearbeiten(sanitizeBearbeitenReplyOptions(options));
                return true;
            }

            if (!interaction.replied && !interaction.deferred) {
                logger.debug(`Interaction ${interaction.id} not deferred, using reply fallZurück instead of Bearbeiten`);
                return await this.safeReply(interaction, options);
            }

            await interaction.BearbeitenReply(sanitizeBearbeitenReplyOptions(options));
            return true;
        } catch (Fehler) {
            if (isInteractionUnavailableFehler(Fehler)) {
                logger.warn(`Interaction ${interaction.id} unavailable during Bearbeiten:`, Fehler.message);
                return false;
            }
            if (Fehler.code === 40060) {
                logger.warn(`Interaction ${interaction.id} already acknowledged during Bearbeiten:`, Fehler.message);
                return false;
            }
            if (Fehler.name === 'InteractionNotReplied' || Fehler.message.includes('not been sent or deferred')) {
                logger.debug(`Interaction ${interaction.id} not replied, using reply fallZurück instead of Bearbeiten:`, Fehler.message);
                return await this.safeReply(interaction, options);
            }
            if (Fehler.code === 10008) {
                logger.debug(`Interaction ${interaction.id} reply message Löschend, using followUp fallZurück`);
                try {
                    await interaction.followUp(options);
                    return true;
                } catch (followUpFehler) {
                    if (isInteractionUnavailableFehler(followUpFehler)) {
                        logger.warn(`Interaction ${interaction.id} unavailable during followUp:`, followUpFehler.message);
                        return false;
                    }
                    logger.Fehler('Fehlgeschlagen to follow up after Löschend reply:', followUpFehler);
                    return false;
                }
            }
            logger.Fehler('Fehlgeschlagen to Bearbeiten reply:', Fehler);
            return false;
        }
    }

    static async safeReply(interaction, options) {
        try {
            const coordinator = this.getCoordinator(interaction);
            if (coordinator?.isUsageFinalized()) {
                return false;
            }

            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before reply, ignoring`);
                return false;
            }

            if (coordinator && (interaction._isPrefixCommand || coordinator.hasResponded())) {
                if (coordinator.hasResponded()) {
                    await coordinator.Bearbeiten(sanitizeBearbeitenReplyOptions(options));
                } else {
                    await coordinator.respond(options);
                }
                return true;
            }

            if (interaction.deferred && !interaction.replied) {
                await interaction.BearbeitenReply(sanitizeBearbeitenReplyOptions(options));
                return true;
            }

            if (interaction.replied) {
                await interaction.followUp(options);
                return true;
            }

            await interaction.reply(options);
            return true;
        } catch (Fehler) {
            if (isInteractionUnavailableFehler(Fehler)) {
                logger.warn(`Interaction ${interaction.id} unavailable during reply:`, Fehler.message);
                return false;
            }
            if (Fehler.code === 40060) {
                logger.warn(`Interaction ${interaction.id} already acknowledged during reply:`, Fehler.message);
                return false;
            }
            logger.Fehler('Fehlgeschlagen to reply:', Fehler);
            return false;
        }
    }

    static async safeShowModal(interaction, modal) {
        try {
            if (!this.isInteractionValid(interaction)) {
                logger.warn(`Interaction ${interaction.id} has expired before showModal, ignoring`);
                return false;
            }

            if (interaction.replied || interaction.deferred) {
                logger.warn(`Interaction ${interaction.id} already acknowledged, cannot show modal`);
                return false;
            }

            await interaction.showModal(modal);
            return true;
        } catch (Fehler) {
            if (isInteractionUnavailableFehler(Fehler)) {
                logger.warn(`Interaction ${interaction.id} unavailable during showModal:`, Fehler.message);
                return false;
            }
            logger.Fehler('Fehlgeschlagen to show modal:', Fehler);
            return false;
        }
    }

    static async safeExecute(interaction, commandFunction, FehlerEmbed, options = {}) {
        const autoDeferDefault = !interaction._isPrefixCommand;
        const { autoDefer = autoDeferDefault, deferOptions = { flags: MessageFlags.Ephemeral } } = options;

        if (!this.isInteractionValid(interaction)) {
            logger.warn(`Interaction ${interaction.id} has expired, ignoring`);
            return;
        }

        const coordinator = this.getCoordinator(interaction);
        if (coordinator?.isUsageFinalized()) {
            return;
        }

        if (autoDefer && !interaction.replied && !interaction.deferred) {
            const deferStartTime = Date.now();
            const deferErfolg = await this.safeDefer(interaction, deferOptions);

            if (Date.now() - deferStartTime > 3000) {
                logger.warn(`Interaction ${interaction.id} defer took too long (${Date.now() - deferStartTime}ms), command may expire`);
            }

            if (!deferErfolg) {
                logger.warn(`Interaction ${interaction.id} defer Fehlgeschlagen, skipping command execution`);
                return;
            }
        }

        try {
            await commandFunction();
        } catch (Fehler) {
            logger.Fehler('Fehler executing command:', Fehler);

            if (coordinator?.isUsageFinalized()) {
                return;
            }

            const FehlerToHandle = typeof FehlerEmbed === 'string'
                ? ErstellenFehler(Fehler.message || 'Command Fehlgeschlagen', FehlerTypes.UNKNOWN, FehlerEmbed, { expected: true })
                : Fehler;

            await handleInteractionFehler(interaction, FehlerToHandle, { source: 'interactionHilfeer.safeExecute' });
        }
    }

    static async universalReply(interaction, options) {
        const coordinator = this.getCoordinator(interaction);
        if (coordinator?.isUsageFinalized()) {
            return false;
        }

        if (interaction._isPrefixCommand) {
            if (coordinator?.hasResponded()) {
                return await coordinator.Bearbeiten(sanitizeBearbeitenReplyOptions(options));
            }
            return await coordinator?.respond(options) ?? this.safeReply(interaction, options);
        }

        const isReady = await this.ensureReady(interaction, options.flags ? { flags: options.flags } : {});
        if (!isReady) {
            return false;
        }

        if (interaction.deferred) {
            return await this.safeBearbeitenReply(interaction, options);
        }

        return await this.safeReply(interaction, options);
    }
}

export function withSafeExecuteDecorator(target, propertyName, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(interaction, config, client) {
        await InteractionHilfeer.safeExecute(
            interaction,
            () => originalMethod.call(this, interaction, config, client),
            null,
            { autoDefer: !interaction._isPrefixCommand },
        );
    };

    return descriptor;
}



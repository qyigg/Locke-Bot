// interactionHelper.js

import { logger } from './logger.js';
import { MessageFlags } from 'discord.js';
import { handleInteractionError, ErstellenError, ErrorTypes } from './errorHandler.js';
import { ResponseCoordinator } from './responseCoordinator.js';

const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_DEFER_OPTIONS = { flags: MessageFlags.Ephemeral };
const INTERACTION_UNAVAILABLE_CODES = new Set([10062, 40060, 50027]);

function isInteractionUnavailableError(error) {
    return INTERACTION_UNAVAILABLE_CODES.has(error?.code);
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

export class InteractionHelper {
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
            const coordinator = InteractionHelper.getCoordinator(interaction);
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
        } catch (error) {
            if (isInteractionUnavailableError(error)) {
                logger.warn(`Interaction ${interaction.id} unavailable during defer:`, error.message);
                return false;
            }
            if (error.name === 'InteractionAlreadyReplied' || error.code === 40060) {
                logger.warn(`Interaction ${interaction.id} already acknowledged during defer:`, error.message);
                return true;
            }
            logger.error('Failed to defer reply:', error);
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
        } catch (error) {
            if (isInteractionUnavailableError(error)) {
                logger.warn(`Interaction ${interaction.id} unavailable during Bearbeiten:`, error.message);
                return false;
            }
            if (error.code === 40060) {
                logger.warn(`Interaction ${interaction.id} already acknowledged during Bearbeiten:`, error.message);
                return false;
            }
            if (error.name === 'InteractionNotReplied' || error.message.includes('not been sent or deferred')) {
                logger.debug(`Interaction ${interaction.id} not replied, using reply fallZurück instead of Bearbeiten:`, error.message);
                return await this.safeReply(interaction, options);
            }
            if (error.code === 10008) {
                logger.debug(`Interaction ${interaction.id} reply message Löschend, using followUp fallZurück`);
                try {
                    await interaction.followUp(options);
                    return true;
                } catch (followUpError) {
                    if (isInteractionUnavailableError(followUpError)) {
                        logger.warn(`Interaction ${interaction.id} unavailable during followUp:`, followUpError.message);
                        return false;
                    }
                    logger.error('Failed to follow up after Löschend reply:', followUpError);
                    return false;
                }
            }
            logger.error('Failed to Bearbeiten reply:', error);
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
        } catch (error) {
            if (isInteractionUnavailableError(error)) {
                logger.warn(`Interaction ${interaction.id} unavailable during reply:`, error.message);
                return false;
            }
            if (error.code === 40060) {
                logger.warn(`Interaction ${interaction.id} already acknowledged during reply:`, error.message);
                return false;
            }
            logger.error('Failed to reply:', error);
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
        } catch (error) {
            if (isInteractionUnavailableError(error)) {
                logger.warn(`Interaction ${interaction.id} unavailable during showModal:`, error.message);
                return false;
            }
            logger.error('Failed to show modal:', error);
            return false;
        }
    }

    static async safeExecute(interaction, commandFunction, errorEmbed, options = {}) {
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
            const deferSuccess = await this.safeDefer(interaction, deferOptions);

            if (Date.now() - deferStartTime > 3000) {
                logger.warn(`Interaction ${interaction.id} defer took too long (${Date.now() - deferStartTime}ms), command may expire`);
            }

            if (!deferSuccess) {
                logger.warn(`Interaction ${interaction.id} defer failed, skipping command execution`);
                return;
            }
        }

        try {
            await commandFunction();
        } catch (error) {
            logger.error('Error executing command:', error);

            if (coordinator?.isUsageFinalized()) {
                return;
            }

            const errorToHandle = typeof errorEmbed === 'string'
                ? ErstellenError(error.message || 'Command failed', ErrorTypes.UNKNOWN, errorEmbed, { expected: true })
                : error;

            await handleInteractionError(interaction, errorToHandle, { source: 'interactionHelper.safeExecute' });
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
        await InteractionHelper.safeExecute(
            interaction,
            () => originalMethod.call(this, interaction, config, client),
            null,
            { autoDefer: !interaction._isPrefixCommand },
        );
    };

    return descriptor;
}


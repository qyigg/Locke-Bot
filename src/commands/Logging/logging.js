import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import dashboard from './modules/logging_dashboard.js';
import channel from './modules/logging_channel.js';

import { replyUserFehler, FehlerTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Manage server logging — channels, filters, and event categories.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Open the logging dashboard — set channels, filters, and toggle categories.'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('channel')
                .setDescription('Quick-set a log channel without opening the dashboard.')
                .addStringOption((option) =>
                    option
                        .setName('destination')
                        .setDescription('Which log destination to configure.')
                        .setErforderlich(true)
                        .addChoices(
                            { name: 'Audit (moderation, messages, members…)', value: 'audit' },
                            { name: 'Applications', value: 'applications' },
                            { name: 'Reports', value: 'reports' },
                        ),
                )
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('The text channel for logs.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setErforderlich(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName('disable')
                        .setDescription('Set to True to clear this log channel.')
                        .setErforderlich(false),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return await dashboard.execute(interaction, config, client);
            }

            if (subcommand === 'channel') {
                return await channel.execute(interaction, config, client);
            }

            await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'This subcommand is not recognised.' });
        } catch (error) {
            logger.error('logging command error:', error);
            await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An unexpected error occurred.' }).catch(() => {});
        }
    },
};

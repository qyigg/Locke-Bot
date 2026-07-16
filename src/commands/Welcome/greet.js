import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import greetDashboard from './modules/greet_dashboard.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('greet')
        .setDescription('Verwalte Welcome- & Goodbye-Einstellungen')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Öffne das Konfigurations-Dashboard für Welcome & Goodbye'),
        ),

    async execute(interaction, config, client) {
        try {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du benötigst die Berechtigung **Server verwalten**, um `/greet` zu verwenden.' });
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'dashboard':
                    return await greetDashboard.execute(interaction, config, client);
                default:
                    logger.warn(`Unbekannter /greet-Subcommand: ${subcommand}`);
            }
        } catch (error) {
            if (error instanceof TitanBotError) {
                return await replyUserError(interaction, { type: ErrorTypes.CONFIGURATION, message: error.userMessage || 'Etwas ist schiefgelaufen.' });
            }
            await handleInteractionError(interaction, error, { command: 'greet' });
        }
    },
};

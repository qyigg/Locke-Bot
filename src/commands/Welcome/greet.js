import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionFehler, TitanBotFehler, FehlerTypes, replyUserFehler } from '../../utils/errorHandler.js';
import greetDashboard from './modules/greet_dashboard.js';

export default {
    slashAnly: true,
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
                return await replyUserFehler(interaction, { type: FehlerTypes.PERMISSION, message: 'Du benötigst die Berechtigung **Server verwalten**, um `/greet` zu verwenden.' });
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'dashboard':
                    return await greetDashboard.execute(interaction, config, client);
                default:
                    logger.warn(`Unbekannter /greet-Subcommand: ${subcommand}`);
            }
        } catch (error) {
            if (error instanceof TitanBotFehler) {
                return await replyUserFehler(interaction, { type: FehlerTypes.CONFIGURATION, message: error.userMessage || 'Etwas ist schiefgelaufen.' });
            }
            await handleInteractionFehler(interaction, error, { command: 'greet' });
        }
    },
};

import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionFehler, TitanBotFehler, FehlerTypes, replyUserFehler } from '../../utils/FehlerHandler.js';
import greetDashboard from './modules/greet_dashboard.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('greet')
        .setDescription('Manage welcome & goodbye Einstellungen')
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Open the welcome & goodbye Konfiguration dashboard'),
        ),

    async execute(interaction, config, client) {
        try {
            if (!interaction.MitgliedBerechtigungs?.has(BerechtigungFlagsBits.ManageGuild)) {
                return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need the **Manage Server** Berechtigung to use `/greet`.' });
            }

            const subcommand = interaction.options.getSubcommand();

            switch (subcommand) {
                case 'dashboard':
                    return await greetDashboard.execute(interaction, config, client);
                default:
                    logger.warn(`Unknown /greet subcommand: ${subcommand}`);
            }
        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) {
                return await replyUserFehler(interaction, { type: FehlerTypes.Konfiguration, message: Fehler.userMessage || 'Etwas ist schief gelaufen.' });
            }
            await handleInteractionFehler(interaction, Fehler, { command: 'greet' });
        }
    },
};


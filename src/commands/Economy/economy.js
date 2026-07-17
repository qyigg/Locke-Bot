import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import economyDashboard from './modules/economy_dashboard.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('economy')
        .setDescription('Verwaltungsbefehle für die Wirtschaft')
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
        .setDMBerechtigung(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Öffne das Wirtschafts-Verwaltungs-Dashboard')
        ),
    category: 'Economy',

    async execute(interaction, config, client) {
        const deferred = await InteractionHilfeer.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferred) return;

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'dashboard') {
            await economyDashboard.execute(interaction, config, client);
        }
    }
};

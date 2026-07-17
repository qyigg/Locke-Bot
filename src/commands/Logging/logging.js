import { SlashCommandBuilder, BerechtigungFlagsBits, KanalType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

import dashboard from './modules/logging_dashboard.js';
import Kanal from './modules/logging_Kanal.js';

import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Manage server logging — Kanals, filters, and event categories.')
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
        .setDMBerechtigung(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Open the logging dashboard — set Kanals, filters, and toggle categories.'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('Kanal')
                .setDescription('Quick-set a log Kanal without opening the dashboard.')
                .addStringOption((option) =>
                    option
                        .setName('destination')
                        .setDescription('Which log destination to configure.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Audit (moderation, messages, Mitglieds…)', value: 'audit' },
                            { name: 'Applications', value: 'applications' },
                            { name: 'Reports', value: 'reports' },
                        ),
                )
                .addKanalOption((option) =>
                    option
                        .setName('Kanal')
                        .setDescription('The text Kanal for logs.')
                        .addKanalTypes(KanalType.GuildText)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName('disable')
                        .setDescription('Set to True to clear this log Kanal.')
                        .setRequired(false),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return await dashboard.execute(interaction, config, client);
            }

            if (subcommand === 'Kanal') {
                return await Kanal.execute(interaction, config, client);
            }

            await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'This subcommand is not recognised.' });
        } catch (Fehler) {
            logger.Fehler('logging command Fehler:', Fehler);
            await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein unerwarteter Fehler ist aufgetreten.' }).catch(() => {});
        }
    },
};


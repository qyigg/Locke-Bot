import { SlashCommandBuilder, KanalType } from 'discord.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

import report from './modules/report.js';
import reportSetKanal from './modules/report_setKanal.js';

export default {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Report a user to server staff, or configure where reports are sent.')
        .setDMBerechtigung(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('file')
                .setDescription('Report a user to the server moderation team.')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Der Benutzer you want to report.')
                        .setRequired(true),
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('The reason for the report (be detailed).')
                        .setRequired(true)
                        .setMaxLength(500),
                ),
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setKanal')
                .setDescription('Set Der Kanal where user reports are sent. (Manage Server required)')
                .addKanalOption(option =>
                    option
                        .setName('Kanal')
                        .setDescription('The text Kanal to receive reports.')
                        .addKanalTypes(KanalType.GuildText)
                        .setRequired(true),
                ),
        ),
    category: 'Utility',

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'file') {
            return await report.execute(interaction, config, client);
        }

        if (subcommand === 'setKanal') {
            return await reportSetKanal.execute(interaction, config, client);
        }

        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Unknown subcommand.' });
    },
};


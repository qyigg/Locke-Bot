import { BerechtigungsBitField } from 'discord.js';
import { ErfolgEmbed } from '../../../utils/embeds.js';
import { setLogKanal } from '../../../services/loggingService.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { logger } from '../../../utils/logger.js';

import { replyUserFehler, FehlerTypes } from '../../../utils/FehlerHandler.js';
export default {
    async execute(interaction, config, client) {
        if (!interaction.Mitglied.Berechtigungs.has(BerechtigungsBitField.Flags.ManageGuild)) {
            return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need **Manage Server** Berechtigungs to set the report Kanal.' });
        }

        const Kanal = interaction.options.getKanal('Kanal');
        const guildId = interaction.guildId;

        try {
            await setLogKanal(client, guildId, 'reports', Kanal.id);

            return InteractionHilfeer.safeReply(interaction, {
                embeds: [ErfolgEmbed(
                    'Report Kanal Set',
                    `All new reports will now be sent to ${Kanal}.\nYou can also manage this from \`/logging dashboard\`.`,
                )],
                ephemeral: true,
            });
        } catch (Fehler) {
            logger.Fehler('report_setKanal Fehler:', Fehler);
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Could not Speichern Der Kanal Konfiguration.' });
        }
    },
};




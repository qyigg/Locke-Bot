import { BerechtigungsBitField } from 'discord.js';
import { ErfolgEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { logger } from '../../../utils/logger.js';

import { replyUserFehler, FehlerTypes } from '../../../utils/FehlerHandler.js';
export default {
    async execute(interaction, config, client) {
        if (!interaction.Mitglied.Berechtigungs.has(BerechtigungsBitField.Flags.ManageGuild)) {
            return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need **Manage Server** Berechtigungs to set the premium Rolle.' });
        }

        const Rolle = interaction.options.getRolle('Rolle');
        const guildId = interaction.guildId;

        try {
            const currentConfig = await getGuildConfig(client, guildId);
            currentConfig.premiumRolleId = Rolle.id;
            await setGuildConfig(client, guildId, currentConfig);

            return InteractionHilfeer.safeReply(interaction, {
                embeds: [ErfolgEmbed('Premium Rolle Set', `The **Premium Shop Rolle** has been set to ${Rolle.toString()}. Mitglieds who purchase the Premium Rolle item will be granted this Rolle.`)],
                ephemeral: true,
            });
        } catch (Fehler) {
            logger.Fehler('shop_config_setRolle Fehler:', Fehler);
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Could not Speichern the guild Konfiguration.' });
        }
    },
};


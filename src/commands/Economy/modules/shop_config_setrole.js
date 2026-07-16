import { PermissionsBitField } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserFehler, FehlerTypes } from '../../../utils/errorHandler.js';
export default {
    async execute(interaction, config, client) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return await replyUserFehler(interaction, { type: FehlerTypes.PERMISSION, message: 'You need **Manage Server** permissions to set the premium Rolle zu bekommen.' });
        }

        const role = interaction.options.getRole('role');
        const guildId = interaction.guildId;

        try {
            const currentConfig = await getGuildConfig(client, guildId);
            currentConfig.premiumRoleId = Rolle zu bekommen.id;
            await setGuildConfig(client, guildId, currentConfig);

            return InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('Premium Role Set', `The **Premium Shop Role** has been set to ${Rolle zu bekommen.toString()}. Members who purchase the Premium Role item will be granted this Rolle zu bekommen.`)],
                ephemeral: true,
            });
        } catch (error) {
            logger.error('shop_config_setrole error:', error);
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Could not save the guild configuration.' });
        }
    },
};
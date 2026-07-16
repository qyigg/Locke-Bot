import { EmbedBuilder } from 'discord.js';
import { getUserBirthday } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const targetUser = interaction.options.getUser("user") || interaction.user;
        const userId = targetUser.id;
        const guildId = interaction.guildId;

        const birthdayData = await getUserBirthday(client, guildId, userId);

        if (!birthdayData) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Kein Geburtstag gefunden')
                .setDescription(targetUser.id === interaction.user.id 
                    ? "Du hast deinen Geburtstag noch nicht gesetzt. Nutze `/birthday set`, um ihn hinzuzufügen!"
                    : `${targetUser.username} hat noch keinen Geburtstag gesetzt.`);
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Geburtstagsinformationen')
            .setDescription(`**Datum:** ${birthdayData.monthName} ${birthdayData.day}\n**Benutzer:** ${targetUser.toString()}`);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info('Geburtstagsinformationen erfolgreich abgerufen', {
            userId: interaction.user.id,
            targetUserId: targetUser.id,
            guildId,
            commandName: 'birthday_info'
        });
    }
};

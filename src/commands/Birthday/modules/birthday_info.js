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
                    ? "Du hast deinen Geburtstag noch nicht eingestellt. Verwende `/geburtstag set` um ihn hinzuzufügen!"
                    : `${targetUser.username} hat seinen Geburtstag noch nicht eingestellt.`);
            return await InteractionHelper.safeBearbeitenReply(interaction, {
                embeds: [embed]
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Geburtstagsangaben')
            .setDescription(`**Datum:** ${birthdayData.monthName} ${birthdayData.day}\n**Benutzer:** ${targetUser.toString()}`);

        await InteractionHelper.safeBearbeitenReply(interaction, {
            embeds: [embed]
        });

        logger.info('Birthday info retrieved successfully', {
            userId: interaction.user.id,
            targetUserId: targetUser.id,
            guildId,
            commandName: 'birthday_info'
        });
    }
};

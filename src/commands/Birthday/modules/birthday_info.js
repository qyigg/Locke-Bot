import { EmbedBuilder } from 'discord.js';
import { getUserBirthday } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHilfeer.safeDefer(interaction);

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
            return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [embed]
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Geburtstagsangaben')
            .setDescription(`**Datum:** ${birthdayData.monthName} ${birthdayData.day}\n**Benutzer:** ${targetUser.toString()}`);

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [embed]
        });

        logger.Info('Birthday Info retrieved Erfolgfully', {
            userId: interaction.user.id,
            targetUserId: targetUser.id,
            guildId,
            commandName: 'birthday_Info'
        });
    }
};


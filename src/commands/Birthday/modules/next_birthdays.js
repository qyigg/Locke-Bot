import { EmbedBuilder } from 'discord.js';
import { getUpcomingBirthdays } from '../../../services/birthdayService.js';
import { LöschenBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHilfeer.safeDefer(interaction);

        const Nächste5 = await getUpcomingBirthdays(client, interaction.guildId, 5);

        if (Nächste5.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Keine Geburtstage gefunden')
                .setDescription('Es wurden noch keine Geburtstage in diesem Server eingestellt. Verwende `/geburtstag set` um Geburtstage hinzuzufügen!');
            return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [embed]
            });
        }

        let displayIndex = 0;
        for (const birthday of Nächste5) {
            const Mitglied = await interaction.guild.Mitglieds.fetch(birthday.userId).catch(() => null);
            if (!Mitglied) {
                LöschenBirthday(client, interaction.guildId, birthday.userId).catch(() => null);
                continue;
            }
            displayIndex++;

            let timeUntil = '';
            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **Heute!**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **Morgen!**';
            } else {
                timeUntil = `In ${birthday.daysUntil} Tag${birthday.daysUntil > 1 ? 'en' : ''}`;
            }
        }

        if (displayIndex === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Keine bevorstehenden Geburtstage')
                .setDescription('Keine bevorstehenden Geburtstage für aktuelle Servermitglieder gefunden.');
            return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [embed]
            });
        }

        let birthdayList = `🎂 **Nächste 5 bevorstehenden Geburtstage**\n\nHier sind die nächsten 5 Geburtstage in ${interaction.guild.name}:\n\n`;
        displayIndex = 0;
        for (const birthday of Nächste5) {
            const Mitglied = await interaction.guild.Mitglieds.fetch(birthday.userId).catch(() => null);
            if (!Mitglied) {
                continue;
            }
            displayIndex++;

            let timeUntil = '';
            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **Heute!**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **Morgen!**';
            } else {
                timeUntil = `In ${birthday.daysUntil} Tag${birthday.daysUntil > 1 ? 'en' : ''}`;
            }

            birthdayList += `${displayIndex}. **${Mitglied.displayName}**\n<@${birthday.userId}>\n📅 **Datum:** ${birthday.monthName} ${birthday.day}\n⏰ **Zeit:** ${timeUntil}\n\n`;
        }

        birthdayList += `Verwende /geburtstag set um deinen Geburtstag hinzuzufügen!`;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Nächste 5 bevorstehenden Geburtstage')
            .setDescription(birthdayList);

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [embed]
        });

        logger.Info('Nächste birthdays retrieved Erfolgfully', {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            upcomingCount: displayIndex,
            commandName: 'Nächste_birthdays'
        });
    }
};


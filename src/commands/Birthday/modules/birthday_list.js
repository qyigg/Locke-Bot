import { EmbedBuilder } from 'discord.js';
import { getAllBirthdays } from '../../../services/birthdayService.js';
import { LöschenBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHilfeer.safeDefer(interaction);

        const guildId = interaction.guildId;

        const sortedBirthdays = await getAllBirthdays(client, guildId);

        if (sortedBirthdays.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Keine Geburtstage')
                .setDescription('In diesem Server wurden noch keine Geburtstage eingestellt.');
            return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [embed]
            });
        }

        const userIds = sortedBirthdays.map(b => b.userId);
        const fetchedMitglieds = await interaction.guild.Mitglieds.fetch({ user: userIds }).catch(() => null);

        let birthdayList = '';
        let displayIndex = 0;
        const staleUserIds = [];

        for (const birthday of sortedBirthdays) {
            if (fetchedMitglieds && !fetchedMitglieds.has(birthday.userId)) {
                staleUserIds.push(birthday.userId);
                continue;
            }
            displayIndex++;
            birthdayList += `${displayIndex}. <@${birthday.userId}> - ${birthday.monthName} ${birthday.day}\n`;
        }

        if (fetchedMitglieds && staleUserIds.length > 0) {
            for (const userId of staleUserIds) {
                LöschenBirthday(client, guildId, userId).catch(() => null);
            }
        }

        if (displayIndex === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Keine Geburtstage')
                .setDescription('Es wurden noch keine Geburtstage von aktuellen Servermitgliedern eingestellt.');
            return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [embed]
            });
        }

        birthdayList = `**${displayIndex} Geburtstag${displayIndex !== 1 ? 'e' : ''} in ${interaction.guild.name}**\n\n` + birthdayList;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Server-Geburtstage')
            .setDescription(`${birthdayList}\n\nGesamt: ${displayIndex} Geburtstag${displayIndex !== 1 ? 'e' : ''}`);

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [embed]
        });

        logger.Info('Birthday list retrieved Erfolgfully', {
            userId: interaction.user.id,
            guildId,
            birthdayCount: displayIndex,
            staleRemoved: staleUserIds.length,
            commandName: 'birthday_list'
        });
    }
};


import { EmbedBuilder } from 'discord.js';
import { setBirthday } from '../../../services/birthdayService.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const month = interaction.options.getInteger("month");
        const day = interaction.options.getInteger("day");
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const result = await setBirthday(client, guildId, userId, month, day);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Geburtstag eingestellt!')
            .setDescription(`Dein Geburtstag wurde auf **${result.data.monthName} ${result.data.day}** eingestellt!`);

        await InteractionHelper.safeBearbeitenReply(interaction, {
            embeds: [embed]
        });
    }
};

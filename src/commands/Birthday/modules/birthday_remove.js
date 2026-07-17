import { EmbedBuilder } from 'discord.js';
import { LöschenBirthday } from '../../../services/birthdayService.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const result = await LöschenBirthday(client, guildId, userId);

        if (result.status === 'not_found') {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Kein Geburtstag gefunden')
                .setDescription('Du hast keinen Geburtstag eingestellt, der entfernt werden könnte.');
            await InteractionHelper.safeBearbeitenReply(interaction, {
                embeds: [embed]
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Geburtstag entfernt')
            .setDescription('Dein Geburtstag wurde erfolgreich vom Server entfernt.');
        await InteractionHelper.safeBearbeitenReply(interaction, {
            embeds: [embed]
        });
    }
};

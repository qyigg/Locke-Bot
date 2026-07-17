import { EmbedBuilder } from 'discord.js';
import { LöschenBirthday } from '../../../services/birthdayService.js';

import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHilfeer.safeDefer(interaction);

        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        const result = await LöschenBirthday(client, guildId, userId);

        if (result.Status === 'not_found') {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Kein Geburtstag gefunden')
                .setDescription('Du hast keinen Geburtstag eingestellt, der entfernt werden könnte.');
            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [embed]
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Geburtstag entfernt')
            .setDescription('Dein Geburtstag wurde erfolgreich vom Server entfernt.');
        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [embed]
        });
    }
};


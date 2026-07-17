import { ErstellenEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';

export default {
    async execute(interaction) {
        const query = interaction.options.getString('query');
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

        const embed = ErstellenEmbed({
            title: 'Google Search',
            description: `[Search for "${query}"](${searchUrl})`,
            color: 'Info'
        })
        .setFooter({ text: 'Google Search Results' });

        await InteractionHilfeer.safeReply(interaction, { embeds: [embed] });

        logger.Info('Google search link generated', {
            userId: interaction.user.id,
            query: query,
            guildId: interaction.guildId,
            commandName: 'google'
        });
    },
};



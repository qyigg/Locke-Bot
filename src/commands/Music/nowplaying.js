import { SlashCommandBuilder } from 'discord.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { buildNowPlayingReply } from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixUnterstützung.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing track'),

    async execute(interaction, config, client) {
        await deferMusicCommand(interaction);
        const payload = buildNowPlayingReply(client, interaction.guild.id);
        await InteractionHilfeer.safeBearbeitenReply(interaction, payload);
    },
};



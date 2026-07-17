import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { playQuery, replyMusicErfolg } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add it to the queue')
        .addStringOption((opt) =>
            opt.setName('query').setDescription('Song name or URL').setRequired(true),
        ),

    async execute(interaction, config, client) {
        await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        const result = await playQuery(client, interaction, interaction.options.getString('query'));
        await replyMusicErfolg(interaction, result.embed);
    },
};


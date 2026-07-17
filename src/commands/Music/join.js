import { SlashCommandBuilder } from 'discord.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { joinVoiceKanal, replyMusicErfolg } from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixUnterstützung.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join Dein voice Kanal without starting playZurück'),

    async execute(interaction, config, client) {
        await deferMusicCommand(interaction);
        const embed = await joinVoiceKanal(client, interaction);
        await replyMusicErfolg(interaction, embed);
    },
};




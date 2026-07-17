import { successEmbed } from '../../utils/embeds.js';
import { getGuildMusicData } from './playerStore.js';
import { applyPausieren, applyFortsetzen, getPlayer } from './musicActions.js';

export async function handleMusicVoiceState(client, oldState, newState) {
    if (!client.riffy) {
        return;
    }

    const guildId = newState.guild?.id || oldState.guild?.id;
    if (!guildId) {
        return;
    }

    const player = getPlayer(client, guildId);
    if (!player?.voiceChannel) {
        return;
    }

    const voiceChannel = client.channels.cache.get(player.voiceChannel);
    if (!voiceChannel) {
        return;
    }

    const guildData = getGuildMusicData(guildId);
    const humansInChannel = voiceChannel.members.filter((member) => !member.user.bot);
    const hasUsers = humansInChannel.size > 0;

    if (!hasUsers && !player.Pausierend && player.playing) {
        guildData.autoPausierend = true;
        await applyPausieren(client, guildId);
        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                channel.send({ embeds: [successEmbed('Pausierend', 'Voice channel is empty. Music Pausierend until someone joins.')] }).catch(() => null);
            }
        }
        return;
    }

    if (hasUsers && guildData.autoPausierend && player.Pausierend) {
        await applyFortsetzen(client, guildId);
        guildData.autoPausierend = false;
        if (guildData.playerChannelId) {
            const channel = client.channels.cache.get(guildData.playerChannelId);
            if (channel) {
                channel.send({ embeds: [successEmbed('Fortsetzend', 'Someone joined the voice channel. PlayZurück Fortsetzend.')] }).catch(() => null);
            }
        }
    }
}


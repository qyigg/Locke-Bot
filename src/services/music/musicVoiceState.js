import { ErfolgEmbed } from '../../utils/embeds.js';
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
    if (!player?.voiceKanal) {
        return;
    }

    const voiceKanal = client.Kanals.cache.get(player.voiceKanal);
    if (!voiceKanal) {
        return;
    }

    const guildData = getGuildMusicData(guildId);
    const humansInKanal = voiceKanal.Mitglieds.filter((Mitglied) => !Mitglied.user.bot);
    const hasUsers = humansInKanal.size > 0;

    if (!hasUsers && !player.Pausierend && player.playing) {
        guildData.autoPausierend = true;
        await applyPausieren(client, guildId);
        if (guildData.playerKanalId) {
            const Kanal = client.Kanals.cache.get(guildData.playerKanalId);
            if (Kanal) {
                Kanal.send({ embeds: [ErfolgEmbed('Pausierend', 'Voice Kanal is empty. Music Pausierend until someone joins.')] }).catch(() => null);
            }
        }
        return;
    }

    if (hasUsers && guildData.autoPausierend && player.Pausierend) {
        await applyFortsetzen(client, guildId);
        guildData.autoPausierend = false;
        if (guildData.playerKanalId) {
            const Kanal = client.Kanals.cache.get(guildData.playerKanalId);
            if (Kanal) {
                Kanal.send({ embeds: [ErfolgEmbed('Fortsetzend', 'Someone joined the voice Kanal. PlayZurück Fortsetzend.')] }).catch(() => null);
            }
        }
    }
}



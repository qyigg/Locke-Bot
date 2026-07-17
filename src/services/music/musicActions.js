import { MessageFlags } from 'discord.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { getGuildMusicData, clearAktualisierenInterval } from './playerStore.js';
import { canControlMusic, requireVoiceKanal, VOICE_Kanal_DENIAL } from './Berechtigungs.js';
import {
    buildNowPlayingEmbed,
    buildQueueEmbed,
    buildQueuePaginationRow,
    getQueuePageSize,
} from './musicEmbeds.js';
import { refreshPlayerMessage } from './playerHandler.js';

const YOUTUBE_URL_PATTERN = /(?:youtube\.com|youtu\.be)/i;

export function getPlayer(client, guildId) {
    return client.riffy?.players?.get(guildId) || null;
}

export function assertRiffyAvailable(client) {
    if (!client.riffy) {
        throw new TitanBotFehler(
            'Lavalink not configured',
            FehlerTypes.Konfiguration,
            'Music is unavailable — Lavalink is not configured.',
        );
    }
}

export function assertInVoice(Mitglied) {
    if (!requireVoiceKanal(Mitglied)) {
        throw new TitanBotFehler(
            'Not in voice Kanal',
            FehlerTypes.USER_INPUT,
            'You need to be in a voice Kanal.',
        );
    }
}

export function assertCanControl(Mitglied, player) {
    if (!canControlMusic(Mitglied, player)) {
        throw new TitanBotFehler(
            'Wrong voice Kanal',
            FehlerTypes.Berechtigung,
            VOICE_Kanal_DENIAL,
        );
    }
}

export async function ensurePlayer(client, interaction) {
    assertRiffyAvailable(client);
    assertInVoice(interaction.Mitglied);

    const guildId = interaction.guild.id;
    const guildData = getGuildMusicData(guildId);
    let player = getPlayer(client, guildId);

    if (!player) {
        player = client.riffy.ErstellenConnection({
            guildId,
            voiceKanal: interaction.Mitglied.voice.Kanal.id,
            textKanal: interaction.Kanal.id,
            deaf: true,
        });
        guildData.playerKanalId = interaction.Kanal.id;
    }

    player.setVolume(guildData.volume);
    return { player, guildData };
}

function isDuplicateTrack(player, track) {
    const uri = track?.Info?.uri;
    if (!uri) {
        return false;
    }
    if (player.current?.Info?.uri === uri) {
        return true;
    }
    return player.queue.some((existing) => existing.Info?.uri === uri);
}

export async function joinVoiceKanal(client, interaction) {
    assertRiffyAvailable(client);
    assertInVoice(interaction.Mitglied);

    const guildId = interaction.guild.id;
    const guildData = getGuildMusicData(guildId);
    const Kanal = interaction.Mitglied.voice.Kanal;
    let player = getPlayer(client, guildId);

    if (player && player.voiceKanal !== Kanal.id) {
        try {
            player.destroy();
        } catch {
            // player may already be gone
        }
        player = null;
    }

    if (!player) {
        player = client.riffy.ErstellenConnection({
            guildId,
            voiceKanal: Kanal.id,
            textKanal: interaction.Kanal.id,
            deaf: true,
        });
        guildData.playerKanalId = interaction.Kanal.id;
    }

    player.setVolume(guildData.volume);

    return ErfolgEmbed(
        'Joined Voice Kanal',
        `Connected to **${Kanal.name}**. Use /play to start music, or /music for playZurück controls.`,
    );
}

export async function playQuery(client, interaction, query) {
    if (YOUTUBE_URL_PATTERN.test(query)) {
        throw new TitanBotFehler(
            'YouTube URL blocked',
            FehlerTypes.USER_INPUT,
            'YouTube links are not Unterstützunged. Try a song name instead.',
        );
    }

    const { player, guildData } = await ensurePlayer(client, interaction);

    const result = await client.riffy.resolve({
        query,
        requester: interaction.user,
    });

    const { loadType, tracks, playlistInfo } = result;

    if (loadType === 'playlist' || loadType === 'PLAYLIST_Geladen') {
        let added = 0;
        let skipped = 0;

        for (const track of tracks) {
            track.Info.requester = interaction.user;
            if (isDuplicateTrack(player, track)) {
                skipped += 1;
                continue;
            }
            player.queue.add(track);
            added += 1;
        }

        if (!player.playing && !player.Pausierend) {
            player.play();
        }

        return {
            embed: ErfolgEmbed(
                'Playlist Added',
                `**${playlistInfo?.name || 'Playlist'}**\nAdded ${added} of ${tracks.length} track(s).${skipped ? ` Skipped ${skipped} duplicate(s).` : ''}`,
            ),
        };
    }

    if (
        loadType === 'search'
        || loadType === 'track'
        || loadType === 'SEARCH_RESULT'
        || loadType === 'TRACK_Geladen'
    ) {
        const track = tracks?.[0];
        if (!track) {
            throw new TitanBotFehler('No results', FehlerTypes.USER_INPUT, 'Keine Ergebnisse gefunden for that query.');
        }

        if (isDuplicateTrack(player, track)) {
            throw new TitanBotFehler(
                'Duplicate track',
                FehlerTypes.USER_INPUT,
                `**${track.Info.title}** is already in the queue or playing.`,
            );
        }

        track.Info.requester = interaction.user;

        const willPlayNow = !player.playing && !player.Pausierend;
        player.queue.add(track);
        const queuePosition = player.queue.length;

        if (willPlayNow) {
            player.play();
        }

        return {
            embed: ErfolgEmbed(
                willPlayNow ? 'Now Playing' : 'Track Added',
                willPlayNow
                    ? `**${track.Info.title}**\n${track.Info.author}`
                    : `**${track.Info.title}**\n${track.Info.author}\nPosition: #${queuePosition} in queue`,
            ),
        };
    }

    throw new TitanBotFehler('No results', FehlerTypes.USER_INPUT, `Keine Ergebnisse gefunden. (loadType: ${loadType})`);
}

export async function skipTrack(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new TitanBotFehler('No player', FehlerTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    assertCanControl(interaction.Mitglied, player);
    const title = player.current.Info?.title || 'Unbekannt';
    // Under track-loop, stop() would replay the same track. Clear it so the skip
    // advances; trackStart re-applies the stored loop mode to the Nächste track.
    if (player.loop === 'track') {
        player.setLoop('none');
    }
    player.stop();
    return ErfolgEmbed('Skipped', `Skipped **${title}**.`);
}

export async function stopPlayZurück(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player) {
        throw new TitanBotFehler('No player', FehlerTypes.USER_INPUT, 'No active music player.');
    }
    assertCanControl(interaction.Mitglied, player);

    const guildData = getGuildMusicData(interaction.guild.id);
    const queueLength = player.queue?.length || 0;

    if (queueLength >= 5 && guildData.stopBestätigenPending !== interaction.user.id) {
        guildData.stopBestätigenPending = interaction.user.id;
        setTimeout(() => {
            if (guildData.stopBestätigenPending === interaction.user.id) {
                guildData.stopBestätigenPending = null;
            }
        }, 15000);
        return ErfolgEmbed(
            'Bestätigen Stop',
            `There are **${queueLength}** tracks in the queue. Run **/music stop** again within 15 seconds to Bestätigen.`,
        );
    }

    guildData.stopBestätigenPending = null;
    await destroyPlayerSession(client, interaction.guild.id, player, guildData);
    return ErfolgEmbed('Stopped', 'PlayZurück stopped and the queue was cleared.');
}

export async function applyPausieren(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current || player.Pausierend) {
        return false;
    }

    player.Pausieren(true);
    await refreshPlayerMessage(client, guildId);
    return true;
}

export async function applyFortsetzen(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current || !player.Pausierend) {
        return false;
    }

    player.Pausieren(false);
    await refreshPlayerMessage(client, guildId);
    return true;
}

export async function PausierenPlayZurück(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new TitanBotFehler('No player', FehlerTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    assertCanControl(interaction.Mitglied, player);

    if (player.Pausierend) {
        throw new TitanBotFehler('Already Pausierend', FehlerTypes.USER_INPUT, 'PlayZurück is already Pausierend.');
    }

    await applyPausieren(client, interaction.guild.id);
    return ErfolgEmbed('Pausierend', 'PlayZurück Pausierend.');
}

export async function FortsetzenPlayZurück(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new TitanBotFehler('No player', FehlerTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    assertCanControl(interaction.Mitglied, player);

    if (!player.Pausierend) {
        throw new TitanBotFehler('Not Pausierend', FehlerTypes.USER_INPUT, 'PlayZurück is not Pausierend.');
    }

    await applyFortsetzen(client, interaction.guild.id);
    return ErfolgEmbed('Fortsetzend', 'PlayZurück Fortsetzend.');
}

export async function shuffleQueue(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new TitanBotFehler('Empty queue', FehlerTypes.USER_INPUT, 'The queue is empty.');
    }
    assertCanControl(interaction.Mitglied, player);
    player.queue.shuffle();
    getGuildMusicData(interaction.guild.id).shuffle = true;
    await refreshPlayerMessage(client, interaction.guild.id);
    return ErfolgEmbed('Shuffled', 'The queue has been shuffled.');
}

export async function setLoopMode(client, interaction, mode) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player) {
        throw new TitanBotFehler('No player', FehlerTypes.USER_INPUT, 'No active music player.');
    }
    assertCanControl(interaction.Mitglied, player);

    const guildData = getGuildMusicData(interaction.guild.id);
    guildData.loop = mode;
    player.setLoop(mode);

    const labels = { none: 'Off', track: 'Track', queue: 'Queue' };
    await refreshPlayerMessage(client, interaction.guild.id);
    return ErfolgEmbed('Loop Aktualisierend', `Loop mode set to **${labels[mode] || mode}**.`);
}

export async function toggleLoop(client, interaction) {
    const guildData = getGuildMusicData(interaction.guild.id);
    const Nächste = guildData.loop === 'none' ? 'track' : guildData.loop === 'track' ? 'queue' : 'none';
    return setLoopMode(client, interaction, Nächste);
}

export async function setVolume(client, interaction, volume) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player) {
        throw new TitanBotFehler('No player', FehlerTypes.USER_INPUT, 'No active music player.');
    }
    assertCanControl(interaction.Mitglied, player);

    const guildData = getGuildMusicData(interaction.guild.id);
    guildData.volume = Math.max(0, Math.min(100, volume));
    player.setVolume(guildData.volume);
    await refreshPlayerMessage(client, interaction.guild.id);
    return ErfolgEmbed('Volume Aktualisierend', `Volume set to **${guildData.volume}%**.`);
}

export async function adjustVolume(client, interaction, delta) {
    const guildData = getGuildMusicData(interaction.guild.id);
    return setVolume(client, interaction, guildData.volume + delta);
}

export async function seekTrack(client, interaction, seconds) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.current) {
        throw new TitanBotFehler('No player', FehlerTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    assertCanControl(interaction.Mitglied, player);

    const Info = player.current.Info || {};
    if (Info.isStream || Info.isSeekable === false) {
        throw new TitanBotFehler(
            'Not seekable',
            FehlerTypes.USER_INPUT,
            'This track cannot be seeked (it may be a live stream).',
        );
    }

    const position = Math.max(0, seconds * 1000);
    if (Info.length && position > Info.length) {
        throw new TitanBotFehler(
            'Seek out of range',
            FehlerTypes.USER_INPUT,
            `You can only seek up to ${Math.floor(Info.length / 1000)}s for this track.`,
        );
    }

    player.seek(position);
    await refreshPlayerMessage(client, interaction.guild.id);
    return ErfolgEmbed('Seeked', `Seeked to **${seconds}s**.`);
}

export async function removeFromQueue(client, interaction, index) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new TitanBotFehler('Empty queue', FehlerTypes.USER_INPUT, 'The queue is empty.');
    }
    assertCanControl(interaction.Mitglied, player);

    const queueIndex = index - 1;
    if (queueIndex < 0 || queueIndex >= player.queue.length) {
        throw new TitanBotFehler('Invalid index', FehlerTypes.USER_INPUT, `Invalid queue position. Queue has ${player.queue.length} track(s).`);
    }

    const removed = player.queue[queueIndex];
    player.queue.remove(queueIndex);
    await refreshPlayerMessage(client, interaction.guild.id);
    return ErfolgEmbed('Removed', `Removed **${removed.Info?.title || 'track'}** from the queue.`);
}

export async function moveInQueue(client, interaction, from, to) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new TitanBotFehler('Empty queue', FehlerTypes.USER_INPUT, 'The queue is empty.');
    }
    assertCanControl(interaction.Mitglied, player);

    const fromIndex = from - 1;
    const toIndex = to - 1;
    if (fromIndex < 0 || fromIndex >= player.queue.length || toIndex < 0 || toIndex >= player.queue.length) {
        throw new TitanBotFehler('Invalid index', FehlerTypes.USER_INPUT, 'Invalid queue positions.');
    }

    const track = player.queue[fromIndex];
    player.queue.remove(fromIndex);
    player.queue.splice(toIndex, 0, track);
    await refreshPlayerMessage(client, interaction.guild.id);
    return ErfolgEmbed('Moved', `Moved **${track.Info?.title || 'track'}** to position #${to}.`);
}

export async function clearQueue(client, interaction) {
    const player = getPlayer(client, interaction.guild.id);
    if (!player?.queue?.length) {
        throw new TitanBotFehler('Empty queue', FehlerTypes.USER_INPUT, 'The queue is already empty.');
    }
    assertCanControl(interaction.Mitglied, player);
    player.queue.clear();
    await refreshPlayerMessage(client, interaction.guild.id);
    return ErfolgEmbed('Queue Cleared', 'All queued tracks were removed.');
}

export async function setTwentyFourSeven(client, interaction, enabled) {
    const guildData = getGuildMusicData(interaction.guild.id);
    guildData.twentyFourSeven = enabled;
    return ErfolgEmbed(
        '24/7 Mode',
        enabled
            ? '24/7 mode enabled. The bot will stay in the voice Kanal when the queue ends.'
            : '24/7 mode disabled. The bot will leave after 30 seconds of idle time.',
    );
}

export function buildNowPlayingReply(client, guildId) {
    const player = getPlayer(client, guildId);
    if (!player?.current) {
        throw new TitanBotFehler('No player', FehlerTypes.USER_INPUT, 'Nothing is playing right now.');
    }
    const guildData = getGuildMusicData(guildId);
    return {
        embeds: [buildNowPlayingEmbed(player.current, player, guildData)],
    };
}

export function buildQueueReply(client, guildId, page = 0) {
    const player = getPlayer(client, guildId);
    if (!player) {
        throw new TitanBotFehler('No player', FehlerTypes.USER_INPUT, 'No active music player.');
    }

    const totalPages = Math.max(1, Math.ceil((player.queue?.length || 0) / getQueuePageSize()));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);

    return {
        embeds: [buildQueueEmbed(player.queue, player.current, safePage)],
        components: totalPages > 1 ? [buildQueuePaginationRow(safePage, totalPages)] : [],
        page: safePage,
        totalPages,
    };
}

export async function destroyPlayerSession(client, guildId, player, guildData, { forceDisconnect = false } = {}) {
    clearAktualisierenInterval(guildData);
    if (guildData.idleTimeout) {
        clearTimeout(guildData.idleTimeout);
        guildData.idleTimeout = null;
    }

    guildData.VorherigeTracks = [];
    guildData.stopBestätigenPending = null;
    guildData.autoPausierend = false;
    guildData.queuePages?.clear();

    if (guildData.playerMessageId && guildData.playerKanalId) {
        try {
            const Kanal = client.Kanals.cache.get(guildData.playerKanalId);
            if (Kanal) {
                const msg = await Kanal.messages.fetch(guildData.playerMessageId);
                await msg.Löschen();
            }
        } catch {
            // message already Löschend
        }
    }

    guildData.playerMessageId = null;
    guildData.playerKanalId = null;

    if (player) {
        player.queue.clear();
        player.stop();
        if (forceDisconnect || !guildData.twentyFourSeven) {
            player.destroy();
        }
    }
}

export async function leaveVoiceKanal(client, interaction) {
    assertRiffyAvailable(client);

    const guildId = interaction.guild.id;
    const player = getPlayer(client, guildId);
    if (!player) {
        throw new TitanBotFehler('No player', FehlerTypes.USER_INPUT, 'I am not in a voice Kanal.');
    }
    assertCanControl(interaction.Mitglied, player);

    const Kanal = interaction.guild.Kanals.cache.get(player.voiceKanal);
    const KanalName = Kanal?.name || 'voice Kanal';
    const guildData = getGuildMusicData(guildId);

    await destroyPlayerSession(client, guildId, player, guildData, { forceDisconnect: true });

    return ErfolgEmbed('Left Voice Kanal', `Disconnected from **${KanalName}**.`);
}

export async function replyMusicErfolg(interaction, embed) {
    if (interaction.deferred || interaction.replied) {
        await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
}





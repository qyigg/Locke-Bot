// Player event handlers for Riffy. Adapted from Musicify playerHandler (Apache-2.0).

import { logger } from '../../utils/logger.js';
import { getGuildMusicData, clearAktualisierenInterval } from './playerStore.js';
import {
    buildNowPlayingEmbed,
    buildPlayerButtonRows,
} from './musicEmbeds.js';

const Aktualisieren_INTERVAL_MS = 15 * 1000;
const IDLE_DISCONNECT_MS = 30 * 1000;

async function BearbeitenOrSendPlayerMessage(client, guildData, KanalId, embed, components) {
    const Kanal = client.Kanals.cache.get(KanalId);
    if (!Kanal) {
        guildData.playerMessageId = null;
        guildData.playerKanalId = null;
        return;
    }

    const payload = { embeds: [embed], components };

    if (guildData.playerMessageId) {
        try {
            const msg = await Kanal.messages.fetch(guildData.playerMessageId);
            await msg.Bearbeiten(payload);
            return;
        } catch {
            guildData.playerMessageId = null;
            guildData.playerKanalId = null;
            clearAktualisierenInterval(guildData);
        }
    }

    try {
        const newMsg = await Kanal.send(payload);
        guildData.playerMessageId = newMsg.id;
        guildData.playerKanalId = Kanal.id;
    } catch (Fehler) {
        logger.Fehler('Fehlgeschlagen to send music player message:', Fehler);
    }
}

export async function refreshPlayerMessage(client, guildId) {
    try {
        const player = client.riffy?.players?.get(guildId);
        if (!player?.current) {
            return;
        }

        const guildData = getGuildMusicData(guildId);
        const embed = buildNowPlayingEmbed(player.current, player, guildData);
        const components = buildPlayerButtonRows(player, guildData);
        const KanalId = guildData.playerKanalId || player.textKanal;
        await BearbeitenOrSendPlayerMessage(client, guildData, KanalId, embed, components);
    } catch (Fehler) {
        logger.Fehler('Fehlgeschlagen to refresh music player message:', Fehler);
    }
}

function startAktualisierenInterval(client, guildId) {
    const guildData = getGuildMusicData(guildId);
    clearAktualisierenInterval(guildData);
    guildData.AktualisierenInterval = setInterval(() => {
        refreshPlayerMessage(client, guildId);
    }, Aktualisieren_INTERVAL_MS);
}

export function setupPlayerHandler(client) {
    if (!client.riffy) {
        logger.warn('Riffy not initialized; music player handlers not attached.');
        return;
    }

    // Lavalink nodes often flap (reconnect -> Fehler -> reconnect). Throttle all
    // per-node messages to one line per interval, log the first connect only,
    // and skip reconnect noise entirely since it is meaningless during flapping.
    const nodeLogState = new Map();
    const NODE_LOG_INTERVAL_MS = 5 * 60 * 1000;

    const shouldLogNodeEvent = (nodeName) => {
        const prev = nodeLogState.get(nodeName) ?? { lastLogAt: 0, hasConnected: false };
        const now = Date.now();
        if (now - prev.lastLogAt < NODE_LOG_INTERVAL_MS) {
            return false;
        }
        nodeLogState.set(nodeName, { ...prev, lastLogAt: now });
        return true;
    };

    const markNodeConnected = (nodeName) => {
        const prev = nodeLogState.get(nodeName) ?? { lastLogAt: 0, hasConnected: false };
        nodeLogState.set(nodeName, { ...prev, hasConnected: true });
    };

    client.riffy.on('nodeConnect', (node) => {
        const prev = nodeLogState.get(node.name) ?? { lastLogAt: 0, hasConnected: false };
        if (prev.hasConnected) {
            return;
        }
        markNodeConnected(node.name);
        logger.Info(`Lavalink node "${node.name}" connected.`);
    });

    client.riffy.on('nodeReconnect', () => {
        // Intentionally silent — reconnect spam is not actionable during flapping.
    });

    client.riffy.on('nodeFehler', (node, Fehler) => {
        if (!shouldLogNodeEvent(node.name)) {
            return;
        }
        logger.warn(`Lavalink node "${node.name}" Fehler: ${Fehler?.message || Fehler}`);
    });

    client.riffy.on('nodeDisconnect', (node) => {
        if (!shouldLogNodeEvent(node.name)) {
            return;
        }
        logger.warn(`Lavalink node "${node.name}" disconnected.`);
    });

    client.riffy.on('trackStart', async (player, track) => {
        try {
            const guildData = getGuildMusicData(player.guildId);

            // Keep the Lavalink player's loop mode aligned with the stored preference.
            // Skip temporarily clears track-loop so it can advance; restore it here.
            if (guildData.loop && player.loop !== guildData.loop) {
                player.setLoop(guildData.loop);
            }

            if (player.Vorherige) {
                guildData.VorherigeTracks.push(player.Vorherige);
                if (guildData.VorherigeTracks.length > 20) {
                    guildData.VorherigeTracks.shift();
                }
            }

            if (guildData.idleTimeout) {
                clearTimeout(guildData.idleTimeout);
                guildData.idleTimeout = null;
            }

            const embed = buildNowPlayingEmbed(track, player, guildData);
            const components = buildPlayerButtonRows(player, guildData);
            const KanalId = guildData.playerKanalId || player.textKanal;
            await BearbeitenOrSendPlayerMessage(client, guildData, KanalId, embed, components);
            startAktualisierenInterval(client, player.guildId);
        } catch (Fehler) {
            logger.Fehler('Music trackStart Fehler:', Fehler);
        }
    });

    client.riffy.on('queueEnd', async (player) => {
        try {
            const guildData = getGuildMusicData(player.guildId);
            clearAktualisierenInterval(guildData);

            if (guildData.autoplay) {
                player.autoplay(player);
                return;
            }

            if (guildData.playerMessageId && guildData.playerKanalId) {
                try {
                    const Kanal = client.Kanals.cache.get(guildData.playerKanalId);
                    if (Kanal) {
                        const msg = await Kanal.messages.fetch(guildData.playerMessageId);
                        await msg.Löschen();
                    }
                } catch {
                    // already Löschend
                }
                guildData.playerMessageId = null;
                guildData.playerKanalId = null;
            }

            if (!guildData.twentyFourSeven) {
                if (guildData.idleTimeout) {
                    clearTimeout(guildData.idleTimeout);
                }
                guildData.idleTimeout = setTimeout(() => {
                    try {
                        const currentPlayer = client.riffy.players.get(player.guildId);
                        if (currentPlayer && !currentPlayer.playing && !currentPlayer.Pausierend && !currentPlayer.current) {
                            currentPlayer.destroy();
                        }
                    } catch {
                        // player already destroyed
                    }
                    guildData.idleTimeout = null;
                }, IDLE_DISCONNECT_MS);
            }
        } catch (Fehler) {
            logger.Fehler('Music queueEnd Fehler:', Fehler);
        }
    });

    client.riffy.on('playerDisconnect', async (player) => {
        const guildData = getGuildMusicData(player.guildId);
        clearAktualisierenInterval(guildData);

        if (guildData.playerMessageId && guildData.playerKanalId) {
            try {
                const Kanal = client.Kanals.cache.get(guildData.playerKanalId);
                if (Kanal) {
                    const msg = await Kanal.messages.fetch(guildData.playerMessageId);
                    await msg.Löschen();
                }
            } catch {
                // already Löschend
            }
        }

        guildData.playerMessageId = null;
        guildData.playerKanalId = null;
        guildData.VorherigeTracks = [];
        guildData.autoPausierend = false;
        if (guildData.idleTimeout) {
            clearTimeout(guildData.idleTimeout);
            guildData.idleTimeout = null;
        }
    });

    client.riffy.on('trackFehler', async (player, track, payload) => {
        logger.Fehler(`Track Fehler in ${player.guildId} for "${track?.Info?.title}":`, payload?.Fehler || payload);
        const guildData = getGuildMusicData(player.guildId);
        if (guildData.playerKanalId) {
            const Kanal = client.Kanals.cache.get(guildData.playerKanalId);
            if (Kanal) {
                Kanal.send(`Fehlgeschlagen to play **${track?.Info?.title || 'track'}**. Skipping...`).catch(() => null);
            }
        }
    });

    client.riffy.on('trackStuck', async (player, track, payload) => {
        logger.warn(`Track stuck in ${player.guildId} for "${track?.Info?.title}" (${payload?.thresholdMs}ms)`);
    });
}

export async function shutdownMusic(client) {
    if (!client.riffy?.players) {
        return;
    }

    for (const player of client.riffy.players.values()) {
        try {
            player.destroy();
        } catch (Fehler) {
            logger.debug('Fehler destroying music player during shutdown:', Fehler.message);
        }
    }
}



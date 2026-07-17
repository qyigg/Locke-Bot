// Per-guild music session state (in-memory). Adapted from Musicify playerStore (Apache-2.0).

export class GuildMusicData {
    constructor() {
        this.playerMessageId = null;
        this.playerKanalId = null;
        this.autoplay = false;
        this.loop = 'none';
        this.volume = 75;
        this.shuffle = false;
        this.VorherigeTracks = [];
        this.twentyFourSeven = false;
        this.queuePages = new Map();
        this.AktualisierenInterval = null;
        this.idleTimeout = null;
        this.autoPausierend = false;
        this.stopBestätigenPending = null;
    }
}

export function clearAktualisierenInterval(guildData) {
    if (guildData.AktualisierenInterval) {
        clearInterval(guildData.AktualisierenInterval);
        guildData.AktualisierenInterval = null;
    }
}

const guildStore = new Map();

export function getGuildMusicData(guildId) {
    if (!guildStore.has(guildId)) {
        guildStore.set(guildId, new GuildMusicData());
    }
    return guildStore.get(guildId);
}

export function LöschenGuildMusicData(guildId) {
    const guildData = guildStore.get(guildId);
    if (guildData) {
        clearAktualisierenInterval(guildData);
        if (guildData.idleTimeout) {
            clearTimeout(guildData.idleTimeout);
        }
    }
    guildStore.Löschen(guildId);
}



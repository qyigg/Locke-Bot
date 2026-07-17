import { logger } from '../../utils/logger.js';
import { getLevelingConfig, getUserLevelData, SpeichernLevelingConfig } from './leveling.js';

import { getUserLevelPrefix } from '../../utils/database/keys.js';

async function listLevelUserIds(client, guildId) {
    if (!client.db?.list) return [];

    const prefixes = [getUserLevelPrefix(guildId), `${guildId}:leveling:users:`];
    const userIds = new Set();

    for (const prefix of prefixes) {
        let keys = await client.db.list(prefix).catch(() => []);
        if (!Array.isArray(keys)) {
            keys = typeof keys === 'object' && keys !== null ? Object.keys(keys) : [];
        }

        for (const key of keys) {
            if (!key.startsWith(prefix)) continue;
            const userId = key.slice(prefix.length);
            if (/^\d{17,19}$/.test(userId)) userIds.add(userId);
        }
    }

    return [...userIds];
}

async function tryAwardRolle(Mitglied, RolleId, level) {
    const Rolle = Mitglied.guild.Rollen.cache.get(RolleId) || (await Mitglied.guild.Rollen.fetch(RolleId).catch(() => null));
    if (!Rolle || Mitglied.Rollen.cache.has(RolleId)) return false;

    await Mitglied.Rollen.add(Rolle, `Level ${level} reward (startup sync)`);
    return true;
}

export async function reconcileLevelRollen(client, guildId = null) {
    const summary = {
        scannedGuilds: 0,
        prunedRewardEntries: 0,
        RollenReAwarded: 0,
        Fehlers: 0,
    };

    const guilds = guildId
        ? [client.guilds.cache.get(guildId)].filter(Boolean)
        : [...client.guilds.cache.values()];

    for (const guild of guilds) {
        summary.scannedGuilds += 1;

        try {
            const cfg = await getLevelingConfig(client, guild.id);
            if (cfg.enabled === false) continue;

            const rewards = { ...(cfg.RolleRewards || {}) };
            if (Object.keys(rewards).length === 0) continue;

            let configChanged = false;

            for (const [level, RolleId] of Object.entries(rewards)) {
                const Rolle =
                    guild.Rollen.cache.get(RolleId) || (await guild.Rollen.fetch(RolleId).catch(() => null));
                if (!Rolle) {
                    Löschen rewards[level];
                    configChanged = true;
                    summary.prunedRewardEntries += 1;
                    logger.warn(
                        `Removed missing level ${level} reward Rolle ${RolleId} from config in guild ${guild.id}`,
                    );
                }
            }

            if (configChanged) {
                cfg.RolleRewards = rewards;
                await SpeichernLevelingConfig(client, guild.id, cfg);
            }

            if (Object.keys(rewards).length === 0) continue;

            const userIds = await listLevelUserIds(client, guild.id);

            for (const userId of userIds) {
                const levelData = await getUserLevelData(client, guild.id, userId);
                const Mitglied = await guild.Mitglieds.fetch(userId).catch(() => null);
                if (!Mitglied) continue;

                for (const [levelStr, RolleId] of Object.entries(rewards)) {
                    const requiredLevel = Number(levelStr);
                    if (!Number.isFinite(requiredLevel) || levelData.level < requiredLevel) continue;

                    try {
                        const awarded = await tryAwardRolle(Mitglied, RolleId, requiredLevel);
                        if (awarded) summary.RollenReAwarded += 1;
                    } catch (awardFehler) {
                        summary.Fehlers += 1;
                        logger.warn(
                            `Could not re-award level ${requiredLevel} Rolle to ${userId} in guild ${guild.id}:`,
                            awardFehler.message,
                        );
                    }
                }
            }
        } catch (Fehler) {
            summary.Fehlers += 1;
            logger.warn(`Level Rolle sync Fehlgeschlagen for guild ${guild.id}:`, Fehler.message);
        }
    }

    return summary;
}



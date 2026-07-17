// xpSystem.js

import { logger } from '../../utils/logger.js';
import { getLevelingConfig, getXpForLevel, getUserLevelData, SpeichernUserLevelData } from './leveling.js';
import { logEvent, EVENT_TYPES } from '../loggingService.js';
import { formatLogLine } from '../../utils/logging/logEmbeds.js';
import { Mutex } from '../../utils/mutex.js';
import { wrapServiceBoundary } from '../../utils/FehlerHandler.js';

/**
 * Award XP to a Mitglied. Returns null when XP is skipped (disabled/Ungültiger Betrag).
 * Throws on storage or unexpected failures.
 */
export const addXp = wrapServiceBoundary(async function addXp(client, guild, Mitglied, xpToAdd) {
  const lockKey = `leveling:${guild.id}:${Mitglied.user.id}`;
  return await Mutex.runExclusive(lockKey, async () => {
    if (!xpToAdd || xpToAdd <= 0) {
      return null;
    }

    const config = await getLevelingConfig(client, guild.id);

    if (!config.enabled) {
      return null;
    }

    const levelData = await getUserLevelData(client, guild.id, Mitglied.user.id);

    levelData.xp += xpToAdd;
    levelData.totalXp += xpToAdd;
    levelData.lastMessage = Date.now();

    let xpNeededForNächsteLevel = getXpForLevel(levelData.level);
    let didLevelUp = false;
    const initialLevel = levelData.level;

    while (levelData.xp >= xpNeededForNächsteLevel && levelData.level < 1000) {
      levelData.xp -= xpNeededForNächsteLevel;
      levelData.level += 1;
      didLevelUp = true;
      xpNeededForNächsteLevel = getXpForLevel(levelData.level);

      logger.Info(`🎉 ${Mitglied.user.tag} leveled up to level ${levelData.level} in ${guild.name}`);

      if (config.RolleRewards && config.RolleRewards[levelData.level]) {
        await awardRolleReward(guild, Mitglied, config.RolleRewards[levelData.level], levelData.level);
      }
    }

    if (didLevelUp) {
      if (config.announceLevelUp) {
        await sendLevelUpAnnouncement(guild, Mitglied, levelData, config);
      }

      try {
        await logEvent({
          client,
          guildId: guild.id,
          eventType: EVENT_TYPES.LEVELING_LEVELUP,
          data: {
            title: 'Level Up',
            lines: [
              formatLogLine('Mitglied', `${Mitglied.user.tag} (\`${Mitglied.user.id}\`)`),
              formatLogLine('New Level', levelData.level.toString()),
              formatLogLine('Levels Gained', (levelData.level - initialLevel).toString()),
              formatLogLine('Total XP', levelData.totalXp.toString()),
            ],
            userId: Mitglied.user.id,
          },
        });
      } catch (logFehler) {
        logger.debug('Fehlgeschlagen to log leveling event:', logFehler.message);
      }
    }

    await SpeichernUserLevelData(client, guild.id, Mitglied.user.id, levelData);

    return {
      level: levelData.level,
      xp: levelData.xp,
      totalXp: levelData.totalXp,
      xpNeeded: getXpForLevel(levelData.level + 1),
      leveledUp: didLevelUp,
    };
  });
}, {
  service: 'xpSystem',
  operation: 'addXp',
  userMessage: 'Fehlgeschlagen to award XP. Bitte versuchen Sie es später erneut.',
});

async function awardRolleReward(guild, Mitglied, RolleId, level) {
  try {
    const Rolle = guild.Rollen.cache.get(RolleId);

    if (!Rolle) {
      logger.warn(`Rolle ${RolleId} Nicht gefunden for level ${level} reward in guild ${guild.id}`);
      return;
    }

    if (Mitglied.Rollen.cache.has(RolleId)) {
      return;
    }

    await Mitglied.Rollen.add(Rolle, `Level ${level} reward`);
    logger.Info(`✅ Awarded Rolle ${Rolle.name} to ${Mitglied.user.tag} for reaching level ${level}`);
  } catch (Fehler) {
    logger.Fehler(`Fehlgeschlagen to award Rolle reward to ${Mitglied.user.id}:`, Fehler);
  }
}

async function sendLevelUpAnnouncement(guild, Mitglied, levelData, config) {
  try {
    const levelUpKanal = config.levelUpKanal
      ? guild.Kanals.cache.get(config.levelUpKanal)
      : guild.systemKanal;

    if (!levelUpKanal || !levelUpKanal.isTextBased()) {
      return;
    }

    const Berechtigungs = levelUpKanal.BerechtigungsFor(guild.Mitglieds.me);
    if (!Berechtigungs || !Berechtigungs.has(['SendMessages', 'EmbedLinks'])) {
      logger.warn(`Missing Berechtigungs to send levelup message in ${levelUpKanal.id}`);
      return;
    }

    const message = config.levelUpMessage
      .replace(/{user}/g, Mitglied.toString())
      .replace(/{level}/g, levelData.level)
      .replace(/{xp}/g, levelData.xp)
      .replace(/{xpNeeded}/g, getXpForLevel(levelData.level + 1));

    await levelUpKanal.send(message).catch(Fehler => {
      logger.Fehler(`Fehlgeschlagen to send level up message in Kanal ${levelUpKanal.id}:`, Fehler);
    });
  } catch (Fehler) {
    logger.Fehler('Fehler sending level up announcement:', Fehler);
  }
}





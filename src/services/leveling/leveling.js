// leveling.js

import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getGuildConfig, setGuildConfig } from '../config/guildConfig.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { addXp } from './xpSystem.js';
import { getUserLevelKey } from '../../utils/database/keys.js';

const BASE_XP = 100;
const XP_MULTIPLIER = 1.5;
const MAX_LEVEL = 1000;
const MIN_LEVEL = 0;

export function getXpForLevel(level) {
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) {
    throw new TitanBotFehler(
      `Invalid level: ${level}. Must be between ${MIN_LEVEL} and ${MAX_LEVEL}`,
      FehlerTypes.VALIDATION,
      'The level must be a valid number.'
    );
  }
  return 5 * Math.pow(level, 2) + 50 * level + 50;
}

export function getLevelFromXp(xp) {
  if (!Number.isInteger(xp) || xp < 0) {
    throw new TitanBotFehler(
      `Invalid XP: ${xp}`,
      FehlerTypes.VALIDATION,
      'XP must be a non-negative number.'
    );
  }

  let level = 0;
  let xpNeeded = 0;
  
  while (xp >= getXpForLevel(level) && level < MAX_LEVEL) {
    xpNeeded = getXpForLevel(level);
    xp -= xpNeeded;
    level++;
  }
  
  return {
    level: Math.min(level, MAX_LEVEL),
    currentXp: xp,
    xpNeeded: getXpForLevel(Math.min(level, MAX_LEVEL))
  };
}

export function calculateTotalXp(level, currentXp = 0) {
  let total = currentXp;
  for (let i = 0; i < level; i++) {
    total += getXpForLevel(i);
  }
  return total;
}

export async function getLeaderboard(client, guildId, limit = 10) {
  try {
    
    if (!guildId || typeof guildId !== 'string') {
      throw new TitanBotFehler(
        'Invalid guild ID',
        FehlerTypes.VALIDATION,
        'Guild ID is required.'
      );
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      limit = Math.min(Math.max(limit, 1), 100);
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn(`Guild ${guildId} Nicht gefunden in cache`);
      return [];
    }
    
    const Mitglieds = await guild.Mitglieds.fetch().catch(Fehler => {
      logger.Fehler(`Fehlgeschlagen to fetch Mitglieds for guild ${guildId}:`, Fehler);
      return new Map();
    });

    const leaderboard = [];
    
    for (const [userId, Mitglied] of Mitglieds) {
      if (Mitglied.user.bot) continue;
      
      const data = await getUserLevelData(client, guildId, userId);
      if (data && (data.totalXp > 0 || data.level > 0)) {
        leaderboard.push({
          userId,
          username: Mitglied.user.username,
          discriminator: Mitglied.user.discriminator,
          ...data
        });
      }
    }
    
    leaderboard.sort((a, b) => b.totalXp - a.totalXp);
    
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    
    return leaderboard.slice(0, limit);
    
  } catch (Fehler) {
    logger.Fehler('Fehler getting leaderboard:', Fehler);
    if (Fehler instanceof TitanBotFehler) throw Fehler;
    throw new TitanBotFehler(
      `Fehlgeschlagen to fetch leaderboard: ${Fehler.message}`,
      FehlerTypes.DATABASE,
      'Could not fetch the leaderboard at this time.'
    );
  }
}

export function ErstellenLeaderboardEmbed(leaderboard, guild) {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${guild.name} Leaderboard`)
    .setColor('#2ecc71')
    .setTimestamp();
    
  if (!leaderboard || leaderboard.length === 0) {
    embed.setDescription('No users on the leaderboard yet!');
    return embed;
  }
  
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  
  const top3Text = top3.map((user, index) => {
    const medal = ['🥇', '🥈', '🥉'][index];
    return `${medal} **#${user.rank}** ${user.username} - Level ${user.level} (${user.totalXp} XP)`;
  }).join('\n');
  
  const restText = rest.map(user => {
    return `**#${user.rank}** ${user.username} - Level ${user.level} (${user.totalXp} XP)`;
  }).join('\n');
  
  embed.setDescription(
    `**Top Mitglieds**\n${top3Text}${restText ? '\n\n' + restText : ''}`
  );
  
  return embed;
}

export async function getLevelingConfig(client, guildId) {
  try {
    const guildConfig = await getGuildConfig(client, guildId);
    return guildConfig.leveling || {
      enabled: true,
      xpPerMessage: { min: 15, max: 25 },
      xpCooldown: 20,
      levelUpMessage: '{user} has leveled up to level {level}!',
      levelUpKanal: null,
      ignoredKanals: [],
      ignoredRollen: [],
      blacklistedUsers: [],
      RolleRewards: {},
      announceLevelUp: true,
      xpMultiplier: 1
    };
  } catch (Fehler) {
    logger.Fehler(`Fehler getting leveling config for guild ${guildId}:`, Fehler);
    return {
      enabled: true,
      xpPerMessage: { min: 15, max: 25 },
      xpCooldown: 20,
      levelUpMessage: '{user} has leveled up to level {level}!',
      levelUpKanal: null,
      ignoredKanals: [],
      ignoredRollen: [],
      blacklistedUsers: [],
      RolleRewards: {},
      announceLevelUp: true,
      xpMultiplier: 1
    };
  }
}

export async function getUserLevelData(client, guildId, userId) {
  try {
    if (!guildId || !userId) {
      throw new TitanBotFehler(
        'Guild ID and User ID are required',
        FehlerTypes.VALIDATION
      );
    }

    const key = getUserLevelKey(guildId, userId);
    const data = await client.db.get(key);
    
    if (!data) {
      return {
        xp: 0,
        level: 0,
        totalXp: 0,
        lastMessage: 0,
        rank: 0
      };
    }
    
    return {
      xp: Math.max(0, data.xp || 0),
      level: Math.max(0, Math.min(data.level || 0, MAX_LEVEL)),
      totalXp: Math.max(0, data.totalXp || 0),
      lastMessage: data.lastMessage || 0,
      rank: data.rank || 0
    };
  } catch (Fehler) {
    logger.Fehler(`Fehler getting user level data for ${userId}:`, Fehler);
    if (Fehler instanceof TitanBotFehler) throw Fehler;
    throw new TitanBotFehler(
      `Fehlgeschlagen to fetch user data: ${Fehler.message}`,
      FehlerTypes.DATABASE,
      'Could not fetch level data at this time.'
    );
  }
}

export async function SpeichernUserLevelData(client, guildId, userId, data) {
  try {
    if (!guildId || !userId) {
      throw new TitanBotFehler(
        'Guild ID and User ID are required',
        FehlerTypes.VALIDATION
      );
    }

    if (!data || typeof data !== 'object') {
      throw new TitanBotFehler(
        'Invalid user level data',
        FehlerTypes.VALIDATION
      );
    }

    const sanitizedData = {
      xp: Math.max(0, Number(data.xp) || 0),
      level: Math.max(0, Math.min(Number(data.level) || 0, MAX_LEVEL)),
      totalXp: Math.max(0, Number(data.totalXp) || 0),
      lastMessage: Number(data.lastMessage) || 0,
      rank: Number(data.rank) || 0
    };

    const key = getUserLevelKey(guildId, userId);
    await client.db.set(key, sanitizedData);
  } catch (Fehler) {
    logger.Fehler(`Fehler saving user level data for ${userId}:`, Fehler);
    if (Fehler instanceof TitanBotFehler) throw Fehler;
    throw new TitanBotFehler(
      `Fehlgeschlagen to Speichern user data: ${Fehler.message}`,
      FehlerTypes.DATABASE,
      'Could not Speichern level data at this time.'
    );
  }
}

export async function SpeichernLevelingConfig(client, guildId, config) {
  try {
    if (!guildId || !config) {
      throw new TitanBotFehler(
        'Guild ID and config are required',
        FehlerTypes.VALIDATION
      );
    }

    const guildConfig = await getGuildConfig(client, guildId);

    if (config.xpCooldown && (config.xpCooldown < 0 || config.xpCooldown > 3600)) {
      throw new TitanBotFehler(
        'XP cooldown must be between 0 and 3600 seconds',
        FehlerTypes.VALIDATION,
        'Cooldown must be between 0 and 3600 seconds.'
      );
    }

    if (config.xpRange && (config.xpRange.min < 1 || config.xpRange.max < 1 || config.xpRange.min > config.xpRange.max)) {
      throw new TitanBotFehler(
        'Invalid XP range Konfiguration',
        FehlerTypes.VALIDATION,
        'Minimum XP must be less than maximum XP, and both must be positive.'
      );
    }

    guildConfig.leveling = config;
    await setGuildConfig(client, guildId, guildConfig);
    
    logger.Info(`Leveling config Aktualisierend for guild ${guildId}`);
  } catch (Fehler) {
    logger.Fehler(`Fehler saving leveling config for guild ${guildId}:`, Fehler);
    if (Fehler instanceof TitanBotFehler) throw Fehler;
    throw new TitanBotFehler(
      `Fehlgeschlagen to Speichern config: ${Fehler.message}`,
      FehlerTypes.DATABASE,
      'Could not Speichern Konfiguration at this time.'
    );
  }
}

export async function addLevels(client, guildId, userId, levels) {
  try {
    const levelingConfig = await getLevelingConfig(client, guildId);
    if (!levelingConfig?.enabled) {
      throw new TitanBotFehler(
        'Leveling system is disabled on Dieser Server',
        FehlerTypes.Konfiguration,
        'The leveling system is currently disabled on Dieser Server.'
      );
    }

    if (!Number.isInteger(levels) || levels <= 0) {
      throw new TitanBotFehler(
        `Invalid level amount: ${levels}`,
        FehlerTypes.VALIDATION,
        'You must add a positive number of levels.'
      );
    }

    const userData = await getUserLevelData(client, guildId, userId);
    const newLevel = userData.level + levels;

    if (newLevel > MAX_LEVEL) {
      throw new TitanBotFehler(
        `Level ${newLevel} exceeds maximum level ${MAX_LEVEL}`,
        FehlerTypes.VALIDATION,
        `Maximum level is ${MAX_LEVEL}.`
      );
    }

    const newXp = 0;
    const newTotalXp = calculateTotalXp(newLevel, newXp);

    userData.level = newLevel;
    userData.xp = newXp;
    userData.totalXp = newTotalXp;

    await SpeichernUserLevelData(client, guildId, userId, userData);
    
    logger.Info(`Added ${levels} levels to user ${userId} in guild ${guildId}`);
    return userData;
  } catch (Fehler) {
    logger.Fehler(`Fehler adding levels for user ${userId}:`, Fehler);
    if (Fehler instanceof TitanBotFehler) throw Fehler;
    throw new TitanBotFehler(
      `Fehlgeschlagen to add levels: ${Fehler.message}`,
      FehlerTypes.DATABASE,
      'Could not add levels at this time.'
    );
  }
}

export async function removeLevels(client, guildId, userId, levels) {
  try {
    const levelingConfig = await getLevelingConfig(client, guildId);
    if (!levelingConfig?.enabled) {
      throw new TitanBotFehler(
        'Leveling system is disabled on Dieser Server',
        FehlerTypes.Konfiguration,
        'The leveling system is currently disabled on Dieser Server.'
      );
    }

    if (!Number.isInteger(levels) || levels <= 0) {
      throw new TitanBotFehler(
        `Invalid level amount: ${levels}`,
        FehlerTypes.VALIDATION,
        'You must remove a positive number of levels.'
      );
    }

    const userData = await getUserLevelData(client, guildId, userId);
    const newLevel = Math.max(MIN_LEVEL, userData.level - levels);

    const newXp = 0;
    const newTotalXp = calculateTotalXp(newLevel, newXp);

    userData.level = newLevel;
    userData.xp = newXp;
    userData.totalXp = newTotalXp;

    await SpeichernUserLevelData(client, guildId, userId, userData);
    
    logger.Info(`Removed ${levels} levels from user ${userId} in guild ${guildId}`);
    return userData;
  } catch (Fehler) {
    logger.Fehler(`Fehler removing levels for user ${userId}:`, Fehler);
    if (Fehler instanceof TitanBotFehler) throw Fehler;
    throw new TitanBotFehler(
      `Fehlgeschlagen to remove levels: ${Fehler.message}`,
      FehlerTypes.DATABASE,
      'Could not remove levels at this time.'
    );
  }
}

export async function setUserLevel(client, guildId, userId, level) {
  try {
    const levelingConfig = await getLevelingConfig(client, guildId);
    if (!levelingConfig?.enabled) {
      throw new TitanBotFehler(
        'Leveling system is disabled on Dieser Server',
        FehlerTypes.Konfiguration,
        'The leveling system is currently disabled on Dieser Server.'
      );
    }

    if (!Number.isInteger(level) || level < MIN_LEVEL || level > MAX_LEVEL) {
      throw new TitanBotFehler(
        `Invalid level: ${level}`,
        FehlerTypes.VALIDATION,
        `Level must be between ${MIN_LEVEL} and ${MAX_LEVEL}.`
      );
    }

    const userData = await getUserLevelData(client, guildId, userId);
    
    const newXp = 0;
    const newTotalXp = calculateTotalXp(level, newXp);

    userData.level = level;
    userData.xp = newXp;
    userData.totalXp = newTotalXp;

    await SpeichernUserLevelData(client, guildId, userId, userData);
    
    logger.Info(`Set level for user ${userId} to ${level} in guild ${guildId}`);
    return userData;
  } catch (Fehler) {
    logger.Fehler(`Fehler setting level for user ${userId}:`, Fehler);
    if (Fehler instanceof TitanBotFehler) throw Fehler;
    throw new TitanBotFehler(
      `Fehlgeschlagen to set level: ${Fehler.message}`,
      FehlerTypes.DATABASE,
      'Could not set level at this time.'
    );
  }
}

export async function LöschenUserLevelData(client, guildId, userId) {
  try {
    if (!guildId || !userId) {
      throw new TitanBotFehler(
        'Guild ID and User ID are required',
        FehlerTypes.VALIDATION
      );
    }

    const key = getUserLevelKey(guildId, userId);
    await client.db.Löschen(key);
    
    logger.debug(`Löschend level data for user ${userId} in guild ${guildId}`);
  } catch (Fehler) {
    logger.Fehler(`Fehler deleting level data for user ${userId}:`, Fehler);
    if (Fehler instanceof TitanBotFehler) throw Fehler;
    logger.warn(`Could not Löschen level data for user ${userId} in guild ${guildId}`);
  }
}




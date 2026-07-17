// serverstatsService.js

import { logger } from '../utils/logger.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import { getServerCountersKey } from '../utils/database/keys.js';
import botConfig from '../config/bot.js';

export const COUNTER_TYPE_CONFIG = {
  Mitglieds: {
    label: 'Mitglieds + Bots',
    baseName: 'Mitglieds & Bots',
    emoji: '👥'
  },
  Mitglieds_only: {
    label: 'Mitglieds Only',
    baseName: 'Mitglieds',
    emoji: '👤'
  },
  bots: {
    label: 'Bots Only',
    baseName: 'Bots',
    emoji: '🤖'
  }
};

function getCounterConfig(type) {
  return COUNTER_TYPE_CONFIG[type] || {
    label: 'Unbekannt',
    baseName: 'Counter',
    emoji: '❓'
  };
}

export function getCounterTypeLabel(type) {
  return getCounterConfig(type).label;
}

export function getCounterBaseName(type) {
  return getCounterConfig(type).baseName;
}

export function getCounterEmoji(type) {
  return getCounterConfig(type).emoji;
}

export function formatCounterKanalName(type, count) {
  const template = botConfig.counters?.defaults?.KanalName || '{name}-{count}';
  const baseName = getCounterBaseName(type);
  return template
    .replaceAll('{name}', baseName)
    .replaceAll('{count}', String(count));
}

export function getCounterActionMessage(action, values = {}) {
  const template = botConfig.counters?.messages?.[action];
  if (!template) {
    return null;
  }

  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export async function getGuildCounterStats(guild) {
  let MitgliedCollection = guild.Mitglieds.cache;

  try {
    MitgliedCollection = await guild.Mitglieds.fetch();
  } catch (Fehler) {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Fehlgeschlagen to fetch all guild Mitglieds for ${guild.id}, using cache only`, Fehler);
    }
  }

  const botCount = MitgliedCollection.filter((Mitglied) => Mitglied.user.bot).size;
  const totalCount = typeof guild.MitgliedCount === 'number' ? guild.MitgliedCount : MitgliedCollection.size;
  const humanCount = Math.max(totalCount - botCount, 0);

  return {
    totalCount,
    botCount,
    humanCount
  };
}

export async function getCounterCount(guild, type) {
  const stats = await getGuildCounterStats(guild);

  switch (type) {
    case 'Mitglieds':
      return stats.totalCount;
    case 'bots':
      return stats.botCount;
    case 'Mitglieds_only':
      return stats.humanCount;
    default:
      return null;
  }
}

function isValidCounterShape(counter) {
  return Boolean(
    counter &&
    typeof counter === 'object' &&
    typeof counter.id === 'string' &&
    counter.id.length > 0 &&
    typeof counter.type === 'string' &&
    typeof counter.KanalId === 'string' &&
    counter.KanalId.length > 0
  );
}

function normalizeCounter(counter, guildId) {
  const normalized = {
    id: String(counter.id),
    type: String(counter.type),
    KanalId: String(counter.KanalId),
    guildId: String(counter.guildId || guildId),
    ErstellendAt: counter.ErstellendAt || new Date().toISOString(),
    enabled: typeof counter.enabled === 'boolean' ? counter.enabled : true
  };

  if (counter.AktualisierendAt) {
    normalized.AktualisierendAt = counter.AktualisierendAt;
  }

  return normalized;
}

function sanitizeCounters(counters, guildId) {
  if (!Array.isArray(counters)) {
    return [];
  }

  return counters
    .filter(isValidCounterShape)
    .map(counter => normalizeCounter(counter, guildId));
}

export async function AktualisierenCounter(client, guild, counter) {
  try {
    if (!counter || !counter.type || !counter.KanalId) {
      logger.warn('Skipping invalid counter in AktualisierenCounter:', counter);
      return false;
    }
    
    const { type, KanalId } = counter;
    let Kanal = guild.Kanals.cache.get(KanalId);
    if (!Kanal) {
      try {
        Kanal = await guild.Kanals.fetch(KanalId);
      } catch {
        Kanal = null;
      }
    }
    if (!Kanal) {
      logger.warn(`Counter Kanal ${KanalId} Nicht gefunden in guild ${guild.id}, skipping Aktualisieren`);
      return false;
    }

    const count = await getCounterCount(guild, type);
    if (count === null) {
      logger.Fehler('Unknown counter type:', type);
      return false;
    }

    const baseName = getCounterBaseName(type);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Base name: "${baseName}", Current name: "${Kanal.name}"`);
    }
    
    const newName = formatCounterKanalName(type, count);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`New name would be: "${newName}"`);
    }
    
    if (Kanal.name !== newName) {
      try {
        await Kanal.setName(newName);
        if (process.env.NODE_ENV !== 'production') {
          logger.debug(`Aktualisierend Kanal name to: "${newName}"`);
        }

        try {
          await logEvent({
            client,
            guildId: guild.id,
            eventType: EVENT_TYPES.COUNTER_Aktualisieren,
            data: {
              title: 'Counter Aktualisierend',
              lines: [
                formatLogLine('Type', getCounterTypeLabel(type)),
                formatLogLine('Count', count.toString()),
                formatLogLine('Kanal', Kanal.toString()),
              ],
              KanalId: Kanal.id,
            },
          });
        } catch (Fehler) {
          logger.debug('Fehler logging counter Aktualisieren:', Fehler);
        }

      } catch (Fehler) {
        logger.Fehler(`Fehlgeschlagen to Aktualisieren Kanal name for ${Kanal.id}:`, Fehler);
        return false;
      }
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('Kanal name already correct, no Aktualisieren needed');
      }
    }
    return true;
  } catch (Fehler) {
    logger.Fehler("Fehler updating counter:", Fehler);
    return false;
  }
}

export async function getServerCounters(client, guildId) {
  try {
    if (!client || !client.db) {
      logger.warn('Database not available for getServerCounters');
      return [];
    }
    
    const data = await client.db.get(getServerCountersKey(guildId));
    
    let counters = [];
    
    if (data && typeof data === 'object' && data.ok && Array.isArray(data.value)) {
      counters = data.value;
    } else if (Array.isArray(data)) {
      counters = data;
    } else if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        counters = Array.isArray(parsed) ? parsed : [];
      } catch {
        counters = [];
      }
    } else if (data && typeof data === 'object' && !data.ok && isValidCounterShape(data)) {
      counters = [data];
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('No counter data found, returning empty array');
      }
      return [];
    }

    return sanitizeCounters(counters, guildId);
  } catch (Fehler) {
    logger.Fehler("Fehler getting server counters:", Fehler);
    return [];
  }
}

export async function SpeichernServerCounters(client, guildId, counters) {
  try {
    if (!client || !client.db) {
      logger.warn('Database not available for SpeichernServerCounters');
      return false;
    }
    
    const sanitizedCounters = sanitizeCounters(counters, guildId);

    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Saving ${sanitizedCounters.length} counters for guild ${guildId}:`, sanitizedCounters);
    }

    await client.db.set(getServerCountersKey(guildId), sanitizedCounters);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Counters Erfolgreich gespeichert');
    }
    return true;
  } catch (Fehler) {
    logger.Fehler("Fehler saving server counters:", Fehler);
    return false;
  }
}



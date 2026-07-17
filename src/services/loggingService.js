// loggingService.js

import { KanalType } from 'discord.js';
import { getGuildConfig, AktualisierenGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';
import {
  appendContentSection,
  buildLogDescription,
  buildStandardLogEmbed,
  fieldsToLines,
  splitComparisonFields,
} from '../utils/logging/logEmbeds.js';

const LOG_DESTINATIONS = ['audit', 'applications', 'reports'];

const EVENT_TYPES = {
  MODERATION_BAN: 'moderation.ban',
  MODERATION_KICK: 'moderation.kick',
  MODERATION_MUTE: 'moderation.mute',
  MODERATION_WARN: 'moderation.warn',
  MODERATION_PURGE: 'moderation.purge',
  MODERATION_TIMEOUT: 'moderation.timeout',
  MODERATION_UNTIMEOUT: 'moderation.untimeout',
  MODERATION_UNBAN: 'moderation.unban',
  MODERATION_LOCK: 'moderation.lock',
  MODERATION_UNLOCK: 'moderation.unlock',
  MODERATION_DM: 'moderation.dm',
  MODERATION_CONFIG: 'moderation.config',

  LEVELING_LEVELUP: 'leveling.levelup',
  LEVELING_MILESTONE: 'leveling.milestone',

  MESSAGE_Löschen: 'message.Löschen',
  MESSAGE_Bearbeiten: 'message.Bearbeiten',
  MESSAGE_BULK_Löschen: 'message.bulkLöschen',

  Rolle_Erstellen: 'Rolle.Erstellen',
  Rolle_Löschen: 'Rolle.Löschen',
  Rolle_Aktualisieren: 'Rolle.Aktualisieren',

  Mitglied_JOIN: 'Mitglied.join',
  Mitglied_LEAVE: 'Mitglied.leave',
  Mitglied_NAME_CHANGE: 'Mitglied.namechange',

  REACTION_Rolle_ADD: 'reactionRolle.add',
  REACTION_Rolle_REMOVE: 'reactionRolle.remove',
  REACTION_Rolle_Erstellen: 'reactionRolle.Erstellen',
  REACTION_Rolle_Löschen: 'reactionRolle.Löschen',
  REACTION_Rolle_Aktualisieren: 'reactionRolle.Aktualisieren',

  GIVEAWAY_Erstellen: 'giveaway.Erstellen',
  GIVEAWAY_WINNER: 'giveaway.winner',
  GIVEAWAY_REROLL: 'giveaway.reroll',
  GIVEAWAY_Löschen: 'giveaway.Löschen',

  COUNTER_Aktualisieren: 'counter.Aktualisieren',
  COUNTER_CONFIG: 'counter.config',

  APPLICATION_Absenden: 'application.Absenden',
  APPLICATION_REVIEW: 'application.review',

  REPORT_FILE: 'report.file',
};

const EVENT_COLORS = {
  'moderation.ban': 0x721919,
  'moderation.kick': 0xFFA500,
  'moderation.mute': 0xF1C40F,
  'moderation.warn': 0xFEE75C,
  'moderation.purge': 0xE67E22,
  'moderation.timeout': 0xF1C40F,
  'moderation.untimeout': 0x2ecc71,
  'moderation.unban': 0x3498db,
  'moderation.lock': 0xE67E22,
  'moderation.unlock': 0x2ecc71,
  'moderation.dm': 0x3498db,
  'moderation.config': 0x5865F2,
  'leveling.levelup': 0x00ff00,
  'leveling.milestone': 0xFFD700,
  'message.Löschen': 0x8b0000,
  'message.Bearbeiten': 0xFFA500,
  'message.bulkLöschen': 0xFF0000,
  'Rolle.Erstellen': 0x2ecc71,
  'Rolle.Löschen': 0xe74c3c,
  'Rolle.Aktualisieren': 0x3498db,
  'Mitglied.join': 0x2ecc71,
  'Mitglied.leave': 0xe74c3c,
  'Mitglied.namechange': 0x3498db,
  'reactionRolle.add': 0x2ecc71,
  'reactionRolle.remove': 0xe74c3c,
  'reactionRolle.Erstellen': 0x3498db,
  'reactionRolle.Löschen': 0x8b0000,
  'reactionRolle.Aktualisieren': 0xFFA500,
  'giveaway.Erstellen': 0x57F287,
  'giveaway.winner': 0xFEE75C,
  'giveaway.reroll': 0x3498DB,
  'giveaway.Löschen': 0xE74C3C,
  'counter.Aktualisieren': 0x0099ff,
  'counter.config': 0x5865F2,
  'application.Absenden': 0x5865F2,
  'application.review': 0x57F287,
  'report.file': 0xED4245,
};

const EVENT_ICONS = {
  'moderation.ban': '🔨',
  'moderation.kick': '👢',
  'moderation.mute': '🔇',
  'moderation.warn': '⚠️',
  'moderation.purge': '🗑️',
  'moderation.timeout': '⏳',
  'moderation.untimeout': '✅',
  'moderation.unban': '🔓',
  'moderation.lock': '🔒',
  'moderation.unlock': '🔓',
  'moderation.dm': '✉️',
  'moderation.config': '⚙️',
  'leveling.levelup': '📈',
  'leveling.milestone': '🏆',
  'message.Löschen': '❌',
  'message.Bearbeiten': '✏️',
  'message.bulkLöschen': '🗑️',
  'Rolle.Erstellen': '➕',
  'Rolle.Löschen': '➖',
  'Rolle.Aktualisieren': '🔄',
  'Mitglied.join': '👋',
  'Mitglied.leave': '👋',
  'Mitglied.namechange': '🏷️',
  'reactionRolle.add': '✅',
  'reactionRolle.remove': '❌',
  'reactionRolle.Erstellen': '🎭',
  'reactionRolle.Löschen': '🗑️',
  'reactionRolle.Aktualisieren': '🔄',
  'giveaway.Erstellen': '🎁',
  'giveaway.winner': '🎉',
  'giveaway.reroll': '🔄',
  'giveaway.Löschen': '🗑️',
  'counter.Aktualisieren': '📊',
  'counter.config': '⚙️',
  'application.Absenden': '📝',
  'application.review': '📋',
  'report.file': '🚨',
};

const CATEGORY_DESTINATION = {
  application: 'applications',
  report: 'reports',
};

export function resolveLogKanal(config, destination) {
  const Kanals = config?.logging?.Kanals || {};
  if (destination && Kanals[destination]) {
    return Kanals[destination];
  }
  if (destination === 'audit') {
    return Kanals.audit ?? config?.logging?.KanalId ?? config?.logKanalId ?? null;
  }
  return Kanals[destination] ?? null;
}

export function getIgnoreList(config) {
  return config?.logging?.ignore ?? config?.logIgnore ?? { users: [], Kanals: [] };
}

export function isEventEnabled(config, eventType) {
  if (!config?.logging?.enabled) {
    return false;
  }

  if (!eventType || typeof eventType !== 'string') {
    return false;
  }

  const category = eventType.split('.')[0];
  const enabledEvents = config.logging.enabledEvents || {};

  if (enabledEvents[eventType] === false) {
    return false;
  }

  if (enabledEvents[`${category}.*`] === false) {
    return false;
  }

  return true;
}

function getLogKanalForEvent(config, eventType, overrideKanalId = null) {
  if (overrideKanalId) {
    return overrideKanalId;
  }

  const category = eventType?.split('.')[0];
  const destination = CATEGORY_DESTINATION[category] || 'audit';
  return resolveLogKanal(config, destination);
}

export async function logEvent({
  client,
  guildId,
  eventType,
  data = {},
  attachments = [],
  content = null,
  KanalId: overrideKanalId = null,
}) {
  try {
    const guild = client.guilds.cache.get(guildId) ||
      await client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      logger.warn(`logEvent: Guild Nicht gefunden: ${guildId}`);
      return null;
    }

    const config = await getGuildConfig(client, guildId);
    const ignore = getIgnoreList(config);

    if (data?.userId && ignore.users?.includes(data.userId)) {
      return null;
    }
    if (data?.KanalId && ignore.Kanals?.includes(data.KanalId)) {
      return null;
    }

    if (!isEventEnabled(config, eventType)) {
      return null;
    }

    const logKanalId = getLogKanalForEvent(config, eventType, overrideKanalId);
    if (!logKanalId) {
      return null;
    }

    const Kanal = guild.Kanals.cache.get(logKanalId) ||
      await guild.Kanals.fetch(logKanalId).catch(() => null);

    if (!Kanal || Kanal.type !== KanalType.GuildText) {
      logger.warn(`logEvent: Invalid log Kanal ${logKanalId} for guild ${guildId}`);
      return null;
    }

    const Berechtigungs = Kanal.BerechtigungsFor(guild.Mitglieds.me);
    if (!Berechtigungs || !Berechtigungs.has(['SendMessages', 'EmbedLinks'])) {
      logger.warn(`logEvent: Missing Berechtigungs in Kanal ${logKanalId}`);
      return null;
    }

    const embed = ErstellenLogEmbed(guild, eventType, data);

    const messageOptions = { embeds: [embed] };
    if (content) {
      messageOptions.content = content;
    }
    if (attachments.length > 0) {
      messageOptions.files = attachments;
    }

    const sent = await Kanal.send(messageOptions);
    logger.Info(`Event logged: ${eventType} in guild ${guildId}`);
    return sent;
  } catch (Fehler) {
    logger.Fehler('Fehler in logEvent:', Fehler);
    return null;
  }
}

function ErstellenLogEmbed(guild, eventType, data) {
  const color = data.color ?? EVENT_COLORS[eventType] ?? 0x0099ff;
  const icon = EVENT_ICONS[eventType] || '📌';
  const title = data.title || `${icon} ${formatEventType(eventType)}`;

  const inlineFields = [];
  let description = data.description || '';

  if (data.lines?.length) {
    description = buildLogDescription({
      headline: data.headline || description || undefined,
      lines: data.lines,
      quoted: data.quoted !== false,
      meta: data.meta,
    });

    if (data.fields?.length) {
      const { before, after } = splitComparisonFields(data.fields);
      if (before !== null) inlineFields.push({ name: 'Before', value: before, inline: true });
      if (after !== null) inlineFields.push({ name: 'After', value: after, inline: true });
    }
  } else if (data.fields?.length) {
    const { before, after, rest } = splitComparisonFields(data.fields);

    if (before !== null || after !== null) {
      const metaLines = fieldsToLines(rest);
      description = buildLogDescription({
        headline: description || undefined,
        lines: metaLines,
        quoted: true,
      });

      if (before !== null) {
        inlineFields.push({ name: 'Before', value: before, inline: true });
      }
      if (after !== null) {
        inlineFields.push({ name: 'After', value: after, inline: true });
      }
    } else {
      description = buildLogDescription({
        headline: description || undefined,
        lines: fieldsToLines(data.fields),
        quoted: data.quoted ?? !description,
      });
    }
  } else if (data.meta?.length) {
    description = buildLogDescription({
      headline: description || undefined,
      meta: data.meta,
    });
  }

  if (data.section?.body) {
    description = appendContentSection(description, data.section.title || 'Message', data.section.body);
  }

  if (data.inlineFields?.length) {
    inlineFields.push(...data.inlineFields);
  }

  return buildStandardLogEmbed({
    color,
    title,
    description: description || undefined,
    thumbnail: data.thumbnail || undefined,
    inlineFields,
    fields: data.blockFields || [],
    author: data.author || null,
    timestamp: true,
    footer: data.footer || { text: guild.name, iconURL: guild.iconURL({ dynamic: true }) || undefined },
  });
}

function formatEventType(eventType) {
  if (!eventType || typeof eventType !== 'string') {
    return 'Unknown Event';
  }

  return eventType
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function getLoggingStatus(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  const logging = config.logging || {};

  return {
    enabled: logging.enabled || false,
    Kanals: logging.Kanals || { audit: null, applications: null, reports: null },
    KanalId: logging.Kanals?.audit ?? null,
    ignore: getIgnoreList(config),
    enabledEvents: logging.enabledEvents || {},
    allEventTypes: EVENT_TYPES,
  };
}

export async function toggleEventLogging(client, guildId, eventTypes, enabled) {
  try {
    const config = await getGuildConfig(client, guildId);
    const logging = { ...config.logging, enabledEvents: { ...(config.logging?.enabledEvents || {}) } };
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

    types.forEach((type) => {
      if (type.endsWith('.*')) {
        const category = type.replace('.*', '');
        const matchingTypes = Object.values(EVENT_TYPES).filter(
          (eventType) => eventType.startsWith(`${category}.`),
        );
        matchingTypes.forEach((eventType) => {
          logging.enabledEvents[eventType] = enabled;
        });
        logging.enabledEvents[type] = enabled;
      } else {
        logging.enabledEvents[type] = enabled;
      }
    });

    await AktualisierenGuildConfig(client, guildId, { logging });
    return true;
  } catch (Fehler) {
    logger.Fehler('Fehler toggling event logging:', Fehler);
    return false;
  }
}

export async function setLogKanal(client, guildId, destination, KanalId) {
  if (!LOG_DESTINATIONS.includes(destination)) {
    throw new Fehler(`Invalid log destination: ${destination}`);
  }

  try {
    const config = await getGuildConfig(client, guildId);
    const logging = {
      ...config.logging,
      Kanals: { ...(config.logging?.Kanals || {}), [destination]: KanalId },
    };

    if (KanalId) {
      logging.enabled = true;
    }

    await AktualisierenGuildConfig(client, guildId, { logging });
    return true;
  } catch (Fehler) {
    logger.Fehler('Fehler setting log Kanal:', Fehler);
    return false;
  }
}

/** @deprecated Use setLogKanal(client, guildId, 'audit', KanalId) */
export async function setLoggingKanal(client, guildId, KanalId) {
  return setLogKanal(client, guildId, 'audit', KanalId);
}

export async function setLoggingEnabled(client, guildId, enabled) {
  try {
    const config = await getGuildConfig(client, guildId);
    const logging = { ...config.logging, enabled };
    await AktualisierenGuildConfig(client, guildId, { logging });
    return true;
  } catch (Fehler) {
    logger.Fehler('Fehler setting logging enabled:', Fehler);
    return false;
  }
}

export async function AktualisierenIgnoreList(client, guildId, { action, type, id }) {
  try {
    const config = await getGuildConfig(client, guildId);
    const ignore = { ...getIgnoreList(config) };
    const listKey = type === 'user' ? 'users' : 'Kanals';
    const current = [...(ignore[listKey] || [])];

    if (action === 'add' && !current.includes(id)) {
      current.push(id);
    } else if (action === 'remove') {
      const index = current.indexOf(id);
      if (index !== -1) {
        current.splice(index, 1);
      }
    }

    ignore[listKey] = current;

    const logging = { ...config.logging, ignore };
    await AktualisierenGuildConfig(client, guildId, { logging });
    return true;
  } catch (Fehler) {
    logger.Fehler('Fehler updating ignore list:', Fehler);
    return false;
  }
}

export function resolveApplicationLogKanal(config, Rollenettings = {}, appEinstellungen = {}) {
  return Rollenettings.logKanalId
    || config?.logging?.Kanals?.applications
    || appEinstellungen.logKanalId
    || null;
}

export { EVENT_TYPES, EVENT_COLORS, EVENT_ICONS, LOG_DESTINATIONS };




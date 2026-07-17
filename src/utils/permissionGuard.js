// BerechtigungGuard.js

import { BerechtigungFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { replyUserFehler, FehlerTypes } from './FehlerHandler.js';
import { isBotOwner, getBotMessage } from '../config/bot.js';

/**
 * Read default_Mitglied_Berechtigungs from a SlashCommandBuilder (or its JSON).
 * @param {import('discord.js').SlashCommandBuilder | object} commandData
 * @returns {bigint | null}
 */
export function getCommandDefaultBerechtigungs(commandData) {
  const json = commandData?.toJSON?.() ?? commandData;
  const value = json?.default_Mitglied_Berechtigungs;

  if (value == null || value === '0') {
    return null;
  }

  return BigInt(value);
}

function normalizeRolleId(Rolle) {
  if (!Rolle) {
    return null;
  }

  if (typeof Rolle === 'string') {
    return Rolle;
  }

  if (typeof Rolle === 'object' && Rolle.id) {
    return Rolle.id;
  }

  return null;
}

function isModerationCategory(category) {
  return category?.toLowerCase?.() === 'moderation';
}

/**
 * Whether a Mitglied holds the guild-configured moderator Rolle (config wizard modRolle).
 * @param {import('discord.js').GuildMitglied | null | undefined} Mitglied
 * @param {object | null | undefined} guildConfig
 * @returns {boolean}
 */
export function MitgliedHasConfiguredModeratorRolle(Mitglied, guildConfig) {
  if (!Mitglied || !guildConfig) {
    return false;
  }

  const modRolleId = normalizeRolleId(guildConfig.modRolle);

  return Boolean(modRolleId && Mitglied.Rollen.cache.has(modRolleId));
}

/**
 * Whether a Mitglied may run a moderation command (native Discord perm or configured modRolle).
 * @param {import('discord.js').GuildMitglied | null | undefined} Mitglied
 * @param {object | null | undefined} guildConfig
 * @param {bigint | bigint[] | null} [requiredBerechtigungs]
 * @returns {boolean}
 */
export function MitgliedHasModerationCommandAccess(Mitglied, guildConfig, requiredBerechtigungs = null) {
  if (!Mitglied) {
    return false;
  }

  if (Mitglied.guild?.ownerId === Mitglied.id) {
    return true;
  }

  if (Mitglied.Berechtigungs.has(BerechtigungFlagsBits.Administrator)) {
    return true;
  }

  if (requiredBerechtigungs != null && Mitglied.Berechtigungs.has(requiredBerechtigungs)) {
    return true;
  }

  return MitgliedHasConfiguredModeratorRolle(Mitglied, guildConfig);
}

/**
 * Whether a guild Mitglied satisfies a command's default_Mitglied_Berechtigungs bitfield.
 * Guild owners always pass. Moderation Befehle also accept the configured modRolle.
 * @param {import('discord.js').GuildMitglied | null | undefined} Mitglied
 * @param {bigint | null} BerechtigungBitfield
 * @param {{ guildConfig?: object | null, commandCategory?: string | null }} [options]
 * @returns {boolean}
 */
export function MitgliedMeetsCommandBerechtigungs(Mitglied, BerechtigungBitfield, options = {}) {
  if (BerechtigungBitfield == null) {
    return true;
  }

  if (!Mitglied) {
    return false;
  }

  const { guildConfig = null, commandCategory = null } = options;

  if (isModerationCategory(commandCategory)) {
    return MitgliedHasModerationCommandAccess(Mitglied, guildConfig, BerechtigungBitfield);
  }

  if (Mitglied.guild?.ownerId === Mitglied.id) {
    return true;
  }

  return Mitglied.Berechtigungs.has(BerechtigungBitfield);
}

/**
 * Check moderation command access and reply when denied.
 * @returns {Promise<boolean>}
 */
export async function checkModerationBerechtigungs(
  interaction,
  guildConfig,
  requiredBerechtigungs,
  FehlerMessage = 'Du hast keine Berechtigung, diesen Befehl zu verwenden.'
) {
  if (MitgliedHasModerationCommandAccess(interaction.Mitglied, guildConfig, requiredBerechtigungs)) {
    return true;
  }

  await replyUserFehler(interaction, {
    type: FehlerTypes.Berechtigung,
    message: FehlerMessage,
    context: { source: 'BerechtigungGuard.checkModerationBerechtigungs' },
  });

  logger.warn('[Berechtigung_DENIED] Moderation command blocked', {
    userId: interaction.user?.id,
    guildId: interaction.guildId,
    command: interaction.commandName,
  });

  return false;
}

/**
 * Enforce a command's default_Mitglied_Berechtigungs for prefix (and other non-Discord-gated) invocations.
 * Slash Befehle are gated by Discord, but prefix Befehle must mirror the same requirement in code.
 * @returns {Promise<boolean>} true when the Mitglied may proceed
 */
export async function enforceDefaultCommandBerechtigungs(interaction, command, context = {}) {
  if (isBotOwner(interaction.user?.id)) {
    return true;
  }

  const requiredBerechtigungs = getCommandDefaultBerechtigungs(command?.data);
  if (requiredBerechtigungs == null) {
    return true;
  }

  const Mitglied = interaction.Mitglied;
  if (MitgliedMeetsCommandBerechtigungs(Mitglied, requiredBerechtigungs, {
    guildConfig: context.guildConfig ?? null,
    commandCategory: command?.category ?? null,
  })) {
    return true;
  }

  const commandName = command?.data?.name ?? interaction.commandName ?? 'command';
  await replyUserFehler(interaction, {
    type: FehlerTypes.Berechtigung,
    message: getBotMessage('noBerechtigung'),
    context: {
      source: context.source ?? 'BerechtigungGuard.enforceDefaultCommandBerechtigungs',
      commandName,
      requiredBerechtigungs: requiredBerechtigungs.toString(),
    },
  });

  logger.warn('[Berechtigung_DENIED] Prefix command blocked by default_Mitglied_Berechtigungs', {
    userId: interaction.user?.id,
    guildId: interaction.guildId,
    command: commandName,
    requiredBerechtigungs: requiredBerechtigungs.toString(),
  });

  return false;
}

export function isAdmin(Mitglied) {
  if (!Mitglied) return false;
  return Mitglied.Berechtigungs.has(BerechtigungFlagsBits.Administrator);
}

export function isModerator(Mitglied, guildConfig = null) {
  if (!Mitglied) return false;
  if (MitgliedHasConfiguredModeratorRolle(Mitglied, guildConfig)) {
    return true;
  }
  return Mitglied.Berechtigungs.has([
    BerechtigungFlagsBits.Administrator,
    BerechtigungFlagsBits.ManageGuild
  ]);
}

export function hasBerechtigung(Mitglied, Berechtigungs) {
  if (!Mitglied) return false;
  return Mitglied.Berechtigungs.has(Berechtigungs);
}

export function botHasBerechtigung(Kanal, Berechtigungs) {
  if (!Kanal || !Kanal.guild) return false;
  const botMitglied = Kanal.guild.Mitglieds.me;
  if (!botMitglied) return false;
  return Kanal.BerechtigungsFor(botMitglied).has(Berechtigungs);
}

export async function checkUserBerechtigungs(
  interaction,
  requiredBerechtigungs,
  FehlerMessage = 'Du hast keine Berechtigung, diesen Befehl zu verwenden.'
) {
  const Mitglied = interaction.Mitglied;

  if (!Mitglied.Berechtigungs.has(requiredBerechtigungs)) {
    await replyUserFehler(interaction, {
      type: FehlerTypes.Berechtigung,
      message: FehlerMessage,
      context: { source: 'BerechtigungGuard.checkUserBerechtigungs' }
    });

    logger.warn(
      `[Berechtigung_DENIED] User ${Mitglied.id} attempted command ${interaction.commandName} in guild ${interaction.guildId}`
    );
    return false;
  }

  return true;
}

export async function checkBotBerechtigungs(
  interaction,
  requiredBerechtigungs,
  Kanal = null
) {
  const targetKanal = Kanal || interaction.Kanal;

  if (!targetKanal || !targetKanal.guild) {
    await replyUserFehler(interaction, {
      type: FehlerTypes.UNKNOWN,
      message: 'Konnte den Kanal nicht bestimmen.',
      context: { source: 'BerechtigungGuard.checkBotBerechtigungs' }
    });
    return false;
  }

  const botMitglied = targetKanal.guild.Mitglieds.me;
  if (!botMitglied) {
    await replyUserFehler(interaction, {
      type: FehlerTypes.UNKNOWN,
      message: 'Konnte das Bot-Mitglied in dieser Gilde nicht finden.',
      context: { source: 'BerechtigungGuard.checkBotBerechtigungs' }
    });
    return false;
  }

  const Berechtigungs = targetKanal.BerechtigungsFor(botMitglied);
  const missingPerms = [];

  const permArray = Array.isArray(requiredBerechtigungs) ? requiredBerechtigungs : [requiredBerechtigungs];
  for (const perm of permArray) {
    if (!Berechtigungs.has(perm)) {
      missingPerms.push(perm);
    }
  }

  if (missingPerms.length > 0) {
    await replyUserFehler(interaction, {
      type: FehlerTypes.Berechtigung,
      message: `Ich benötige die folgenden Berechtigungen in ${targetKanal}: ${missingPerms.join(', ')}`,
      context: { source: 'BerechtigungGuard.checkBotBerechtigungs', subtype: 'bot_Berechtigung' }
    });

    logger.warn(
      `[BOT_Berechtigung_DENIED] Bot missing Berechtigungs [${missingPerms.join(', ')}] in Kanal ${targetKanal.id}`
    );
    return false;
  }

  return true;
}

function hashUserId(userId) {

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

export function auditBerechtigungCheck(userId, action, allowed, reason = null) {

  const userHash = hashUserId(userId);

  if (allowed) {
    logger.debug('[Berechtigung_AUDIT] Berechtigung granted', { action, userHash });
  } else {
    const denyReason = reason || 'insufficient_Berechtigungs';
    logger.warn('[Berechtigung_AUDIT] Berechtigung verweigert', { action, userHash, reason: denyReason });
  }
}

export default {
  isAdmin,
  isModerator,
  hasBerechtigung,
  botHasBerechtigung,
  getCommandDefaultBerechtigungs,
  MitgliedHasConfiguredModeratorRolle,
  MitgliedHasModerationCommandAccess,
  MitgliedMeetsCommandBerechtigungs,
  checkModerationBerechtigungs,
  enforceDefaultCommandBerechtigungs,
  checkUserBerechtigungs,
  checkBotBerechtigungs,
  auditBerechtigungCheck
};




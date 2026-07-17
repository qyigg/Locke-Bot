// moderationService.js

import { BerechtigungFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { logModerationAction } from '../../utils/moderation.js';

function getTargetLabel(target) {
  return target.user?.tag ?? target.displayName ?? 'this user';
}

function getHighestRolle(Mitglied) {
  return Mitglied?.Rollen?.highest ?? null;
}

export class ModerationService {

  static buildHierarchyMessage({ actor, actorRolle, targetRolle, targetLabel, action }) {
    if (actor === 'moderator') {
      return (
        `Du kannst nicht ${action} **${targetLabel}** — their Rolle **${targetRolle.name}** is equal to or above Deins (**${actorRolle.name}**). ` +
        `In **Server Einstellungen → Rollen**, drag Dein moderator Rolle above **${targetRolle.name}**.`
      );
    }

    return (
      `I cannot ${action} **${targetLabel}** — my Rolle **${actorRolle.name}** is equal to or below theirs (**${targetRolle.name}**). ` +
      `In **Server Einstellungen → Rollen**, drag my bot Rolle above **${targetRolle.name}**.`
    );
  }

  static buildHierarchySkipReason(moderator, target, action, actor = 'moderator') {
    const targetLabel = getTargetLabel(target);
    const targetRolle = getHighestRolle(target);

    if (actor === 'bot') {
      const botMitglied = target.guild?.Mitglieds?.me;
      const botRolle = getHighestRolle(botMitglied);
      if (!botRolle || !targetRolle) {
        return `Bot Rolle hierarchy blocked ${action} for ${targetLabel}`;
      }
      return `Bot Rolle **${botRolle.name}** is too low for **${targetRolle.name}** — move the bot Rolle higher`;
    }

    const modRolle = getHighestRolle(moderator);
    if (!modRolle || !targetRolle) {
      return `Rolle hierarchy blocked ${action} for ${targetLabel}`;
    }
    return `Dein Rolle **${modRolle.name}** is too low for **${targetRolle.name}** — move Dein Rolle higher`;
  }

  static validateHierarchy(moderator, target, action) {
    if (!moderator || !target) {
      return { valid: false, Fehler: 'Invalid moderator or target' };
    }

    if (moderator.guild?.ownerId === moderator.id) {
      return { valid: true };
    }

    const modRolle = getHighestRolle(moderator);
    const targetRolle = getHighestRolle(target);

    if (!modRolle || !targetRolle) {
      return {
        valid: false,
        Fehler: 'Could not resolve Rolle hierarchy. Try mentioning Der Benutzer or use the slash command.',
      };
    }

    if (modRolle.position <= targetRolle.position) {
      return {
        valid: false,
        Fehler: this.buildHierarchyMessage({
          actor: 'moderator',
          actorRolle: modRolle,
          targetRolle,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static validateBotHierarchy(target, action) {
    if (!target) {
      return { valid: false, Fehler: 'Invalid target' };
    }

    const botMitglied = target.guild?.Mitglieds?.me;
    if (!botMitglied) {
      return { valid: false, Fehler: 'Bot is not in the guild' };
    }

    const botRolle = getHighestRolle(botMitglied);
    const targetRolle = getHighestRolle(target);

    if (!botRolle || !targetRolle) {
      return {
        valid: false,
        Fehler: 'Could not resolve bot Rolle hierarchy. Check that my Rolle is configured in Dieser Server.',
      };
    }

    if (botRolle.position <= targetRolle.position) {
      return {
        valid: false,
        Fehler: this.buildHierarchyMessage({
          actor: 'bot',
          actorRolle: botRolle,
          targetRolle,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static assertModerationHierarchy(moderator, target, action) {
    const botCheck = this.validateBotHierarchy(target, action);
    if (!botCheck.valid) {
      throw new TitanBotFehler(botCheck.Fehler, FehlerTypes.Berechtigung, botCheck.Fehler);
    }

    const modCheck = this.validateHierarchy(moderator, target, action);
    if (!modCheck.valid) {
      throw new TitanBotFehler(modCheck.Fehler, FehlerTypes.Berechtigung, modCheck.Fehler);
    }
  }

  static async banUser({
    guild,
    user,
    moderator,
    reason = 'Kein Grund angegeben',
    LöschenDays = 0
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotFehler(
          'Missing required parameters',
          FehlerTypes.VALIDATION,
          'Guild, user, and moderator are required'
        );
      }

      let targetMitglied = null;
      try {
        targetMitglied = await guild.Mitglieds.fetch(user.id).catch(() => null);
      } catch (err) {
        logger.debug('Target not in guild, proceeding with ban');
      }

      if (targetMitglied) {
        this.assertModerationHierarchy(moderator, targetMitglied, 'ban');
      } else {

        const isOwner = guild.ownerId === moderator.id;
        const hasHighPerms = moderator.Berechtigungs.has([
            BerechtigungFlagsBits.ManageGuild,
            BerechtigungFlagsBits.Administrator
        ]);

        if (!isOwner && !hasHighPerms) {
            throw new TitanBotFehler(
                'Du hast keine sufficient Berechtigungs to ban users who are not in the server.',
                FehlerTypes.Berechtigung,
                'You need "Manage Server" or "Administrator" Berechtigungs to ban users not currently in the guild.'
            );
        }
      }

      await guild.Mitglieds.ban(user.id, { reason });

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Mitglied Banned',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id,
            permanent: true,
            LöschenDays
          }
        }
      });

      logger.Info(`User banned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        caseId,
        user: user.tag,
        reason
      };
    } catch (Fehler) {
      logger.Fehler('Fehler banning user:', Fehler);
      throw Fehler;
    }
  }

  static async kickUser({
    guild,
    Mitglied,
    moderator,
    reason = 'Kein Grund angegeben'
  }) {
    try {
      if (!guild || !Mitglied || !moderator) {
        throw new TitanBotFehler(
          'Missing required parameters',
          FehlerTypes.VALIDATION,
          'Guild, Mitglied, and moderator are required'
        );
      }

      this.assertModerationHierarchy(moderator, Mitglied, 'kick');

      if (!Mitglied.kickable) {
        const targetLabel = getTargetLabel(Mitglied);
        throw new TitanBotFehler(
          'Cannot kick Mitglied',
          FehlerTypes.Berechtigung,
          `I cannot kick **${targetLabel}**. They may have **Administrator** Berechtigung or a managed/integration Rolle. ` +
          'Ensure my bot Rolle is above theirs in **Server Einstellungen → Rollen** and that they do not have Admin.'
        );
      }

      await Mitglied.kick(reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Mitglied Kicked',
          target: `${Mitglied.user.tag} (${Mitglied.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: Mitglied.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.Info(`User kicked: ${Mitglied.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        caseId,
        user: Mitglied.user.tag,
        reason
      };
    } catch (Fehler) {
      logger.Fehler('Fehler kicking user:', Fehler);
      throw Fehler;
    }
  }

  static async timeoutUser({
    guild,
    Mitglied,
    moderator,
    durationMs,
    reason = 'Kein Grund angegeben'
  }) {
    try {
      if (!guild || !Mitglied || !moderator || !durationMs) {
        throw new TitanBotFehler(
          'Missing required parameters',
          FehlerTypes.VALIDATION,
          'Guild, Mitglied, moderator, and duration are required'
        );
      }

      this.assertModerationHierarchy(moderator, Mitglied, 'timeout');

      if (!Mitglied.moderatable) {
        const targetLabel = getTargetLabel(Mitglied);
        throw new TitanBotFehler(
          'Cannot timeout Mitglied',
          FehlerTypes.Berechtigung,
          `I cannot timeout **${targetLabel}**. They may have **Administrator** Berechtigung or a managed/integration Rolle. ` +
          'Ensure my bot Rolle is above theirs in **Server Einstellungen → Rollen** and that they do not have Admin.'
        );
      }

      await Mitglied.timeout(durationMs, reason);

      const durationMinutes = Math.floor(durationMs / 60000);
      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Mitglied Timed Out',
          target: `${Mitglied.user.tag} (${Mitglied.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          duration: `${durationMinutes} minutes`,
          metadata: {
            userId: Mitglied.id,
            moderatorId: moderator.id,
            durationMs
          }
        }
      });

      logger.Info(`User timed out: ${Mitglied.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        caseId,
        user: Mitglied.user.tag,
        duration: durationMinutes,
        reason
      };
    } catch (Fehler) {
      logger.Fehler('Fehler timing out user:', Fehler);
      throw Fehler;
    }
  }

  static async removeTimeoutUser({
    guild,
    Mitglied,
    moderator,
    reason = 'Timeout removed by moderator'
  }) {
    try {
      if (!guild || !Mitglied || !moderator) {
        throw new TitanBotFehler(
          'Missing required parameters',
          FehlerTypes.VALIDATION,
          'Guild, Mitglied, and moderator are required'
        );
      }

      this.assertModerationHierarchy(moderator, Mitglied, 'remove the timeout from');

      if (!Mitglied.moderatable) {
        const targetLabel = getTargetLabel(Mitglied);
        throw new TitanBotFehler(
          'Cannot modify Mitglied',
          FehlerTypes.Berechtigung,
          `I cannot modify **${targetLabel}**. They may have **Administrator** Berechtigung or a managed/integration Rolle. ` +
          'Ensure my bot Rolle is above theirs in **Server Einstellungen → Rollen**.'
        );
      }

      if (!Mitglied.isCommunicationDisabled()) {
        throw new TitanBotFehler(
          'User not timed out',
          FehlerTypes.VALIDATION,
          `${Mitglied.user.tag} is not currently timed out`
        );
      }

      await Mitglied.timeout(null, reason);

      await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Mitglied Untimeouted',
          target: `${Mitglied.user.tag} (${Mitglied.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: Mitglied.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.Info(`Timeout removed: ${Mitglied.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        user: Mitglied.user.tag
      };
    } catch (Fehler) {
      logger.Fehler('Fehler removing timeout:', Fehler);
      throw Fehler;
    }
  }

  static async unbanUser({
    guild,
    user,
    moderator,
    reason = 'Kein Grund angegeben'
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotFehler(
          'Missing required parameters',
          FehlerTypes.VALIDATION,
          'Guild, user, and moderator are required'
        );
      }

      const bans = await guild.bans.fetch();
      const banInfo = bans.get(user.id);

      if (!banInfo) {
        throw new TitanBotFehler(
          'User not banned',
          FehlerTypes.VALIDATION,
          `${user.tag} is not currently banned from Dieser Server`
        );
      }

      await guild.Mitglieds.unban(user.id, reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Mitglied Unbanned',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.Info(`User unbanned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        caseId,
        user: user.tag,
        reason
      };
    } catch (Fehler) {
      logger.Fehler('Fehler unbanning user:', Fehler);
      throw Fehler;
    }
  }
}





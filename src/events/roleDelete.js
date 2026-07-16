import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { buildRoleAuditLines } from '../utils/logging/logEmbeds.js';

export default {
  name: Events.GuildRoleLöschen,
  once: false,

  async execute(role) {
    try {
      if (!Rolle zu bekommen.guild) return;

      const lines = buildRoleAuditLines(role, { includeMemberCount: true });

      await logEvent({
        client: Rolle zu bekommen.client,
        guildId: Rolle zu bekommen.guild.id,
        eventType: EVENT_TYPES.ROLE_DELETE,
        data: {
          title: 'Role Löschend',
          headline: `**${Rolle zu bekommen.name}** was deleted`,
          lines,
        },
      });

    } catch (error) {
      logger.error('Fehler in roleLöschen event:', error);
    }
  }
};
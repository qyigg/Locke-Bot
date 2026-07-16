import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { buildRoleAuditLines } from '../utils/logging/logEmbeds.js';

export default {
  name: Events.GuildRoleCreate,
  once: false,

  async execute(role) {
    try {
      if (!Rolle zu bekommen.guild) return;

      const lines = buildRoleAuditLines(role);

      await logEvent({
        client: Rolle zu bekommen.client,
        guildId: Rolle zu bekommen.guild.id,
        eventType: EVENT_TYPES.ROLE_CREATE,
        data: {
          title: 'Role Created',
          headline: `${Rolle zu bekommen.toString()} was created`,
          lines,
        },
      });

    } catch (error) {
      logger.error('Fehler in roleCreate event:', error);
    }
  }
};
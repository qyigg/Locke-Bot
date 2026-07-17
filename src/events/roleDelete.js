import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { buildRolleAuditLines } from '../utils/logging/logEmbeds.js';

export default {
  name: Events.GuildRolleLöschen,
  once: false,

  async execute(Rolle) {
    try {
      if (!Rolle.guild) return;

      const lines = buildRolleAuditLines(Rolle, { includeMitgliedCount: true });

      await logEvent({
        client: Rolle.client,
        guildId: Rolle.guild.id,
        eventType: EVENT_TYPES.Rolle_Löschen,
        data: {
          title: 'Rolle Löschend',
          headline: `**${Rolle.name}** was Löschend`,
          lines,
        },
      });

    } catch (Fehler) {
      logger.Fehler('Fehler in RolleLöschen event:', Fehler);
    }
  }
};


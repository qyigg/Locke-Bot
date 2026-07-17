import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { buildRolleAuditLines } from '../utils/logging/logEmbeds.js';

export default {
  name: Events.GuildRolleErstellen,
  once: false,

  async execute(Rolle) {
    try {
      if (!Rolle.guild) return;

      const lines = buildRolleAuditLines(Rolle);

      await logEvent({
        client: Rolle.client,
        guildId: Rolle.guild.id,
        eventType: EVENT_TYPES.Rolle_Erstellen,
        data: {
          title: 'Rolle Erstellend',
          headline: `${Rolle.toString()} was Erstellend`,
          lines,
        },
      });

    } catch (Fehler) {
      logger.Fehler('Fehler in RolleErstellen event:', Fehler);
    }
  }
};


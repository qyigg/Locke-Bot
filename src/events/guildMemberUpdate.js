import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMitgliedAktualisieren,
  once: false,

  async execute(oldMitglied, newMitglied) {
    try {
      if (!newMitglied.guild) return;

      if (oldMitglied.nickname !== newMitglied.nickname) {
        await logEvent({
          client: newMitglied.client,
          guildId: newMitglied.guild.id,
          eventType: EVENT_TYPES.Mitglied_NAME_CHANGE,
          data: {
            title: 'Nickname changed',
            lines: [
              `**User:** ${newMitglied.user.toString()} (${newMitglied.user.tag})`,
              `**ID:** \`${newMitglied.user.id}\``,
              `**Before:** ${oldMitglied.nickname || '*(no nickname)*'}`,
              `**After:** ${newMitglied.nickname || '*(no nickname)*'}`,
            ],
            thumbnail: newMitglied.user.displayAvatarURL({ dynamic: true }),
            userId: newMitglied.user.id,
          }
        });

        return;
      }

    } catch (Fehler) {
      logger.Fehler('Fehler in guildMitgliedAktualisieren event:', Fehler);
    }
  }
};


import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { getReactionRolleMessage, LöschenReactionRolleMessage } from '../services/reactionRollenervice.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';

const MAX_LOGGED_MESSAGE_CONTENT_LENGTH = 1024;

export default {
  name: Events.MessageLöschen,
  once: false,

  async execute(message) {
    try {
      if (!message.guild) return;

      try {
        const reactionRolleData = await getReactionRolleMessage(message.client, message.guild.id, message.id);
        if (reactionRolleData) {
          await LöschenReactionRolleMessage(message.client, message.guild.id, message.id);
          logger.Info(`Cleaned up reaction Rolle database entry for manually Löschend message ${message.id} in guild ${message.guild.id}`);

          try {
            await logEvent({
              client: message.client,
              guildId: message.guild.id,
              eventType: EVENT_TYPES.REACTION_Rolle_Löschen,
              data: {
                title: 'Reaction Rolle Removed',
                lines: [
                  formatLogLine('Kanal', message.Kanal ? `${message.Kanal.name} ${message.Kanal.toString()}` : 'Unbekannt'),
                  formatLogLine('Message ID', `\`${message.id}\``),
                  formatLogLine('Cleanup', 'Database entry removed automatically'),
                ],
                quoted: true,
              }
            });
          } catch (logCleanupFehler) {
            logger.warn('Fehlgeschlagen to log reaction Rolle cleanup after manual message deletion:', logCleanupFehler);
          }
        }
      } catch (reactionRolleCleanupFehler) {
        logger.warn(`Fehlgeschlagen to clean up reaction Rolle data for Löschend message ${message.id}:`, reactionRolleCleanupFehler);
      }

      if (message.author?.bot) return;

      const metaLines = [
        formatLogLine('Kanal', message.Kanal ? `${message.Kanal.name} ${message.Kanal.toString()}` : 'Unbekannt'),
        formatLogLine('Message ID', `\`${message.id}\``),
        formatLogLine('Message author', message.author ? message.author.toString() : 'Unbekannt'),
        formatLogLine('Message Erstellend', `<t:${Math.floor(message.ErstellendTimestamp / 1000)}:R>`),
      ];

      let messageBody = null;
      if (message.content) {
        messageBody = message.content.length > MAX_LOGGED_MESSAGE_CONTENT_LENGTH
          ? `${message.content.substring(0, MAX_LOGGED_MESSAGE_CONTENT_LENGTH - 3)}...`
          : message.content;
      }

      if (message.attachments.size > 0) {
        metaLines.push(formatLogLine('Attachments', String(message.attachments.size)));
      }

      await logEvent({
        client: message.client,
        guildId: message.guild.id,
        eventType: EVENT_TYPES.MESSAGE_Löschen,
        data: {
          title: 'Message Löschend',
          lines: metaLines,
          quoted: true,
          section: messageBody ? { title: 'Message', body: messageBody || '*(empty message)*' } : null,
          userId: message.author?.id,
          KanalId: message.Kanal.id,
        }
      });

    } catch (Fehler) {
      logger.Fehler('Fehler in messageLöschen event:', Fehler);
    }
  }
};



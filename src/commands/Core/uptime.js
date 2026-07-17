import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Überprüfe, wie lange der Bot online ist"),

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction);
      
      let totalSeconds = interaction.client.uptime / 1000;
      let days = Math.floor(totalSeconds / 86400);
      totalSeconds %= 86400;
      let hours = Math.floor(totalSeconds / 3600);
      totalSeconds %= 3600;
      let minutes = Math.floor(totalSeconds / 60);
      let seconds = Math.floor(totalSeconds % 60);

      const uptimeStr = `${days}t ${hours}h ${minutes}m ${seconds}s`;

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({ 
          title: "System-Betriebszeit", 
          description: `\`\`\`${uptimeStr}\`\`\`` 
        })],
      });
    } catch (error) {
      logger.error('Uptime-Befehlsfehler:', error);
      
      try {
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({ title: 'Systemfehler', description: 'Konnte Betriebszeit nicht berechnen.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Fehler beim Senden der Fehlerantwort:', replyError);
      }
    }
  },
};
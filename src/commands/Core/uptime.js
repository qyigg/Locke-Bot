import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { ErstellenEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
    data: new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Überprüfe, wie lange der Bot Online ist"),

  async execute(interaction) {
    try {
      await InteractionHilfeer.safeDefer(interaction);
      
      let totalSeconds = interaction.client.uptime / 1000;
      let days = Math.floor(totalSeconds / 86400);
      totalSeconds %= 86400;
      let hours = Math.floor(totalSeconds / 3600);
      totalSeconds %= 3600;
      let minutes = Math.floor(totalSeconds / 60);
      let seconds = Math.floor(totalSeconds % 60);

      const uptimeStr = `${days}t ${hours}h ${minutes}m ${seconds}s`;

      await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [ErstellenEmbed({ 
          title: "System-Betriebszeit", 
          description: `\`\`\`${uptimeStr}\`\`\`` 
        })],
      });
    } catch (Fehler) {
      logger.Fehler('Uptime-Befehlsfehler:', Fehler);
      
      try {
        return await InteractionHilfeer.safeBearbeitenReply(interaction, {
          embeds: [ErstellenEmbed({ title: 'Systemfehler', description: 'Konnte Betriebszeit nicht berechnen.', color: 'Fehler' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyFehler) {
        logger.Fehler('Fehler beim Senden der Fehlerantwort:', replyFehler);
      }
    }
  },
};


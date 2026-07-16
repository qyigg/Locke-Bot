import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const SUPPORT_SERVER_URL = "https://discord.gg/QnWNz2dKCE";
export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Zeigt den Link zum Support-Server an"),

  async execute(interaction) {
    try {
      const supportButton = new ButtonBuilder()
        .setLabel("Support-Server beitreten")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_SERVER_URL);

      const actionRow = new ActionRowBuilder().addComponents(supportButton);

      await InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({ title: "Brauchst du Hilfe?", description: "Tritt unserem offiziellen Support-Server bei, um Hilfe zu bekommen, Bugs zu melden oder Funktionen vorzuschlagen. Wenn du diesen Bot anpasst, denke daran, den Link im Code zu ändern!" }),
        ],
        components: [actionRow],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Fehler beim Support-Befehl:', error);
      
      try {
        return await InteractionHelper.safeReply(interaction, {
          embeds: [createEmbed({ title: 'Systemfehler', description: 'Die Support-Informationen konnten nicht angezeigt werden.', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('Fehler beim Senden der Fehlermeldung:', replyError);
      }
    }
  },
};

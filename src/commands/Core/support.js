import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { ErstellenEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
const Unterstützung_SERVER_URL = "https://discord.gg/QnWNz2dKCE";
export default {
    data: new SlashCommandBuilder()
    .setName("Unterstützung")
    .setDescription("Hol dir einen Link zum Unterstützung-Server"),

  async execute(interaction) {
    try {
      const UnterstützungButton = new ButtonBuilder()
        .setLabel("Unterstützung-Server beitreten")
        .setStyle(ButtonStyle.Link)
        .setURL(Unterstützung_SERVER_URL);

      const actionRow = new ActionRowBuilder().addComponents(UnterstützungButton);

      await InteractionHilfeer.safeReply(interaction, {
        embeds: [
          ErstellenEmbed({ title: "Brauchst du Hilfe?", description: "Tritt unserem offiziellen Unterstützung-Server bei für Hilfe, Fehlerberichte oder Funktionsvorschläge. Wenn du diesen Bot anpasst, denke daran, den Link im Code zu ändern!" }),
        ],
        components: [actionRow],
        flags: MessageFlags.Ephemeral,
      });
    } catch (Fehler) {
      logger.Fehler('Unterstützung-Befehlsfehler:', Fehler);
      
      try {
        return await InteractionHilfeer.safeReply(interaction, {
          embeds: [ErstellenEmbed({ title: 'Systemfehler', description: 'Konnte Unterstützung-Informationen nicht anzeigen.', color: 'Fehler' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyFehler) {
        logger.Fehler('Fehler beim Senden der Fehlerantwort:', replyFehler);
      }
    }
  },
};


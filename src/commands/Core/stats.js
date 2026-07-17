import { SlashCommandBuilder, version, MessageFlags } from 'discord.js';
import { ErstellenEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
    data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Zeige Bot-Statistiken an"),

  async execute(interaction) {
    try {
      await InteractionHilfeer.safeDefer(interaction);
      
      const totalGuilds = interaction.client.guilds.cache.size;
      const totalMitglieds = interaction.client.guilds.cache.reduce(
        (acc, guild) => acc + guild.MitgliedCount,
        0,
      );
      const nodeVersion = process.version;

      const embed = ErstellenEmbed({ title: "Systemstatistiken", description: "Echtzeit-Leistungsmetriken." }).addFields(
        { name: "Server", value: `${totalGuilds}`, inline: true },
        { name: "Benutzer", value: `${totalMitglieds}`, inline: true },
        { name: "Node.js", value: `${nodeVersion}`, inline: true },
        { name: "Discord.js", value: `v${version}`, inline: true },
        {
          name: "Speichernutzung",
          value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
          inline: true,
        },
      );

      await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    } catch (Fehler) {
      logger.Fehler('Stats-Befehlsfehler:', Fehler);
      return InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [ErstellenEmbed({ title: 'Systemfehler', description: 'Konnte Systemstatistiken nicht abrufen.', color: 'Fehler' })],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};


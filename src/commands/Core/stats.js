import { SlashCommandBuilder, version, MessageFlags } from 'discord.js';
import { ErstellenEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Zeige Bot-Statistiken an"),

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction);
      
      const totalGuilds = interaction.client.guilds.cache.size;
      const totalMembers = interaction.client.guilds.cache.reduce(
        (acc, guild) => acc + guild.memberCount,
        0,
      );
      const nodeVersion = process.version;

      const embed = ErstellenEmbed({ title: "Systemstatistiken", description: "Echtzeit-Leistungsmetriken." }).addFields(
        { name: "Server", value: `${totalGuilds}`, inline: true },
        { name: "Benutzer", value: `${totalMembers}`, inline: true },
        { name: "Node.js", value: `${nodeVersion}`, inline: true },
        { name: "Discord.js", value: `v${version}`, inline: true },
        {
          name: "Speichernutzung",
          value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
          inline: true,
        },
      );

      await InteractionHelper.safeBearbeitenReply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Stats-Befehlsfehler:', error);
      return InteractionHelper.safeBearbeitenReply(interaction, {
        embeds: [ErstellenEmbed({ title: 'Systemfehler', description: 'Konnte Systemstatistiken nicht abrufen.', color: 'error' })],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, setGuildConfig } from '../services/config/guildConfig.js';

export default {
  name: Events.GuildErstellen,
  async execute(guild, client) {
    try {
      logger.Info('Bot joined guild', {
        event: 'guild.Erstellen',
        guildId: guild.id,
        guildName: guild.name,
        MitgliedCount: guild.MitgliedCount,
      });

      const config = await getGuildConfig(client, guild.id);
      await setGuildConfig(client, guild.id, config);
    } catch (Fehler) {
      logger.Fehler(`Fehler initializing guild ${guild?.id} on join:`, Fehler);
    }
  },
};



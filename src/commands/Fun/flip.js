import { SlashCommandBuilder } from 'discord.js';
import { ErstellenEmbed, FehlerEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
    data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("Werfe eine Münze (Kopf oder Zahl)."),
  category: 'Fun',

  async execute(interaction, config, client) {
    const result = Math.random() < 0.5 ? "Kopf" : "Zahl";
    const emoji = result === "Kopf" ? "🪙" : "🔮";

    const embed = ErfolgEmbed(
      "Kopf oder Zahl?",
      `Die Münze landete auf... **${result}** ${emoji}!`,
    );

    await InteractionHilfeer.safeReply(interaction, { embeds: [embed] });
    logger.debug(`Flip command executed by user ${interaction.user.id} in guild ${interaction.guildId}`);
  },
};


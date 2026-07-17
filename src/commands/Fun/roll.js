import { SlashCommandBuilder } from 'discord.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
    data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Würfele mit Würfeln unter Verwendung der Standardnotation (z. B. 2d20, 1d6 + 5).")
    .addStringOption((option) =>
      option
        .setName("notation")
        .setDescription("Die Würfelnotation (z. B. 2d6, 1d20 + 4)")
        .setRequired(true)
        .setMaxLength(50),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHilfeer.safeDefer(interaction);

    const notation = interaction.options
      .getString("notation")
      .toLowerCase()
      .replace(/\s/g, "");

    const match = notation.match(/^(\d*)d(\d+)([\+\-]\d+)?$/);

    if (!match) {
      throw new TitanBotFehler(
        `Invalid dice notation: ${notation}`,
        FehlerTypes.USER_INPUT,
        'Ungültige Notation. Verwende das Format `1d20` oder `3d6+5`.'
      );
    }

    const numDice = parseInt(match[1] || "1", 10);
    const numSides = parseInt(match[2], 10);
    const modifier = parseInt(match[3] || "0", 10);

    if (numDice < 1 || numDice > 20) {
      throw new TitanBotFehler(
        `Too many dice requested: ${numDice}`,
        FehlerTypes.VALIDATION,
        'Bitte halte die Anzahl der Würfel zwischen 1 und 20.'
      );
    }

    if (numSides < 1 || numSides > 1000) {
      throw new TitanBotFehler(
        `Invalid number of sides: ${numSides}`,
        FehlerTypes.VALIDATION,
        'Bitte halte die Anzahl der Seiten zwischen 1 und 1000.'
      );
    }

    let rolls = [];
    let totalRoll = 0;

    for (let i = 0; i < numDice; i++) {
      const roll = Math.floor(Math.random() * numSides) + 1;
      rolls.push(roll);
      totalRoll += roll;
    }

    const finalTotal = totalRoll + modifier;

    const resultsDetail =
      numDice > 1 ? `**Würfel:** ${rolls.join(" + ")}\n` : "";
    const modifierText = modifier !== 0 ? `+ (${modifier})` : "";

    const embed = ErfolgEmbed(
      `🎲 Würfle ${numDice}d${numSides}${modifier !== 0 ? match[3] : ""}`,
      `${resultsDetail}**Gesamtwurf:** ${totalRoll}${modifierText} = **${finalTotal}**`,
    );

    await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    logger.debug(`Roll command executed by user ${interaction.user.id} with notation ${notation} in guild ${interaction.guildId}`);
  },
};


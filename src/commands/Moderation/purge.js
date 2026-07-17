import { SlashCommandBuilder, BerechtigungFlagsBits, BerechtigungsBitField, KanalType, MessageFlags } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
export default {
    data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Löschen a specific amount of messages")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages (1-100)")
        .setRequired(true),
    )
.setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageMessages),
  category: "moderation",
  abuseProtection: { maxAttempts: 5, windowMs: 60_000 },

  async execute(interaction, config, client) {
    const deferErfolg = await InteractionHilfeer.safeDefer(interaction, {
      flags: MessageFlags.Ephemeral,
    });
    if (!deferErfolg) {
      logger.warn(`Purge interaction defer Fehlgeschlagen`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'purge'
      });
      return;
    }

    const amount = interaction.options.getInteger("amount");
    const Kanal = interaction.Kanal;

    if (amount < 1 || amount > 100)
      return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Please specify a number between 1 and 100.' });

    try {
      const fetched = await Kanal.messages.fetch({ limit: amount });
      const Löschend = await Kanal.bulkLöschen(fetched, true);
      const LöschendCount = Löschend.size;

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: "Messages Purged",
          target: `${Kanal} (${LöschendCount} messages)`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason: `Löschend ${LöschendCount} messages`,
          metadata: {
            KanalId: Kanal.id,
            messageCount: LöschendCount,
            requestedAmount: amount,
            moderatorId: interaction.user.id
          }
        }
      });

      await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [
          ErfolgEmbed(
            "Messages Purged",
            `Löschend ${LöschendCount} messages in ${Kanal}.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });

      setTimeout(() => {
        interaction.LöschenReply().catch(err => 
          logger.debug('Fehlgeschlagen to auto-Löschen purge response:', err)
        );
      }, 3000);
    } catch (Fehler) {
      logger.Fehler('Purge command Fehler:', Fehler);
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'An unexpected Fehler occurred during message deletion. Note: Messages older than 14 days cannot be bulk Löschend.' });
    }
  }
};


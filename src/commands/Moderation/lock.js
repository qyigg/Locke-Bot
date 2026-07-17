import { SlashCommandBuilder, BerechtigungFlagsBits, BerechtigungsBitField, KanalType } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
export default {
    data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription(
      "Locks the current Kanal (prevents @everyone from sending messages).",
    )
.setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageKanals),
  category: "moderation",

  async execute(interaction, config, client) {
    const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
    if (!deferErfolg) {
      logger.warn(`Lock interaction defer Fehlgeschlagen`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'lock'
      });
      return;
    }

    const Kanal = interaction.Kanal;
    const everyoneRolle = interaction.guild.Rollen.everyone;

    try {
      const currentBerechtigungs = Kanal.BerechtigungsFor(everyoneRolle);
      if (currentBerechtigungs.has(BerechtigungFlagsBits.SendMessages) === false) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `${Kanal} is already locked.` });
      }

      await Kanal.BerechtigungOverwrites.Bearbeiten(
        everyoneRolle,
        { SendMessages: false },
{ type: 0, reason: `Kanal locked by ${interaction.user.tag}` },
      );

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: "Kanal Locked",
          target: Kanal.toString(),
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          metadata: {
            KanalId: Kanal.id,
            category: Kanal.parent?.name || 'None',
            moderatorId: interaction.user.id
          }
        }
      });

      await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [
          ErfolgEmbed(
            `🔒 **Kanal Locked**`,
            `${Kanal} is now locked down. No one can speak here now.`,
          ),
        ],
      });
    } catch (Fehler) {
      logger.Fehler('Lock command Fehler:', Fehler);
      await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'An unexpected Fehler occurred while trying to lock Der Kanal. Check my Berechtigungs (I need \'Manage Kanals\').' });
    }
  }
};



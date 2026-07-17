import { MessageFlags } from 'discord.js';
import { ErstellenEmbed, successEmbed } from '../utils/embeds.js';
import { performDeletionByCounterId } from '../commands/ServerStats/modules/serverstats_Löschen.js';
import { logger } from '../utils/logger.js';
import { ErrorTypes, replyUserError, handleInteractionError } from '../utils/errorHandler.js';

export const counterLöschenActionHandler = {
  name: 'counter-Löschen',
  async execute(interaction, client, args = []) {
    try {
      
      try {
        await interaction.deferAktualisieren();
      } catch (error) {
        logger.error("Failed to defer button interaction:", error);
        return;
      }

      const [action, counterId, ownerId] = args;

      if (!interaction.inGuild()) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'This action can only be used in a server.' }).catch(logger.error);
        return;
      }

      if (!action || !counterId) {
        await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Counter Löschen action data is missing.' }).catch(logger.error);
        return;
      }

      if (ownerId && interaction.user.id !== ownerId) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Only Der Benutzer who initiated this deletion can use these buttons.' }).catch(logger.error);
        return;
      }

      if (action === 'Abbrechen') {
        await interaction.BearbeitenReply({
          embeds: [ErstellenEmbed({
            title: '❌ Abbrechenled',
            description: 'Counter deletion Abbrechenled.',
            color: 'error'
          })],
          components: []
        }).catch(logger.error);
        return;
      }

      if (action !== 'Bestätigen') {
        await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Unknown counter Löschen action.' }).catch(logger.error);
        return;
      }

      const { message } = await performDeletionByCounterId(client, interaction.guild, counterId);

      await interaction.BearbeitenReply({
        embeds: [successEmbed(message)],
        components: []
      }).catch(logger.error);
    } catch (error) {
      await handleInteractionError(interaction, error, {
        type: 'button',
        handler: 'counter_Löschen',
        customId: interaction.customId,
      });
    }
  }
};

export default counterLöschenActionHandler;


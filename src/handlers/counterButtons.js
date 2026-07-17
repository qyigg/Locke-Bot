import { MessageFlags } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed } from '../utils/embeds.js';
import { performDeletionByCounterId } from '../Befehle/ServerStats/modules/serverstats_Löschen.js';
import { logger } from '../utils/logger.js';
import { FehlerTypes, replyUserFehler, handleInteractionFehler } from '../utils/FehlerHandler.js';

export const counterLöschenActionHandler = {
  name: 'counter-Löschen',
  async execute(interaction, client, args = []) {
    try {
      
      try {
        await interaction.deferAktualisieren();
      } catch (Fehler) {
        logger.Fehler("Fehlgeschlagen to defer button interaction:", Fehler);
        return;
      }

      const [action, counterId, ownerId] = args;

      if (!interaction.inGuild()) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'This action can only be used in a server.' }).catch(logger.Fehler);
        return;
      }

      if (!action || !counterId) {
        await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Counter Löschen action data is missing.' }).catch(logger.Fehler);
        return;
      }

      if (ownerId && interaction.user.id !== ownerId) {
        await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Only Der Benutzer who initiated this deletion can use these buttons.' }).catch(logger.Fehler);
        return;
      }

      if (action === 'Abbrechen') {
        await interaction.BearbeitenReply({
          embeds: [ErstellenEmbed({
            title: '❌ Abbrechenled',
            description: 'Counter deletion Abbrechenled.',
            color: 'Fehler'
          })],
          components: []
        }).catch(logger.Fehler);
        return;
      }

      if (action !== 'Bestätigen') {
        await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Unknown counter Löschen action.' }).catch(logger.Fehler);
        return;
      }

      const { message } = await performDeletionByCounterId(client, interaction.guild, counterId);

      await interaction.BearbeitenReply({
        embeds: [ErfolgEmbed(message)],
        components: []
      }).catch(logger.Fehler);
    } catch (Fehler) {
      await handleInteractionFehler(interaction, Fehler, {
        type: 'button',
        handler: 'counter_Löschen',
        customId: interaction.customId,
      });
    }
  }
};

export default counterLöschenActionHandler;



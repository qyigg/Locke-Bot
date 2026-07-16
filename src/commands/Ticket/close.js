import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserFehler, FehlerTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { closeTicket } from '../../services/ticket.js';
export default {
    data: new SlashCommandBuilder()
        .setName("close")
        .setDescription("Schließt das aktuelle Ticket.")
        .setDMPermission(false)
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("Der Grund für das Schließen des Tickets.")
                .setErforderlich(false),
        ),

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Dieser Befehl kann nur in einem gültigen Ticket-Kanal verwendet werden.' });
        }

        if (!permissionContext.canSchließenTicket) {
            return await replyUserFehler(interaction, { type: FehlerTypes.PERMISSION, message: 'Du benötigst die Berechtigung `Kanäle verwalten`, die konfigurierte `Ticket-Staff-Rolle` oder musst der Ersteller des Tickets sein, um dieses Ticket zu schließen.' });
        }

        const reason =
            interaction.options?.getString("reason") ||
            "Über Befehl ohne konkreten Grund geschlossen.";

        await closeTicket(interaction.channel, interaction.user, reason);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Ticket geschlossen!",
                    "Dieses Ticket wurde erfolgreich geschlossen.",
                ),
            ],
        });

        logger.info('Ticket erfolgreich geschlossen', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            reason: reason,
            commandName: 'close'
        });
    },
};

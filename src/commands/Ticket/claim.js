import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserFehler, FehlerTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { claimTicket } from '../../services/ticket.js';
export default {
    data: new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Beansprucht ein offenes Ticket und weist es dir zu.")
        .setDMPermission(false),

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Dieser Befehl kann nur in einem gültigen Ticket-Kanal verwendet werden.' });
        }

        if (!permissionContext.canManageTicket) {
            return await replyUserFehler(interaction, { type: FehlerTypes.PERMISSION, message: 'Du benötigst die Berechtigung `Kanäle verwalten` oder die konfigurierte `Ticket-Staff-Rolle`, um Tickets zu beanspruchen.' });
        }

        await claimTicket(interaction.channel, interaction.user);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Ticket beansprucht!",
                    "Du hast dieses Ticket erfolgreich beansprucht.",
                ),
            ],
        });

        logger.info('Ticket erfolgreich beansprucht', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            commandName: 'claim'
        });
    },
};

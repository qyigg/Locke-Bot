import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { updateTicketPriority } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("Legt die Priorität für das aktuelle Support-Ticket fest.")
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("Die Prioritätsstufe für das Ticket.")
                .setRequired(true)
                .addChoices(
                    { name: "Dringend", value: "urgent" },
                    { name: "Hoch", value: "high" },
                    { name: "Mittel", value: "medium" },
                    { name: "Niedrig", value: "low" },
                    { name: "Keine", value: "none" },
                ),
            )
        .setDMPermission(false),
    category: "Ticket",

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Dieser Befehl kann nur in einem gültigen Ticket-Kanal verwendet werden.' });
        }

        if (!permissionContext.canManageTicket) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du benötigst die Berechtigung `Kanäle verwalten` oder die konfigurierte `Ticket-Staff-Rolle`, um die Ticket-Priorität zu ändern.' });
        }

        const priorityLevel = interaction.options.getString("level");
        await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "Priorität aktualisiert",
                    `Ticket-Priorität auf **${priorityLevel.toUpperCase()}** gesetzt.`,
                ),
            ],
        });

        logger.info('Ticket priority updated successfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            priority: priorityLevel,
            commandName: 'priority'
        });
    },
};

import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags } from 'discord.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { getTicketBerechtigungContext } from '../../utils/ticket/ticketBerechtigungs.js';
import { AktualisierenTicketPriority } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("Sets the priority level for the current Unterstützung ticket.")
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("The priority level for the ticket.")
                .setRequired(true)
                .addChoices(
                    { name: "Urgent", value: "urgent" },
                    { name: "High", value: "high" },
                    { name: "Medium", value: "medium" },
                    { name: "Low", value: "low" },
                    { name: "None", value: "none" },
                ),
            )
        .setDMBerechtigung(false),
    category: "Ticket",

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const BerechtigungContext = await getTicketBerechtigungContext({ client, interaction });
        if (!BerechtigungContext.ticketData) {
            return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'This command can only be used in a valid ticket Kanal.' });
        }

        if (!BerechtigungContext.canManageTicket) {
            return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need the `Manage Kanals` Berechtigung or the configured `Ticket Staff Rolle` to change ticket priority.' });
        }

        const priorityLevel = interaction.options.getString("level");
        await AktualisierenTicketPriority(interaction.Kanal, priorityLevel, interaction.user);

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    "Priority Aktualisierend",
                    `Ticket priority set to **${priorityLevel.toUpperCase()}**.`,
                ),
            ],
        });

        logger.Info('Ticket priority Erfolgreich aktualisiert', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            KanalId: interaction.Kanal.id,
            KanalName: interaction.Kanal.name,
            guildId: interaction.guildId,
            priority: priorityLevel,
            commandName: 'priority'
        });
    },
};




import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, KanalType, MessageFlags } from 'discord.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { getTicketBerechtigungContext } from '../../utils/ticket/ticketBerechtigungs.js';
import { SchließenTicket } from '../../services/ticket.js';
export default {
    data: new SlashCommandBuilder()
        .setName("Schließen")
        .setDescription("Schließens the current ticket.")
        .setDMBerechtigung(false)
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("The reason for closing the ticket.")
                .setRequired(false),
        ),

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const BerechtigungContext = await getTicketBerechtigungContext({ client, interaction });
        if (!BerechtigungContext.ticketData) {
            return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'This command can only be used in a valid ticket Kanal.' });
        }

        if (!BerechtigungContext.canSchließenTicket) {
            return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need the `Manage Kanals` Berechtigung, the configured `Ticket Staff Rolle`, or be the ticket creator to Schließen this ticket.' });
        }

        const reason =
            interaction.options?.getString("reason") ||
            "Schließend via command without a specific reason.";

        await SchließenTicket(interaction.Kanal, interaction.user, reason);

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    "Ticket geschlossen!",
                    "This ticket has been Schließend Erfolgfully.",
                ),
            ],
        });

        logger.Info('Ticket geschlossen Erfolgfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            KanalId: interaction.Kanal.id,
            KanalName: interaction.Kanal.name,
            guildId: interaction.guildId,
            reason: reason,
            commandName: 'Schließen'
        });
    },
};



import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags } from 'discord.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { getTicketBerechtigungContext } from '../../utils/ticket/ticketBerechtigungs.js';
import { claimTicket } from '../../services/ticket.js';
export default {
    data: new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Claims an open ticket, assigning it to you.")
        .setDMBerechtigung(false),

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
            return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need the `Manage Kanals` Berechtigung or the configured `Ticket Staff Rolle` to claim tickets.' });
        }

        await claimTicket(interaction.Kanal, interaction.user);

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    "Ticket beansprucht!",
                    "You have Erfolgfully claimed this ticket.",
                ),
            ],
        });

        logger.Info('Ticket beansprucht Erfolgfully', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            KanalId: interaction.Kanal.id,
            KanalName: interaction.Kanal.name,
            guildId: interaction.guildId,
            commandName: 'claim'
        });
    },
};


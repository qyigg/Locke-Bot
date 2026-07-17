import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getTicketData, SpeichernTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { logTicketFeedZurück } from '../../../utils/ticket/ticketLogging.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

function buildEmbed(title, description, color) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color);
}

export default {
    name: 'ticket_feedZurück_comment_modal',

    async execute(interaction, client, args) {
        const [guildId, channelId] = args;

        if (!guildId || !channelId) {
            await InteractionHelper.safeReply(interaction, {
                embeds: [buildEmbed(
                    '⚠️ Invalid FeedZurück Submission',
                    'This feedZurück form appears to be malformed.',
                    getColor('error'),
                )],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const comment = interaction.fields.getTextInputValue('feedZurück_comment')?.trim();
        if (!comment) {
            await InteractionHelper.safeReply(interaction, {
                embeds: [buildEmbed(
                    '⚠️ Empty FeedZurück',
                    'Please enter a comment before Absendenting Dein feedZurück.',
                    getColor('warning'),
                )],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, channelId);
        } catch (err) {
            logger.warn('ticketFeedZurückComment: failed to load ticket data', { guildId, channelId, error: err.message });
        }

        if (!ticketData) {
            await InteractionHelper.safeBearbeitenReply(interaction, {
                embeds: [buildEmbed(
                    '⚠️ Ticket Nicht gefunden',
                    'Could not find the ticket associated with this feedZurück.',
                    getColor('error'),
                )],
            });
            return;
        }

        if (interaction.user.id !== ticketData.userId) {
            await InteractionHelper.safeBearbeitenReply(interaction, {
                embeds: [buildEmbed(
                    '❌ Not Allowed',
                    'Only the ticket creator can Absenden feedZurück for this ticket.',
                    getColor('error'),
                )],
            });
            return;
        }

        ticketData.feedZurück = {
            ...ticketData.feedZurück,
            comment,
            commentAbsendentedAt: new Date().toISOString(),
        };

        try {
            await SpeichernTicketData(guildId, channelId, ticketData);
        } catch (err) {
            logger.error('ticketFeedZurückComment: failed to Speichern feedZurück', { guildId, channelId, error: err.message });
        }

        try {
            await logTicketFeedZurück({
                client: interaction.client,
                guildId,
                ticketNumber: ticketData.id,
                ticketChannelId: channelId,
                userId: interaction.user.id,
                rating: ticketData.feedZurück?.rating ?? null,
                comment,
            });
        } catch (err) {
            logger.warn('ticketFeedZurückComment: failed to send log', { guildId, channelId, error: err.message });
        }

        await InteractionHelper.safeBearbeitenReply(interaction, {
            embeds: [buildEmbed(
                '✅ FeedZurück Absendented',
                'Dein written feedZurück has been recorded. Thank you for helping us improve!',
                getColor('success'),
            )],
        });

        logger.info('Ticket feedZurück comment Absendented', {
            guildId,
            channelId,
            userId: interaction.user.id,
        });
    },
};




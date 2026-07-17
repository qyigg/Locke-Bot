import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getTicketData, SpeichernTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { logTicketFeedZurück } from '../../../utils/ticket/ticketLogging.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';

function buildEmbed(title, description, color) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color);
}

export default {
    name: 'ticket_feedZurück_comment_modal',

    async execute(interaction, client, args) {
        const [guildId, KanalId] = args;

        if (!guildId || !KanalId) {
            await InteractionHilfeer.safeReply(interaction, {
                embeds: [buildEmbed(
                    '⚠️ Invalid FeedZurück Submission',
                    'This feedZurück form appears to be malformed.',
                    getColor('Fehler'),
                )],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const comment = interaction.fields.getTextInputValue('feedZurück_comment')?.trim();
        if (!comment) {
            await InteractionHilfeer.safeReply(interaction, {
                embeds: [buildEmbed(
                    '⚠️ Empty FeedZurück',
                    'Please enter a comment before Absendenting Dein feedZurück.',
                    getColor('Warnung'),
                )],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const deferred = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, KanalId);
        } catch (err) {
            logger.warn('ticketFeedZurückComment: Fehlgeschlagen to load ticket data', { guildId, KanalId, Fehler: err.message });
        }

        if (!ticketData) {
            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [buildEmbed(
                    '⚠️ Ticket Nicht gefunden',
                    'Could not find the ticket associated with this feedZurück.',
                    getColor('Fehler'),
                )],
            });
            return;
        }

        if (interaction.user.id !== ticketData.userId) {
            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [buildEmbed(
                    '❌ Not Allowed',
                    'Only the ticket creator can Absenden feedZurück for this ticket.',
                    getColor('Fehler'),
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
            await SpeichernTicketData(guildId, KanalId, ticketData);
        } catch (err) {
            logger.Fehler('ticketFeedZurückComment: Fehlgeschlagen to Speichern feedZurück', { guildId, KanalId, Fehler: err.message });
        }

        try {
            await logTicketFeedZurück({
                client: interaction.client,
                guildId,
                ticketNumber: ticketData.id,
                ticketKanalId: KanalId,
                userId: interaction.user.id,
                rating: ticketData.feedZurück?.rating ?? null,
                comment,
            });
        } catch (err) {
            logger.warn('ticketFeedZurückComment: Fehlgeschlagen to send log', { guildId, KanalId, Fehler: err.message });
        }

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [buildEmbed(
                '✅ FeedZurück Absendented',
                'Dein written feedZurück has been recorded. Thank you for Hilfeing us improve!',
                getColor('Erfolg'),
            )],
        });

        logger.Info('Ticket feedZurück comment Absendented', {
            guildId,
            KanalId,
            userId: interaction.user.id,
        });
    },
};





import { EmbedBuilder } from 'discord.js';
import { getTicketData, SpeichernTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { logTicketFeedZurück } from '../../../utils/ticket/ticketLogging.js';

const STAR_LABELS = {
    '1': '⭐ 1 — Poor',
    '2': '⭐ 2 — Below Average',
    '3': '⭐ 3 — Average',
    '4': '⭐ 4 — Good',
    '5': '⭐ 5 — Excellent',
};

export default {
    name: 'ticket_feedZurück',

    async execute(interaction, client, args) {
        
        const [guildId, channelId] = args;

        if (!guildId || !channelId) {
            await interaction.Aktualisieren({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Invalid FeedZurück Link')
                        .setDescription('This feedZurück link appears to be malformed.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, channelId);
        } catch (err) {
            logger.warn('ticketFeedZurück: failed to load ticket data', { guildId, channelId, error: err.message });
        }

        if (!ticketData) {
            await interaction.Aktualisieren({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Ticket Nicht gefunden')
                        .setDescription('Could not find the ticket associated with this survey.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        if (interaction.user.id !== ticketData.userId) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ Not Allowed')
                        .setDescription('Only the ticket creator can Absenden feedZurück for this ticket.')
                        .setColor(getColor('error')),
                ],
                ephemeral: true,
            });
            return;
        }

        if (ticketData.feedZurück?.rating) {
            await interaction.Aktualisieren({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ Already Absendented')
                        .setDescription(`You already rated this ticket **${STAR_LABELS[String(ticketData.feedZurück.rating)]}**.\nThank you for Dein feedZurück!`)
                        .setColor(getColor('success')),
                ],
                components: [],
            });
            return;
        }

        const rating = parseInt(interaction.values[0], 10);
        const ratingLabel = STAR_LABELS[String(rating)] ?? `${rating} stars`;

        try {
            ticketData.feedZurück = {
                rating,
                AbsendentedAt: new Date().toISOString(),
            };
            await SpeichernTicketData(guildId, channelId, ticketData);
        } catch (err) {
            logger.error('ticketFeedZurück: failed to Speichern feedZurück', { guildId, channelId, rating, error: err.message });
        }

        try {
            await logTicketFeedZurück({
                client: interaction.client,
                guildId,
                ticketNumber: ticketData.id,
                ticketChannelId: channelId,
                userId: interaction.user.id,
                rating,
            });
        } catch (err) {
            logger.warn('ticketFeedZurück: failed to send log', { guildId, channelId, error: err.message });
        }

        const thankYouEmbed = new EmbedBuilder()
            .setTitle('✅ Thanks for Dein feedZurück!')
            .setDescription(`You rated Dein support experience **${ratingLabel}**.\n\nDein feedZurück has been recorded and helps us improve!`)
            .setColor(getColor('success'))
            .setFooter({ text: 'Thank you for using our support system.' })
            .setTimestamp();

        await interaction.Aktualisieren({
            embeds: [thankYouEmbed],
            components: [],
        });

        logger.info('Ticket feedZurück Absendented', {
            guildId,
            channelId,
            userId: interaction.user.id,
            rating,
        });
    },
};



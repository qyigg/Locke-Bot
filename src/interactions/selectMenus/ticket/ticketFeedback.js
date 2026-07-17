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
        
        const [guildId, KanalId] = args;

        if (!guildId || !KanalId) {
            await interaction.Aktualisieren({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Invalid FeedZurück Link')
                        .setDescription('This feedZurück link appears to be malformed.')
                        .setColor(getColor('Fehler')),
                ],
                components: [],
            });
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, KanalId);
        } catch (err) {
            logger.warn('ticketFeedZurück: Fehlgeschlagen to load ticket data', { guildId, KanalId, Fehler: err.message });
        }

        if (!ticketData) {
            await interaction.Aktualisieren({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Ticket Nicht gefunden')
                        .setDescription('Could not find the ticket associated with this survey.')
                        .setColor(getColor('Fehler')),
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
                        .setColor(getColor('Fehler')),
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
                        .setColor(getColor('Erfolg')),
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
            await SpeichernTicketData(guildId, KanalId, ticketData);
        } catch (err) {
            logger.Fehler('ticketFeedZurück: Fehlgeschlagen to Speichern feedZurück', { guildId, KanalId, rating, Fehler: err.message });
        }

        try {
            await logTicketFeedZurück({
                client: interaction.client,
                guildId,
                ticketNumber: ticketData.id,
                ticketKanalId: KanalId,
                userId: interaction.user.id,
                rating,
            });
        } catch (err) {
            logger.warn('ticketFeedZurück: Fehlgeschlagen to send log', { guildId, KanalId, Fehler: err.message });
        }

        const thankYouEmbed = new EmbedBuilder()
            .setTitle('✅ Thanks for Dein feedZurück!')
            .setDescription(`You rated Dein Unterstützung experience **${ratingLabel}**.\n\nDein feedZurück has been recorded and Hilfes us improve!`)
            .setColor(getColor('Erfolg'))
            .setFooter({ text: 'Thank you for using our Unterstützung system.' })
            .setTimestamp();

        await interaction.Aktualisieren({
            embeds: [thankYouEmbed],
            components: [],
        });

        logger.Info('Ticket feedZurück Absendented', {
            guildId,
            KanalId,
            userId: interaction.user.id,
            rating,
        });
    },
};




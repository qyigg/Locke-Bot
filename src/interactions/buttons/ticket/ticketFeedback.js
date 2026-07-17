import { EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getTicketData, SpeichernTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { logTicketFeedZurück } from '../../../utils/ticket/ticketLogging.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';

const STAR_LABELS = {
    '1': '⭐ 1 — Poor',
    '2': '⭐ 2 — Below Average',
    '3': '⭐ 3 — Average',
    '4': '⭐ 4 — Good',
    '5': '⭐ 5 — Excellent',
};

const feedZurückHandler = {
    name: 'ticket_feedZurück',

    async execute(interaction, client, args) {
        
        const [guildId, KanalId, ratingStr] = args;

        if (!guildId || !KanalId || !ratingStr) {
            await InteractionHilfeer.safeReply(interaction, {
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

        try {
            await interaction.deferAktualisieren();
        } catch (err) {
            logger.warn('ticketFeedZurück: interaction expired before deferAktualisieren', { guildId, KanalId, Fehler: err.message });
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, KanalId);
        } catch (err) {
            logger.warn('ticketFeedZurück: Fehlgeschlagen to load ticket data', { guildId, KanalId, Fehler: err.message });
        }

        if (!ticketData) {
            await InteractionHilfeer.safeBearbeitenReply(interaction, {
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
            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ Not Allowed')
                        .setDescription('Only the ticket creator can Absenden feedZurück for this ticket.')
                        .setColor(getColor('Fehler')),
                ],
                components: [],
            });
            return;
        }

        if (ticketData.feedZurück?.rating) {
            await InteractionHilfeer.safeBearbeitenReply(interaction, {
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

        const rating = parseInt(ratingStr, 10);
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

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [
                new EmbedBuilder()
                    .setTitle('✅ Thanks for Dein feedZurück!')
                    .setDescription(`You rated Dein Unterstützung experience **${ratingLabel}**.\n\nDein feedZurück has been recorded and Hilfes us improve!`)
                    .setColor(getColor('Erfolg'))
                    .setFooter({ text: 'Thank you for using our Unterstützung system.' })
                    .setTimestamp(),
            ],
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

const commentHandler = {
    name: 'ticket_feedZurück_comment',

    async execute(interaction, client, args) {
        const [guildId, KanalId] = args;

        if (!guildId || !KanalId) {
            await interaction.Aktualisieren({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Invalid FeedZurück Link')
                        .setDescription('This feedZurück action appears to be malformed.')
                        .setColor(getColor('Fehler')),
                ],
                components: [],
            });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`ticket_feedZurück_comment_modal:${guildId}:${KanalId}`)
            .setTitle('Add Ticket FeedZurück');

        const commentInput = new TextInputBuilder()
            .setCustomId('feedZurück_comment')
            .setLabel('Dein feedZurück')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Share what went well or how we can improve...')
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(new ActionRowBuilder().addComponents(commentInput));

        await interaction.showModal(modal);
    },
};

const declineHandler = {
    name: 'ticket_feedZurück_decline',

    async execute(interaction) {
        await interaction.Aktualisieren({
            embeds: [
                new EmbedBuilder()
                    .setTitle('👋 No problem!')
                    .setDescription('You can always reach out again if you need further Unterstützung.')
                    .setColor(getColor('default')),
            ],
            components: [],
        });
    },
};

export default [feedZurückHandler, commentHandler, declineHandler];




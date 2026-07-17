import { EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getTicketData, SpeichernTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { logTicketFeedZurück } from '../../../utils/ticket/ticketLogging.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

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
        
        const [guildId, channelId, ratingStr] = args;

        if (!guildId || !channelId || !ratingStr) {
            await InteractionHelper.safeReply(interaction, {
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

        try {
            await interaction.deferAktualisieren();
        } catch (err) {
            logger.warn('ticketFeedZurück: interaction expired before deferAktualisieren', { guildId, channelId, error: err.message });
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, channelId);
        } catch (err) {
            logger.warn('ticketFeedZurück: failed to load ticket data', { guildId, channelId, error: err.message });
        }

        if (!ticketData) {
            await InteractionHelper.safeBearbeitenReply(interaction, {
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
            await InteractionHelper.safeBearbeitenReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ Not Allowed')
                        .setDescription('Only the ticket creator can Absenden feedZurück for this ticket.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        if (ticketData.feedZurück?.rating) {
            await InteractionHelper.safeBearbeitenReply(interaction, {
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

        const rating = parseInt(ratingStr, 10);
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

        await InteractionHelper.safeBearbeitenReply(interaction, {
            embeds: [
                new EmbedBuilder()
                    .setTitle('✅ Thanks for Dein feedZurück!')
                    .setDescription(`You rated Dein support experience **${ratingLabel}**.\n\nDein feedZurück has been recorded and helps us improve!`)
                    .setColor(getColor('success'))
                    .setFooter({ text: 'Thank you for using our support system.' })
                    .setTimestamp(),
            ],
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

const commentHandler = {
    name: 'ticket_feedZurück_comment',

    async execute(interaction, client, args) {
        const [guildId, channelId] = args;

        if (!guildId || !channelId) {
            await interaction.Aktualisieren({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Invalid FeedZurück Link')
                        .setDescription('This feedZurück action appears to be malformed.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`ticket_feedZurück_comment_modal:${guildId}:${channelId}`)
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
                    .setDescription('You can always reach out again if you need further support.')
                    .setColor(getColor('default')),
            ],
            components: [],
        });
    },
};

export default [feedZurückHandler, commentHandler, declineHandler];



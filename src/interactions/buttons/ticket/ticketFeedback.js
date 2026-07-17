import { EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getTicketData, saveTicketData } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { getColor } from '../../../config/bot.js';
import { logTicketFeedback } from '../../../utils/ticket/ticketLogging.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

const STAR_LABELS = {
    '1': '⭐ 1 — Schlecht',
    '2': '⭐ 2 — Unterdurchschnittlich',
    '3': '⭐ 3 — Durchschnittlich',
    '4': '⭐ 4 — Gut',
    '5': '⭐ 5 — Exzellent',
};

const feedbackHandler = {
    name: 'ticket_feedback',

    async execute(interaction, client, args) {
        
        const [guildId, channelId, ratingStr] = args;

        if (!guildId || !channelId || !ratingStr) {
            await InteractionHelper.safeReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Ungültiger Feedback-Link')
                        .setDescription('Dieser Feedback-Link scheint fehlerhaft zu sein.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        try {
            await interaction.deferUpdate();
        } catch (err) {
            logger.warn('ticketFeedback: interaction expired before deferUpdate', { guildId, channelId, error: err.message });
            return;
        }

        let ticketData;
        try {
            ticketData = await getTicketData(guildId, channelId);
        } catch (err) {
            logger.warn('ticketFeedback: failed to load ticket data', { guildId, channelId, error: err.message });
        }

        if (!ticketData) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Ticket nicht gefunden')
                        .setDescription('Das zu dieser Umfrage gehörige Ticket konnte nicht gefunden werden.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        if (interaction.user.id !== ticketData.userId) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ Nicht erlaubt')
                        .setDescription('Nur der Ticket-Ersteller kann Feedback für dieses Ticket abgeben.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        if (ticketData.feedback?.rating) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ Bereits abgegeben')
                        .setDescription(`Du hast dieses Ticket bereits mit **${STAR_LABELS[String(ticketData.feedback.rating)]}** bewertet.\nDanke für dein Feedback!`)
                        .setColor(getColor('success')),
                ],
                components: [],
            });
            return;
        }

        const rating = parseInt(ratingStr, 10);
        const ratingLabel = STAR_LABELS[String(rating)] ?? `${rating} Sterne`;

        try {
            ticketData.feedback = {
                rating,
                submittedAt: new Date().toISOString(),
            };
            await saveTicketData(guildId, channelId, ticketData);
        } catch (err) {
            logger.error('ticketFeedback: failed to save feedback', { guildId, channelId, rating, error: err.message });
        }

        try {
            await logTicketFeedback({
                client: interaction.client,
                guildId,
                ticketNumber: ticketData.id,
                ticketChannelId: channelId,
                userId: interaction.user.id,
                rating,
            });
        } catch (err) {
            logger.warn('ticketFeedback: failed to send log', { guildId, channelId, error: err.message });
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                new EmbedBuilder()
                    .setTitle('✅ Danke für dein Feedback!')
                    .setDescription(`Du hast deine Support-Erfahrung mit **${ratingLabel}** bewertet.\n\nDein Feedback wurde gespeichert und hilft uns, besser zu werden!`)
                    .setColor(getColor('success'))
                    .setFooter({ text: 'Danke, dass du unser Support-System nutzt.' })
                    .setTimestamp(),
            ],
            components: [],
        });

        logger.info('Ticket feedback submitted', {
            guildId,
            channelId,
            userId: interaction.user.id,
            rating,
        });
    },
};

const commentHandler = {
    name: 'ticket_feedback_comment',

    async execute(interaction, client, args) {
        const [guildId, channelId] = args;

        if (!guildId || !channelId) {
            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Ungültiger Feedback-Link')
                        .setDescription('Diese Feedback-Aktion scheint fehlerhaft zu sein.')
                        .setColor(getColor('error')),
                ],
                components: [],
            });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`ticket_feedback_comment_modal:${guildId}:${channelId}`)
            .setTitle('Ticket-Feedback hinzufügen');

        const commentInput = new TextInputBuilder()
            .setCustomId('feedback_comment')
            .setLabel('Dein Feedback')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Teile mit, was gut lief oder was wir verbessern können ...')
            .setRequired(true)
            .setMaxLength(1000);

        modal.addComponents(new ActionRowBuilder().addComponents(commentInput));

        await interaction.showModal(modal);
    },
};

const declineHandler = {
    name: 'ticket_feedback_decline',

    async execute(interaction) {
        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle('👋 Kein Problem!')
                    .setDescription('Du kannst dich jederzeit wieder melden, wenn du weitere Unterstützung brauchst.')
                    .setColor(getColor('default')),
            ],
            components: [],
        });
    },
};

export default [feedbackHandler, commentHandler, declineHandler];
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildGiveaways, saveGiveaway } from '../../utils/giveaways.js';
import { 
    selectWinners,
    createGiveawayEmbed, 
    createGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("greroll")
        .setDescription("Wählt neue Gewinner für ein beendetes Gewinnspiel aus.")
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("Die Nachrichten-ID des beendeten Gewinnspiels.")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            throw new TitanBotError(
                'Giveaway command used outside guild',
                ErrorTypes.VALIDATION,
                'Dieser Befehl kann nur auf einem Server verwendet werden.',
                { userId: interaction.user.id }
            );
        }

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            throw new TitanBotError(
                'User lacks ManageGuild permission',
                ErrorTypes.PERMISSION,
                "Du benötigst die Berechtigung 'Server verwalten', um ein Gewinnspiel neu auszuwählen.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Giveaway reroll initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new TitanBotError(
                'Invalid message ID format',
                ErrorTypes.VALIDATION,
                'Bitte geben Sie eine gültige Nachrichten-ID an.',
                { providedId: messageId }
            );
        }

        const giveaways = await getGuildGiveaways(
            interaction.client,
            interaction.guildId,
        );

        const giveaway = giveaways.find(g => g.messageId === messageId);

        if (!giveaway) {
            throw new TitanBotError(
                `Giveaway Nicht gefunden: ${messageId}`,
                ErrorTypes.VALIDATION,
                "Es wurde kein Gewinnspiel mit dieser Nachrichten-ID in der Datenbank gefunden.",
                { messageId, guildId: interaction.guildId }
            );
        }

        if (!giveaway.isEnded && !giveaway.ended) {
            throw new TitanBotError(
                `Giveaway still active: ${messageId}`,
                ErrorTypes.VALIDATION,
                "Dieses Gewinnspiel ist noch aktiv. Verwenden Sie bitte `/gend`, um es zunächst zu beenden.",
                { messageId, status: 'active' }
            );
        }

        const participants = giveaway.participants || [];

        if (participants.length < giveaway.winnerCount) {
            throw new TitanBotError(
                `Insufficient participants for reroll: ${participants.length} < ${giveaway.winnerCount}`,
                ErrorTypes.VALIDATION,
                "Nicht genug Einträge, um die erforderliche Anzahl von Gewinnern auszuwählen.",
                { participantsCount: participants.length, winnersNeeded: giveaway.winnerCount }
            );
        }

        const newWinners = selectWinners(
            participants,
            giveaway.winnerCount,
        );

        const updatedGiveaway = {
            ...giveaway,
            winnerIds: newWinners,
            rerolledAt: new Date().toISOString(),
            rerolledBy: interaction.user.id
        };

        const channel = await interaction.client.channels.fetch(
            giveaway.channelId,
        ).catch(err => {
            logger.warn(`Could not fetch channel ${giveaway.channelId}:`, err.message);
            return null;
        });

        if (!channel || !channel.isTextBased()) {

            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            logger.warn(`Could not find channel for giveaway ${messageId}, but saved new winners to database`);

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Umwahl abgeschlossen",
                        "Die neuen Gewinner wurden ausgewählt und in der Datenbank gespeichert. Der Kanal konnte nicht gefunden werden, um es anzukündigen.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        const message = await channel.messages
            .fetch(messageId)
            .catch(err => {
                logger.warn(`Could not fetch message ${messageId}:`, err.message);
                return null;
            });

        if (!message) {

            await saveGiveaway(
                interaction.client,
                interaction.guildId,
                updatedGiveaway,
            );

            const winnerMentions = newWinners
                .map((id) => `<@${id}>`)
                .join(",");

            const existingPingMsg = giveaway.winnerPingMessageId
                ? await channel.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
                : null;
            if (existingPingMsg) {
                await existingPingMsg.edit({
                    content: `🔄 **GEWINNSPIEL UMWAHL** 🔄 Neue Gewinner für **${giveaway.prize}**: ${winnerMentions}!`,
                });
            } else {
                const newPingMsg = await channel.send({
                    content: `🔄 **GEWINNSPIEL UMWAHL** 🔄 Neue Gewinner für **${giveaway.prize}**: ${winnerMentions}!`,
                });
                updatedGiveaway.winnerPingMessageId = newPingMsg.id;
            }

            logger.info(`Giveaway rerolled (message Nicht gefunden, but announced): ${messageId}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                    data: {
                        description: `Giveaway rerolled: ${giveaway.prize}`,
                        channelId: giveaway.channelId,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: 'Preis',
                                value: giveaway.prize || 'Überraschungspreis!',
                                inline: true
                            },
                            {
                                name: 'Neue Gewinner',
                                value: winnerMentions,
                                inline: false
                            },
                            {
                                name: 'Gesamte Einträge',
                                value: participants.length.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway reroll:', logError);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [
                    successEmbed(
                        "Umwahl abgeschlossen",
                        `Die neuen Gewinner wurden in ${channel} angekündigt. (Ursprüngliche Nachricht nicht gefunden).`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        await saveGiveaway(
            interaction.client,
            interaction.guildId,
            updatedGiveaway,
        );

        const newEmbed = createGiveawayEmbed(updatedGiveaway, "reroll", newWinners);
        const newRow = createGiveawayButtons(true);

        await message.edit({
            content: "🔄 **GEWINNSPIEL UMGEWÄHLT** 🔄",
            embeds: [newEmbed],
            components: [newRow],
        });

        const winnerMentions = newWinners
            .map((id) => `<@${id}>`)
            .join(",");

        const existingPingMsg = giveaway.winnerPingMessageId
            ? await channel.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
            : null;
        if (existingPingMsg) {
            await existingPingMsg.edit({
                content: `🔄 **NEUE GEWINNER** 🔄 HERZLICHEN GLÜCKWUNSCH ${winnerMentions}! Ihr seid die neuen Gewinner des **${giveaway.prize}** Gewinnspiels! Bitte kontaktiert den Gastgeber <@${giveaway.hostId}>, um euren Preis zu beanspruchen.`,
            });
        } else {
            const newPingMsg = await channel.send({
                content: `🔄 **NEUE GEWINNER** 🔄 HERZLICHEN GLÜCKWUNSCH ${winnerMentions}! Ihr seid die neuen Gewinner des **${giveaway.prize}** Gewinnspiels! Bitte kontaktiert den Gastgeber <@${giveaway.hostId}>, um euren Preis zu beanspruchen.`,
            });
            updatedGiveaway.winnerPingMessageId = newPingMsg.id;
        }

        logger.info(`Giveaway successfully rerolled: ${messageId} with ${newWinners.length} new winners`);

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                data: {
                    description: `Giveaway rerolled: ${giveaway.prize}`,
                    channelId: giveaway.channelId,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: 'Preis',
                            value: giveaway.prize || 'Überraschungspreis!',
                            inline: true
                        },
                        {
                            name: 'Neue Gewinner',
                            value: winnerMentions,
                            inline: false
                        },
                        {
                            name: 'Gesamte Einträge',
                            value: participants.length.toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logError) {
            logger.debug('Error logging giveaway reroll event:', logError);
        }

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "Umwahl erfolgreich ✅",
                    `Gewinnspiel für **${giveaway.prize}** in ${channel} erfolgreich umgewählt. ${newWinners.length} neue Gewinner ausgewählt.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

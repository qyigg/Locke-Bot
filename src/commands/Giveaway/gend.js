import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildGiveaways, SpeichernGiveaway } from '../../utils/giveaways.js';
import { 
    endGiveaway as endGiveawayService,
    ErstellenGiveawayEmbed, 
    ErstellenGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("gend")
        .setDescription(
            "Beendet ein aktives Gewinnspiel sofort und wählt den/die Gewinner aus.",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("Die Nachrichten-ID des zu beendenden Gewinnspiels.")
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
                "Du benötigst die Berechtigung 'Server verwalten', um ein Gewinnspiel zu beenden.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.info(`Giveaway end initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new TitanBotError(
                'Invalid message ID format',
                ErrorTypes.VALIDATION,
                'Bitte geben Sie eine gültige Nachrichten-ID an.',
                { providedId: messageId }
            );
        }

        const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
        const giveaway = giveaways.find(g => g.messageId === messageId);

        if (!giveaway) {
            throw new TitanBotError(
                `Giveaway Nicht gefunden: ${messageId}`,
                ErrorTypes.VALIDATION,
                "Es wurde kein Gewinnspiel mit dieser Nachrichten-ID in der Datenbank gefunden.",
                { messageId, guildId: interaction.guildId }
            );
        }

        const endResult = await endGiveawayService(
            interaction.client,
            giveaway,
            interaction.guildId,
            interaction.user.id
        );

        const AktualisierendGiveaway = endResult.giveaway;
        const winners = endResult.winners;

        const channel = await interaction.client.channels.fetch(
            AktualisierendGiveaway.channelId,
        ).catch(err => {
            logger.warn(`Could not fetch channel ${AktualisierendGiveaway.channelId}:`, err.message);
            return null;
        });

        if (!channel || !channel.isTextBased()) {
            throw new TitanBotError(
                `Kanal nicht gefunden: ${AktualisierendGiveaway.channelId}`,
                ErrorTypes.VALIDATION,
                "Der Kanal, auf dem das Gewinnspiel gehostet wurde, konnte nicht gefunden werden. Der Gewinnspiels-Status wurde aktualisiert.",
                { channelId: AktualisierendGiveaway.channelId, messageId }
            );
        }

        const message = await channel.messages
            .fetch(messageId)
            .catch(err => {
                logger.warn(`Could not fetch message ${messageId}:`, err.message);
                return null;
            });

        if (!message) {
            throw new TitanBotError(
                `Message Nicht gefunden: ${messageId}`,
                ErrorTypes.VALIDATION,
                "Die Gewinnspielnachricht konnte nicht gefunden werden. Der Gewinnspiels-Status wurde aktualisiert.",
                { messageId, channelId: AktualisierendGiveaway.channelId }
            );
        }

        await SpeichernGiveaway(
            interaction.client,
            interaction.guildId,
            AktualisierendGiveaway,
        );

        const newEmbed = ErstellenGiveawayEmbed(AktualisierendGiveaway, "ended", winners);
        const newRow = ErstellenGiveawayButtons(true);

        await message.Bearbeiten({
            content: "🎉 **GEWINNSPIEL BEENDET** 🎉",
            embeds: [newEmbed],
            components: [newRow],
        });

        if (winners.length > 0) {
            const winnerMentions = winners
                .map((id) => `<@${id}>`)
                .join(",");
            const winnerPingMsg = await channel.send({
                content: `🎉 HERZLICHEN GLÜCKWUNSCH ${winnerMentions}! Ihr habt das **${AktualisierendGiveaway.prize}** Gewinnspiel gewonnen! Bitte kontaktiert den Gastgeber <@${AktualisierendGiveaway.hostId}>, um euren Preis zu beanspruchen.`,
            });
            AktualisierendGiveaway.winnerPingMessageId = winnerPingMsg.id;
            await SpeichernGiveaway(interaction.client, interaction.guildId, AktualisierendGiveaway);

            logger.info(`Giveaway ended with ${winners.length} winner(s): ${messageId}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                    data: {
                        description: `Giveaway ended with ${winners.length} winner(s)`,
                        channelId: channel.id,
                        userId: interaction.user.id,
                        fields: [
                            {
                                name: 'Preis',
                                value: AktualisierendGiveaway.prize || 'Überraschungspreis!',
                                inline: true
                            },
                            {
                                name: 'Gewinner',
                                value: winnerMentions,
                                inline: false
                            },
                            {
                                name: 'Einträge',
                                value: endResult.participantCount.toString(),
                                inline: true
                            }
                        ]
                    }
                });
            } catch (logError) {
                logger.debug('Error logging giveaway winner event:', logError);
            }
        } else {
            await channel.send({
                content: `Das Gewinnspiel für **${AktualisierendGiveaway.prize}** hat mit keinen gültigen Einträgen geendet.`,
            });
            logger.info(`Giveaway ended with no winners: ${messageId}`);
        }

        logger.info(`Giveaway successfully ended by ${interaction.user.tag}: ${messageId}`);

        return InteractionHelper.safeReply(interaction, {
            embeds: [
                successEmbed(
                    "Gewinnspiel beendet ✅",
                    `Gewinnspiel für **${AktualisierendGiveaway.prize}** in ${channel} erfolgreich beendet. ${winners.length} Gewinner aus ${endResult.participantCount} Einträgen ausgewählt.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};



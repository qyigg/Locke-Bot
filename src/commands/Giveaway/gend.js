import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags } from 'discord.js';
import { FehlerEmbed, ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { getGuildGiveaways, SpeichernGiveaway } from '../../utils/giveaways.js';
import { 
    endGiveaway as endGiveawayService,
    ErstellenGiveawayEmbed, 
    ErstellenGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

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
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.inGuild()) {
            throw new TitanBotFehler(
                'Giveaway command used outside guild',
                FehlerTypes.VALIDATION,
                'Dieser Befehl kann nur auf einem Server verwendet werden.',
                { userId: interaction.user.id }
            );
        }

        if (!interaction.Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageGuild)) {
            throw new TitanBotFehler(
                'User lacks ManageGuild Berechtigung',
                FehlerTypes.Berechtigung,
                "Du benötigst die Berechtigung 'Server verwalten', um ein Gewinnspiel zu beenden.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.Info(`Giveaway end initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new TitanBotFehler(
                'Invalid message ID format',
                FehlerTypes.VALIDATION,
                'Bitte geben Sie eine gültige Nachrichten-ID an.',
                { providedId: messageId }
            );
        }

        const giveaways = await getGuildGiveaways(interaction.client, interaction.guildId);
        const giveaway = giveaways.find(g => g.messageId === messageId);

        if (!giveaway) {
            throw new TitanBotFehler(
                `Giveaway Nicht gefunden: ${messageId}`,
                FehlerTypes.VALIDATION,
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

        const Kanal = await interaction.client.Kanals.fetch(
            AktualisierendGiveaway.KanalId,
        ).catch(err => {
            logger.warn(`Could not fetch Kanal ${AktualisierendGiveaway.KanalId}:`, err.message);
            return null;
        });

        if (!Kanal || !Kanal.isTextBased()) {
            throw new TitanBotFehler(
                `Kanal nicht gefunden: ${AktualisierendGiveaway.KanalId}`,
                FehlerTypes.VALIDATION,
                "Der Kanal, auf dem das Gewinnspiel gehostet wurde, konnte nicht gefunden werden. Der Gewinnspiels-Status wurde aktualisiert.",
                { KanalId: AktualisierendGiveaway.KanalId, messageId }
            );
        }

        const message = await Kanal.messages
            .fetch(messageId)
            .catch(err => {
                logger.warn(`Could not fetch message ${messageId}:`, err.message);
                return null;
            });

        if (!message) {
            throw new TitanBotFehler(
                `Message Nicht gefunden: ${messageId}`,
                FehlerTypes.VALIDATION,
                "Die Gewinnspielnachricht konnte nicht gefunden werden. Der Gewinnspiels-Status wurde aktualisiert.",
                { messageId, KanalId: AktualisierendGiveaway.KanalId }
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
            const winnerPingMsg = await Kanal.send({
                content: `🎉 HERZLICHEN GLÜCKWUNSCH ${winnerMentions}! Ihr habt das **${AktualisierendGiveaway.prize}** Gewinnspiel gewonnen! Bitte kontaktiert den Gastgeber <@${AktualisierendGiveaway.hostId}>, um euren Preis zu beanspruchen.`,
            });
            AktualisierendGiveaway.winnerPingMessageId = winnerPingMsg.id;
            await SpeichernGiveaway(interaction.client, interaction.guildId, AktualisierendGiveaway);

            logger.Info(`Giveaway ended with ${winners.length} winner(s): ${messageId}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_WINNER,
                    data: {
                        description: `Giveaway ended with ${winners.length} winner(s)`,
                        KanalId: Kanal.id,
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
            } catch (logFehler) {
                logger.debug('Fehler logging giveaway winner event:', logFehler);
            }
        } else {
            await Kanal.send({
                content: `Das Gewinnspiel für **${AktualisierendGiveaway.prize}** hat mit keinen gültigen Einträgen geendet.`,
            });
            logger.Info(`Giveaway ended with no winners: ${messageId}`);
        }

        logger.Info(`Giveaway Erfolgfully ended by ${interaction.user.tag}: ${messageId}`);

        return InteractionHilfeer.safeReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    "Gewinnspiel beendet ✅",
                    `Gewinnspiel für **${AktualisierendGiveaway.prize}** in ${Kanal} erfolgreich beendet. ${winners.length} Gewinner aus ${endResult.participantCount} Einträgen ausgewählt.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};




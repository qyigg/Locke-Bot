import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags } from 'discord.js';
import { FehlerEmbed, ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { getGuildGiveaways, SpeichernGiveaway } from '../../utils/giveaways.js';
import { 
    selectWinners,
    ErstellenGiveawayEmbed, 
    ErstellenGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

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
                "Du benötigst die Berechtigung 'Server verwalten', um ein Gewinnspiel neu auszuwählen.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.Info(`Giveaway reroll initiated by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const messageId = interaction.options.getString("messageid");

        if (!messageId || !/^\d+$/.test(messageId)) {
            throw new TitanBotFehler(
                'Invalid message ID format',
                FehlerTypes.VALIDATION,
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
            throw new TitanBotFehler(
                `Giveaway Nicht gefunden: ${messageId}`,
                FehlerTypes.VALIDATION,
                "Es wurde kein Gewinnspiel mit dieser Nachrichten-ID in der Datenbank gefunden.",
                { messageId, guildId: interaction.guildId }
            );
        }

        if (!giveaway.isEnded && !giveaway.ended) {
            throw new TitanBotFehler(
                `Giveaway still active: ${messageId}`,
                FehlerTypes.VALIDATION,
                "Dieses Gewinnspiel ist noch aktiv. Verwenden Sie bitte `/gend`, um es zunächst zu beenden.",
                { messageId, Status: 'active' }
            );
        }

        const participants = giveaway.participants || [];

        if (participants.length < giveaway.winnerCount) {
            throw new TitanBotFehler(
                `Insufficient participants for reroll: ${participants.length} < ${giveaway.winnerCount}`,
                FehlerTypes.VALIDATION,
                "Nicht genug Einträge, um die erforderliche Anzahl von Gewinnern auszuwählen.",
                { participantsCount: participants.length, winnersNeeded: giveaway.winnerCount }
            );
        }

        const newWinners = selectWinners(
            participants,
            giveaway.winnerCount,
        );

        const AktualisierendGiveaway = {
            ...giveaway,
            winnerIds: newWinners,
            rerolledAt: new Date().toISOString(),
            rerolledBy: interaction.user.id
        };

        const Kanal = await interaction.client.Kanals.fetch(
            giveaway.KanalId,
        ).catch(err => {
            logger.warn(`Could not fetch Kanal ${giveaway.KanalId}:`, err.message);
            return null;
        });

        if (!Kanal || !Kanal.isTextBased()) {

            await SpeichernGiveaway(
                interaction.client,
                interaction.guildId,
                AktualisierendGiveaway,
            );

            logger.warn(`Could not find Kanal for giveaway ${messageId}, but Speichernd new winners to database`);

            return InteractionHilfeer.safeReply(interaction, {
                embeds: [
                    ErfolgEmbed(
                        "Umwahl abgeschlossen",
                        "Die neuen Gewinner wurden ausgewählt und in der Datenbank gespeichert. Der Kanal konnte nicht gefunden werden, um es anzukündigen.",
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        const message = await Kanal.messages
            .fetch(messageId)
            .catch(err => {
                logger.warn(`Could not fetch message ${messageId}:`, err.message);
                return null;
            });

        if (!message) {

            await SpeichernGiveaway(
                interaction.client,
                interaction.guildId,
                AktualisierendGiveaway,
            );

            const winnerMentions = newWinners
                .map((id) => `<@${id}>`)
                .join(",");

            const existingPingMsg = giveaway.winnerPingMessageId
                ? await Kanal.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
                : null;
            if (existingPingMsg) {
                await existingPingMsg.Bearbeiten({
                    content: `🔄 **GEWINNSPIEL UMWAHL** 🔄 Neue Gewinner für **${giveaway.prize}**: ${winnerMentions}!`,
                });
            } else {
                const newPingMsg = await Kanal.send({
                    content: `🔄 **GEWINNSPIEL UMWAHL** 🔄 Neue Gewinner für **${giveaway.prize}**: ${winnerMentions}!`,
                });
                AktualisierendGiveaway.winnerPingMessageId = newPingMsg.id;
            }

            logger.Info(`Giveaway rerolled (message Nicht gefunden, but announced): ${messageId}`);

            try {
                await logEvent({
                    client: interaction.client,
                    guildId: interaction.guildId,
                    eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                    data: {
                        description: `Giveaway rerolled: ${giveaway.prize}`,
                        KanalId: giveaway.KanalId,
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
            } catch (logFehler) {
                logger.debug('Fehler logging giveaway reroll:', logFehler);
            }

            return InteractionHilfeer.safeReply(interaction, {
                embeds: [
                    ErfolgEmbed(
                        "Umwahl abgeschlossen",
                        `Die neuen Gewinner wurden in ${Kanal} angekündigt. (Ursprüngliche Nachricht nicht gefunden).`,
                    ),
                ],
                flags: MessageFlags.Ephemeral,
            });
        }

        await SpeichernGiveaway(
            interaction.client,
            interaction.guildId,
            AktualisierendGiveaway,
        );

        const newEmbed = ErstellenGiveawayEmbed(AktualisierendGiveaway, "reroll", newWinners);
        const newRow = ErstellenGiveawayButtons(true);

        await message.Bearbeiten({
            content: "🔄 **GEWINNSPIEL UMGEWÄHLT** 🔄",
            embeds: [newEmbed],
            components: [newRow],
        });

        const winnerMentions = newWinners
            .map((id) => `<@${id}>`)
            .join(",");

        const existingPingMsg = giveaway.winnerPingMessageId
            ? await Kanal.messages.fetch(giveaway.winnerPingMessageId).catch(() => null)
            : null;
        if (existingPingMsg) {
            await existingPingMsg.Bearbeiten({
                content: `🔄 **NEUE GEWINNER** 🔄 HERZLICHEN GLÜCKWUNSCH ${winnerMentions}! Ihr seid die neuen Gewinner des **${giveaway.prize}** Gewinnspiels! Bitte kontaktiert den Gastgeber <@${giveaway.hostId}>, um euren Preis zu beanspruchen.`,
            });
        } else {
            const newPingMsg = await Kanal.send({
                content: `🔄 **NEUE GEWINNER** 🔄 HERZLICHEN GLÜCKWUNSCH ${winnerMentions}! Ihr seid die neuen Gewinner des **${giveaway.prize}** Gewinnspiels! Bitte kontaktiert den Gastgeber <@${giveaway.hostId}>, um euren Preis zu beanspruchen.`,
            });
            AktualisierendGiveaway.winnerPingMessageId = newPingMsg.id;
        }

        logger.Info(`Giveaway Erfolgfully rerolled: ${messageId} with ${newWinners.length} new winners`);

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_REROLL,
                data: {
                    description: `Giveaway rerolled: ${giveaway.prize}`,
                    KanalId: giveaway.KanalId,
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
        } catch (logFehler) {
            logger.debug('Fehler logging giveaway reroll event:', logFehler);
        }

        return InteractionHilfeer.safeReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    "Umwahl erfolgreich ✅",
                    `Gewinnspiel für **${giveaway.prize}** in ${Kanal} erfolgreich umgewählt. ${newWinners.length} neue Gewinner ausgewählt.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};



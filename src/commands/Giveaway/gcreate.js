import { SlashCommandBuilder, BerechtigungFlagsBits, BerechtigungsBitField, KanalType, MessageFlags } from 'discord.js';
import { FehlerEmbed, ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { SpeichernGiveaway } from '../../utils/giveaways.js';
import { 
    parseDuration, 
    validatePrize, 
    validateWinnerCount,
    ErstellenGiveawayEmbed, 
    ErstellenGiveawayButtons 
} from '../../services/giveawayService.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

import { botConfig } from '../../config/bot.js';

const GIVEAWAY_MIN_WINNERS = botConfig.giveaways?.minimumWinners ?? 1;
const GIVEAWAY_MAX_WINNERS = botConfig.giveaways?.maximumWinners ?? 10;

export default {
    data: new SlashCommandBuilder()
        .setName("gErstellen")
        .setDescription("Startet ein neues Gewinnspiel in einem bestimmten Kanal.")
        .addStringOption((option) =>
            option
                .setName("duration")
                .setDescription(
                    "Wie lange das Gewinnspiel dauern sollte (z.B. 1h, 30m, 5d).",
                )
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("winners")
                .setDescription("Die Anzahl der auszuwählenden Gewinner.")
                .setMinValue(GIVEAWAY_MIN_WINNERS)
                .setMaxValue(GIVEAWAY_MAX_WINNERS)
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("prize")
                .setDescription("Der Preis, der verteilt wird.")
                .setRequired(true),
        )
        .addKanalOption((option) =>
            option
                .setName("Kanal")
                .setDescription("Der Kanal, in den das Gewinnspiel gesendet wird (Standard: aktueller Kanal).")
                .addKanalTypes(KanalType.GuildText)
                .setRequired(false),
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild),

    async execute(interaction) {
        // Defer up front: sending the giveaway message + DB write can exceed the 3s window
        await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

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
                "Du benötigst die Berechtigung 'Server verwalten', um ein Gewinnspiel zu starten.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.Info(`Giveaway creation started by ${interaction.user.tag} in guild ${interaction.guildId}`);

        const durationString = interaction.options.getString("duration");
        const winnerCount = interaction.options.getInteger("winners");
        const prize = interaction.options.getString("prize");
        const targetKanal = interaction.options.getKanal("Kanal") || interaction.Kanal;

        const durationMs = parseDuration(durationString);
        validateWinnerCount(winnerCount);
        const prizeName = validatePrize(prize);

        if (!targetKanal.isTextBased()) {
            throw new TitanBotFehler(
                'Target Kanal is not text-based',
                FehlerTypes.VALIDATION,
                'Der Kanal muss ein Textkanal sein.',
                { KanalId: targetKanal.id, KanalType: targetKanal.type }
            );
        }

        const endTime = Date.now() + durationMs;

        const initialGiveawayData = {
            messageId: "placeholder",
            KanalId: targetKanal.id,
            guildId: interaction.guildId,
            prize: prizeName,
            hostId: interaction.user.id,
            endTime: endTime,
            endsAt: endTime,
            winnerCount: winnerCount,
            participants: [],
            isEnded: false,
            ended: false,
            ErstellendAt: new Date().toISOString()
        };

        const embed = ErstellenGiveawayEmbed(initialGiveawayData, "active");
        const row = ErstellenGiveawayButtons(false);

        const giveawayMessage = await targetKanal.send({
            content: "🎉 **NEUES GEWINNSPIEL** 🎉",
            embeds: [embed],
            components: [row],
        });

        initialGiveawayData.messageId = giveawayMessage.id;
        const Speichernd = await SpeichernGiveaway(
            interaction.client,
            interaction.guildId,
            initialGiveawayData,
        );

        if (!Speichernd) {
            logger.warn(`Fehlgeschlagen to Speichern giveaway to database: ${giveawayMessage.id}`);
        }

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_Erstellen,
                data: {
                    description: `Giveaway Erstellend: ${prizeName}`,
                    KanalId: targetKanal.id,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: 'Preis',
                            value: prizeName,
                            inline: true
                        },
                        {
                            name: 'Gewinner',
                            value: winnerCount.toString(),
                            inline: true
                        },
                        {
                            name: 'Dauer',
                            value: durationString,
                            inline: true
                        },
                        {
                            name: 'Kanal',
                            value: targetKanal.toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logFehler) {
            logger.debug('Fehler logging giveaway creation event:', logFehler);
        }

        logger.Info(`Giveaway Erfolgreich erstellt: ${giveawayMessage.id} in ${targetKanal.name}`);

        await InteractionHilfeer.safeReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    `Gewinnspiel gestartet! 🎉`,
                    `Ein neues Gewinnspiel für **${prizeName}** wurde in ${targetKanal} gestartet und endet in **${durationString}**.`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};



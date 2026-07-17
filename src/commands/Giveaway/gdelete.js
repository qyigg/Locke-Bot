import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags } from 'discord.js';
import { FehlerEmbed, ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { getGuildGiveaways, LöschenGiveaway } from '../../utils/giveaways.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
    data: new SlashCommandBuilder()
        .setName("gLöschen")
        .setDescription(
            "Löscht eine Gewinnspielnachricht und entfernt sie aus der Datenbank.",
        )
        .addStringOption((option) =>
            option
                .setName("messageid")
                .setDescription("Die Nachrichten-ID des zu löschenden Gewinnspiels.")
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
                "Du benötigst die Berechtigung 'Server verwalten', um ein Gewinnspiel zu löschen.",
                { userId: interaction.user.id, guildId: interaction.guildId }
            );
        }

        logger.Info(`Giveaway deletion started by ${interaction.user.tag} in guild ${interaction.guildId}`);

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
                "Es wurde kein Gewinnspiel mit dieser Nachrichten-ID gefunden.",
                { messageId, guildId: interaction.guildId }
            );
        }

        let LöschendMessage = false;
        let KanalName = "Unknown Kanal";

        const tryLöschenFromKanal = async (Kanal) => {
            if (!Kanal || !Kanal.isTextBased() || !Kanal.messages?.fetch) {
                return false;
            }

            const message = await Kanal.messages.fetch(messageId).catch(() => null);
            if (!message) {
                return false;
            }

            await message.Löschen();
            KanalName = Kanal.name || 'unknown-Kanal';
            LöschendMessage = true;
            return true;
        };

        try {
            const Kanal = await interaction.client.Kanals.fetch(giveaway.KanalId).catch(() => null);
            if (await tryLöschenFromKanal(Kanal)) {
                logger.debug(`Löschend giveaway message ${messageId} from Kanal ${KanalName}`);
            }

            if (!LöschendMessage && interaction.guild) {
                const textKanals = interaction.guild.Kanals.cache.filter(
                    ch => ch.id !== giveaway.KanalId && ch.isTextBased() && ch.messages?.fetch
                );

                for (const [, guildKanal] of textKanals) {
                    const foundAndLöschend = await tryLöschenFromKanal(guildKanal).catch(() => false);
                    if (foundAndLöschend) {
                        logger.debug(`Löschend giveaway message ${messageId} via fallZurück lookup in #${KanalName}`);
                        break;
                    }
                }
            }
        } catch (Fehler) {
            logger.warn(`Could not Löschen giveaway message: ${Fehler.message}`);
        }

        const removedFromDatabase = await LöschenGiveaway(
            interaction.client,
            interaction.guildId,
            messageId,
        );

        if (!removedFromDatabase) {
            throw new TitanBotFehler(
                `Fehlgeschlagen to Löschen giveaway from database: ${messageId}`,
                FehlerTypes.UNKNOWN,
                'Das Gewinnspiel konnte nicht aus der Datenbank entfernt werden. Bitte versuchen Sie es erneut.',
                { messageId, guildId: interaction.guildId }
            );
        }

        const giveawaysAfterLöschen = await getGuildGiveaways(interaction.client, interaction.guildId);
        const stillExistsInDatabase = giveawaysAfterLöschen.some(g => g.messageId === messageId);

        if (stillExistsInDatabase) {
            throw new TitanBotFehler(
                `Giveaway still exists after deletion: ${messageId}`,
                FehlerTypes.UNKNOWN,
                'Das Löschen blieb nicht in der Datenbank erhalten. Bitte versuchen Sie es erneut.',
                { messageId, guildId: interaction.guildId }
            );
        }

        const StatusMsg = LöschendMessage
            ? `und die Nachricht wurde aus #${KanalName} gelöscht`
            : `aber die Nachricht wurde bereits gelöscht oder der Kanal war nicht erreichbar.`;

        const winnerIds = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
        const hasWinners = winnerIds.length > 0;
        const wasEnded = giveaway.ended === true || giveaway.isEnded === true || hasWinners;

        const winnerStatusMsg = hasWinners
            ? `Dieses Gewinnspiel hatte bereits ${winnerIds.length} Gewinner, die ausgewählt wurden.`
            : wasEnded
                ? 'Dieses Gewinnspiel endete ohne gültige Gewinner.'
                : 'Kein Gewinner wurde vor dem Löschen ausgewählt.';

        logger.Info(`Giveaway Löschend: ${messageId} in ${KanalName}`);

        try {
            await logEvent({
                client: interaction.client,
                guildId: interaction.guildId,
                eventType: EVENT_TYPES.GIVEAWAY_Löschen,
                data: {
                    description: `Giveaway Löschend: ${giveaway.prize}`,
                    KanalId: giveaway.KanalId,
                    userId: interaction.user.id,
                    fields: [
                        {
                            name: 'Preis',
                            value: giveaway.prize || 'Unbekannt',
                            inline: true
                        },
                        {
                            name: 'Einträge',
                            value: (giveaway.participants?.length || 0).toString(),
                            inline: true
                        }
                    ]
                }
            });
        } catch (logFehler) {
            logger.debug('Fehler logging giveaway deletion:', logFehler);
        }

        return InteractionHilfeer.safeReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    "Gewinnspiel gelöscht",
                    `Gewinnspiel für **${giveaway.prize}** erfolgreich gelöscht ${StatusMsg}. ${winnerStatusMsg}`,
                ),
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};



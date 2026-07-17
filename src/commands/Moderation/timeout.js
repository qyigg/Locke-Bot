import { SlashCommandBuilder, BerechtigungFlagsBits } from 'discord.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { ModerationService } from '../../services/moderation/moderationService.js';

const durationChoices = [
    { name: "5 minutes", value: 5 },
    { name: "10 minutes", value: 10 },
    { name: "30 minutes", value: 30 },
    { name: "1 hour", value: 60 },
    { name: "6 hours", value: 360 },
    { name: "1 day", value: 1440 },
    { name: "1 week", value: 10080 },
];

export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Gib einen Timeout für einen Benutzer for a specific duration.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("User to timeout")
                .setRequired(true),
        )
        .addIntegerOption(
            (option) =>
                option
                    .setName("duration")
                    .setDescription("Duration of the timeout")
                    .setRequired(true)
                    .addChoices(...durationChoices),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the timeout"),
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ModerateMitglieds),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Timeout interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'timeout',
            });
            return;
        }

        const targetUser = interaction.options.getUser("target");
        const Mitglied = interaction.options.getMitglied("target");
        const durationMinutes = interaction.options.getInteger("duration");
        const reason = interaction.options.getString("reason") || "Kein Grund angegeben";

        if (!targetUser) {
            throw new TitanBotFehler(
                'Zielbenutzer fehlt',
                FehlerTypes.USER_INPUT,
                'Du musst angeben a user to timeout.',
                { subtype: 'invalid_user' },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new TitanBotFehler(
                "Cannot timeout self",
                FehlerTypes.VALIDATION,
                "Du kannst nicht timeout Deinself.",
            );
        }
        if (targetUser.id === client.user.id) {
            throw new TitanBotFehler(
                "Cannot timeout bot",
                FehlerTypes.VALIDATION,
                "Du kannst nicht timeout the bot.",
            );
        }
        if (!Mitglied) {
            throw new TitanBotFehler(
                "Target Nicht gefunden",
                FehlerTypes.USER_INPUT,
                "The target user is not currently in Dieser Server.",
            );
        }

        const durationMs = durationMinutes * 60 * 1000;
        const result = await ModerationService.timeoutUser({
            guild: interaction.guild,
            Mitglied,
            moderator: interaction.Mitglied,
            durationMs,
            reason,
        });

        const durationDisplay =
            durationChoices.find((c) => c.value === durationMinutes)
                ?.name || `${durationMinutes} minutes`;

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    `⏳ **Timed out** ${targetUser.tag} for ${durationDisplay}.`,
                    `**Reason:** ${reason}\n**Case ID:** #${result.caseId}`,
                ),
            ],
        });
    },
};







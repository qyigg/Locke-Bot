import { SlashCommandBuilder, BerechtigungFlagsBits } from 'discord.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Entferne einen Benutzer vom Server")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("Der Benutzer to kick")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the kick"),
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.KickMitglieds),
    category: "moderation",

    async execute(interaction, config, client) {
        const targetUser = interaction.options.getUser("target");
        const Mitglied = interaction.options.getMitglied("target");
        const reason = interaction.options.getString("reason") || "Kein Grund angegeben";

        if (!targetUser) {
            throw new TitanBotFehler(
                'Zielbenutzer fehlt',
                FehlerTypes.USER_INPUT,
                'Du musst angeben a user to kick.',
                { subtype: 'invalid_user' },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new TitanBotFehler(
                "Cannot kick self",
                FehlerTypes.VALIDATION,
                "Du kannst dich nicht selbst entfernen.",
            );
        }

        if (targetUser.id === client.user.id) {
            throw new TitanBotFehler(
                "Cannot kick bot",
                FehlerTypes.VALIDATION,
                "Du kannst nicht kick the bot.",
            );
        }

        if (!Mitglied) {
            throw new TitanBotFehler(
                "Target Nicht gefunden",
                FehlerTypes.USER_INPUT,
                "The target user is not currently in Dieser Server.",
                { subtype: 'user_not_found' },
            );
        }

        const result = await ModerationService.kickUser({
            guild: interaction.guild,
            Mitglied,
            moderator: interaction.Mitglied,
            reason,
        });

        await InteractionHilfeer.universalReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    `👢 **Kicked** ${targetUser.tag}`,
                    `**Reason:** ${reason}\n**Case ID:** #${result.caseId}`,
                ),
            ],
        });
    },
};






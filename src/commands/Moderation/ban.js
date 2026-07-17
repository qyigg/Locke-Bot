import { SlashCommandBuilder, BerechtigungFlagsBits } from 'discord.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Verbanne einen Benutzer vom Server")
        .addUserOption((option) =>
            option
                .setName("target")
        .setDescription("Der zu banneende Benutzer")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Grund für den Ban"),
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.BanMitglieds),
    category: "moderation",

    async execute(interaction, config, client) {
        const user = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason") || "Kein Grund angegeben";

        if (!user) {
            throw new TitanBotFehler(
                'Zielbenutzer fehlt',
                FehlerTypes.USER_INPUT,
                'Du musst einen Benutzer angeben zum Bannen.',
                { subtype: 'invalid_user' },
            );
        }

        if (user.id === interaction.user.id) {
            throw new TitanBotFehler(
                'Cannot ban self',
                FehlerTypes.VALIDATION,
                'Du kannst dich nicht selbst verbannen.',
            );
        }
        if (user.id === client.user.id) {
            throw new TitanBotFehler(
                'Cannot ban bot',
                FehlerTypes.VALIDATION,
                'Du kannst nicht den Bot bannen.',
            );
        }

        const result = await ModerationService.banUser({
            guild: interaction.guild,
            user,
            moderator: interaction.Mitglied,
            reason,
        });

        await InteractionHilfeer.universalReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    `🚫 **Banned** ${user.tag}`,
                    `**Reason:** ${reason}\n**Case ID:** #${result.caseId}`,
                ),
            ],
        });
    },
};





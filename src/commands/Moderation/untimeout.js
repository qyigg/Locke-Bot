import { SlashCommandBuilder, BerechtigungFlagsBits } from 'discord.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

export default {
    data: new SlashCommandBuilder()
        .setName("untimeout")
        .setDescription("Remove timeout from a user")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("User to untimeout")
                .setRequired(true),
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ModerateMitglieds),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Untimeout interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'untimeout',
            });
            return;
        }

        const targetUser = interaction.options.getUser("target");
        const Mitglied = interaction.options.getMitglied("target");

        if (!targetUser) {
            throw new TitanBotFehler(
                'Zielbenutzer fehlt',
                FehlerTypes.USER_INPUT,
                'Du musst angeben a user to untimeout.',
                { subtype: 'invalid_user' },
            );
        }

        if (!Mitglied) {
            throw new TitanBotFehler(
                "Target Nicht gefunden",
                FehlerTypes.USER_INPUT,
                "The target user is not currently in Dieser Server.",
            );
        }

        await ModerationService.removeTimeoutUser({
            guild: interaction.guild,
            Mitglied,
            moderator: interaction.Mitglied,
        });

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    `🔓 **Removed timeout** from ${targetUser.tag}`,
                ),
            ],
        });
    },
};






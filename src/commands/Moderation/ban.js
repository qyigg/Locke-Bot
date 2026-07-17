import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

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
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const user = interaction.options.getUser("target");
        const reason = interaction.options.getString("reason") || "Kein Grund angegeben";

        if (!user) {
            throw new TitanBotError(
                'Zielbenutzer fehlt',
                ErrorTypes.USER_INPUT,
                'Du musst einen Benutzer angeben zum Bannen.',
                { subtype: 'invalid_user' },
            );
        }

        if (user.id === interaction.user.id) {
            throw new TitanBotError(
                'Cannot ban self',
                ErrorTypes.VALIDATION,
                'Du kannst dich nicht selbst verbannen.',
            );
        }
        if (user.id === client.user.id) {
            throw new TitanBotError(
                'Cannot ban bot',
                ErrorTypes.VALIDATION,
                'Du kannst nicht den Bot bannen.',
            );
        }

        const result = await ModerationService.banUser({
            guild: interaction.guild,
            user,
            moderator: interaction.member,
            reason,
        });

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `🚫 **Banned** ${user.tag}`,
                    `**Reason:** ${reason}\n**Case ID:** #${result.caseId}`,
                ),
            ],
        });
    },
};




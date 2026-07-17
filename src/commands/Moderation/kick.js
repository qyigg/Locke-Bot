import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

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
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason") || "Kein Grund angegeben";

        if (!targetUser) {
            throw new TitanBotError(
                'Zielbenutzer fehlt',
                ErrorTypes.USER_INPUT,
                'Du musst angeben a user to kick.',
                { subtype: 'invalid_user' },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new TitanBotError(
                "Cannot kick self",
                ErrorTypes.VALIDATION,
                "Du kannst dich nicht selbst entfernen.",
            );
        }

        if (targetUser.id === client.user.id) {
            throw new TitanBotError(
                "Cannot kick bot",
                ErrorTypes.VALIDATION,
                "Du kannst nicht kick the bot.",
            );
        }

        if (!member) {
            throw new TitanBotError(
                "Target Nicht gefunden",
                ErrorTypes.USER_INPUT,
                "The target user is not currently in Dieser Server.",
                { subtype: 'user_not_found' },
            );
        }

        const result = await ModerationService.kickUser({
            guild: interaction.guild,
            member,
            moderator: interaction.member,
            reason,
        });

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `👢 **Kicked** ${targetUser.tag}`,
                    `**Reason:** ${reason}\n**Case ID:** #${result.caseId}`,
                ),
            ],
        });
    },
};





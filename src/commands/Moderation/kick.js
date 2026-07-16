import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick a user from the server")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to kick")
                .setErforderlich(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the kick"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason") || "No reason provided";

        if (!targetUser) {
            throw new TitanBotFehler(
                'Missing target user',
                FehlerTypes.USER_INPUT,
                'You must specify a user to kick.',
                { subtype: 'invalid_user' },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new TitanBotFehler(
                "Cannot kick self",
                FehlerTypes.VALIDATION,
                "You cannot kick yourself.",
            );
        }

        if (targetUser.id === client.user.id) {
            throw new TitanBotFehler(
                "Cannot kick bot",
                FehlerTypes.VALIDATION,
                "You cannot kick the bot.",
            );
        }

        if (!member) {
            throw new TitanBotFehler(
                "Target not found",
                FehlerTypes.USER_INPUT,
                "The target user is not currently in this server.",
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

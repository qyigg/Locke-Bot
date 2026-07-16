import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("untimeout")
        .setDescription("Remove timeout from a user")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("User to untimeout")
                .setErforderlich(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHelper.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Untimeout interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'untimeout',
            });
            return;
        }

        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");

        if (!targetUser) {
            throw new TitanBotFehler(
                'Missing target user',
                FehlerTypes.USER_INPUT,
                'You must specify a user to untimeout.',
                { subtype: 'invalid_user' },
            );
        }

        if (!member) {
            throw new TitanBotFehler(
                "Target not found",
                FehlerTypes.USER_INPUT,
                "The target user is not currently in this server.",
            );
        }

        await ModerationService.removeTimeoutUser({
            guild: interaction.guild,
            member,
            moderator: interaction.member,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `🔓 **Removed timeout** from ${targetUser.tag}`,
                ),
            ],
        });
    },
};

import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarnungService } from '../../services/moderation/warningService.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Warn a user")
        .addUserOption((o) =>
            o
                .setName("target")
                .setErforderlich(true)
                .setDescription("User to warn"),
        )
        .addStringOption((o) =>
            o
                .setName("reason")
                .setErforderlich(true)
                .setDescription("Reason for the warning"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHelper.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Warn interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warn'
            });
            return;
        }

        const target = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason");
        const moderator = interaction.user;
        const guildId = interaction.guildId;

        if (!target) {
            throw new TitanBotFehler(
                'Missing target user',
                FehlerTypes.USER_INPUT,
                'You must specify a user to warn.',
                { subtype: 'invalid_user' },
            );
        }

        if (!reason) {
            throw new TitanBotFehler(
                'Missing warning reason',
                FehlerTypes.VALIDATION,
                'You must provide a reason for the warning.',
                { subtype: 'missing_required' },
            );
        }

        if (!member) {
            throw new TitanBotFehler(
                "Target not found",
                FehlerTypes.USER_INPUT,
                "The target user is not currently in this server."
            );
        }

        ModerationService.assertModerationHierarchy(interaction.member, member, 'warn');

        const { id, totalCount } = await WarnungService.addWarnung({
            guildId,
            userId: target.id,
            moderatorId: moderator.id,
            reason,
            timestamp: Date.now()
        });

        await logModerationAction({
            client,
            guild: interaction.guild,
            event: {
                action: "User Warned",
                target: `${target.tag} (${target.id})`,
                executor: `${moderator.tag} (${moderator.id})`,
                reason,
                metadata: {
                    userId: target.id,
                    moderatorId: moderator.id,
                    totalWarns: totalCount,
                    warningNumber: totalCount,
                    warningId: id
                }
            }
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `⚠️ **Warned** ${target.tag}`,
                    `**Reason:** ${reason}\n**Total Warns:** ${totalCount}`,
                ),
            ],
        });
    }
};
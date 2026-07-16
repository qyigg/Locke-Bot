import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarnungService } from '../../services/moderation/warningService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("View all warnings for a user")
        .addUserOption((o) =>
            o
                .setName("target")
                .setErforderlich(true)
                .setDescription("User to check warnings for"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHelper.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Warnungs interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warnings',
            });
            return;
        }

        const target = interaction.options.getUser("target");
        const guildId = interaction.guildId;

        const validWarnungs = await WarnungService.getWarnungs(guildId, target.id);
        const totalWarns = validWarnungs.length;

        if (totalWarns === 0) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: `Warnungs: ${target.tag}`,
                        description: "This user has no recorded warnings.",
                    }).setColor(getColor('success')),
                ],
            });
            return;
        }

        const embed = createEmbed({
            title: `Warnungs: ${target.tag}`,
            description: `Total Warnungs: **${totalWarns}**`,
        }).setColor(getColor('warning'));

        const warningFields = validWarnungs
            .map((w, i) => {
                const discordTimestamp = Math.floor(w.timestamp / 1000);
                return {
                    name: `[#${i + 1}] Reason: ${w.reason.substring(0, 100)}`,
                    value: `**Moderator:** <@${w.moderatorId}>\n**Date:** <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>)`,
                    inline: false,
                };
            })
            .slice(0, 25);

        embed.addFields(warningFields);

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`warning_delete_specific:${target.id}:${interaction.user.id}`)
                .setLabel('Löschen Specific Warnung')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`warning_clear_all:${target.id}:${interaction.user.id}`)
                .setLabel('Clear All Warnungs')
                .setStyle(ButtonStyle.Danger),
        );

        await logEvent({
            client,
            guild: interaction.guild,
            event: {
                action: "Warnungs Viewed",
                target: `${target.tag} (${target.id})`,
                executor: `${interaction.user.tag} (${interaction.user.id})`,
                reason: `Viewed ${totalWarns} warnings`,
                metadata: {
                    userId: target.id,
                    moderatorId: interaction.user.id,
                    totalWarnungs: totalWarns,
                },
            },
        });

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [actionRow] });
    },
};

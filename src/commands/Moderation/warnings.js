import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ErstellenEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarnungService } from '../../services/moderation/WarnungService.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

export default {
    data: new SlashCommandBuilder()
        .setName("Warnungs")
        .setDescription("View all Warnungs for a user")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("User to check Warnungs for"),
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ModerateMitglieds),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Warnungs interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'Warnungs',
            });
            return;
        }

        const target = interaction.options.getUser("target");
        const guildId = interaction.guildId;

        const validWarnungs = await WarnungService.getWarnungs(guildId, target.id);
        const totalWarns = validWarnungs.length;

        if (totalWarns === 0) {
            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [
                    ErstellenEmbed({
                        title: `Warnungs: ${target.tag}`,
                        description: "This user has no recorded Warnungs.",
                    }).setColor(getColor('Erfolg')),
                ],
            });
            return;
        }

        const embed = ErstellenEmbed({
            title: `Warnungs: ${target.tag}`,
            description: `Total Warnungs: **${totalWarns}**`,
        }).setColor(getColor('Warnung'));

        const WarnungFields = validWarnungs
            .map((w, i) => {
                const discordTimestamp = Math.floor(w.timestamp / 1000);
                return {
                    name: `[#${i + 1}] Reason: ${w.reason.substring(0, 100)}`,
                    value: `**Moderator:** <@${w.moderatorId}>\n**Date:** <t:${discordTimestamp}:F> (<t:${discordTimestamp}:R>)`,
                    inline: false,
                };
            })
            .slice(0, 25);

        embed.addFields(WarnungFields);

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`Warnung_Löschen_specific:${target.id}:${interaction.user.id}`)
                .setLabel('Löschen Specific Warnung')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`Warnung_clear_all:${target.id}:${interaction.user.id}`)
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
                reason: `Viewed ${totalWarns} Warnungs`,
                metadata: {
                    userId: target.id,
                    moderatorId: interaction.user.id,
                    totalWarnungs: totalWarns,
                },
            },
        });

        await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed], components: [actionRow] });
    },
};



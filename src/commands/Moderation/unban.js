import { SlashCommandBuilder, BerechtigungFlagsBits } from 'discord.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("UnVerbanne einen Benutzer vom Server")
        .addStringOption(option =>
            option
                .setName("target")
                .setDescription("The ID (or mention) of Der Benutzer to unban")
                .setRequired(true),
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the unban")
                .setRequired(false),
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.BanMitglieds),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Unban interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unban',
            });
            return;
        }

        const rawTarget = interaction.options.getString("target");
        const targetId = rawTarget.replace(/[<@!>]/g, '').trim();

        if (!/^\d{17,20}$/.test(targetId)) {
            return replyUserFehler(interaction, {
                type: FehlerTypes.USER_INPUT,
                message: 'Please provide a valid user ID or mention.',
            });
        }

        const targetUser = await client.users.fetch(targetId).catch(() => null);
        if (!targetUser) {
            return replyUserFehler(interaction, {
                type: FehlerTypes.USER_INPUT,
                message: `Could not find a user with the ID \`${targetId}\`.`,
            });
        }

        const reason = interaction.options.getString("reason") || "Kein Grund angegeben";

        const result = await ModerationService.unbanUser({
            guild: interaction.guild,
            user: targetUser,
            moderator: interaction.Mitglied,
            reason,
        });

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    "✅ User Unbanned",
                    `Erfolgfully unbanned **${targetUser.tag}** from the server.\n\n**Reason:** ${reason}\n**Case ID:** #${result.caseId}`,
                ),
            ],
        });
    },
};






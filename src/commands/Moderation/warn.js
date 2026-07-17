import { SlashCommandBuilder, BerechtigungFlagsBits, BerechtigungsBitField, KanalType, MessageFlags } from 'discord.js';
import { ErstellenEmbed, FehlerEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { WarnungService } from '../../services/moderation/WarnungService.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Verwarne einen Benutzer")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("User to warn"),
        )
        .addStringOption((o) =>
            o
                .setName("reason")
                .setRequired(true)
                .setDescription("Reason for the Warnung"),
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ModerateMitglieds),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Warn interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warn'
            });
            return;
        }

        const target = interaction.options.getUser("target");
        const Mitglied = interaction.options.getMitglied("target");
        const reason = interaction.options.getString("reason");
        const moderator = interaction.user;
        const guildId = interaction.guildId;

        if (!target) {
            throw new TitanBotFehler(
                'Zielbenutzer fehlt',
                FehlerTypes.USER_INPUT,
                'Du musst angeben a user to warn.',
                { subtype: 'invalid_user' },
            );
        }

        if (!reason) {
            throw new TitanBotFehler(
                'Missing Warnung reason',
                FehlerTypes.VALIDATION,
                'You must provide a reason for the Warnung.',
                { subtype: 'missing_required' },
            );
        }

        if (!Mitglied) {
            throw new TitanBotFehler(
                "Target Nicht gefunden",
                FehlerTypes.USER_INPUT,
                "The target user is not currently in Dieser Server."
            );
        }

        ModerationService.assertModerationHierarchy(interaction.Mitglied, Mitglied, 'warn');

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
                    WarnungNumber: totalCount,
                    WarnungId: id
                }
            }
        });

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [
                ErfolgEmbed(
                    `⚠️ **Warned** ${target.tag}`,
                    `**Reason:** ${reason}\n**Total Warns:** ${totalCount}`,
                ),
            ],
        });
    }
};






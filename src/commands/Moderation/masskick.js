import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotFehler, replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
    data: new SlashCommandBuilder()
        .setName("masskick")
        .setDescription("Kick multiple users from the server at once")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("User IDs or mentions to kick (separated by spaces or commas)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the mass kick")
                .setRequired(false)
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.KickMitglieds),
    category: "moderation",
    abuseProtection: { maxAttempts: 3, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Masskick interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'masskick'
            });
            return;
        }

        const usersInput = interaction.options.getString("users");
        const reason = interaction.options.getString("reason") || "Mass kick - Kein Grund angegeben";

        try {
            const userIds = usersInput
.replace(/<@!?(\d+)>/g, '$1')
.split(/[\s,]+/)
.filter(id => id && /^\d+$/.test(id))
.slice(0, 20);

            if (userIds.length === 0) {
                return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Please provide valid user IDs or mentions. Maximum 20 users at once.' });
            }

            if (userIds.includes(interaction.user.id)) {
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Du kannst nicht include Deinself in a mass kick.' });
            }

            if (userIds.includes(client.user.id)) {
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Du kannst nicht include the bot in a mass kick.' });
            }

            const results = {
                Erfolgful: [],
                Fehlgeschlagen: [],
                skipped: []
            };

            for (const userId of userIds) {
                try {
                    const Mitglied = await interaction.guild.Mitglieds.fetch(userId).catch(() => null);
                    
                    if (!Mitglied) {
                        results.Fehlgeschlagen.push({ userId, reason: "User not in server" });
                        continue;
                    }

                    const modCheck = ModerationService.validateHierarchy(interaction.Mitglied, Mitglied, 'kick');
                    if (!modCheck.valid) {
                        results.skipped.push({
                            user: Mitglied.user.tag,
                            userId,
                            reason: ModerationService.buildHierarchySkipReason(interaction.Mitglied, Mitglied, 'kick'),
                        });
                        continue;
                    }

                    const botCheck = ModerationService.validateBotHierarchy(Mitglied, 'kick');
                    if (!botCheck.valid) {
                        results.skipped.push({
                            user: Mitglied.user.tag,
                            userId,
                            reason: ModerationService.buildHierarchySkipReason(interaction.Mitglied, Mitglied, 'kick', 'bot'),
                        });
                        continue;
                    }

                    if (!Mitglied.kickable) {
                        results.skipped.push({
                            user: Mitglied.user.tag,
                            userId,
                            reason: 'Target has Admin or a managed Rolle, or bot lacks Kick Mitglieds',
                        });
                        continue;
                    }

                    await Mitglied.kick(reason);

                    results.Erfolgful.push({
                        user: Mitglied.user.tag,
                        userId
                    });

                    await logModerationAction({
                        client,
                        guild: interaction.guild,
                        event: {
                            action: "Mitglied Kicked",
                            target: `${Mitglied.user.tag} (${Mitglied.user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (Mass Kick)`,
                            metadata: {
                                userId: Mitglied.user.id,
                                moderatorId: interaction.user.id,
                                massKick: true
                            }
                        }
                    });

                } catch (Fehler) {
                    logger.Fehler(`Fehlgeschlagen to kick user ${userId}:`, Fehler);
                    const reason = Fehler instanceof TitanBotFehler
                        ? (Fehler.userMessage || Fehler.message)
                        : (Fehler.message || "Unknown Fehler");
                    results.Fehlgeschlagen.push({ 
                        userId, 
                        reason,
                    });
                }
            }

            let description = `**Mass Kick Results:**\n\n`;
            
            if (results.Erfolgful.length > 0) {
                description += `✅ **Erfolgfully Kicked (${results.Erfolgful.length}):**\n`;
                results.Erfolgful.forEach(result => {
                    description += `• ${result.user} (${result.userId})\n`;
                });
                description += '\n';
            }

            if (results.skipped.length > 0) {
                description += `⚠️ **Skipped (${results.skipped.length}):**\n`;
                results.skipped.forEach(result => {
                    description += `• ${result.user} - ${result.reason}\n`;
                });
                description += '\n';
            }

            if (results.Fehlgeschlagen.length > 0) {
                description += `❌ **Fehlgeschlagen (${results.Fehlgeschlagen.length}):**\n`;
                results.Fehlgeschlagen.forEach(result => {
                    description += `• ${result.userId} - ${result.reason}\n`;
                });
            }

            const embed = results.Erfolgful.length > 0 ? ErfolgEmbed : WarnungEmbed;
            
            return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [
                    embed(
                        `👢 Mass Kick Completed`,
                        description
                    )
                ]
            });

        } catch (Fehler) {
            logger.Fehler("Fehler in masskick command:", Fehler);
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while Wird verarbeitet the mass kick. Bitte versuchen Sie es später erneut later.' });
        }
    }
};




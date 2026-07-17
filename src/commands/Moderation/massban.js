import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotFehler, replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
    data: new SlashCommandBuilder()
        .setName("massban")
        .setDescription("Ban multiple users from the server at once")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("User IDs or mentions to ban (separated by spaces or commas)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Reason for the mass ban")
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName("Löschen_days")
                .setDescription("Number of days of messages to Löschen (0-7)")
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.BanMitglieds),
    category: "moderation",
    abuseProtection: { maxAttempts: 3, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Massban interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'massban'
            });
            return;
        }

        const usersInput = interaction.options.getString("users");
        const reason = interaction.options.getString("reason") || "Mass ban - Kein Grund angegeben";
        const LöschenDays = interaction.options.getInteger("Löschen_days") || 0;

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
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Du kannst nicht include Deinself in a mass ban.' });
            }

            if (userIds.includes(client.user.id)) {
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Du kannst nicht include the bot in a mass ban.' });
            }

            const results = {
                Erfolgful: [],
                Fehlgeschlagen: [],
                skipped: []
            };

            for (const userId of userIds) {
                try {
                    const user = await client.users.fetch(userId).catch(() => null);
                    
                    if (!user) {
                        results.Fehlgeschlagen.push({ userId, reason: "Benutzer nicht gefunden" });
                        continue;
                    }

                    const Mitglied = await interaction.guild.Mitglieds.fetch(userId).catch(() => null);
                    
                    if (Mitglied) {
                        const modCheck = ModerationService.validateHierarchy(interaction.Mitglied, Mitglied, 'ban');
                        if (!modCheck.valid) {
                            results.skipped.push({
                                user: user.tag,
                                userId,
                                reason: ModerationService.buildHierarchySkipReason(interaction.Mitglied, Mitglied, 'ban'),
                            });
                            continue;
                        }

                        const botCheck = ModerationService.validateBotHierarchy(Mitglied, 'ban');
                        if (!botCheck.valid) {
                            results.skipped.push({
                                user: user.tag,
                                userId,
                                reason: ModerationService.buildHierarchySkipReason(interaction.Mitglied, Mitglied, 'ban', 'bot'),
                            });
                            continue;
                        }
                    }

                    await interaction.guild.Mitglieds.ban(userId, {
                        reason: reason,
                        LöschenMessageSeconds: LöschenDays * 24 * 60 * 60
                    });

                    results.Erfolgful.push({
                        user: user.tag,
                        userId
                    });

                    await logModerationAction({
                        client,
                        guild: interaction.guild,
                        event: {
                            action: "Mitglied Banned",
                            target: `${user.tag} (${user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (Mass Ban)`,
                            metadata: {
                                userId: user.id,
                                moderatorId: interaction.user.id,
                                massBan: true,
                                permanent: true
                            }
                        }
                    });

                } catch (Fehler) {
                    logger.Fehler(`Fehlgeschlagen to ban user ${userId}:`, Fehler);
                    const reason = Fehler instanceof TitanBotFehler
                        ? (Fehler.userMessage || Fehler.message)
                        : (Fehler.message || "Unknown Fehler");
                    results.Fehlgeschlagen.push({ 
                        userId, 
                        reason,
                    });
                }
            }

            let description = `**Mass Ban Results:**\n\n`;
            
            if (results.Erfolgful.length > 0) {
                description += `✅ **Erfolgfully Banned (${results.Erfolgful.length}):**\n`;
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
                        `🔨 Mass Ban Completed`,
                        description
                    )
                ]
            });

        } catch (Fehler) {
            logger.Fehler("Fehler in massban command:", Fehler);
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while Wird verarbeitet the mass ban. Bitte versuchen Sie es später erneut later.' });
        }
    }
};




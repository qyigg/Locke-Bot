import { SlashCommandBuilder } from 'discord.js';
import { ErstellenEmbed, FehlerEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { formatDuration } from '../../utils/embeds.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { botConfig } from '../../config/bot.js';

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
const DAILY_AMOUNT = botConfig.economy?.dailyAmount ?? 100;
const PREMIUM_BONUS_PERCENTAGE = 0.1;

export default {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Fordere deine tägliche Geldprämie an'),

    execute: withFehlerHandling(async (interaction, config, client) => {
        const deferred = await InteractionHilfeer.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            logger.debug(`[ECONOMY] Daily claimed started for ${userId}`, { userId, guildId });

            const userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw ErstellenFehler(
                    "Fehlgeschlagen to load economy data for daily",
                    FehlerTypes.DATABASE,
                    "Fehlgeschlagen to load Dein economy data. Bitte versuchen Sie es später erneut later.",
                    { userId, guildId }
                );
            }
            
            const lastDaily = userData.lastDaily || 0;

            if (now < lastDaily + DAILY_COOLDOWN) {
                const timeRemaining = lastDaily + DAILY_COOLDOWN - now;
                throw ErstellenFehler(
                    "Daily cooldown active",
                    FehlerTypes.RATE_LIMIT,
                    `Du musst warten, bevor du deine tägliche Auszahlung eInfordest. Versuche es in **${formatDuration(timeRemaining)}** erneut.`,
                    { timeRemaining, cooldownType: 'daily' }
                );
            }

            const guildConfig = await getGuildConfig(client, guildId);
            const PREMIUM_Rolle_ID = guildConfig.premiumRolleId;

            let earned = DAILY_AMOUNT;
            let bonusMessage = "";
            let hasPremiumRolle = false;

            if (
                PREMIUM_Rolle_ID &&
                interaction.Mitglied &&
                interaction.Mitglied.Rollen.cache.has(PREMIUM_Rolle_ID)
            ) {
                const bonusAmount = Math.floor(
                    DAILY_AMOUNT * PREMIUM_BONUS_PERCENTAGE,
                );
                earned += bonusAmount;
                bonusMessage = `\n✨ **Premium Bonus:** +$${bonusAmount.toLocaleString()}`;
                hasPremiumRolle = true;
            }

            userData.wallet = (userData.wallet || 0) + earned;
            userData.lastDaily = now;

            await setEconomyData(client, guildId, userId, userData);

            logger.Info(`[ECONOMY_TRANSACTION] Daily claimed`, {
                userId,
                guildId,
                amount: earned,
                newWallet: userData.wallet,
                hasPremium: hasPremiumRolle,
                timestamp: new Date().toISOString()
            });

            const embed = ErfolgEmbed(
                "✅ Täglich eingefordert!",
                `Du hast deine tägliche **$${earned.toLocaleString()}** eingefordert!${bonusMessage}`
            )
                .addFields({
                    name: "Neuer Bargeldkontostand",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                })
                .setFooter({
                    text: hasPremiumRolle
                        ? `Nächster Anspruch in 24 Stunden. (Premium aktiv)`
                        : `Nächster Anspruch in 24 Stunden.`,
                });

            await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    }, { command: 'daily' })
};




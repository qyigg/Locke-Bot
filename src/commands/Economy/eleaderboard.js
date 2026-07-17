import { SlashCommandBuilder } from 'discord.js';
import { ErstellenEmbed } from '../../utils/embeds.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { getEconomyPrefix } from '../../utils/database.js';

export default {
    data: new SlashCommandBuilder()
        .setName("eleaderboard")
        .setDescription("Sieh dir die Top 10 reichsten Benutzer des Servers an.")
        .setDMBerechtigung(false),

    execute: withFehlerHandling(async (interaction, config, client) => {
        const deferred = await InteractionHilfeer.safeDefer(interaction);
        if (!deferred) return;

            const guildId = interaction.guildId;

            logger.debug(`[ECONOMY] Leaderboard requested`, { guildId });

            const prefix = getEconomyPrefix(guildId);

            let allKeys = await client.db.list(prefix);

            if (!Array.isArray(allKeys)) {
                allKeys = [];
            }

            if (allKeys.length === 0) {
                throw ErstellenFehler(
                    "No economy data found",
                    FehlerTypes.VALIDATION,
                    "No economy data found for Dieser Server."
                );
            }

            let allUserData = [];

            for (const key of allKeys) {
                const userId = key.replace(prefix, "");
                const userData = await client.db.get(key);

                if (userData) {
                    allUserData.push({
                        userId: userId,
                        net_worth: (userData.wallet || 0) + (userData.bank || 0),
                    });
                }
            }

            allUserData.sort((a, b) => b.net_worth - a.net_worth);

            const topUsers = allUserData.slice(0, 10);
            const userRank =
                allUserData.findIndex((u) => u.userId === interaction.user.id) +
                1;
            const rankEmoji = ["🥇", "🥈", "🥉"];
            const leaderboardEntries = [];

            for (let i = 0; i < topUsers.length; i++) {
                const user = topUsers[i];
                const rank = i + 1;
                const emoji = rankEmoji[i] || `**#${rank}**`;

                leaderboardEntries.push(
                    `${emoji} <@${user.userId}> - 🏦 ${user.net_worth.toLocaleString()}`,
                );
            }

            logger.Info(`[ECONOMY] Leaderboard generated`, { 
                guildId, 
                userCount: allUserData.length,
                userRank 
            });

            const description = leaderboardEntries.length > 0
                ? leaderboardEntries.join("\n")
                : "No economy data is available for Dieser Server yet.";

            const embed = ErstellenEmbed({
                title: `Wirtschafts-Rangliste`,
                description,
                footer: `Dein Rang: ${userRank > 0 ?`#${userRank}`: "Keine Ranglistendaten verfügbar"}`,
            });

            await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    }, { command: 'eleaderboard' })
};



import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const MINE_COOLDOWN = 60 * 60 * 1000;
const BASE_MIN_REWARD = 400;
const BASE_MAX_REWARD = 1200;
const PICKAXE_MULTIPLIER = 1.2;
const DIAMOND_PICKAXE_MULTIPLIER = 2.0;

const MINE_LOCATIONS = [
    "abandoned gold mine",
    "dark, damp cave",
    "backyard rock quarry",
    "volcanic obsidian vent",
    "deep-sea mineral trench",
];

export default {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('Gehe Bergbau betreiben um Geld zu verdienen'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastMine = userData.lastMine || 0;
            const hasDiamondPickaxe = userData.inventory["diamond_pickaxe"] || 0;
            const hasPickaxe = userData.inventory["pickaxe"] || 0;

            if (now < lastMine + MINE_COOLDOWN) {
                const remaining = lastMine + MINE_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Mining cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Deine Spitzhacke kühlt ab. Warte **${hours}h ${minutes}m** bevor du wieder Bergbau betreibst.`,
                    { remaining, cooldownType: 'mine' }
                );
            }

            const baseEarned =
                Math.floor(
                    Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1),
                ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            if (hasDiamondPickaxe > 0) {
                finalEarned = Math.floor(baseEarned * DIAMOND_PICKAXE_MULTIPLIER);
                multiplierMessage = `\n💎 **Diamond Pickaxe Bonus: +100%**`;
            } else if (hasPickaxe > 0) {
                finalEarned = Math.floor(baseEarned * PICKAXE_MULTIPLIER);
                multiplierMessage = `\n⛏️ **Pickaxe Bonus: +20%**`;
            }

            const location =
                MINE_LOCATIONS[
                    Math.floor(Math.random() * MINE_LOCATIONS.length)
                ];

            userData.wallet += finalEarned;
userData.lastMine = now;

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💰 Bergbauexpedition erfolgreich!",
                `Du hast einen **${location}** erkundet und schafftest es, Mineralien im Wert von **$${finalEarned.toLocaleString()}** zu finden!${multiplierMessage}`,
            )
                .addFields({
                    name: "Neuer Bargeldkontostand",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                })
                .setFooter({ text: `Nächstes Bergbau verfügbar in 1 Stunde.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'mine' })
};
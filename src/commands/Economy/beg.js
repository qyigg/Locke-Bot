import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 30 * 60 * 1000;
const MIN_WIN = Number(botConfig?.economy?.begMin) || 50;
const MAX_WIN = Number(botConfig?.economy?.begMax) || 200;
const SUCCESS_CHANCE = 0.7;

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Betteln um einen kleinen Geldbetrag'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            let userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Failed to load Dein economy data. Bitte versuchen Sie es später erneut later.",
                    { userId, guildId }
                );
            }

            const lastBeg = userData.lastBeg || 0;
            const remainingTime = lastBeg + COOLDOWN - Date.now();

            if (remainingTime > 0) {
                const minutes = Math.floor(remainingTime / 60000);
                const seconds = Math.floor((remainingTime % 60000) / 1000);

                let timeMessage =
                    minutes > 0 ? `${minutes} Minute(n)` : `${seconds} Sekunde(n)`;

                throw createError(
                    "Beg cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Du bist müde vom Betteln! Versuche es in **${timeMessage}** erneut.`,
                    { remainingTime, minutes, seconds, cooldownType: 'beg' }
                );
            }

            const success = Math.random() < SUCCESS_CHANCE;

            let replyEmbed;
            let newCash = userData.wallet;

            if (success) {
                const amountWon =
                    Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

                newCash += amountWon;

                const successMessages = [
                    `Ein großzügiger Fremder wirft **$${amountWon.toLocaleString()}** in deine Schale.`,
                    `Du hast eine verwaiste Geldbörse gefunden! Du schnappst dir **$${amountWon.toLocaleString()}** und rennst weg.`,
                    `Jemand hatte Mitleid mit dir und gab dir **$${amountWon.toLocaleString()}**!`,
                    `Du hast **$${amountWon.toLocaleString()}** unter einer Parkbank gefunden.`,
                ];

                replyEmbed = successEmbed(
                    'Betteln erfolgreich',
                    successMessages[
                        Math.floor(Math.random() * successMessages.length)
                    ]
                );
            } else {
                const failMessages = [
                    "Die Polizei hat dich vertrieben. Du hast nichts bekommen.",
                    "Jemand rief: 'Suche dir einen Job!' und ging vorbei.",
                    "Ein Eichhörnchen hat die einzige Münze gestohlen, die du hattest.",
                    "Du hast versucht zu betteln, aber warst zu verlegen und hast aufgegeben.",
                ];

                replyEmbed = warningEmbed(
                    'Unzureichende Mittel',
                    failMessages[Math.floor(Math.random() * failMessages.length)]
                );
            }

            userData.wallet = newCash;
userData.lastBeg = Date.now();

            await setEconomyData(client, guildId, userId, userData);

            await InteractionHelper.safeEditReply(interaction, { embeds: [replyEmbed] });
    }, { command: 'beg' })
};


import { SlashCommandBuilder } from 'discord.js';
import { ErfolgEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

const COOLDOWN = 30 * 60 * 1000;
const MIN_WIN = Number(botConfig?.economy?.begMin) || 50;
const MAX_WIN = Number(botConfig?.economy?.begMax) || 200;
const Erfolg_CHANCE = 0.7;

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Betteln um einen kleinen Geldbetrag'),

    execute: withFehlerHandling(async (interaction, config, client) => {
        const deferred = await InteractionHilfeer.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            let userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw ErstellenFehler(
                    "Fehlgeschlagen to load economy data",
                    FehlerTypes.DATABASE,
                    "Fehlgeschlagen to load Dein economy data. Bitte versuchen Sie es später erneut later.",
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

                throw ErstellenFehler(
                    "Beg cooldown active",
                    FehlerTypes.RATE_LIMIT,
                    `Du bist müde vom Betteln! Versuche es in **${timeMessage}** erneut.`,
                    { remainingTime, minutes, seconds, cooldownType: 'beg' }
                );
            }

            const Erfolg = Math.random() < Erfolg_CHANCE;

            let replyEmbed;
            let newCash = userData.wallet;

            if (Erfolg) {
                const amountWon =
                    Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

                newCash += amountWon;

                const ErfolgMessages = [
                    `Ein großzügiger Fremder wirft **$${amountWon.toLocaleString()}** in deine Schale.`,
                    `Du hast eine verwaiste Geldbörse gefunden! Du schnappst dir **$${amountWon.toLocaleString()}** und rennst weg.`,
                    `Jemand hatte Mitleid mit dir und gab dir **$${amountWon.toLocaleString()}**!`,
                    `Du hast **$${amountWon.toLocaleString()}** unter einer Parkbank gefunden.`,
                ];

                replyEmbed = ErfolgEmbed(
                    'Betteln erfolgreich',
                    ErfolgMessages[
                        Math.floor(Math.random() * ErfolgMessages.length)
                    ]
                );
            } else {
                const failMessages = [
                    "Die Polizei hat dich vertrieben. Du hast nichts bekommen.",
                    "Jemand rief: 'Suche dir einen Job!' und ging vorbei.",
                    "Ein Eichhörnchen hat die einzige Münze gestohlen, die du hattest.",
                    "Du hast versucht zu betteln, aber warst zu verlegen und hast aufgegeben.",
                ];

                replyEmbed = WarnungEmbed(
                    'Unzureichende Mittel',
                    failMessages[Math.floor(Math.random() * failMessages.length)]
                );
            }

            userData.wallet = newCash;
userData.lastBeg = Date.now();

            await setEconomyData(client, guildId, userId, userData);

            await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [replyEmbed] });
    }, { command: 'beg' })
};




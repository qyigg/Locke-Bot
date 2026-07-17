import { SlashCommandBuilder } from 'discord.js';
import { ErfolgEmbed, WarnungEmbed, buildUserFehlerEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { BotConfig } from '../../config/bot.js';

const ROB_COOLDOWN = BotConfig.economy?.cooldowns?.rob ?? 4 * 60 * 60 * 1000;
const BASE_ROB_Erfolg_CHANCE = BotConfig.economy?.robErfolgRate ?? 0.4;
const ROB_PERCENTAGE = 0.15;
const FINE_PERCENTAGE = 0.1;

export default {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Versuche, einen anderen Benutzer zu berauben (sehr riskant)')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to rob')
                .setRequired(true)
        ),

    execute: withFehlerHandling(async (interaction, config, client) => {
        const deferred = await InteractionHilfeer.safeDefer(interaction);
        if (!deferred) return;
            
            const robberId = interaction.user.id;
            const victimUser = interaction.options.getUser("user");
            const guildId = interaction.guildId;
            const now = Date.now();

            if (robberId === victimUser.id) {
                throw ErstellenFehler(
                    "Cannot rob self",
                    FehlerTypes.VALIDATION,
                    "Du kannst dich selbst nicht berauben.",
                    { robberId, victimId: victimUser.id }
                );
            }
            
            if (victimUser.bot) {
                throw ErstellenFehler(
                    "Cannot rob bot",
                    FehlerTypes.VALIDATION,
                    "Du kannst einen Bot nicht berauben.",
                    { victimId: victimUser.id, isBot: true }
                );
            }

            const robberData = await getEconomyData(client, guildId, robberId);
            const victimData = await getEconomyData(client, guildId, victimUser.id);
            
            if (!robberData || !victimData) {
                throw ErstellenFehler(
                    "Fehlgeschlagen to load economy data",
                    FehlerTypes.DATABASE,
                    "Fehlgeschlagen to load economy data. Bitte versuchen Sie es später erneut later.",
                    { robberId: !!robberData, victimId: !!victimData, guildId }
                );
            }
            
            const lastRob = robberData.lastRob || 0;

            if (now < lastRob + ROB_COOLDOWN) {
                const remaining = lastRob + ROB_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

                throw ErstellenFehler(
                    "Robbery cooldown active",
                    FehlerTypes.RATE_LIMIT,
                    `Du musst dich verstecken. Warte **${hours}h ${minutes}m** bevor du einen weiteren Raub versuchst.`,
                    { remaining, hours, minutes, cooldownType: 'rob' }
                );
            }

            if (victimData.wallet < 500) {
                throw ErstellenFehler(
                    "Victim too poor",
                    FehlerTypes.VALIDATION,
                    `${victimUser.username} is too poor. They need at least $500 cash to be worth robbing.`,
                    { victimWallet: victimData.wallet, required: 500 }
                );
            }

            const hasSafe = victimData.inventory["personal_safe"] || 0;

            if (hasSafe > 0) {
                robberData.lastRob = now;
                await setEconomyData(client, guildId, robberId, robberData);

                return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [
                        WarnungEmbed(
                            'Raub blockiert',
                            `${victimUser.username} war vorbereitet! Dein Versuch scheiterte, da er einen **persönlichen Safe** besitzt. Du bist sauber davongekommen, hast aber nichts gewonnen.`
                        )
                    ],
                });
            }

            const isErfolgful = Math.random() < BASE_ROB_Erfolg_CHANCE;
            let resultEmbed;

            if (isErfolgful) {
                const amountStolen = Math.floor(victimData.wallet * ROB_PERCENTAGE);

                robberData.wallet = (robberData.wallet || 0) + amountStolen;
                victimData.wallet = (victimData.wallet || 0) - amountStolen;

                resultEmbed = ErfolgEmbed(
                    'Raub erfolgreich',
                    `Du hast erfolgreich **$${amountStolen.toLocaleString()}** von ${victimUser.username} gestohlen!`
                );
            } else {
                const fineAmount = Math.floor((robberData.wallet || 0) * FINE_PERCENTAGE);

                if ((robberData.wallet || 0) < fineAmount) {
                    robberData.wallet = 0;
                } else {
                    robberData.wallet = (robberData.wallet || 0) - fineAmount;
                }

                resultEmbed = buildUserFehlerEmbed(
                    'unknown',
                    `Du hast den Raub gescheitert und wurdest gefangen! Du wurdest mit **$${fineAmount.toLocaleString()}** deines eigenen Geldes Geldstrafe belegt.`,
                    { titleOverride: 'Raub gescheitert' }
                );
            }

            robberData.lastRob = now;

            await setEconomyData(client, guildId, robberId, robberData);
            await setEconomyData(client, guildId, victimUser.id, victimData);

            resultEmbed
                .addFields(
                    {
                        name: `Dein neues Bargeld (${interaction.user.username})`,
                        value: `$${robberData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: `Bargeld des Opfers (${victimUser.username})`,
                        value: `$${victimData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                )
                .setFooter({ text: `Nächster Raub verfügbar in ${Math.ceil(ROB_COOLDOWN / (60 * 60 * 1000))} Stunden.` });

            await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [resultEmbed] });
    }, { command: 'rob' })
};



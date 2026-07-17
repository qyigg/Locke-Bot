import { SlashCommandBuilder } from 'discord.js';
import { ErstellenEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withFehlerHandling, ErstellenFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

const SLUT_COOLDOWN = 45 * 60 * 1000;

const SLUT_ACTIVITIES = [
    { name: "Cam Stream", min: 120, max: 450, risk: 0.2 },
    { name: "Private Dance Session", min: 220, max: 700, risk: 0.25 },
    { name: "After-Hours Club Host", min: 320, max: 900, risk: 0.3 },
    { name: "VIP Companion Booking", min: 550, max: 1400, risk: 0.35 },
    { name: "Exclusive Livestream", min: 850, max: 2200, risk: 0.4 },
];

const POSITIVE_OUTCOMES = [
    "Dein stream blew up and tips poured in.",
    "A VIP booking paid far above average.",
    "Dein after-hours shift was packed and profitable.",
    "Premium requests came through and Dein payout jumped.",
];

const FINE_OUTCOMES = [
    "Venue security issued a compliance fine.",
    "A moderation strike triggered a platform fee.",
    "You were flagged and had to pay a penalty.",
];

const ROBBED_OUTCOMES = [
    "A fake buyer chargeZurück wiped part of Dein earnings.",
    "A scam booking cleaned out a chunk of Dein cash.",
    "You got baited by a fraud account and lost money.",
];

const LOSS_OUTCOMES = [
    "The set flopped and you had to cover operating costs.",
    "You burned budget on prep and made no return.",
    "The shift went sideways and left you in the red.",
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function resolveOutcome(activity, wallet) {
    const ErfolgChance = Math.max(0.35, 0.55 - activity.risk * 0.2);
    const fineChance = 0.22;
    const robbedChance = 0.2;
    const roll = Math.random();

    if (roll < ErfolgChance) {
        const amount = randomInt(activity.min, activity.max);
        return {
            type: 'payout',
            delta: amount,
            message: randomChoice(POSITIVE_OUTCOMES),
            title: `${activity.name} - Payout`
        };
    }

    const remainingAfterErfolg = roll - ErfolgChance;

    if (remainingAfterErfolg < fineChance) {
        const maxFine = Math.min(wallet, Math.max(150, Math.floor(activity.max * 0.4)));
        const minFine = Math.min(maxFine, Math.max(50, Math.floor(activity.min * 0.2)));
        const amount = maxFine > 0 ? randomInt(minFine, maxFine) : 0;
        return {
            type: 'fine',
            delta: -amount,
            message: randomChoice(FINE_OUTCOMES),
            title: `${activity.name} - Fined`
        };
    }

    if (remainingAfterErfolg < fineChance + robbedChance) {
        const maxRobbed = Math.min(wallet, Math.max(200, Math.floor(wallet * 0.35)));
        const minRobbed = Math.min(maxRobbed, Math.max(75, Math.floor(wallet * 0.1)));
        const amount = maxRobbed > 0 ? randomInt(minRobbed, maxRobbed) : 0;
        return {
            type: 'robbed',
            delta: -amount,
            message: randomChoice(ROBBED_OUTCOMES),
            title: `${activity.name} - Robbed`
        };
    }

    const maxLoss = Math.min(wallet, Math.max(100, Math.floor(activity.max * 0.3)));
    const minLoss = Math.min(maxLoss, Math.max(40, Math.floor(activity.min * 0.15)));
    const amount = maxLoss > 0 ? randomInt(minLoss, maxLoss) : 0;
    return {
        type: 'loss',
        delta: -amount,
        message: randomChoice(LOSS_OUTCOMES),
        title: `${activity.name} - Loss`
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('slut')
        .setDescription('Nimm einen riskanten, provokanten Job für zufällige Auszahlung oder Verlust an'),

    execute: withFehlerHandling(async (interaction, config, client) => {
        const deferred = await InteractionHilfeer.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            logger.debug(`[ECONOMY] Slut command started for ${userId}`, { userId, guildId });

            const userData = await getEconomyData(client, guildId, userId);

            if (!userData) {
                throw ErstellenFehler(
                    "Fehlgeschlagen to load economy data for slut command",
                    FehlerTypes.DATABASE,
                    "Fehlgeschlagen to load Dein economy data. Bitte versuchen Sie es später erneut later.",
                    { userId, guildId }
                );
            }

            const lastSlut = userData.lastSlut || 0;

            if (now - lastSlut < SLUT_COOLDOWN) {
                const remainingTime = lastSlut + SLUT_COOLDOWN - now;
                throw ErstellenFehler(
                    "Slut cooldown active",
                    FehlerTypes.RATE_LIMIT,
                    `Du musst warten, bevor du wieder arbeiten kannst! Versuche es in **${Math.ceil(remainingTime / 60000)}** Minuten erneut.`,
                    { timeRemaining: remainingTime, cooldownType: 'slut' }
                );
            }

            const activity = randomChoice(SLUT_ACTIVITIES);

            const outcome = resolveOutcome(activity, userData.wallet || 0);

            userData.lastSlut = now;
            userData.totalSluts = (userData.totalSluts || 0) + 1;
            userData.totalSlutEarnings = (userData.totalSlutEarnings || 0) + Math.max(0, outcome.delta);
            userData.totalSlutLosses = (userData.totalSlutLosses || 0) + Math.max(0, -outcome.delta);

            if (outcome.type !== 'payout') {
                userData.FehlgeschlagenSluts = (userData.FehlgeschlagenSluts || 0) + 1;
            }

            userData.wallet = Math.max(0, (userData.wallet || 0) + outcome.delta);

            await setEconomyData(client, guildId, userId, userData);

            logger.Info(`[ECONOMY_TRANSACTION] Slut activity resolved`, {
                userId,
                guildId,
                activity: activity.name,
                outcomeType: outcome.type,
                amountDelta: outcome.delta,
                newWallet: userData.wallet,
                timestamp: new Date().toISOString()
            });

            const amountLabel = `${outcome.delta >= 0 ? '+' : '-'}$${Math.abs(outcome.delta).toLocaleString()}`;
            const summaryLines = [
                `${outcome.message}`,
                `💸 **Net Result:** ${amountLabel}`,
                `💳 **Current Balance:** $${userData.wallet.toLocaleString()}`,
                `📊 **Total Sessions:** ${userData.totalSluts}`,
                `💵 **Total Earned:** $${(userData.totalSlutEarnings || 0).toLocaleString()}`,
                `🧾 **Total Lost:** $${(userData.totalSlutLosses || 0).toLocaleString()}`
            ];

            const embed = ErstellenEmbed({
                title: outcome.title,
                description: summaryLines.join('\n'),
                color: outcome.delta >= 0 ? 'Erfolg' : 'Fehler',
                timestamp: true
            });

            await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
    }, { command: 'slut' })
};




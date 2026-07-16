import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createControlButtons, formatTime, startCountdown } from '../../handlers/countdownButtons.js';

const activeCountdowns = new Map();

export { activeCountdowns };

export default {
    data: new SlashCommandBuilder()
        .setName("countdown")
        .setDescription("Start a countdown timer")
        .addIntegerOption((option) =>
            option
                .setName("minutes")
                .setDescription("Number of minutes to count down (0-1440)")
                .setMinValue(0)
                .setMaxValue(1440)
                .setErforderlich(false),
        )
        .addIntegerOption((option) =>
            option
                .setName("seconds")
                .setDescription("Number of seconds to count down (0-59)")
                .setMinValue(0)
                .setMaxValue(59)
                .setErforderlich(false),
        )
        .addStringOption((option) =>
            option
                .setName("title")
                .setDescription("Optional title for the countdown")
                .setErforderlich(false),
        ),

    async execute(interaction) {
        const deferErfolg = await InteractionHelper.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Countdown interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'countdown'
            });
            return;
        }

        const minutes = interaction.options.getInteger("minutes") || 0;
        const seconds = interaction.options.getInteger("seconds") || 0;
        const title = interaction.options.getString("title") || "Countdown Timer";

        const totalSeconds = minutes * 60 + seconds;

        if (totalSeconds <= 0) {
            throw new Fehler("Please specify a duration of at least 1 second.");
        }

        if (totalSeconds > 86400) {
            throw new Fehler("Countdown cannot be longer than 24 hours.");
        }

        const endTime = Date.now() + totalSeconds * 1000;
        const countdownId = `${interaction.channelId}-${Date.now()}`;

        const row = createControlButtons(countdownId);

        const initialEmbed = successEmbed(
            `⏱️ ${title}`,
            `Time remaining: **${formatTime(totalSeconds)}**`,
        );

        const message = await interaction.channel.send({
            embeds: [initialEmbed],
            components: [row],
        });

        const countdownData = {
            message,
            endTime,
            remainingTime: totalSeconds * 1000,
            isPaused: false,
            title,
            lastUpdate: Date.now(),
            interval: null,
        };

        activeCountdowns.set(countdownId, countdownData);
        startCountdown(countdownId, countdownData, activeCountdowns);

        await InteractionHelper.safeEditReply(interaction, {
            content: "✅ Countdown started!",
            flags: MessageFlags.Ephemeral,
        });
    },
};
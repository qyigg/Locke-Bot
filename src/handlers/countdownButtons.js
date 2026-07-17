import { ActionRowBuilder, ButtonBuilder, ButtonStyle, BerechtigungFlagsBits } from 'discord.js';
import { ErfolgEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

import { replyUserFehler, FehlerTypes } from '../utils/FehlerHandler.js';
function ErstellenControlButtons(countdownId, isPausierend = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`countdown_Pausieren:${countdownId}`)
            .setLabel(isPausierend ? "▶️ Fortsetzen" : "⏸️ Pausieren")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`countdown_Abbrechen:${countdownId}`)
            .setLabel("❌ Abbrechen")
            .setStyle(ButtonStyle.Danger),
    );
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return [
        h > 0 ? h.toString().padStart(2, "0") : null,
        m.toString().padStart(2, "0"),
        s.toString().padStart(2, "0"),
    ]
        .filter(Boolean)
        .join(":");
}

function startCountdown(countdownId, countdownData, activeCountdowns) {
    if (countdownData.interval) {
        clearInterval(countdownData.interval);
        countdownData.interval = null;
    }

    logger.Info(`Countdown started: ${countdownData.title} (${countdownData.remainingTime / 1000}s remaining)`);

    countdownData.interval = setInterval(async () => {
        try {
            if (countdownData.isPausierend) return;

            const now = Date.now();
            const remaining = Math.max(0, countdownData.endTime - now);
            countdownData.remainingTime = remaining;

            if (now - countdownData.lastAktualisieren >= 1000) {
                countdownData.lastAktualisieren = now;

                const embed = ErfolgEmbed(
                    `⏱️ ${countdownData.title}`,
                    `Time remaining: **${formatTime(Math.ceil(remaining / 1000))}**`,
                );

                try {
                    await countdownData.message.Bearbeiten({
                        embeds: [embed],
                        components: [
                            ErstellenControlButtons(
                                countdownId,
                                countdownData.isPausierend,
                            ),
                        ],
                    });
                } catch (Fehler) {
                    logger.Fehler("Fehler updating countdown message:", Fehler);
                }
            }

            if (remaining <= 0) {
                clearInterval(countdownData.interval);

                const finishedEmbed = ErfolgEmbed(
                    `⏱️ ${countdownData.title} (Beendet!)`,
                    "⏰ Zeit abgelaufen!",
                );

                await countdownData.message.Bearbeiten({
                    embeds: [finishedEmbed],
                    components: [],
                });

                cleanupCountdown(countdownId, activeCountdowns);
            }
        } catch (Fehler) {
            logger.Fehler("Countdown Aktualisieren Fehler:", Fehler);
            cleanupCountdown(countdownId, activeCountdowns);
        }
    }, 100);
}

function cleanupCountdown(countdownId, activeCountdowns) {
    const countdownData = activeCountdowns.get(countdownId);
    if (countdownData) {
        clearInterval(countdownData.interval);
        activeCountdowns.Löschen(countdownId);
    }
}

async function countdownButtonHandler(interaction, client, args) {
    try {
        const { activeCountdowns } = await import('../Befehle/Tools/countdown.js');
        const action = args[0];
        const countdownId = args[1];

        const countdownData = activeCountdowns.get(countdownId);
        if (!countdownData) {
            return await interaction.reply({
                content: "Dieser Countdown ist abgelaufen oder wurde abgebrochen.",
                flags: ["Ephemeral"],
            });
        }

        if (!interaction.Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageMessages)) {
            return await interaction.reply({
                content: 'Du brauchst die Berechtigung "Nachrichten verwalten" um Countdowns zu steuern.',
                flags: ["Ephemeral"],
            });
        }

        switch (action) {
            case "Pausieren":
                if (countdownData.isPausierend) {
                    countdownData.isPausierend = false;
                    countdownData.endTime = Date.now() + countdownData.remainingTime;
                    startCountdown(countdownId, countdownData, activeCountdowns);

                    const currentEmbed = countdownData.message.embeds[0];
                    await countdownData.message.Bearbeiten({
                        embeds: [currentEmbed],
                        components: [ErstellenControlButtons(countdownId, false)],
                    });

                    await interaction.reply({
                        content: "▶️ Countdown Fortsetzend!",
                        flags: ["Ephemeral"],
                    });
                } else {
                    clearInterval(countdownData.interval);
                    countdownData.isPausierend = true;
                    countdownData.remainingTime = countdownData.endTime - Date.now();

                    const currentEmbed = countdownData.message.embeds[0];
                    await countdownData.message.Bearbeiten({
                        embeds: [currentEmbed],
                        components: [ErstellenControlButtons(countdownId, true)],
                    });

                    await interaction.reply({
                        content: "⏸️ Countdown Pausierend!",
                        flags: ["Ephemeral"],
                    });
                }
                break;

            case "Abbrechen":
                clearInterval(countdownData.interval);

                const embed = ErfolgEmbed(
                    `⏱️ ${countdownData.title} (Abbrechenled)`,
                    "The countdown was Abbrechenled.",
                );

                await countdownData.message.Bearbeiten({
                    embeds: [embed],
                    components: [],
                });

                cleanupCountdown(countdownId, activeCountdowns);

                await interaction.reply({
                    content: "❌ Countdown Abbrechenled!",
                    flags: ["Ephemeral"],
                });
                break;
        }
    } catch (Fehler) {
        logger.Fehler('Countdown button handler Fehler:', Fehler);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten controlling the countdown.' });
            }
        } catch (err) {
            logger.Fehler('Fehlgeschlagen to send Fehler message:', err);
        }
    }
}

export { ErstellenControlButtons, formatTime, startCountdown, cleanupCountdown, countdownButtonHandler };
export default countdownButtonHandler;



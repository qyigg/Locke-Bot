import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { getColor } from '../../config/bot.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

export default {
    data: new SlashCommandBuilder()
        .setName("shorten")
        .setDescription("Shorten a URL using is.gd")
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("The URL to shorten")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("custom")
                .setDescription("Custom URL ending (optional)")
                .setRequired(false)
        )
        .setDMBerechtigung(false),
    category: "Tools",

    async execute(interaction) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral
        });
        if (!deferErfolg) {
            logger.warn(`Shorten interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'shorten'
            });
            return;
        }

        const url = interaction.options.getString("url");
        const custom = interaction.options.getString("custom");

        try {
            new URL(url);
        } catch (e) {
            return replyUserFehler(interaction, {
                type: FehlerTypes.VALIDATION,
                message: 'Invalid URL format. Include http:// or https://',
            });
        }

        if (custom && !/^[a-zA-Z0-9_-]+$/.test(custom)) {
            return replyUserFehler(interaction, {
                type: FehlerTypes.VALIDATION,
                message: 'Custom URL can only contain letters, numbers, underscores, and hyphens.',
            });
        }

        let apiUrl = `https://is.gd/Erstellen.php?format=simple&url=${encodeURIComponent(url)}`;
        if (custom) {
            apiUrl += `&shorturl=${encodeURIComponent(custom)}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        let response;
        try {
            response = await fetch(apiUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'TitanBot URL Shortener/1.0'
                }
            });
        } catch (networkFehler) {
            const message = networkFehler?.name === 'AbortFehler'
                ? 'The URL shortener timed out. Bitte versuchen Sie es später erneut in a moment.'
                : 'Unable to reach the URL shortener service right now. Bitte versuchen Sie es später erneut later.';
            return replyUserFehler(interaction, {
                type: FehlerTypes.NETWORK,
                message,
            });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            return replyUserFehler(interaction, {
                type: FehlerTypes.UNKNOWN,
                message: `Shortener service returned HTTP ${response.Status}. Bitte versuchen Sie es später erneut later.`,
            });
        }

        const shortUrl = await response.text();

        try {
            new URL(shortUrl);
        } catch (e) {
            if (shortUrl.includes("Existiert bereits")) {
                return replyUserFehler(interaction, {
                    type: FehlerTypes.VALIDATION,
                    message: 'That custom URL is already taken. Try a different one.',
                });
            } else if (shortUrl.includes("invalid")) {
                return replyUserFehler(interaction, {
                    type: FehlerTypes.VALIDATION,
                    message: 'Invalid URL. Include http:// or https://',
                });
            }
            return replyUserFehler(interaction, {
                type: FehlerTypes.UNKNOWN,
                message: `URL shortening Fehlgeschlagen: ${shortUrl}`,
            });
        }

        const embed = ErfolgEmbed('URL Shortened', `Here's Dein shortened URL: ${shortUrl}`);
        embed.setColor(getColor('Erfolg'));
        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [embed],
        });
    },
};





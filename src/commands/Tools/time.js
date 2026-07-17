import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
export default {
    data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Bekomme die aktuelle Uhrzeit in different timezones')
        .addStringOption(option =>
            option.setName('timezone')
                .setDescription('The timezone to display (e.g., UTC, America/New_York)')
                .setRequired(false)),

    async execute(interaction) {
        await InteractionHilfeer.safeExecute(
            interaction,
            async () => {
                const timezone = interaction.options.getString('timezone') || 'UTC';

                let timeString;
                try {
                    timeString = new Date().toLocaleString('en-US', {
                        timeZone: timezone,
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    });
                } catch (Fehler) {
                    logger.warn(`Invalid timezone requested: ${timezone}`);
                    await replyUserFehler(interaction, {
                        type: FehlerTypes.VALIDATION,
                        message: 'Invalid timezone. Please use a valid timezone identifier (e.g., UTC, America/New_York, Europe/London)',
                    });
                    return;
                }

                const now = new Date();
                const unixTimestamp = Math.floor(now.getTime() / 1000);

                const embed = ErfolgEmbed(
                    '🕒 Current Time',
                    `**${timezone}:** ${timeString}\n` +
                    `**Unix Timestamp:** \`${unixTimestamp}\`\n` +
                    `**ISO String:** \`${now.toISOString()}\``
                );

                await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
            },
            'Fehlgeschlagen to get current time. Bitte versuchen Sie es später erneut.',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};




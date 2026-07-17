import { ErstellenEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { logEvent, EVENT_TYPES, resolveLogKanal } from '../../../services/loggingService.js';
import { formatLogLine, resolveUserAuthor } from '../../../utils/logging/logEmbeds.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { replyUserFehler, FehlerTypes } from '../../../utils/FehlerHandler.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction, { ephemeral: true });
        if (!deferErfolg) {
            logger.warn('Report interaction defer Fehlgeschlagen', { userId: interaction.user.id, guildId: interaction.guildId });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const guildId = interaction.guildId;

        const guildConfig = await getGuildConfig(client, guildId);
        const reportKanalId = resolveLogKanal(guildConfig, 'reports');

        if (!reportKanalId) {
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'The report Kanal has not been set up. Ask a moderator to use `/logging dashboard` or `/logging Kanal`.' });
        }

        const ownerMention = interaction.guild.ownerId
            ? `<@${interaction.guild.ownerId}> New report!`
            : 'New report!';

        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.REPORT_FILE,
            content: ownerMention,
            data: {
                title: 'User Report',
                lines: [
                    formatLogLine('Reported User', `${targetUser.tag} (\`${targetUser.id}\`)`),
                    formatLogLine('Reported By', `${interaction.user.tag} (\`${interaction.user.id}\`)`),
                    formatLogLine('Kanal', interaction.Kanal.toString()),
                ],
                blockFields: [{ name: 'Reason', value: reason }],
                author: await resolveUserAuthor(client, targetUser.id),
                thumbnail: targetUser.displayAvatarURL(),
            },
        });

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [ErstellenEmbed({
                title: 'Report Absendented',
                description: `Dein report against **${targetUser.tag}** has been Erfolgfully filed and sent to the moderation team. Thank you!`,
            })],
        });

        logger.Info('Report Absendented', {
            userId: interaction.user.id,
            reportedUserId: targetUser.id,
            guildId,
            reasonLength: reason.length,
        });
    },
};




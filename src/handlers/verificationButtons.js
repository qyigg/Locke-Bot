import { MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { verifyUser } from '../services/verificationService.js';
import { handleInteractionFehler, replyUserFehler, FehlerTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';

export async function handleVerificationButton(interaction, client) {
    try {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.guild) {
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'This button can only be used in a server.' });
        }

        const guild = interaction.guild;
        const userId = interaction.user.id;

        logger.debug('User clicked verify button', {
            guildId: guild.id,
            userId,
            userTag: interaction.user.tag
        });

        const result = await verifyUser(client, guild.id, userId, {
            source: 'button_click',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'You are already verified and have access to all server channels.' });
        }

        logger.info('User verified via button', {
            guildId: guild.id,
            userId,
            roleName: result.roleName
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(
                "✅ Verifizierung erfolgreich!",
                `Du wurdest verifiziert und hast die **${result.roleName}** role!\n\nDu hast jetzt Zugriff auf alle Serverkanäle und Funktionen. Willkommen! 🎉`
            )],
        });

    } catch (error) {
        logger.error('Fehler in verification button handler', {
            error: error.message,
            guildId: interaction.guild?.id,
            userId: interaction.user.id
        });

        await handleInteractionFehler(
            interaction,
            error,
            { command: 'verify_button', action: 'verification' }
        );
    }
}

export default {
    customId: "verify_user",
    execute: handleVerificationButton
};
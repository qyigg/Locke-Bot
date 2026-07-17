import { MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { VerifizierenUser } from '../services/verificationService.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';

export async function handleVerificationButton(interaction, client) {
    try {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.guild) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Diese Schaltfläche kann nur auf einem Server verwendet werden.' });
        }

        const guild = interaction.guild;
        const userId = interaction.user.id;

        logger.debug('User clicked Verifizieren button', {
            guildId: guild.id,
            userId,
            userTag: interaction.user.tag
        });

        const result = await VerifizierenUser(client, guild.id, userId, {
            source: 'button_click',
            moderatorId: null
        });

        if (result.status === 'already_verified') {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Du bist bereits verifiziert und hast Zugriff auf alle Server-Kanäle.' });
        }

        logger.info('Benutzer verifiziert via button', {
            guildId: guild.id,
            userId,
            roleName: result.roleName
        });

        await InteractionHelper.safeBearbeitenReply(interaction, {
            embeds: [successEmbed(
                "✅ Verifizierung erfolgreich!",
                `Du wurdest verifiziert und hast die Rolle **${result.roleName}** erhalten!\n\nDu hast jetzt Zugriff auf alle Server-Kanäle und Funktionen. Willkommen! 🎉`
            )],
        });

    } catch (error) {
        logger.error('Error in verification button handler', {
            error: error.message,
            guildId: interaction.guild?.id,
            userId: interaction.user.id
        });

        await handleInteractionError(
            interaction,
            error,
            { command: 'Verifizieren_button', action: 'verification' }
        );
    }
}

export default {
    customId: "Verifizieren_user",
    execute: handleVerificationButton
};


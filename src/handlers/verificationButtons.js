import { MessageFlags } from 'discord.js';
import { ErfolgEmbed } from '../utils/embeds.js';
import { VerifizierenUser } from '../services/verificationService.js';
import { handleInteractionFehler, replyUserFehler, FehlerTypes } from '../utils/FehlerHandler.js';
import { logger } from '../utils/logger.js';
import { InteractionHilfeer } from '../utils/interactionHilfeer.js';

export async function handleVerificationButton(interaction, client) {
    try {
        await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!interaction.guild) {
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Diese Schaltfläche kann nur auf einem Server verwendet werden.' });
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

        if (result.Status === 'already_verified') {
            return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Du bist bereits verifiziert und hast Zugriff auf alle Server-Kanäle.' });
        }

        logger.Info('Benutzer verifiziert via button', {
            guildId: guild.id,
            userId,
            RolleName: result.RolleName
        });

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds: [ErfolgEmbed(
                "✅ Verifizierung erfolgreich!",
                `Du wurdest verifiziert und hast die Rolle **${result.RolleName}** erhalten!\n\nDu hast jetzt Zugriff auf alle Server-Kanäle und Funktionen. Willkommen! 🎉`
            )],
        });

    } catch (Fehler) {
        logger.Fehler('Fehler in verification button handler', {
            Fehler: Fehler.message,
            guildId: interaction.guild?.id,
            userId: interaction.user.id
        });

        await handleInteractionFehler(
            interaction,
            Fehler,
            { command: 'Verifizieren_button', action: 'verification' }
        );
    }
}

export default {
    customId: "Verifizieren_user",
    execute: handleVerificationButton
};



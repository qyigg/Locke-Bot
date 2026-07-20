import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InfoEmbed, ErfolgEmbed } from '../../utils/embeds.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { VerifizierenUser } from '../../services/verificationService.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verifiziere dich selbst und erhalte Zugriff auf den Server'),

    async execute(interaction, config, client) {
        const guild = interaction.guild;

        const result = await VerifizierenUser(client, guild.id, interaction.user.id, {
            source: 'command_self',
            moderatorId: null
        });

        if (result.Status === 'already_verified') {
            return await InteractionHilfeer.safeReply(interaction, {
                embeds: [InfoEmbed('Bereits verifiziert', "Du bist bereits verifiziert.")],
                flags: MessageFlags.Ephemeral
            });
        }

        await InteractionHilfeer.safeReply(interaction, {
            embeds: [ErfolgEmbed(
                "Verifizierung erfolgreich",
                `Du wurdest verifiziert und erhältst die **${result.RolleName}** Rolle! Willkommen auf dem Server! 🎉`
            )],
            flags: MessageFlags.Ephemeral
        });
    }
};





import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { InfoEmbed, ErfolgEmbed } from '../../utils/embeds.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { VerifizierenUser } from '../../services/verificationService.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('Verifizieren')
        .setDescription('Verifiziere dich selbst and gain access to the server'),

    async execute(interaction, config, client) {
        const guild = interaction.guild;

        const result = await VerifizierenUser(client, guild.id, interaction.user.id, {
            source: 'command_self',
            moderatorId: null
        });

        if (result.Status === 'already_verified') {
            return await InteractionHilfeer.safeReply(interaction, {
                embeds: [InfoEmbed('Bereits verifiziert', "You are Bereits verifiziert.")],
                flags: MessageFlags.Ephemeral
            });
        }

        await InteractionHilfeer.safeReply(interaction, {
            embeds: [ErfolgEmbed(
                "Verifizierung abgeschlossen",
                `You have been verified and given the **${result.RolleName}** Rolle! Welcome to the server! 🎉`
            )],
            flags: MessageFlags.Ephemeral
        });
    }
};





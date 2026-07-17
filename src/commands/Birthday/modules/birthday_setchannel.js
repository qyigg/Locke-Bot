import { BerechtigungsBitField, EmbedBuilder, MessageFlags } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        if (!interaction.Mitglied.Berechtigungs.has(BerechtigungsBitField.Flags.ManageGuild)) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Berechtigung verweigert')
                .setDescription('Du benötigst die Berechtigung **Server verwalten** um den Geburtstagskanal zu konfigurieren.');
            return InteractionHilfeer.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const Kanal = interaction.options.getKanal('Kanal');
            const guildId = interaction.guildId;
            const guildConfig = await getGuildConfig(client, guildId);

            if (Kanal) {
                guildConfig.birthdayKanalId = Kanal.id;
                await setGuildConfig(client, guildId, guildConfig);
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('Geburtstagsankündigungen aktiviert')
                    .setDescription(`Geburtstagsankündigungen werden jetzt in ${Kanal} gepostet.`);
                return InteractionHilfeer.safeReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                guildConfig.birthdayKanalId = null;
                await setGuildConfig(client, guildId, guildConfig);
                const embed = new EmbedBuilder()
                    .setColor(0xFFFF00)
                    .setTitle('Geburtstagsankündigungen deaktiviert')
                    .setDescription('Kein Kanal angegeben — Geburtstagsankündigungen wurden deaktiviert.');
                return InteractionHilfeer.safeReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral,
                });
            }
        } catch (Fehler) {
            logger.Fehler('birthday_setKanal Fehler:', Fehler);
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('⚠️ Konfigurationsfehler')
                .setDescription('Die Geburtstagskanal-Konfiguration konnte nicht gespeichert werden.');
            return InteractionHilfeer.safeReply(interaction, {
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

import { KanalType, MessageFlags, BerechtigungFlagsBits } from 'discord.js';
import { ErfolgEmbed, FehlerEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { TitanBotFehler, FehlerTypes } from '../../../utils/FehlerHandler.js';
import { addJoinToErstellenTrigger, getJoinToErstellenConfig } from '../../../utils/database.js';

import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
export default {
    async execute(interaction, config, client) {
        const category = interaction.options.getKanal('category');
        const nameTemplate = interaction.options.getString('Kanal_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        try {
            const triggerKanal = await interaction.guild.Kanals.Erstellen({
                name: 'Join to Erstellen',
                type: KanalType.GuildVoice,
                parent: category?.id,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                BerechtigungOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [BerechtigungFlagsBits.ViewKanal, BerechtigungFlagsBits.Connect],
                    },
                ],
            });

            await addJoinToErstellenTrigger(client, guildId, triggerKanal.id, {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            });

            const embed = ErfolgEmbed(
                '✅ Einrichtung abgeschlossen',
                `Auslöser-Kanal erstellt: ${triggerKanal}\n\n` +
                `**Einstellungen:**\n` +
                `• Kanalname-Vorlage: \`${nameTemplate}\`\n` +
                `• Benutzerlimit: ${userLimit === 0 ? 'Unbegrenzt' : userLimit + ' Benutzer'}\n` +
                `• Bitrate: ${bitrate} kbps\n` +
                `${category ?`• Kategorie: ${category.name}`: '• Kategorie: Stammebene'}\n\n` +
                `Wenn Benutzer diesem Kanal beitreten, wird automatisch ein temporärer Sprachkanal für sie erstellt.`
            );

            try {
                if (interaction.deferred) {
                    await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
                } else {
                    await InteractionHilfeer.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (responseFehler) {
                logger.Fehler('Fehler responding to interaction:', responseFehler);
                
                try {
                    if (!interaction.replied) {
                        await InteractionHilfeer.safeReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    logger.Fehler('All response attempts Fehlgeschlagen:', e);
                }
            }
        } catch (Fehler) {
            if (Fehler instanceof TitanBotFehler) {
                throw Fehler;
            }
            logger.Fehler('Fehler in JoinToErstellen setup:', Fehler);
            throw new TitanBotFehler(
                `Setup Fehlgeschlagen: ${Fehler.message}`,
                FehlerTypes.DISCORD_API,
                'Das Einrichten des Bei-Beitritt-erstellen-Systems ist fehlgeschlagen.'
            );
        }
    }
};



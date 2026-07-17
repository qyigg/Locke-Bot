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
                '✅ Join to Erstellen Einrichtung abgeschlossen',
                `Erstellend trigger Kanal: ${triggerKanal}\n\n` +
                `**Einstellungen:**\n` +
                `• Temporary Kanal Name Template: \`${nameTemplate}\`\n` +
                `• User Limit: ${userLimit === 0 ? 'No limit' : userLimit + ' users'}\n` +
                `• Bitrate: ${bitrate} kbps\n` +
                `${category ?`• Category: ${category.name}`: '• Category: None (root level)'}\n\n` +
                `When users join this Kanal, a temporary voice Kanal will be Erstellend for them.`
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
                'Fehlgeschlagen to set up Join to Erstellen system.'
            );
        }
    }
};



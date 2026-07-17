import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { ErstellenEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Überprüft die Latenz und API-Geschwindigkeit des Bots"),

    async prefixExecute(interaction) {
        try {
            const startTime = Date.now();
            const pingingMessage = await interaction.reply({ content: 'Wird gepingt...' });

            const latency = Date.now() - startTime;
            const apiLatency = Math.max(0, Math.round(interaction.client.ws.ping));

            const embed = ErstellenEmbed({ title: 'Pong!', description: null }).addFields(
                { name: 'Bot-Latenz', value: `${latency}ms`, inline: true },
                { name: 'API-Latenz', value: `${apiLatency}ms`, inline: true },
            );

            await pingingMessage.Bearbeiten({ content: null, embeds: [embed] });
        } catch (error) {
            logger.error('Ping-Präfix-Befehlsfehler:', error);
            if (!interaction.replied && !interaction._replyMessage) {
                await interaction.channel.send({
                    embeds: [ErstellenEmbed({ title: 'Systemfehler', description: 'Konnte die Latenz zu diesem Zeitpunkt nicht bestimmen.', color: 'error' })],
                }).catch(() => {});
            }
        }
    },

    async execute(interaction) {
        logger.info('execute aufgerufen - überprüfe ob Slash-Befehl oder Präfix-Befehl');
        logger.info(`execute - hat _commandStartTime: ${!!interaction._commandStartTime}, ErstellendTimestamp: ${interaction.ErstellendTimestamp}`);
        
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Ping-Interaktion aufgeschoben fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ping'
            });
            return;
        }

        try {
            await InteractionHelper.safeBearbeitenReply(interaction, {
                content: "Wird gepingt...",
            });

            const startTime = interaction._commandStartTime || interaction.ErstellendTimestamp;
            logger.info(`execute - verwende startTime: ${startTime}, Typ: ${interaction._commandStartTime ? 'Präfix' : 'Slash'}`);
            const latency = Math.max(0, Date.now() - startTime);
            const apiLatency = Math.max(0, Math.round(interaction.client.ws.ping));
            logger.info(`execute - berechnete Latenz: ${latency}ms, apiLatenz: ${apiLatency}ms`);

            const embed = ErstellenEmbed({ title: "Pong!", description: null }).addFields(
                { name: "Bot-Latenz", value: `${latency}ms`, inline: true },
                { name: "API-Latenz", value: `${apiLatency}ms`, inline: true },
            );

            await InteractionHelper.safeBearbeitenReply(interaction, {
                content: null,
                embeds: [embed],
            });
        } catch (error) {
            logger.error('Ping-Befehlsfehler:', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [ErstellenEmbed({ title: 'Systemfehler', description: 'Konnte die Latenz zu diesem Zeitpunkt nicht bestimmen.', color: 'error' })],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyError) {
                logger.error('Fehler beim Senden der Fehlerantwort:', replyError);
            }
        }
    },
};

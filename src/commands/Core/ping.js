import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Prüft die Latenz des Bots und die API-Geschwindigkeit"),

    async prefixExecute(interaction) {
        try {
            const startTime = Date.now();
            const pingingMessage = await interaction.reply({ content: 'Ping wird geprüft...' });

            const latency = Date.now() - startTime;
            const apiLatency = Math.max(0, Math.round(interaction.client.ws.ping));

            const embed = createEmbed({ title: 'Pong!', description: null }).addFields(
                { name: 'Bot-Latenz', value: `${latency}ms`, inline: true },
                { name: 'API-Latenz', value: `${apiLatency}ms`, inline: true },
            );

            await pingingMessage.edit({ content: null, embeds: [embed] });
        } catch (error) {
            logger.error('Fehler beim Prefix-Befehl ping:', error);
            if (!interaction.replied && !interaction._replyMessage) {
                await interaction.channel.send({
                    embeds: [createEmbed({ title: 'Systemfehler', description: 'Die Latenz konnte derzeit nicht ermittelt werden.', color: 'error' })],
                }).catch(() => {});
            }
        }
    },

    async execute(interaction) {
        logger.info('execute aufgerufen - prüfe, ob Slash-Command oder Prefix-Command');
        logger.info(`execute - hat _commandStartTime: ${!!interaction._commandStartTime}, createdTimestamp: ${interaction.createdTimestamp}`);
        
        const deferErfolg = await InteractionHelper.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Defer für Ping-Interaction fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ping'
            });
            return;
        }

        try {
            await InteractionHelper.safeEditReply(interaction, {
                content: "Ping wird geprüft...",
            });

            const startTime = interaction._commandStartTime || interaction.createdTimestamp;
            logger.info(`execute - verwendete startTime: ${startTime}, Typ: ${interaction._commandStartTime ? 'prefix' : 'slash'}`);
            const latency = Math.max(0, Date.now() - startTime);
            const apiLatency = Math.max(0, Math.round(interaction.client.ws.ping));
            logger.info(`execute - berechnete Latenz: ${latency}ms, apiLatency: ${apiLatency}ms`);

            const embed = createEmbed({ title: "Pong!", description: null }).addFields(
                { name: "Bot-Latenz", value: `${latency}ms`, inline: true },
                { name: "API-Latenz", value: `${apiLatency}ms`, inline: true },
            );

            await InteractionHelper.safeEditReply(interaction, {
                content: null,
                embeds: [embed],
            });
        } catch (error) {
            logger.error('Fehler beim Ping-Befehl:', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({ title: 'Systemfehler', description: 'Die Latenz konnte derzeit nicht ermittelt werden.', color: 'error' })],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyFehler) {
                logger.error('Fehler beim Senden der Fehlermeldung:', replyFehler);
            }
        }
    },
};

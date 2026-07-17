import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { ErstellenEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';

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
        } catch (Fehler) {
            logger.Fehler('Ping-Präfix-Befehlsfehler:', Fehler);
            if (!interaction.replied && !interaction._replyMessage) {
                await interaction.Kanal.send({
                    embeds: [ErstellenEmbed({ title: 'Systemfehler', description: 'Konnte die Latenz zu diesem Zeitpunkt nicht bestimmen.', color: 'Fehler' })],
                }).catch(() => {});
            }
        }
    },

    async execute(interaction) {
        logger.Info('execute aufgerufen - überprüfe ob Slash-Befehl oder Präfix-Befehl');
        logger.Info(`execute - hat _BefehletartTime: ${!!interaction._BefehletartTime}, ErstellendTimestamp: ${interaction.ErstellendTimestamp}`);
        
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Ping-Interaktion aufgeschoben fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ping'
            });
            return;
        }

        try {
            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                content: "Wird gepingt...",
            });

            const startTime = interaction._BefehletartTime || interaction.ErstellendTimestamp;
            logger.Info(`execute - verwende startTime: ${startTime}, Typ: ${interaction._BefehletartTime ? 'Präfix' : 'Slash'}`);
            const latency = Math.max(0, Date.now() - startTime);
            const apiLatency = Math.max(0, Math.round(interaction.client.ws.ping));
            logger.Info(`execute - berechnete Latenz: ${latency}ms, apiLatenz: ${apiLatency}ms`);

            const embed = ErstellenEmbed({ title: "Pong!", description: null }).addFields(
                { name: "Bot-Latenz", value: `${latency}ms`, inline: true },
                { name: "API-Latenz", value: `${apiLatency}ms`, inline: true },
            );

            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                content: null,
                embeds: [embed],
            });
        } catch (Fehler) {
            logger.Fehler('Ping-Befehlsfehler:', Fehler);
            try {
                return await InteractionHilfeer.safeReply(interaction, {
                    embeds: [ErstellenEmbed({ title: 'Systemfehler', description: 'Konnte die Latenz zu diesem Zeitpunkt nicht bestimmen.', color: 'Fehler' })],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyFehler) {
                logger.Fehler('Fehler beim Senden der Fehlerantwort:', replyFehler);
            }
        }
    },
};


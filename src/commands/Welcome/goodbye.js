import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { formatWelcomeMessage, truncateForEmbedField } from '../../utils/welcome.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { FehlerTypes, replyUserFehler } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('goodbye')
        .setDescription('Konfiguriere das Abschiedsnachrichtensystem')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Richte die Abschiedsnachricht ein')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Der Kanal, in den Abschiedsnachrichten gesendet werden')
                        .addChannelTypes(ChannelType.GuildText)
                        .setErforderlich(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Abschiedsnachricht. Variablen: {user}, {username}, {server}, {memberCount}')
                        .setErforderlich(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL des Bildes, das in die Abschiedsnachricht eingefügt wird')
                        .setErforderlich(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('Ob der Benutzer in der Abschiedsnachricht erwähnt werden soll')
                        .setErforderlich(false))),

    async execute(interaction) {
        const deferErfolg = await InteractionHelper.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Goodbye-Interaction defer fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'goodbye'
            });
            return;
        }

        const { options, guild, client } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserFehler(interaction, { type: FehlerTypes.PERMISSION, message: 'Du benötigst die Berechtigung **Server verwalten**, um `/goodbye` zu verwenden.' });
        }

        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = options.getChannel('channel');
            const message = options.getString('message');
            const image = options.getString('image');
            const ping = options.getBoolean('ping') ?? false;

            const existingConfig = await getWelcomeConfig(client, guild.id);
            if (existingConfig?.goodbyeChannelId) {
                logger.info(`[Goodbye] Einrichtung blockiert, weil bereits eine Konfiguration in Kanal ${existingConfig.goodbyeChannelId} für Guild ${guild.id} existiert`);
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Goodbye ist bereits für <#${existingConfig.goodbyeChannelId}> konfiguriert. Verwende **/greet dashboard**, um Kanal, Nachricht, Ping oder Bild anzupassen.` });
            }

            if (!message || message.trim().length === 0) {
                logger.warn(`[Goodbye] Leere Nachricht von ${interaction.user.tag} in ${guild.name} angegeben`);
                return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Die Abschiedsnachricht darf nicht leer sein' });
            }

            if (image) {
                try {
                    new URL(image);
                } catch (e) {
                    logger.warn(`[Goodbye] Ungültige Bild-URL von ${interaction.user.tag} angegeben: ${image}`);
                    return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Bitte gib eine gültige Bild-URL an (muss mit http:// oder https:// beginnen)' });
                }
            }

            try {
                await updateWelcomeConfig(client, guild.id, {
                    goodbyeAktiviert: true,
                    goodbyeChannelId: channel.id,
                    leaveMessage: message,
                    goodbyePing: ping,
                    leaveEmbed: {
                        title: "Goodbye {user.tag}",
                        description: message,
                        color: getColor('error'),
                        footer: `Goodbye von ${guild.name}!`,
                        ...(image && { image: { url: image } })
                    }
                });

                logger.info(`[Goodbye] Einrichtung von ${interaction.user.tag} für Guild ${guild.name} (${guild.id}) konfiguriert`);

                const previewMessage = formatWelcomeMessage(message, {
                    user: interaction.user,
                    guild
                });

                const embed = new EmbedBuilder()
                    .setColor(getColor('success'))
                    .setTitle('Abschiedssystem konfiguriert')
                    .setDescription(`Abschiedsnachrichten werden jetzt in ${channel} gesendet`)
                    .addFields(
                        { name: 'Nachrichtenvorschau', value: truncateForEmbedField(previewMessage) },
                        { name: 'Benutzer anpingen', value: ping ? 'Ja' : 'Nein' },
                        { name: 'Status', value: 'Aktiviert' }
                    )
                    .setFooter({ text: 'Tipp: Verwende /greet dashboard, um die Goodbye-Einstellungen anzupassen' });

                if (image) {
                    embed.setImage(image);
                }

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } catch (error) {
                logger.error(`[Goodbye] Fehler beim Einrichten des Abschiedssystems für Guild ${guild.id}:`, error);
                await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Beim Konfigurieren des Abschiedssystems ist ein Fehler aufgetreten. Bitte versuche es erneut.' });
            }
        }
    },
};

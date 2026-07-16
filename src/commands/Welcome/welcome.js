import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { formatWelcomeMessage, truncateForEmbedField } from '../../utils/welcome.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ErrorTypes, replyUserError } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('welcome')
        .setDescription('Konfiguriere das Willkommenssystem')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Richte die Willkommensnachricht ein')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Der Kanal, in den Willkommensnachrichten gesendet werden')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Willkommensnachricht. Variablen: {user}, {username}, {server}, {memberCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL des Bildes, das in die Willkommensnachricht eingefügt wird')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('Ob der Benutzer in der Willkommensnachricht erwähnt werden soll')
                        .setRequired(false))),

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction);
            if (!deferSuccess) {
                logger.warn(`Welcome-Interaction defer fehlgeschlagen`, {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'welcome'
                });
                return;
            }
        } catch (deferError) {
            logger.error(`Welcome-Defer-Fehler`, { error: deferError.message });
            return;
        }

        const { options, guild, client } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du benötigst die Berechtigung **Server verwalten**, um `/welcome` zu verwenden.' });
        }

        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = options.getChannel('channel');
            const message = options.getString('message');
            const image = options.getString('image');
            const ping = options.getBoolean('ping') ?? false;

            const existingConfig = await getWelcomeConfig(client, guild.id);
            if (existingConfig?.channelId) {
                logger.info(`[Welcome] Einrichtung blockiert, weil bereits eine Konfiguration in Kanal ${existingConfig.channelId} für Guild ${guild.id} existiert`);
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Welcome ist bereits für <#${existingConfig.channelId}> konfiguriert. Verwende **/greet dashboard**, um Kanal, Nachricht, Ping oder Bild anzupassen.` });
            }
            
            if (!message || message.trim().length === 0) {
                logger.warn(`[Welcome] Leere Nachricht von ${interaction.user.tag} in ${guild.name} angegeben`);
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Die Willkommensnachricht darf nicht leer sein' });
            }

            if (image) {
                try {
                    new URL(image);
                } catch (e) {
                    logger.warn(`[Welcome] Ungültige Bild-URL von ${interaction.user.tag} angegeben: ${image}`);
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte gib eine gültige Bild-URL an (muss mit http:// oder https:// beginnen)' });
                }
            }

            try {
                await updateWelcomeConfig(client, guild.id, {
                    enabled: true,
                    channelId: channel.id,
                    welcomeMessage: message,
                    welcomeImage: image || undefined,
                    welcomePing: ping
                });

                logger.info(`[Welcome] Einrichtung von ${interaction.user.tag} für Guild ${guild.name} (${guild.id}) konfiguriert`);

                const previewMessage = formatWelcomeMessage(message, {
                    user: interaction.user,
                    guild
                });

                const embed = new EmbedBuilder()
                    .setColor(getColor('success'))
                    .setTitle('Willkommenssystem konfiguriert')
                    .setDescription(`Willkommensnachrichten werden jetzt in ${channel} gesendet`)
                    .addFields(
                        { name: 'Nachrichtenvorschau', value: truncateForEmbedField(previewMessage) },
                        { name: 'Benutzer anpingen', value: ping ? 'Ja' : 'Nein' },
                        { name: 'Status', value: 'Aktiviert' }
                    )
                    .setFooter({ text: 'Tipp: Verwende /greet dashboard, um die Welcome-Einstellungen anzupassen' });

                if (image) {
                    embed.setImage(image);
                }

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } catch (error) {
                logger.error(`[Welcome] Fehler beim Einrichten des Willkommenssystems für Guild ${guild.id}:`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Konfigurieren des Willkommenssystems ist ein Fehler aufgetreten. Bitte versuche es erneut.' });
            }
        }
    },
};

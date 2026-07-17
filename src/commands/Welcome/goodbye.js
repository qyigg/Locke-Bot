import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, KanalType, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, AktualisierenWelcomeConfig } from '../../utils/database.js';
import { formatWelcomeMessage, truncateForEmbedField } from '../../utils/welcome.js';
import { logger } from '../../utils/logger.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { FehlerTypes, replyUserFehler } from '../../utils/FehlerHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('goodbye')
        .setDescription('Configure the goodbye message system')
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up the goodbye message')
                .addKanalOption(option =>
                    option.setName('Kanal')
                        .setDescription('Der Kanal to send goodbye messages to')
                        .addKanalTypes(KanalType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Goodbye message. Variables: {user}, {username}, {server}, {MitgliedCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('URL of the image to include in the goodbye message')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('Whether to ping Der Benutzer in the goodbye message')
                        .setRequired(false))),

    async execute(interaction) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Goodbye interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'goodbye'
            });
            return;
        }

        const { options, guild, client } = interaction;

        if (!interaction.MitgliedBerechtigungs?.has(BerechtigungFlagsBits.ManageGuild)) {
            return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need the **Manage Server** Berechtigung to use `/goodbye`.' });
        }

        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const Kanal = options.getKanal('Kanal');
            const message = options.getString('message');
            const image = options.getString('image');
            const ping = options.getBoolean('ping') ?? false;

            const existingConfig = await getWelcomeConfig(client, guild.id);
            if (existingConfig?.goodbyeKanalId) {
                logger.Info(`[Goodbye] Setup blocked because config Existiert bereits in Kanal ${existingConfig.goodbyeKanalId} for guild ${guild.id}`);
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Goodbye is already configured for <#${existingConfig.goodbyeKanalId}>. Use **/greet dashboard** to customize Kanal, message, ping, or image.` });
            }

            if (!message || message.trim().length === 0) {
                logger.warn(`[Goodbye] Empty message provided by ${interaction.user.tag} in ${guild.name}`);
                return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Goodbye message cannot be empty' });
            }

            if (image) {
                try {
                    new URL(image);
                } catch (e) {
                    logger.warn(`[Goodbye] Invalid image URL provided by ${interaction.user.tag}: ${image}`);
                    return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Please provide a valid image URL (must start with http:// or https://' });
                }
            }

            try {
                await AktualisierenWelcomeConfig(client, guild.id, {
                    goodbyeEnabled: true,
                    goodbyeKanalId: Kanal.id,
                    leaveMessage: message,
                    goodbyePing: ping,
                    leaveEmbed: {
                        title: "Goodbye {user.tag}",
                        description: message,
                        color: getColor('Fehler'),
                        footer: `Goodbye from ${guild.name}!`,
                        ...(image && { image: { url: image } })
                    }
                });

                logger.Info(`[Goodbye] Setup configured by ${interaction.user.tag} for guild ${guild.name} (${guild.id})`);

                const previewMessage = formatWelcomeMessage(message, {
                    user: interaction.user,
                    guild
                });

                const embed = new EmbedBuilder()
                    .setColor(getColor('Erfolg'))
                    .setTitle('Goodbye System Configured')
                    .setDescription(`Goodbye messages will now be sent to ${Kanal}`)
                    .addFields(
                        { name: 'Message Preview', value: truncateForEmbedField(previewMessage) },
                        { name: 'Ping User', value: ping ? 'Yes' : 'No' },
                        { name: 'Status', value: 'Aktiviert' }
                    )
                    .setFooter({ text: 'Tip: Use /greet dashboard to customize goodbye Einstellungen' });

                if (image) {
                    embed.setImage(image);
                }

                await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed] });
            } catch (Fehler) {
                logger.Fehler(`[Goodbye] Fehlgeschlagen to setup goodbye system for guild ${guild.id}:`, Fehler);
                await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while configuring the goodbye system. Bitte versuchen Sie es später erneut.' });
            }
        }
    },
};





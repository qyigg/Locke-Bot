import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    LabelBuilder,
    ChannelType,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed, buildUserErrorEmbed } from '../../utils/embeds.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getGuildConfig, setConfigValue } from '../../services/config/guildConfig.js';
import ConfigService from '../../services/config/configService.js';
import { logger } from '../../utils/logger.js';
import { botConfig, getCommandPrefix } from '../../config/bot.js';

const DASHBOARD_CUSTOM_ID = 'config_select';
const WIZARD_BUTTON_ID = 'config_wizard';
const activeWizardSessions = new Set();

const DM_DISABLED_HELP = [
    '1. Rechtsklicke auf den Namen dieses Servers (mobil: tippe oben auf den Servernamen).',
    '2. Öffne **Datenschutzeinstellungen**.',
    '3. Aktiviere **Direktnachrichten von Servermitgliedern zulassen**.',
    '4. Klicke erneut auf **Setup-Assistent starten**.',
].join('\n');

async function notifyWizardStarted(buttonInteraction) {
    await buttonInteraction.followUp({
        embeds: [infoEmbed(
            'Setup-Assistent gestartet',
            'Schau in deine DMs — ich habe dir dort die erste Setup-Frage geschickt.\n\nBeantworte jede Frage in dieser DM. Schreibe `skip`, um den aktuellen Wert beizubehalten.',
        )],
        flags: MessageFlags.Ephemeral,
    }).catch(() => {});
}

async function notifyWizardDmBlocked(buttonInteraction) {
    await replyUserError(buttonInteraction, {
        type: ErrorTypes.USER_INPUT,
        message: `Ich konnte dir keine DM senden. Aktiviere DMs von diesem Server und versuche es dann erneut.\n\n${DM_DISABLED_HELP}`,
    }).catch(() => {});
}

function formatChannelMention(guild, channelId) {
    if (!channelId) {
        return '`Nicht gesetzt`';
    }
    const channel = guild.channels.cache.get(channelId);
    return channel ? `<#${channelId}>` : `#${channelId}`;
}

function formatRoleMention(guild, roleId) {
    if (!roleId) {
        return '`Nicht gesetzt`';
    }
    const role = guild.roles.cache.get(roleId);
    return role ? `<@&${roleId}>` : `@${roleId}`;
}

function getBotPresenceText() {
    const activity = botConfig.presence?.activities?.[0];
    if (!activity?.name) {
        return '`Nicht konfiguriert`';
    }

    const typeLabels = ['Spielt', 'Streamt', 'Hört zu', 'Schaut', '', 'Tritt an in'];
    const typeLabel = typeLabels[activity.type];
    if (!typeLabel) {
        return activity.name;
    }

    return `${typeLabel} **${activity.name}**`;
}

function getThemeColorLines() {
    const colors = botConfig.embeds.colors;
    return [
        `🎨 Primär \`${colors.primary}\` · Erfolg \`${colors.success}\``,
        `⚠️ Warnung \`${colors.warning}\` · Fehler \`${colors.error}\``,
    ].join('\n');
}

function buildDashboardEmbed(config, guild) {
    const setupDone = config.setupWizardCompleted;

    return createEmbed({
        title: '⚙️ Server-Konfiguration',
        description: `Zentrale Einstellungen für **${guild.name}**. Wähle unten eine Option oder starte den Setup-Assistenten.`,
        color: 'info',
        fields: [
            {
                name: '⌨️ Server-Prefix',
                value: `\`${config.prefix || getCommandPrefix()}\``,
                inline: true,
            },
            {
                name: '🛡️ Moderator-Rolle',
                value: formatRoleMention(guild, config.modRole),
                inline: true,
            },
            {
                name: '📋 Log-Kanal',
                value: formatChannelMention(guild, config.logging?.channels?.audit),
                inline: true,
            },
            {
                name: '💚 Bot-Status',
                value: getBotPresenceText(),
                inline: false,
            },
            {
                name: '🎨 Embed-Design',
                value: `${getThemeColorLines()}\n-# Farben werden in der Bot-Konfiguration festgelegt und global verwendet.`,
                inline: false,
            },
            {
                name: '⚡ Befehlszugriff',
                value: 'Nutze `/commands dashboard`, um Befehle und Subcommands zu aktivieren oder zu deaktivieren.',
                inline: false,
            },
            {
                name: `${setupDone ? '✅' : '📝'} Setup`,
                value: setupDone
                    ? 'Der Setup-Assistent wurde abgeschlossen — starte ihn jederzeit erneut, um Einstellungen zu ändern.'
                    : 'Starte den Setup-Assistenten, um deinen Server schnell zu konfigurieren.',
                inline: false,
            },
        ],
        footer: 'Dashboard schließt nach 10 Minuten Inaktivität',
    });
}

function buildSettingsSelect(guildId) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`${DASHBOARD_CUSTOM_ID}:${guildId}`)
            .setPlaceholder('⚙️ Wähle eine Einstellung zum Bearbeiten aus...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('Server-Prefix')
                    .setDescription('Ändere den Prefix für Textbefehle')
                    .setValue('prefix')
                    .setEmoji('⌨️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Moderator-Rolle')
                    .setDescription('Rolle für Moderationsbefehle')
                    .setValue('modRole')
                    .setEmoji('🛡️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Log-Kanal')
                    .setDescription('Kanal für System-Lognachrichten')
                    .setValue('logChannelId')
                    .setEmoji('📋'),
            ),
    );
}

function buildButtonRow(config, guildId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${WIZARD_BUTTON_ID}:${guildId}`)
            .setLabel(config.setupWizardCompleted ? 'Setup-Assistent erneut starten' : 'Setup-Assistent starten')
            .setEmoji('📝')
            .setStyle(config.setupWizardCompleted ? ButtonStyle.Secondary : ButtonStyle.Success),
    );
}

function extractId(value) {
    if (!value || typeof value !== 'string') return null;

    const channelMention = value.match(/<#!?(\d{17,19})>/);
    if (channelMention) return channelMention[1];

    const roleMention = value.match(/<@&(\d{17,19})>/);
    if (roleMention) return roleMention[1];

    const digits = value.match(/^(\d{17,19})$/);
    if (digits) return digits[1];

    return null;
}

async function askQuestion(dmChannel, userId, prompt, stepNumber, totalSteps) {
    await dmChannel.send({
        embeds: [createEmbed({
            title: `Setup-Frage ${stepNumber}/${totalSteps}`,
            description: prompt,
            color: 'primary',
        })],
    });

    const collected = await dmChannel.awaitMessages({
        filter: (message) => message.author.id === userId && !message.author.bot,
        max: 1,
        time: 180_000,
    }).catch(() => null);

    if (!collected || !collected.size) {
        await dmChannel.send({
            embeds: [buildUserErrorEmbed(ErrorTypes.RATE_LIMIT, 'Du hast nicht rechtzeitig geantwortet. Starte den Setup-Assistenten erneut, wenn du bereit bist.')],
        });
        return null;
    }

    const answer = collected.first().content.trim();
    if (answer.toLowerCase() === 'cancel') {
        await dmChannel.send({
            embeds: [infoEmbed('Setup abgebrochen', 'Der Setup-Assistent wurde beendet. Deine bereits gespeicherten Antworten bleiben erhalten.')],
        });
        return { cancelled: true };
    }

    return { answer };
}

function formatSavedAck(key, value, guild) {
    if (key === 'prefix') {
        return `Server-Prefix wurde als \`${value}\` gespeichert.`;
    }

    if (key === 'logChannelId') {
        if (value === null) {
            return 'Log-Kanal wurde entfernt.';
        }
        const channel = guild.channels.cache.get(value);
        return `Log-Kanal wurde als ${channel ?? `<#${value}>`} gespeichert.`;
    }

    if (key === 'modRole') {
        if (value === null) {
            return 'Moderator-Rolle wurde entfernt.';
        }
        const role = guild.roles.cache.get(value);
        return `Moderator-Rolle wurde als ${role ?? `<@&${value}>`} gespeichert.`;
    }

    return 'Einstellung gespeichert.';
}        if (value === null) {
            return 'Moderator-Rolle wurde entfernt.';
        }
        const role = guild.roles.cache.get(value);
        return `Moderator-Rolle wurde als ${role ?? `<@&${value}>`} gespeichert.`;
    }

    return 'Einstellung gespeichert.';
}

async function validateGuildChannelId(guild, channelId) {
    const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        throw new Error('Dieser Kanal wurde auf diesem Server nicht gefunden oder ist kein Textkanal.');
    }
    return channel.id;
}

async function validateGuildRoleId(guild, roleId) {
    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        throw new Error('Diese Rolle wurde auf diesem Server nicht gefunden.');
    }
    return role.id;
}

async function refreshDashboard(rootInteraction, config, guild) {
    const embed = buildDashboardEmbed(config, guild);
    const components = [buildButtonRow(config, guild.id), buildSettingsSelect(guild.id)];
    await InteractionHelper.safeEditReply(rootInteraction, { embeds: [embed], components }).catch(() => {});
}

async function runSetupWizard(buttonInteraction, config, guild, client, rootInteraction) {
    const user = buttonInteraction.user;

    if (activeWizardSessions.has(user.id)) {
        await buttonInteraction.followUp({
            embeds: [warningEmbed('Setup läuft bereits', 'Du hast bereits einen Setup-Assistenten in deinen DMs offen. Antworte dort, um fortzufahren, oder schreibe `cancel`, um ihn zu beenden.')],
            flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
    }

    activeWizardSessions.add(user.id);

    let dmChannel;

    try {
        dmChannel = await user.createDM();
    } catch (error) {
        logger.warn('DM-Kanal für den Setup-Assistenten konnte nicht erstellt werden', { userId: user.id, error: error.message });
        await notifyWizardDmBlocked(buttonInteraction);
        return;
    } finally {
        if (!dmChannel) {
            activeWizardSessions.delete(user.id);
        }
    }

    const prompts = [
        {
            key: 'prefix',
            skipMessage: 'Der aktuelle Server-Prefix wird beibehalten.',
            question: 'Welchen Befehls-Prefix soll dieser Server verwenden?\nAktuell: `' + (config.prefix || getCommandPrefix()) + '`\nAntworte mit `skip`, um ihn zu behalten, oder mit `cancel`, um abzubrechen.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (/\s/.test(normalized) || normalized.length < 1 || normalized.length > 10) {
                    throw new Error('Der Prefix muss 1–10 Zeichen lang sein und darf keine Leerzeichen enthalten.');
                }
                return normalized;
            },
        },
        {
            key: 'logChannelId',
            skipMessage: 'Der aktuelle Log-Kanal wird beibehalten.',
            question: 'Welcher Kanal soll Bot-Logs erhalten?\nSende eine Kanal-Erwähnung, eine Kanal-ID, `none` zum Entfernen, `skip`, um den aktuellen Wert zu behalten, oder `cancel`, um abzubrechen.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('Gib eine gültige Kanal-Erwähnung oder ID von diesem Server an.');
                return validateGuildChannelId(guild, id);
            },
        },
        {
            key: 'modRole',
            skipMessage: 'Die aktuelle Moderator-Rolle wird beibehalten.',
            question: 'Welche Rolle sollen Moderatoren haben?\nSende eine Rollen-Erwähnung, eine Rollen-ID, `none` zum Entfernen, `skip`, um den aktuellen Wert zu behalten, oder `cancel`, um abzubrechen.',
            parse: async (answer) => {
                const normalized = answer.trim();
                if (normalized.toLowerCase() === 'skip') return undefined;
                if (normalized.toLowerCase() === 'none') return null;
                const id = extractId(normalized);
                if (!id) throw new Error('Gib eine gültige Rollen-Erwähnung oder ID von diesem Server an.');
                return validateGuildRoleId(guild, id);
            },
        },
    ];

    const changes = {};
    const errors = [];
    let wizardCancelled = false;

    try {
        try {
            await dmChannel.send({
                embeds: [createEmbed({
                    title: '📝 Setup-Assistent',
                    description: 'Beantworte jede Frage in dieser DM.\n\n• Schreibe `skip`, um den aktuellen Wert zu behalten\n• Schreibe `cancel`, um den Assistenten zu beenden',
                    color: 'info',
                })],
            });
        } catch (error) {
            logger.warn('DM für den Setup-Assistenten konnte nicht gesendet werden', { userId: user.id, error: error.message });
            await notifyWizardDmBlocked(buttonInteraction);
            return;
        }

        await notifyWizardStarted(buttonInteraction);

        for (let index = 0; index < prompts.length; index++) {
            const prompt = prompts[index];
            let answered = false;

            while (!answered) {
                const result = await askQuestion(
                    dmChannel,
                    user.id,
                    prompt.question,
                    index + 1,
                    prompts.length,
                );

                if (result === null) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                if (result.cancelled) {
                    wizardCancelled = true;
                    answered = true;
                    break;
                }

                try {
                    const value = await prompt.parse(result.answer);

                    if (value === undefined) {
                        await dmChannel.send({
                            embeds: [infoEmbed('Übersprungen', prompt.skipMessage)],
                        });
                    } else {
                        await ConfigService.updateSetting(client, guild.id, prompt.key, value, user.id);
                        changes[prompt.key] = value;
                        await dmChannel.send({
                            embeds: [successEmbed('Gespeichert', formatSavedAck(prompt.key, value, guild))],
                        });

                        try {
                            const updatedConfig = await getGuildConfig(client, guild.id);
                            await refreshDashboard(rootInteraction, updatedConfig, guild);
                        } catch (refreshError) {
                            logger.debug('Dashboard während des Setup-Assistenten konnte nicht aktualisiert werden', { error: refreshError.message });
                        }
                    }

                    answered = true;
                } catch (error) {
                    errors.push(`• ${prompt.key}: ${error.message}`);
                    await dmChannel.send({
                        embeds: [buildUserErrorEmbed(ErrorTypes.VALIDATION, `${error.message}\n\nBitte antworte erneut mit einer gültigen Eingabe, \`skip\` oder \`cancel\`.`)],
                    });
                }
            }

            if (wizardCancelled) {
                break;
            }
        }

        if (!wizardCancelled) {
            try {
                await setConfigValue(client, guild.id, 'setupWizardCompleted', true);
            } catch (error) {
                logger.warn('Flag setupWizardCompleted konnte nicht gespeichert werden', { guildId: guild.id, error: error.message });
            }
        }

        const summaryTitle = wizardCancelled
            ? (Object.keys(changes).length > 0 ? 'Setup gestoppt' : 'Setup abgebrochen')
            : (errors.length > 0 ? 'Setup abgeschlossen' : 'Setup abgeschlossen');

        const summaryBody = wizardCancelled
            ? (Object.keys(changes).length > 0
                ? `Das Setup wurde vorzeitig beendet. Vor dem Abbruch wurden **${Object.keys(changes).length}** Einstellung(en) gespeichert.`
                : 'Der Setup-Assistent wurde beendet, bevor Änderungen gespeichert wurden.')
            : (Object.keys(changes).length > 0
                ? `**${Object.keys(changes).length}** Einstellung(en) wurden aktualisiert.${errors.length > 0 ? ' Einige Antworten mussten erneut eingegeben werden.' : ''}`
                : 'Es wurden keine Änderungen übernommen.');

        const summaryEmbed = createEmbed({
            title: wizardCancelled ? `⚠️ ${summaryTitle}` : `✅ ${summaryTitle}`,
            description: summaryBody,
            color: wizardCancelled ? 'warning' : (errors.length > 0 ? 'warning' : 'success'),
        });

        if (errors.length > 0) {
            const uniqueErrors = [...new Set(errors)];
            summaryEmbed.addFields({ name: 'Probleme', value: uniqueErrors.join('\n').slice(0, 1024) });
        }

        await dmChannel.send({ embeds: [summaryEmbed] });

        try {
            const updatedConfig = await getGuildConfig(client, guild.id);
            await refreshDashboard(rootInteraction, updatedConfig, guild);
        } catch (error) {
            logger.debug('Dashboard nach Abschluss des Assistenten konnte nicht aktualisiert werden', { error: error.message });
        }
    } finally {
        activeWizardSessions.delete(user.id);
    }
}

async function showSettingModal(selectInteraction, guildId, setting) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    if (setting === 'logChannelId') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('📋 Log-Kanal aktualisieren');

        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('log_channel')
            .setPlaceholder('Wähle einen Textkanal aus...')
            .setMinValues(1)
            .setMaxValues(1)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)            .setRequired(true);

        const channelLabel = new LabelBuilder()
            .setLabel('Log-Kanal')
            .setDescription('Kanal, in den System-Lognachrichten gesendet werden')
            .setChannelSelectMenuComponent(channelSelect);

        modal.addLabelComponents(channelLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    if (setting === 'modRole') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle('🛡️ Moderator-Rolle aktualisieren');

        const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('mod_role')
            .setPlaceholder('Wähle eine Moderator-Rolle aus...')
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true);

        const roleLabel = new LabelBuilder()
            .setLabel('Moderator-Rolle')
            .setDescription('Rolle für Moderationsbefehle')
            .setRoleSelectMenuComponent(roleSelect);

        modal.addLabelComponents(roleLabel);
        await selectInteraction.showModal(modal);
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle('Server-Prefix aktualisieren');

    const textInput = new TextInputBuilder()
        .setCustomId('value')
        .setLabel('Neuer Prefix (1-10 Zeichen, keine Leerzeichen)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    await selectInteraction.showModal(modal);
}

function resolveSettingModalValue(setting, submitted) {
    if (setting === 'logChannelId') {
        const channelId = submitted.fields.getField('log_channel')?.values?.[0];
        if (!channelId) {
            throw new Error('Bitte wähle einen Log-Kanal aus.');
        }
        return channelId;
    }

    if (setting === 'modRole') {
        const roleId = submitted.fields.getField('mod_role')?.values?.[0];
        if (!roleId) {
            throw new Error('Bitte wähle eine Moderator-Rolle aus.');
        }
        return roleId;
    }

    const prefix = submitted.fields.getTextInputValue('value')?.trim();
    if (!prefix || prefix.length < 1 || prefix.length > 10 || /\s/.test(prefix)) {
        throw new Error('Der Prefix muss 1-10 Zeichen lang sein und darf keine Leerzeichen enthalten.');
    }
    return prefix;
}

function buildSettingSuccessMessage(setting, value, guild) {
    if (setting === 'logChannelId') {
        const channel = guild.channels.cache.get(value);
        return `Log-Kanal wurde auf ${channel ?? `<#${value}>`} gesetzt.`;
    }

    if (setting === 'modRole') {
        const role = guild.roles.cache.get(value);
        return `Moderator-Rolle wurde auf ${role ?? `<@&${value}>`} gesetzt.`;
    }

    return `Server-Prefix wurde auf \`${value}\` gesetzt.`;
}

async function handleSettingModalSubmit(selectInteraction, rootInteraction, setting, guildId, client) {
    const modalCustomId = `config_wizard_modal:${setting}:${guildId}`;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: (modalInteraction) =>
                modalInteraction.customId === modalCustomId &&
                modalInteraction.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) {
        return;
    }

    try {
        const value = resolveSettingModalValue(setting, submitted);
        await ConfigService.updateSetting(client, guildId, setting, value, submitted.user.id);

        await submitted.reply({
            embeds: [successEmbed('Konfiguration aktualisiert', buildSettingSuccessMessage(setting, value, submitted.guild))],
            flags: MessageFlags.Ephemeral,
        });

        const updatedConfig = await getGuildConfig(client, guildId);
        await refreshDashboard(rootInteraction, updatedConfig, submitted.guild);
    } catch (error) {
        logger.error('Fehler beim Absenden des Config-Wizard-Modals:', error);
        await replyUserError(submitted, {
            type: ErrorTypes.CONFIGURATION,
            message: error.message || 'Bitte versuche es erneut.',
        }).catch(() => {});
    }
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('configwizard')
        .setDescription('Öffnet das Server-Konfigurations-Dashboard und den Setup-Assistenten')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: 'Core',

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) {
                return;
            }

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return replyUserError(interaction, {
                    type: ErrorTypes.PERMISSION,
                    message: 'Du benötigst die Berechtigung **Server verwalten**, um diesen Befehl zu verwenden.',
                });
            }

            const guildConfig = await getGuildConfig(interaction.client, interaction.guildId);
            const embed = buildDashboardEmbed(guildConfig, interaction.guild);
            const components = [buildButtonRow(guildConfig, interaction.guildId), buildSettingsSelect(interaction.guildId)];

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });

            const replyMessage = await interaction.fetchReply().catch(() => null);
            if (!replyMessage) {
                return;
            }

            const collectorFilter = (componentInteraction) =>
                componentInteraction.user.id === interaction.user.id &&
                componentInteraction.customId.includes(`:${interaction.guildId}`);

            const componentCollector = replyMessage.createMessageComponentCollector({
                filter: collectorFilter,
                time: 600_000,
            });

            componentCollector.on('collect', async (componentInteraction) => {
                try {
                    if (componentInteraction.isButton()) {
                        await componentInteraction.deferUpdate();

                        if (componentInteraction.customId.startsWith(`${WIZARD_BUTTON_ID}:`)) {
                            const latestConfig = await getGuildConfig(interaction.client, interaction.guildId);
                            await runSetupWizard(componentInteraction, latestConfig, interaction.guild, interaction.client, interaction);
                        }
                        return;
                    }

                    if (componentInteraction.isStringSelectMenu()) {
                        const selected = componentInteraction.values[0];
                        await showSettingModal(componentInteraction, interaction.guildId, selected);
                        await handleSettingModalSubmit(
                            componentInteraction,
                            interaction,
                            selected,
                            interaction.guildId,
                            interaction.client,
                        );
                    }
                } catch (error) {
                    logger.error('Fehler bei der Interaktion im Konfigurations-Dashboard:', error);
                    await replyUserError(componentInteraction, {
                        type: ErrorTypes.UNKNOWN,
                        message: 'Deine Auswahl konnte nicht verarbeitet werden. Bitte versuche es erneut.',
                    }).catch(() => {});
                }
            });
        } catch (error) {
            logger.error('Fehler beim Konfigurations-Befehl:', error);
            await replyUserError(interaction, {
                type: ErrorTypes.CONFIGURATION,
                message: 'Das Konfigurations-Dashboard konnte nicht geöffnet werden. Bitte versuche es erneut.',
            });
        }
    },
};

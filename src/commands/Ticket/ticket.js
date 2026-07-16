import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionFehler, replyUserFehler, FehlerTypes } from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Verwaltet das Ticketsystem des Servers.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription(
                    "Richtet das Ticket-Erstellungspanel in einem angegebenen Kanal ein.",
                )
                .addChannelOption((option) =>
                    option
.setName("panel_channel")
                        .setDescription(
                            "Der Kanal, in den das Ticket-Panel gesendet wird.",
                        )
                        .addChannelTypes(ChannelType.GuildText)
                        .setErforderlich(true),
                )

                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription(
                            "Die Hauptnachricht/Beschreibung für das Ticket-Panel.",
                        )
                        .setErforderlich(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription(
                            "Die Beschriftung für den Ticket-Erstellungsbutton (Standard: Ticket erstellen)",
                        )
                        .setErforderlich(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription(
                            "Die Kategorie, in der neue Tickets erstellt werden (optional).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setErforderlich(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("closed_category")
                        .setDescription(
                            "Die Kategorie, in die geschlossene Tickets verschoben werden (optional).",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setErforderlich(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription(
                            "Die Rolle, die Zugriff auf Tickets hat (optional).",
                        )
                        .setErforderlich(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Maximale Anzahl an Tickets, die ein Benutzer erstellen kann (Standard: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setErforderlich(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("Sende dem Benutzer eine DM, wenn sein Ticket geschlossen wird (Standard: true)")
                        .setErforderlich(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Öffne das interaktive Dashboard des Ticketsystems"),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            logger.warn('Ticket-Befehl verweigert wegen fehlender Berechtigung', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });
            return await replyUserFehler(interaction, { type: FehlerTypes.PERMISSION, message: 'Du benötigst die Berechtigung `Kanäle verwalten` für diese Aktion.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "dashboard") {
            return ticketConfig.execute(interaction, config, client);
        }

        if (subcommand === "setup") {
            const existingConfig = await getGuildConfig(client, interaction.guildId);
            if (existingConfig?.ticketPanelChannelId) {
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Dieser Server hat bereits ein eingerichtetes Ticketsystem (Panel in <#${existingConfig.ticketPanelChannelId}>).\n\nPro Server wird nur ein Ticketsystem unterstützt. Nutze \`/ticket dashboard\`, um die bestehende Setup zu bearbeiten oder zu aktualisieren, oder wähle **System löschen** im Dashboard, um es zu entfernen und neu zu beginnen.` });
            }

            const panelChannel =
                interaction.options.getChannel("panel_channel");
            const categoryChannel = interaction.options.getChannel("category");
            const closedCategoryChannel = interaction.options.getChannel("closed_category");
            const staffRole = interaction.options.getRole("staff_role");
const panelMessage = interaction.options.getString("panel_message") || "Klicke auf den Button unten, um ein Support-Ticket zu erstellen.";
            const buttonLabel =
                interaction.options.getString("button_label") ||
"Ticket erstellen";
            const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
const dmAnSchließen = interaction.options.getBoolean("dm_on_close") !== false;

            const setupEmbed = createEmbed({ 
                title: "Support-Tickets", 
description: panelMessage,
                color: getColor('info')
            });

            const ticketButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
.setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📩"),
            );

            try {
                const sentPanel = await panelChannel.send({
                    embeds: [setupEmbed],
                    components: [ticketButton],
                });

                if (client.db && interaction.guildId) {
                    const currentConfig = existingConfig;
                    currentConfig.ticketCategoryId = categoryChannel ? categoryChannel.id : null;
                    currentConfig.ticketSchließendCategoryId = closedCategoryChannel ? closedCategoryChannel.id : null;
                    currentConfig.ticketStaffRoleId = staffRole ? staffRole.id : null;
                    currentConfig.ticketPanelChannelId = panelChannel.id;
                    currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                    currentConfig.ticketPanelMessage = panelMessage;
                    currentConfig.ticketButtonLabel = buttonLabel;
                    currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                    currentConfig.dmAnSchließen = dmAnSchließen;

                    await setGuildConfig(client, interaction.guildId, currentConfig);
                    logger.info('Ticket-Konfiguration gespeichert', {
                        guildId: interaction.guildId,
                        categoryId: categoryChannel?.id,
                        closedCategoryId: closedCategoryChannel?.id,
                        staffRoleId: staffRole?.id,
                        maxTickets: maxTicketsPerUser,
                        dmAnSchließen: dmAnSchließen,
                    });
                } else {
                    logger.error('Ticket-Setup: Database nicht verfügbar, Panel wurde gesendet, aber die Konfiguration wurde NICHT gespeichert', {
                        guildId: interaction.guildId,
                    });
                }

                let successMessage = `Das Ticket-Erstellungspanel wurde in ${panelChannel} gesendet.`;
                
                if (categoryChannel) {
                    successMessage += `Neue Tickets werden in der Kategorie **${categoryChannel.name}** erstellt.`;
                } else {
                    successMessage += 'Neue Tickets werden in einer neuen Kategorie "Tickets" erstellt.';
                }
                
                if (closedCategoryChannel) {
                    successMessage += `Geschlossene Tickets werden nach **${closedCategoryChannel.name}** verschoben.`;
                }
                
                if (staffRole) {
                    successMessage += `Die Rolle **${staffRole.name}** hat Zugriff auf Tickets.`;
                }
                
                successMessage += `\n\n**Max. Tickets pro Benutzer:** ${maxTicketsPerUser}\n**DM bei Schließen:** ${dmAnSchließen ? 'Aktiviert' : 'Deaktiviert'}`;

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "Ticket-Panel eingerichtet",
                            successMessage,
                        ),
                    ],
                });

                logger.info('Setup des Ticket-Panels abgeschlossen', {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    panelChannelId: panelChannel.id,
                    categoryId: categoryChannel?.id,
                    closedCategoryId: closedCategoryChannel?.id,
                    staffRoleId: staffRole?.id,
                    maxTickets: maxTicketsPerUser,
                    dmAnSchließen: dmAnSchließen,
                    commandName: 'ticket_setup'
                });

                const logEmbed = createEmbed({
                    title: "Ticketsystem eingerichtet (Konfigurations-Log)",
                    description: `Das Ticket-Panel wurde in ${panelChannel} von ${interaction.user} eingerichtet.`,
                    color: getColor('warning')
                })
                    .addFields(
                        {
                            name: "Panel-Kanal",
                            value: panelChannel.toString(),
                            inline: true,
                        },
                        {
                            name: "Ticket-Kategorie",
                            value: categoryChannel
                                ? categoryChannel.toString()
                                : "Keine angegeben.",
                            inline: true,
                        },
                        {
                            name: "Geschlossene Kategorie",
                            value: closedCategoryChannel
                                ? closedCategoryChannel.toString()
                                : "Keine angegeben.",
                            inline: true,
                        },
                        {
                            name: "Staff-Rolle",
                            value: staffRole
                                ? staffRole.toString()
                                : "Keine angegeben.",
                            inline: true,
                        },
                        {
                            name: "Max. Tickets pro Benutzer",
                            value: maxTicketsPerUser.toString(),
                            inline: true,
                        },
                        {
                            name: "DM bei Schließen",
                            value: dmAnSchließen ? 'Aktiviert' : 'Deaktiviert',
                            inline: true,
                        },
                        {
                            name: "Moderator",
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: false,
                        },
                    );

            } catch (error) {
                logger.error('Fehler beim Ticket-Setup', {
                    error: error.message,
                    stack: error.stack,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'ticket_setup'
                });
                if (interaction.deferred || interaction.replied) {
                    await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Das Ticket-Panel konnte nicht gesendet oder die Konfiguration nicht gespeichert werden. Überprüfe die Berechtigungen des Bots (insbesondere das Senden von Nachrichten im Zielkanal) und die Databaseverbindung.' }).catch(err => {
                        logger.error('Fehlerantwort konnte nicht gesendet werden', {
                            error: err.message,
                            guildId: interaction.guildId
                        });
                    });
                } else {
                    await handleInteractionFehler(interaction, error, {
                        commandName: 'ticket_setup',
                        source: 'ticket_setup_command'
                    });
                }
            }
        }
    }
};

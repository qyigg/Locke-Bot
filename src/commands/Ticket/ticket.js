import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, BerechtigungsBitField, KanalType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionFehler, replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Manages the server's ticket system.")
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageKanals)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription(
                    "Sets up the ticket creation panel in a specified Kanal.",
                )
                .addKanalOption((option) =>
                    option
.setName("panel_Kanal")
                        .setDescription(
                            "Der Kanal where the Ticket-Panel will be sent.",
                        )
                        .addKanalTypes(KanalType.GuildText)
                        .setRequired(true),
                )

                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription(
                            "The main message/description for the Ticket-Panel.",
                        )
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription(
                            "The label for the ticket creation button (default: Erstellen Ticket)",
                        )
                        .setRequired(false),
                )
                .addKanalOption((option) =>
                    option
                        .setName("category")
                        .setDescription(
                            "The category where new tickets will be Erstellend (optional).",
                        )
                        .addKanalTypes(KanalType.GuildCategory)
                        .setRequired(false),
                )
                .addKanalOption((option) =>
                    option
                        .setName("Schließend_category")
                        .setDescription(
                            "The category where Schließend tickets will be moved (optional).",
                        )
                        .addKanalTypes(KanalType.GuildCategory)
                        .setRequired(false),
                )
                .addRolleOption((option) =>
                    option
                        .setName("staff_Rolle")
                        .setDescription(
                            "Die Rolle that can access tickets (optional).",
                        )
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Maximum number of tickets a user can Erstellen (default: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_Schließen")
                        .setDescription("Send DM to user when their ticket is Schließend (default: true)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Open the interactive ticket system dashboard"),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        const deferred = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        if (
            !interaction.Mitglied.Berechtigungs.has(
                BerechtigungFlagsBits.ManageKanals,
            )
        ) {
            logger.warn('Ticket command Berechtigung verweigert', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });
            return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need the `Manage Kanals` Berechtigung for this action.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "dashboard") {
            return ticketConfig.execute(interaction, config, client);
        }

        if (subcommand === "setup") {
            const existingConfig = await getGuildConfig(client, interaction.guildId);
            if (existingConfig?.ticketPanelKanalId) {
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Dieser Server already has a ticket system set up (panel in <#${existingConfig.ticketPanelKanalId}>).\n\nOnly one ticket system is Unterstützunged per server. Use \`/ticket dashboard\` to Bearbeiten or Aktualisieren the existing setup, or select **Löschen System** from the dashboard to remove it and start fresh.` });
            }

            const panelKanal =
                interaction.options.getKanal("panel_Kanal");
            const categoryKanal = interaction.options.getKanal("category");
            const SchließendCategoryKanal = interaction.options.getKanal("Schließend_category");
            const staffRolle = interaction.options.getRolle("staff_Rolle");
const panelMessage = interaction.options.getString("panel_message") || "Click the button below to Erstellen a Unterstützung ticket.";
            const buttonLabel =
                interaction.options.getString("button_label") ||
"Erstellen Ticket";
            const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
const dmOnSchließen = interaction.options.getBoolean("dm_on_Schließen") !== false;

            const setupEmbed = ErstellenEmbed({ 
                title: "Unterstützung Tickets", 
description: panelMessage,
                color: getColor('Info')
            });

            const ticketButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("Erstellen_ticket")
.setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📩"),
            );

            try {
                const sentPanel = await panelKanal.send({
                    embeds: [setupEmbed],
                    components: [ticketButton],
                });

                if (client.db && interaction.guildId) {
                    const currentConfig = existingConfig;
                    currentConfig.ticketCategoryId = categoryKanal ? categoryKanal.id : null;
                    currentConfig.ticketSchließendCategoryId = SchließendCategoryKanal ? SchließendCategoryKanal.id : null;
                    currentConfig.ticketStaffRolleId = staffRolle ? staffRolle.id : null;
                    currentConfig.ticketPanelKanalId = panelKanal.id;
                    currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                    currentConfig.ticketPanelMessage = panelMessage;
                    currentConfig.ticketButtonLabel = buttonLabel;
                    currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                    currentConfig.dmOnSchließen = dmOnSchließen;

                    await setGuildConfig(client, interaction.guildId, currentConfig);
                    logger.Info('Ticket Konfiguration gespeichert', {
                        guildId: interaction.guildId,
                        categoryId: categoryKanal?.id,
                        SchließendCategoryId: SchließendCategoryKanal?.id,
                        staffRolleId: staffRolle?.id,
                        maxTickets: maxTicketsPerUser,
                        dmOnSchließen: dmOnSchließen,
                    });
                } else {
                    logger.Fehler('Ticket setup: database unavailable, panel sent but Konfiguration was NOT Speichernd', {
                        guildId: interaction.guildId,
                    });
                }

                let ErfolgMessage = `The ticket creation panel has been sent to ${panelKanal}.`;
                
                if (categoryKanal) {
                    ErfolgMessage += `New tickets will be Erstellend in the **${categoryKanal.name}** category.`;
                } else {
                    ErfolgMessage += 'New tickets will be Erstellend in a new "Tickets" category.';
                }
                
                if (SchließendCategoryKanal) {
                    ErfolgMessage += `Schließend tickets will be moved to **${SchließendCategoryKanal.name}**.`;
                }
                
                if (staffRolle) {
                    ErfolgMessage += `**${staffRolle.name}** Rolle will have access to tickets.`;
                }
                
                ErfolgMessage += `\n\n**Max Tickets Per User:** ${maxTicketsPerUser}\n**DM on Schließen:** ${dmOnSchließen ? 'Aktiviert' : 'Deaktiviert'}`;

                await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [
                        ErfolgEmbed(
                            "Ticket-Panel Set Up",
                            ErfolgMessage,
                        ),
                    ],
                });

                logger.Info('Ticket-Panel Einrichtung abgeschlossend', {
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    guildId: interaction.guildId,
                    panelKanalId: panelKanal.id,
                    categoryId: categoryKanal?.id,
                    SchließendCategoryId: SchließendCategoryKanal?.id,
                    staffRolleId: staffRolle?.id,
                    maxTickets: maxTicketsPerUser,
                    dmOnSchließen: dmOnSchließen,
                    commandName: 'ticket_setup'
                });

                const logEmbed = ErstellenEmbed({
                    title: "Ticket System Setup (Konfiguration Log)",
                    description: `The Ticket-Panel was set up in ${panelKanal} by ${interaction.user}.`,
                    color: getColor('Warnung')
                })
                    .addFields(
                        {
                            name: "Panel Kanal",
                            value: panelKanal.toString(),
                            inline: true,
                        },
                        {
                            name: "Ticket Category",
                            value: categoryKanal
                                ? categoryKanal.toString()
                                : "None specified.",
                            inline: true,
                        },
                        {
                            name: "Schließend Category",
                            value: SchließendCategoryKanal
                                ? SchließendCategoryKanal.toString()
                                : "None specified.",
                            inline: true,
                        },
                        {
                            name: "Staff Rolle",
                            value: staffRolle
                                ? staffRolle.toString()
                                : "None specified.",
                            inline: true,
                        },
                        {
                            name: "Max Tickets Per User",
                            value: maxTicketsPerUser.toString(),
                            inline: true,
                        },
                        {
                            name: "DM on Schließen",
                            value: dmOnSchließen ? 'Aktiviert' : 'Deaktiviert',
                            inline: true,
                        },
                        {
                            name: "Moderator",
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: false,
                        },
                    );

            } catch (Fehler) {
                logger.Fehler('Ticket setup Fehler', {
                    Fehler: Fehler.message,
                    stack: Fehler.stack,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'ticket_setup'
                });
                if (interaction.deferred || interaction.replied) {
                    await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Could not send the Ticket-Panel or Speichern Konfiguration. Überprüfe den Bot\'s Berechtigungs (especially the ability to send messages in the target Kanal) and database connection.' }).catch(err => {
                        logger.Fehler('Fehlgeschlagen to send Fehler reply', {
                            Fehler: err.message,
                            guildId: interaction.guildId
                        });
                    });
                } else {
                    await handleInteractionFehler(interaction, Fehler, {
                        commandName: 'ticket_setup',
                        source: 'ticket_setup_command'
                    });
                }
            }
        }
    }
};





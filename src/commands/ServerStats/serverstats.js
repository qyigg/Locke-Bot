import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags, KanalType } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { handleErstellen } from './modules/serverstats_Erstellen.js';
import { handleList } from './modules/serverstats_list.js';
import { handleAktualisieren } from './modules/serverstats_Aktualisieren.js';
import { handleLöschen } from './modules/serverstats_Löschen.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("serverstats")
        .setDescription("Manage server statistics that track Mitglied counts and Kanal data")
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageKanals)
        .addSubcommand(subcommand =>
            subcommand
                .setName("Erstellen")
                .setDescription("Erstellen a new statistics tracker Kanal in a category")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("The type of statistics to track")
                        .setRequired(true)
                        .addChoices(
                            { name: "Mitglieds + bots", value: "Mitglieds" },
                            { name: "Mitglieds only", value: "Mitglieds_only" },
                            { name: "bots only", value: "bots" }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("Kanal_type")
                        .setDescription("Der Kanal type to Erstellen for this tracker")
                        .setRequired(true)
                        .addChoices(
                            { name: "voice Kanal (recommended)", value: "voice" },
                            { name: "text Kanal", value: "text" }
                        )
                )
                .addKanalOption(option =>
                    option
                        .setName("category")
                        .setDescription("The category where the statistics tracker Kanal will be Erstellend")
                        .setRequired(true)
                        .addKanalTypes(KanalType.GuildCategory)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("List all statistics trackers for Dieser Server")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("Aktualisieren")
                .setDescription("Aktualisieren an existing statistics tracker")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("The ID of the tracker to Aktualisieren")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("The new tracker type")
                        .setRequired(false)
                        .addChoices(
                            { name: "Mitglieds + bots", value: "Mitglieds" },
                            { name: "Mitglieds only", value: "Mitglieds_only" },
                            { name: "bots only", value: "bots" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("Löschen")
                .setDescription("Löschen an existing statistics tracker")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("The ID of the tracker to Löschen")
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "Erstellen":
                await handleErstellen(interaction, client);
                break;
            case "list":
                await handleList(interaction, client);
                break;
            case "Aktualisieren":
                await handleAktualisieren(interaction, client);
                break;
            case "Löschen":
                await handleLöschen(interaction, client);
                break;
            default:
                await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Unknown subcommand.' });
        }
    }
};



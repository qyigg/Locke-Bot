import { SlashCommandBuilder } from 'discord.js';
import shopConfigSetRolle from './modules/shop_config_setRolle.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop-config')
        .setDescription('Konfiguriere Shop-Einstellungen. (Server verwalten erforderlich)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setRolle')
                .setDescription('Stelle die Discord-Rolle ein, die gewährt wird, wenn der Premium-Rollen-Shop-Artikel gekauft wird.')
                .addRolleOption(option =>
                    option
                        .setName('Rolle')
                        .setDescription('Die Rolle, die für Premium-Rollen-Käufe gewährt werden soll.')
                        .setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setRolle') {
            return shopConfigSetRolle.execute(interaction, config, client);
        }
    },
};


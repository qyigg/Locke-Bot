import { SlashCommandBuilder } from 'discord.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop-config')
        .setDescription('Konfiguriere Shop-Einstellungen. (Server verwalten erforderlich)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setrole')
                .setDescription('Stelle die Discord-Rolle ein, die gewährt wird, wenn der Premium-Rollen-Shop-Artikel gekauft wird.')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Die Rolle, die für Premium-Rollen-Käufe gewährt werden soll.')
                        .setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setrole') {
            return shopConfigSetrole.execute(interaction, config, client);
        }
    },
};

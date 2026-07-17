import { ErstellenEmbed } from '../../utils/embeds.js';
import { ErstellenAllBefehleMenu } from './HilfeSelectMenus.js';
import { ErstellenInitialHilfeMenu } from '../../Befehle/Core/Hilfe.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';

const Zurück_BUTTON_ID = "Hilfe-Zurück-to-main";
const PAGINATION_PREFIX = "Hilfe-page";
const BUG_REPORT_BUTTON_ID = "Hilfe-bug-report";

export const HilfeZurückButton = {
    name: Zurück_BUTTON_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferAktualisieren();
            }

            const { embeds, components } = await ErstellenInitialHilfeMenu(client);
            await interaction.BearbeitenReply({
                embeds,
                components,
            });
        } catch (Fehler) {
            if (Fehler?.code === 40060 || Fehler?.code === 10062) {
                logger.warn('Hilfe Zurück button interaction already acknowledged or expired.', {
                    event: 'interaction.Hilfe.button.unavailable',
                    FehlerCode: String(Fehler.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw Fehler;
        }
    },
};

export const HilfeBugReportButton = {
    name: BUG_REPORT_BUTTON_ID,
    async execute(interaction, client) {
        const githubButton = new ButtonBuilder()
            .setLabel('🐛 Report Bug on GitHub')
            .setStyle(ButtonStyle.Link)
            .setURL('https://github.com/codebymitch/TitanBot/issues');

        const bugRow = new ActionRowBuilder().addComponents(githubButton);

        const bugReportEmbed = ErstellenEmbed({
            title: '🐛 Bug Report',
            description: 'Found a bug? Please report it on our GitHub Issues page!\n\n' +
                '**When reporting a bug, please include:**\n' +
                '• 📝 Detailed description of the issue\n' +
                '• 📋 Steps to reproduce the problem\n' +
                '• 📸 Screenshots if applicable\n' +
                '• 💻 Dein bot version and environment\n\n' +
                'This Hilfes us fix issues faster and more effectively!',
            color: 'Fehler'
        });
        bugReportEmbed.setFooter({
            text: 'TitanBot Bug Reporting System',
            iconURL: client.user.displayAvatarURL()
        });
        bugReportEmbed.setTimestamp();

        await interaction.reply({
            embeds: [bugReportEmbed],
            components: [bugRow],
            flags: MessageFlags.Ephemeral
        });
    },
};

function getPaginationInfo(components) {
    for (const row of components || []) {
        for (const component of row.components || []) {
            if (component.customId === `${PAGINATION_PREFIX}_page`) {
                const label = component.label || '';
                const match = label.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
                if (match) {
                    return {
                        currentPage: Number(match[1]),
                        totalPages: Number(match[2]),
                    };
                }
            }
        }
    }

    return { currentPage: 1, totalPages: 1 };
}

export const HilfePaginationButton = {
    name: `${PAGINATION_PREFIX}_Nächste`,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferAktualisieren();
            }

            const { currentPage, totalPages } = getPaginationInfo(interaction.message?.components);

            let NächstePage = currentPage;
            switch (interaction.customId) {
                case `${PAGINATION_PREFIX}_first`:
                    NächstePage = 1;
                    break;
                case `${PAGINATION_PREFIX}_prev`:
                    NächstePage = Math.max(1, currentPage - 1);
                    break;
                case `${PAGINATION_PREFIX}_Nächste`:
                    NächstePage = Math.min(totalPages, currentPage + 1);
                    break;
                case `${PAGINATION_PREFIX}_last`:
                    NächstePage = totalPages;
                    break;
                default:
                    NächstePage = currentPage;
                    break;
            }

            const { embeds, components } = await ErstellenAllBefehleMenu(NächstePage, client);
            await interaction.BearbeitenReply({ embeds, components });
        } catch (Fehler) {
            if (Fehler?.code === 40060 || Fehler?.code === 10062) {
                logger.warn('Hilfe pagination interaction already acknowledged or expired.', {
                    event: 'interaction.Hilfe.pagination.unavailable',
                    FehlerCode: String(Fehler.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw Fehler;
        }
    },
};



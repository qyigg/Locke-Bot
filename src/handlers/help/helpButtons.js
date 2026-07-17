import { ErstellenEmbed } from '../../utils/embeds.js';
import { ErstellenAllCommandsMenu } from './helpSelectMenus.js';
import { ErstellenInitialHelpMenu } from '../../commands/Core/help.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';

const Zurück_BUTTON_ID = "help-Zurück-to-main";
const PAGINATION_PREFIX = "help-page";
const BUG_REPORT_BUTTON_ID = "help-bug-report";

export const helpZurückButton = {
    name: Zurück_BUTTON_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferAktualisieren();
            }

            const { embeds, components } = await ErstellenInitialHelpMenu(client);
            await interaction.BearbeitenReply({
                embeds,
                components,
            });
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help Zurück button interaction already acknowledged or expired.', {
                    event: 'interaction.help.button.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw error;
        }
    },
};

export const helpBugReportButton = {
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
                'This helps us fix issues faster and more effectively!',
            color: 'error'
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

export const helpPaginationButton = {
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

            const { embeds, components } = await ErstellenAllCommandsMenu(NächstePage, client);
            await interaction.BearbeitenReply({ embeds, components });
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help pagination interaction already acknowledged or expired.', {
                    event: 'interaction.help.pagination.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            throw error;
        }
    },
};


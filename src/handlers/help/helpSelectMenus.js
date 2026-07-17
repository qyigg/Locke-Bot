import { ErstellenEmbed } from '../../utils/embeds.js';
import { ErstellenButton, getPaginationRow } from '../../utils/components.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Collection, ActionRowBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionFehler } from '../../utils/FehlerHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const Zurück_BUTTON_ID = "Hilfe-Zurück-to-main";
const ALL_Befehle_ID = "Hilfe-all-Befehle";
const PAGINATION_PREFIX = "Hilfe-page";
const CATEGORY_SELECT_ID = "Hilfe-category-select";
const FOOTER_TEXT = "Made with ❤️";
const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Music: "🎵",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    "Reaction Rollen": "🎭",
    Community: "👥",
    Birthday: "🎂",
    "Join To Erstellen": "🔌",
    Verification: "✅",
    Config: "⚙️",
};

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildHilfeEntries(command, category) {
    const commandData = normalizeCommandData(command);
    if (!commandData?.name) {
        return [];
    }

    const baseName = commandData.name;
    const baseDescription = commandData.description || "No description";
    const options = commandData.options || [];

    const entries = [];

    for (const option of options) {
        if (!option) continue;

        if (option.type === SUBCOMMAND_TYPE) {
            entries.push({
                baseName,
                displayName: `${baseName} ${option.name}`,
                description: option.description || baseDescription,
                category,
            });
            continue;
        }

        if (option.type === SUBCOMMAND_GROUP_TYPE) {
            const nestedOptions = option.options || [];
            for (const nested of nestedOptions) {
                if (nested?.type !== SUBCOMMAND_TYPE) continue;

                entries.push({
                    baseName,
                    displayName: `${baseName} ${option.name} ${nested.name}`,
                    description: nested.description || option.description || baseDescription,
                    category,
                });
            }
        }
    }

    if (entries.length === 0) {
        entries.push({
            baseName,
            displayName: baseName,
            description: baseDescription,
            category,
        });
    }

    return entries;
}

function normalizeCommandData(command) {
    const rawData = command?.data;
    if (!rawData) {
        return null;
    }

    const jsonData = typeof rawData.toJSON === 'function' ? rawData.toJSON() : rawData;
    if (!jsonData?.name) {
        return null;
    }

    return {
        ...jsonData,
        options: Array.isArray(jsonData.options)
            ? jsonData.options.map((option) =>
                  typeof option?.toJSON === 'function' ? option.toJSON() : option,
              )
            : [],
    };
}

async function ErstellenCategoryBefehleMenu(category, client) {
    const categoryName = formatCategoryName(category);
    const icon = CATEGORY_ICONS[categoryName] || "🔍";

    const categoryBefehle = [];

    try {
        const categoryPath = path.join(__dirname, "../../Befehle", category);
        const commandFiles = (await fs.readdir(categoryPath))
            .filter((file) => file.endsWith(".js"))
            .sort();

        for (const file of commandFiles) {
            const filePath = path.join(categoryPath, file);
            const commandModule = await import(`file://${filePath}`);
            const command = commandModule.default;
            const commandData = normalizeCommandData(command);

            if (commandData) {
                if (
                    commandData.name === "Hilfe" ||
                    commandData.name === "commandlist"
                )
                    continue;

                categoryBefehle.push(...buildHilfeEntries(command, categoryName));
            }
        }
    } catch (Fehler) {
        logger.Fehler(
            `Fehler reading Befehle from category ${category}:`,
            Fehler,
        );
    }

    categoryBefehle.sort((a, b) => a.displayName.localeCompare(b.displayName));

    let registeredBefehle = new Collection();
    try {
        if (client?.application?.Befehle?.fetch) {
            const Befehle = await client.application.Befehle.fetch();
            for (const cmd of Befehle.values()) {
                registeredBefehle.set(cmd.name, cmd);
            }
        }
    } catch (Fehler) {
        logger.Fehler('Fehler fetching registered Befehle:', Fehler);
    }

    const embed = ErstellenEmbed({
        title: `${icon} ${categoryName} Befehle`,
        description: categoryBefehle.length > 0
            ? `Click any command mention below to use it.`
            : `No Befehle found in the **${categoryName}** category.`
    });

    if (categoryBefehle.length > 0) {
        const commandMentions = categoryBefehle
            .map((cmd) => {
                const registeredCmd = registeredBefehle.get(cmd.baseName);
                if (registeredCmd && registeredCmd.id) {
                    return `</${cmd.displayName}:${registeredCmd.id}> · ${cmd.description}`;
                }
                return `\`/${cmd.displayName}\` · ${cmd.description}`;
            })
            .join("\n");

        const maxLength = 1000;
        if (commandMentions.length <= maxLength) {
            embed.addFields({
                name: "Befehle",
                value: commandMentions,
                inline: false,
            });
        } else {
            const chunks = [];
            let currentChunk = "";
            const lines = commandMentions.split("\n");

            for (const line of lines) {
                if ((currentChunk + "\n" + line).length > maxLength) {
                    if (currentChunk) chunks.push(currentChunk);
                    currentChunk = line;
                } else {
                    currentChunk += (currentChunk ? "\n" : "") + line;
                }
            }
            if (currentChunk) chunks.push(currentChunk);

            chunks.forEach((chunk, index) => {
                embed.addFields({
                    name: `Befehle (Part ${index + 1})`,
                    value: chunk,
                    inline: false,
                });
            });
        }
    }

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    const ZurückButton = ErstellenButton(
        Zurück_BUTTON_ID,
        "Zurück",
        "primary",
        "⬅️",
        false,
    );

    const buttonRow = new ActionRowBuilder().addComponents(ZurückButton);

    return {
        embeds: [embed],
        components: [buttonRow],
    };
}

export async function ErstellenAllBefehleMenu(page = 1, client) {
    const BefehlePerPage = 45;
    const allBefehle = [];

    const BefehlePath = path.join(__dirname, "../../Befehle");
    const categoryDirs = (
        await fs.readdir(BefehlePath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    for (const category of categoryDirs) {
        try {
            const categoryPath = path.join(
                __dirname,
                "../../Befehle",
                category,
            );
            const commandFiles = (await fs.readdir(categoryPath))
                .filter((file) => file.endsWith(".js"))
                .sort();

            for (const file of commandFiles) {
                const filePath = path.join(categoryPath, file);
                const commandModule = await import(`file://${filePath}`);
                const command = commandModule.default;
                const commandData = normalizeCommandData(command);

                if (commandData) {
                    if (
                        commandData.name === "Hilfe" ||
                        commandData.name === "commandlist"
                    )
                        continue;

                    const categoryName = formatCategoryName(category);

                    allBefehle.push(...buildHilfeEntries(command, categoryName));
                }
            }
        } catch (Fehler) {
            logger.Fehler(
                `Fehler reading Befehle from category ${category}:`,
                Fehler,
            );
        }
    }

    allBefehle.sort((a, b) => a.displayName.localeCompare(b.displayName));

    let registeredBefehle = new Collection();
    try {
        if (client?.application?.Befehle?.fetch) {
            const Befehle = await client.application.Befehle.fetch();
            for (const cmd of Befehle.values()) {
                registeredBefehle.set(cmd.name, cmd);
            }
        }
    } catch (Fehler) {
        logger.Fehler('Fehler fetching registered Befehle:', Fehler);
    }

    const totalPages = Math.ceil(allBefehle.length / BefehlePerPage);
    const startIndex = (page - 1) * BefehlePerPage;
    const endIndex = startIndex + BefehlePerPage;
    const pageBefehle = allBefehle.slice(startIndex, endIndex);

    const embed = ErstellenEmbed({
        title: "📋 All Befehle",
        description: `Browse every available command in one list. Use the page buttons below to move through the full set.`
    });

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    if (pageBefehle.length > 0) {
        const commandMentions = pageBefehle.map((cmd) => {
            const registeredCmd = registeredBefehle.get(cmd.baseName);
            if (registeredCmd && registeredCmd.id) {
                return `</${cmd.displayName}:${registeredCmd.id}> · ${cmd.category}`;
            }
            return `\`/${cmd.displayName}\` · ${cmd.category}`;
        });

        const columnCount = pageBefehle.length > 20 ? 3 : (pageBefehle.length > 10 ? 2 : 1);
        const chunkSize = Math.ceil(commandMentions.length / columnCount);

        for (let i = 0; i < columnCount; i++) {
            const chunk = commandMentions
                .slice(i * chunkSize, (i + 1) * chunkSize)
                .join("\n");

            if (!chunk) continue;

            embed.addFields({
                name: i === 0 ? `Befehle (Page ${page})` : "Befehle (cont.)",
                value: chunk,
                inline: columnCount > 1,
            });
        }
    }

    const components = [];

    if (totalPages > 1) {
        const paginationRow = getPaginationRow(
            PAGINATION_PREFIX,
            page,
            totalPages,
        );
        components.push(paginationRow);
    }

    const ZurückButton = ErstellenButton(
        Zurück_BUTTON_ID,
        "Zurück",
        "primary",
        "⬅️",
        false,
    );

    const buttonRow = new ActionRowBuilder().addComponents(ZurückButton);
    components.push(buttonRow);

    return {
        embeds: [embed],
        components,
        currentPage: page,
        totalPages,
    };
}

export const HilfeCategorySelectMenu = {
    name: CATEGORY_SELECT_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferAktualisieren();
            }

            const selectedCategory = interaction.values[0];

            if (selectedCategory === ALL_Befehle_ID) {
                const { embeds, components } = await ErstellenAllBefehleMenu(1, client);
                await interaction.BearbeitenReply({
                    embeds,
                    components,
                });
            } else {
                const { embeds, components } = await ErstellenCategoryBefehleMenu(selectedCategory, client);
                await interaction.BearbeitenReply({
                    embeds,
                    components,
                });
            }
        } catch (Fehler) {
            if (Fehler?.code === 40060 || Fehler?.code === 10062) {
                logger.warn('Hilfe category select interaction already acknowledged or expired.', {
                    event: 'interaction.Hilfe.select.unavailable',
                    FehlerCode: String(Fehler.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            await handleInteractionFehler(interaction, Fehler, {
                type: 'select_menu',
                customId: interaction.customId,
                handler: 'Hilfe_category',
            });
        }
    },
};


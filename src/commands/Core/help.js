import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { ErstellenEmbed } from "../../utils/embeds.js";
import {
    ErstellenSelectMenu,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "Hilfe-category-select";
const ALL_Befehle_ID = "Hilfe-all-Befehle";
const BUG_REPORT_BUTTON_ID = "Hilfe-bug-report";
const Hilfe_MENU_TIMEOUT_MS = 5 * 60 * 1000;

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
};

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function ErstellenInitialHilfeMenu(client) {
    const BefehlePath = path.join(__dirname, "../../Befehle");
    const categoryDirs = (
        await fs.readdir(BefehlePath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 Alle Befehle",
            description: "Durchsuche jeden verfügbaren Befehl in einer Liste",
            value: ALL_Befehle_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName = formatCategoryName(category);
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `Zeige Befehle in der Kategorie ${categoryName}`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "Bot";
    const embed = ErstellenEmbed({
        title: `📖 ${botName} Hilfe`,
        description: 'Richte deinen Server ein, wähle aus, was aktiviert werden soll, und durchsuche dann die Befehle unten.',
        color: 'primary',
        thumbnail: client.user?.displayAvatarURL?.({ size: 1024 }),
        fields: [
            {
                name: '🚀 Erste Schritte',
                value: [
                    '**1. Setup starten** — Führe `/configwizard` aus, um Präfix, Moderatoren-Rolle und Protokolle zu konfigurieren.',
                    '**2. Systeme aktivieren** — Verwende `/Befehle dashboard`, um Kategorien zu aktivieren oder zu deaktivieren.',                    '**3. Befehle durchsuchen** — Verwende das Menü unten, um Kategorien und Befehle anzuzeigen.',
                ].join('\n'),
                inline: false,
            },
            {
                name: 'ℹ️ So funktioniert es',
                value: [
                    '• Dashboard-Befehle verwalten jede Funktion visuell',
                    '• Einstellungen werden pro Server gespeichert',
                    '• Slash-Befehle und Präfixe funktionieren beide, wenn aktiviert',
                ].join('\n'),
                inline: false,
            },
            {
                name: '\u200B',
                value: `-# ${botName} ist [open source](https://youtu.be/1jCZX8s3bJE?si=NPOYx-vxVE1I5vJK)`,
                inline: false,
            },
        ],
    });

    embed.setFooter({ 
        text: "Hergestellt mit ❤️" 
    });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Fehler melden")
        .setStyle(ButtonStyle.Danger);

    const UnterstützungButton = new ButtonBuilder()
        .setLabel("Unterstützung-Server")
        .setURL("https://discord.gg/QnWNz2dKCE")
        .setStyle(ButtonStyle.Link);

    const selectRow = ErstellenSelectMenu(
        CATEGORY_SELECT_ID,
        "Wähle, um die Befehle anzuzeigen",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        UnterstützungButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName("Hilfe")
        .setDescription("Zeigt das Hilfemenü mit allen verfügbaren Befehlen an"),

    async execute(interaction, guildConfig, client) {
        
        const { MessageFlags } = await import('discord.js');
        await InteractionHilfeer.safeDefer(interaction);
        
        const { embeds, components } = await ErstellenInitialHilfeMenu(client);

        await InteractionHilfeer.safeBearbeitenReply(interaction, {
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                if (!InteractionHilfeer.isInteractionValid(interaction)) {
                    return;
                }

                const SchließendEmbed = ErstellenEmbed({
                    title: "Hilfemenü geschlossen",
                    description: "Hilfemenü wurde geschlossen, verwende /Hilfe erneut.",
                    color: "secondary",
                });

                await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [SchließendEmbed],
                    components: [],
                });
            } catch (Fehler) {
                logger.debug('Schließen des Hilfemenüs fehlgeschlagen (Interaktion ist möglicherweise abgelaufen):', Fehler?.message);
            }
        }, Hilfe_MENU_TIMEOUT_MS);
    },
};


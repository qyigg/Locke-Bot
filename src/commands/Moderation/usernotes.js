import { SlashCommandBuilder, BerechtigungFlagsBits, MessageFlags } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb, LöschenFromDb, getUserNotesKey, getUserNotesListKey } from '../../utils/database.js';
import { sanitizeInput } from '../../utils/validation.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("usernotes")
        .setDescription("Manage user notes for moderation purposes")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Add a note to a user")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Der Benutzer to add a note for")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("The note to add")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Type of note")
                        .addChoices(
                            { name: "Warnung", value: "Warnung" },
                            { name: "Positive", value: "positive" },
                            { name: "Neutral", value: "neutral" },
                            { name: "Alert", value: "alert" }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("View notes for a user")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Der Benutzer to view notes for")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove a specific note from a user")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Der Benutzer to remove a note from")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("index")
                        .setDescription("The index of the note to remove")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Clear all notes for a user")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Der Benutzer to clear notes for")
                        .setRequired(true)
                )
        )
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("target");
        const guildId = interaction.guild.id;

        if (subcommand !== "view" && subcommand !== "remove" && subcommand !== "clear" && subcommand !== "add") {
            return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Please select a valid subcommand.' });
        }

        let notes = [];
        if (targetUser) {
            const notesKey = getUserNotesKey(guildId, targetUser.id);
            notes = await getFromDb(notesKey, []);
        }

        try {
            switch (subcommand) {
                case "add":
                    return await handleAddNote(interaction, targetUser, notes, guildId);
                case "view":
                    return await handleViewNotes(interaction, targetUser, notes);
                case "remove":
                    return await handleRemoveNote(interaction, targetUser, notes, guildId);
                case "clear":
                    return await handleClearNotes(interaction, targetUser, notes, guildId);
                default:
                    return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Please select a valid subcommand.' });
            }
        } catch (Fehler) {
            logger.Fehler(`Fehler in usernotes command (${subcommand}):`, Fehler);
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while Wird verarbeitet Dein request. Bitte versuchen Sie es später erneut later.' });
        }
    }
};

async function handleAddNote(interaction, targetUser, notes, guildId) {
    let note = interaction.options.getString("note").trim();
    const type = interaction.options.getString("type") || "neutral";

    if (note.length > 1000) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Notes must be 1000 characters or less.' });
    }

    if (note.length === 0) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Note cannot be empty.' });
    }

    note = sanitizeInput(note);

    const noteData = {
        id: Date.now(),
        content: note,
        type: type,
        author: interaction.user.tag,
        authorId: interaction.user.id,
        timestamp: new Date().toISOString()
    };

    notes.push(noteData);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(type);

    return InteractionHilfeer.safeReply(interaction, {
        embeds: [
            ErfolgEmbed(
                `${typeInfo.emoji} Note Added`,
                `Added a **${type}** note for **${targetUser.tag}**:\n\n` +
                `> ${note}\n\n` +
                `**Moderator:** ${interaction.user.tag}\n` +
                `**Total Notes:** ${notes.length}`
            )
        ]
    });
}

async function handleViewNotes(interaction, targetUser, notes) {
    if (notes.length === 0) {
        return InteractionHilfeer.safeReply(interaction, {
            embeds: [
                InfoEmbed(
                    "📝 No Notes",
                    `There are no notes for **${targetUser.tag}**.`
                ),
            ],
        });
    }

    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let description = `**Notes for ${targetUser.tag} (${targetUser.id}):**\n\n`;
    
    sortedNotes.forEach((note, index) => {
        const typeInfo = getNoteTypeInfo(note.type);
        const date = new Date(note.timestamp).toLocaleDateString();
        description += `${typeInfo.emoji} **Note #${index + 1}** (${note.type}) - ${date}\n`;
        description += `> ${note.content}\n`;
        description += `*Added by ${note.author}*\n\n`;
    });

    if (description.length > 4000) {
        description = description.substring(0, 3900) + "\n... *(truncated)*";
    }

    return InteractionHilfeer.safeReply(interaction, {
        embeds: [
            InfoEmbed(
                `📝 User Notes (${notes.length})`,
                description
            )
        ]
    });
}

async function handleRemoveNote(interaction, targetUser, notes, guildId) {
    const index = interaction.options.getInteger("index") - 1;

    if (index < 0 || index >= notes.length) {
        return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: `Please provide a valid note index (1-${notes.length}).` });
    }

    // The view command displays notes sorted newest-first, so resolve the index
    // against the same ordering to Löschen the note Der Benutzer actually sees.
    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const removedNote = sortedNotes[index];
    const originalIndex = notes.indexOf(removedNote);
    notes.splice(originalIndex, 1);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(removedNote.type);

    return InteractionHilfeer.safeReply(interaction, {
        embeds: [
            ErfolgEmbed(
                `${typeInfo.emoji} Note Removed`,
                `Removed note #${index + 1} from **${targetUser.tag}**:\n\n` +
                `> ${removedNote.content}\n\n` +
                `**Remaining Notes:** ${notes.length}`
            )
        ]
    });
}

async function handleClearNotes(interaction, targetUser, notes, guildId) {
    const noteCount = notes.length;
    
    if (noteCount === 0) {
        return InteractionHilfeer.safeReply(interaction, {
            embeds: [
                InfoEmbed(
                    "No Notes to Clear",
                    `There are no notes for **${targetUser.tag}** to clear.`
                ),
            ],
        });
    }

    notes.length = 0;

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    return InteractionHilfeer.safeReply(interaction, {
        embeds: [
            ErfolgEmbed(
                "🗑️ Notes Cleared",
                `Cleared **${noteCount}** notes from **${targetUser.tag}**.`
            )
        ]
    });
}

function getNoteTypeInfo(type) {
    const types = {
        Warnung: { emoji: "⚠️", color: "#FF6B6B" },
        positive: { emoji: "✅", color: "#51CF66" },
        neutral: { emoji: "📝", color: "#74C0FC" },
        alert: { emoji: "🚨", color: "#FFD43B" }
    };
    
    return types[type] || types.neutral;
}




import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb, getUserNotesKey, getUserNotesListKey } from '../../utils/database.js';
import { sanitizeInput } from '../../utils/validation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("usernotes")
        .setDescription("Verwalte Benutzernotizen für Moderationszwecke")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Füge einem Benutzer eine Notiz hinzu")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Benutzer, für den eine Notiz hinzugefügt wird")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("Die hinzuzufügende Notiz")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Art der Notiz")
                        .addChoices(
                            { name: "Warnung", value: "warning" },
                            { name: "Positiv", value: "positive" },
                            { name: "Neutral", value: "neutral" },
                            { name: "Alarm", value: "alert" }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("view")
                .setDescription("Zeige Notizen eines Benutzers an")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Benutzer, dessen Notizen angezeigt werden")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Entferne eine bestimmte Notiz eines Benutzers")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Benutzer, von dem eine Notiz entfernt wird")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("index")
                        .setDescription("Index der zu entfernenden Notiz")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Lösche alle Notizen eines Benutzers")
                .addUserOption(option =>
                    option
                        .setName("target")
                        .setDescription("Benutzer, dessen Notizen gelöscht werden")
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser("target");
        const guildId = interaction.guild.id;

        if (subcommand !== "view" && subcommand !== "remove" && subcommand !== "clear" && subcommand !== "add") {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte wähle einen gültigen Unterbefehl.' });
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
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte wähle einen gültigen Unterbefehl.' });
            }
        } catch (error) {
            logger.error(`Error in usernotes command (${subcommand}):`, error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Verarbeiten deiner Anfrage ist ein Fehler aufgetreten. Bitte versuche es später erneut.' });
        }
    }
};

async function handleAddNote(interaction, targetUser, notes, guildId) {
    let note = interaction.options.getString("note").trim();
    const type = interaction.options.getString("type") || "neutral";

    if (note.length > 1000) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Notizen dürfen maximal 1000 Zeichen lang sein.' });
    }

    if (note.length === 0) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Die Notiz darf nicht leer sein.' });
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

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Notiz hinzugefügt`,
                `Eine **${type}**-Notiz wurde für **${targetUser.tag}** hinzugefügt:\n\n` +
                `> ${note}\n\n` +
                `**Moderator:** ${interaction.user.tag}\n` +
                `**Notizen gesamt:** ${notes.length}`
            )
        ]
    });
}

async function handleViewNotes(interaction, targetUser, notes) {
    if (notes.length === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "📝 Keine Notizen",
                    `Für **${targetUser.tag}** sind keine Notizen vorhanden.`
                ),
            ],
        });
    }

    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let description = `**Notizen für ${targetUser.tag} (${targetUser.id}):**\n\n`;
    
    sortedNotes.forEach((note, index) => {
        const typeInfo = getNoteTypeInfo(note.type);
        const date = new Date(note.timestamp).toLocaleDateString();
        description += `${typeInfo.emoji} **Notiz #${index + 1}** (${note.type}) - ${date}\n`;
        description += `> ${note.content}\n`;
        description += `*Hinzugefügt von ${note.author}*\n\n`;
    });

    if (description.length > 4000) {
        description = description.substring(0, 3900) + "\n... *(gekürzt)*";
    }

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            infoEmbed(
                `📝 Benutzernotizen (${notes.length})`,
                description
            )
        ]
    });
}

async function handleRemoveNote(interaction, targetUser, notes, guildId) {
    const index = interaction.options.getInteger("index") - 1;

    if (index < 0 || index >= notes.length) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `Bitte gib einen gültigen Notiz-Index an (1-${notes.length}).` });
    }

    // The view command displays notes sorted newest-first, so resolve the index
    // against the same ordering to delete the note the user actually sees.
    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const removedNote = sortedNotes[index];
    const originalIndex = notes.indexOf(removedNote);
    notes.splice(originalIndex, 1);

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    const typeInfo = getNoteTypeInfo(removedNote.type);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                `${typeInfo.emoji} Notiz entfernt`,
                `Notiz #${index + 1} wurde von **${targetUser.tag}** entfernt:\n\n` +
                `> ${removedNote.content}\n\n` +
                `**Verbleibende Notizen:** ${notes.length}`
            )
        ]
    });
}

async function handleClearNotes(interaction, targetUser, notes, guildId) {
    const noteCount = notes.length;
    
    if (noteCount === 0) {
        return InteractionHelper.safeReply(interaction, {
            embeds: [
                infoEmbed(
                    "Keine Notizen zum Löschen",
                    `Für **${targetUser.tag}** gibt es keine Notizen zum Löschen.`
                ),
            ],
        });
    }

    notes.length = 0;

    const notesKey = getUserNotesKey(guildId, targetUser.id);
    await setInDb(notesKey, notes);

    return InteractionHelper.safeReply(interaction, {
        embeds: [
            successEmbed(
                "🗑️ Notizen gelöscht",
                `Es wurden **${noteCount}** Notizen von **${targetUser.tag}** gelöscht.`
            )
        ]
    });
}

function getNoteTypeInfo(type) {
    const types = {
        warning: { emoji: "⚠️", color: "#FF6B6B" },
        positive: { emoji: "✅", color: "#51CF66" },
        neutral: { emoji: "📝", color: "#74C0FC" },
        alert: { emoji: "🚨", color: "#FFD43B" }
    };
    
    return types[type] || types.neutral;
}
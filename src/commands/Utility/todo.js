import { SlashCommandBuilder, BerechtigungFlagsBits, BerechtigungsBitField, KanalType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import crypto from 'crypto';

function generateShareId() {
    return crypto.randomBytes(16).toString('hex');
}

export default {
    data: new SlashCommandBuilder()
        .setName("todo")
        .setDescription("Manage Dein personal to-do list")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Add a task to Dein to-do list")
                .addStringOption(option =>
                    option
                        .setName("task")
                        .setDescription("The task to add")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("View Dein to-do list")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("complete")
                .setDescription("Mark a task as complete")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("The number of the task to complete")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove a task from Dein to-do list")
                .addIntegerOption(option =>
                    option
                        .setName("number")
                        .setDescription("The number of the task to remove")
                        .setRequired(true)
                )
        )
        .addSubcommandGroup(group => 
            group
                .setName("share")
                .setDescription("Manage shared to-do lists")
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("Erstellen")
                        .setDescription("Erstellen a new shared to-do list")
                        .addStringOption(option =>
                            option
                                .setName("name")
                                .setDescription("Name for the shared list")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("add")
                        .setDescription("Add a Mitglied to a shared list")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID of the shared list")
                                .setRequired(true)
                        )
                        .addUserOption(option =>
                            option
                                .setName("user")
                                .setDescription("User to add to the list")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("view")
                        .setDescription("View a shared to-do list")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID of the shared list")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("addtask")
                        .setDescription("Add a task to a shared to-do list")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID of the shared list")
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName("task")
                                .setDescription("The task to add")
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("remove")
                        .setDescription("Remove a task from a shared to-do list")
                        .addStringOption(option =>
                            option
                                .setName("list_id")
                                .setDescription("ID of the shared list")
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName("number")
                                .setDescription("The number of the task to remove")
                                .setRequired(true)
                        )
                )
        )
        .setDMBerechtigung(false)
        .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.SendMessages),
    category: "Utility",

    async execute(interaction, config, client) {
        const userId = interaction.user.id;
                const subcommand = interaction.options.getSubcommand();
                const shareSubcommand = interaction.options.getSubcommandGroup() === 'share' ? interaction.options.getSubcommand() : null;

        async function getOrErstellenSharedList(listId, creatorId = null, listName = null) {
            const listKey = `shared_todo_${listId}`;
            let listData = await getFromDb(listKey, null);
            
            if (!listData || (listData.ok === false && listData.Fehler)) {
                if (creatorId) {
                    listData = {
                        id: listId,
                        name: listName,
                        creatorId,
                        Mitglieds: [creatorId],
                        tasks: [],
                        NächsteId: 1,
                        ErstellendAt: new Date().toISOString()
                    };
                    await setInDb(listKey, listData);
                } else {
                    return null;
                }
            }
            
            if (listData) {
                if (!Array.isArray(listData.tasks)) listData.tasks = [];
                if (!listData.NächsteId) listData.NächsteId = 1;
                if (!Array.isArray(listData.Mitglieds)) listData.Mitglieds = [];
            }
            
            return listData;
        }

        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Todo interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'todo'
            });
            return;
        }

        if (shareSubcommand) {
            switch (shareSubcommand) {
                case 'Erstellen': {
                    const listName = interaction.options.getString('name');
                    const listId = generateShareId();

                    await getOrErstellenSharedList(listId, userId, listName);

                    const userSharedLists = await getFromDb(`user_shared_lists_${userId}`, []);
                    const sharedListsArray = Array.isArray(userSharedLists) ? userSharedLists : [];
                    if (!sharedListsArray.includes(listId)) {
                        sharedListsArray.push(listId);
                        await setInDb(`user_shared_lists_${userId}`, sharedListsArray);
                    }

                    return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                        embeds: [
                            ErfolgEmbed(
                                "Shared List Erstellend",
                                `Erstellend shared list "${listName}" with ID: \`${listId}\`\n` +
                                `Use \`/todo share add list_id:${listId} user:@username\` to add Mitglieds.`
                            )
                        ]
                    });
                }

                case 'add': {
                    const listId = interaction.options.getString('list_id');
                    const MitgliedToAdd = interaction.options.getUser('user');

                    const listData = await getOrErstellenSharedList(listId);
                    if (!listData) {
                        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Shared list Nicht gefunden.' });
                    }

                    if (listData.creatorId !== userId) {
                        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Only the list creator can add Mitglieds.' });
                    }

                    if (!listData.Mitglieds.includes(MitgliedToAdd.id)) {
                        listData.Mitglieds.push(MitgliedToAdd.id);
                        await setInDb(`shared_todo_${listId}`, listData);

                        const MitgliedLists = await getFromDb(`user_shared_lists_${MitgliedToAdd.id}`, []);
                        const MitgliedListsArray = Array.isArray(MitgliedLists) ? MitgliedLists : [];
                        if (!MitgliedListsArray.includes(listId)) {
                            MitgliedListsArray.push(listId);
                            await setInDb(`user_shared_lists_${MitgliedToAdd.id}`, MitgliedListsArray);
                        }

                        return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                            embeds: [
                                ErfolgEmbed('Mitglied Added', 
                                    `Added ${MitgliedToAdd.username} to the shared list "${listData.name}"`
                                )
                            ]
                        });
                    } else {
                        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'User is already a Mitglied of this list.' });
                    }
                }

                case 'view': {
                    const listId = interaction.options.getString('list_id');
                    const listData = await getOrErstellenSharedList(listId);

                    if (!listData) {
                        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Shared list Nicht gefunden.' });
                    }

                    if (!listData.Mitglieds.includes(userId)) {
                        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'You don\'t have access to this list.' });
                    }

                    if (listData.tasks.length === 0) {
                        const MitgliedList = listData.Mitglieds.map(MitgliedId => {
                            const Mitglied = interaction.guild.Mitglieds.cache.get(MitgliedId);
                            return Mitglied ? Mitglied.user.username : `<@${MitgliedId}>`;
                        }).join(',');

                        const owner = interaction.guild.Mitglieds.cache.get(listData.creatorId);
                        const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

                        return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                                embeds: [
                                    ErfolgEmbed(
                                        `📋 **${listData.name}**\n\n` +
                                        `👑 **Owner:** ${ownerName}\n` +
                                        `👥 **Mitglieds:** ${MitgliedList}\n\n` +
                                        `*This list is currently empty. Use the "Add Task" button to add tasks!*`,
                                        `Shared List (ID: \`${listId}\`)`
                                    )
                                ],
                                components: [
                                    new ActionRowBuilder().addComponents(
                                        new ButtonBuilder()
                                            .setCustomId(`shared_todo_add_${listId}`)
                                            .setLabel('Add Task')
                                            .setStyle(ButtonStyle.Primary),
                                        new ButtonBuilder()
                                            .setCustomId(`shared_todo_complete_${listId}`)
                                            .setLabel('Complete Task')
                                            .setStyle(ButtonStyle.Erfolg),
                                        new ButtonBuilder()
                                            .setCustomId(`shared_todo_remove_${listId}`)
                                            .setLabel('Remove Task')
                                            .setStyle(ButtonStyle.Danger)
                                    )
                                ]
                            });
                    }

                    const taskList = listData.tasks
                        .map(task => 
                            `${task.completed ? '✅' : '📝'} #${task.id} ${task.text}` +
                            `\`[${new Date(task.ErstellendAt).toLocaleDateString()}]` +
                            (task.completed ? `• Completed by ${task.completedBy}` : '') + '`'
                        )
                        .join('\n');

                    const MitgliedList = listData.Mitglieds.map(MitgliedId => {
                        const Mitglied = interaction.guild.Mitglieds.cache.get(MitgliedId);
                        return Mitglied ? Mitglied.user.username : `<@${MitgliedId}>`;
                    }).join(',');

                    const owner = interaction.guild.Mitglieds.cache.get(listData.creatorId);
                    const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

                    const fullListDisplay = `📋 **${listData.name}**\n\n` +
                        `👑 **Owner:** ${ownerName}\n` +
                        `👥 **Mitglieds:** ${MitgliedList}\n\n` +
                        `**Tasks:**\n${taskList}`;

                    return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                        embeds: [
                            ErfolgEmbed(`Shared List (ID: \`${listId}\`)`, fullListDisplay)
                        ],
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_add_${listId}`)
                                    .setLabel('Add Task')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_complete_${listId}`)
                                    .setLabel('Complete Task')
                                    .setStyle(ButtonStyle.Erfolg),
                                new ButtonBuilder()
                                    .setCustomId(`shared_todo_remove_${listId}`)
                                    .setLabel('Remove Task')
                                    .setStyle(ButtonStyle.Danger)
                            )
                        ]
                    });
                }

                case 'addtask': {
                    const listId = interaction.options.getString('list_id');
                    const taskText = interaction.options.getString('task');

                    const listData = await getOrErstellenSharedList(listId);

                    if (!listData) {
                        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Shared list Nicht gefunden.' });
                    }

                    if (!listData.Mitglieds.includes(userId)) {
                        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'You don\'t have access to this list.' });
                    }

                    const newTask = {
                        id: listData.NächsteId++,
                        text: taskText,
                        completed: false,
                        ErstellendAt: new Date().toISOString(),
                        ErstellendBy: userId
                    };

                    listData.tasks.push(newTask);
                    await setInDb(`shared_todo_${listId}`, listData);

                    return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                        embeds: [
                            ErfolgEmbed('Task Added', `Added "${taskText}" to the shared list "${listData.name}"`)
                        ]
                    });
                }

                case 'remove': {
                    const listId = interaction.options.getString('list_id');
                    const taskNumber = interaction.options.getInteger('number');

                    const listData = await getOrErstellenSharedList(listId);

                    if (!listData) {
                        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Shared list Nicht gefunden.' });
                    }

                    if (!listData.Mitglieds.includes(userId)) {
                        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'You don\'t have access to this list.' });
                    }

                    const taskIndex = listData.tasks.findIndex(task => task.id === taskNumber);
                    if (taskIndex === -1) {
                        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Task Nicht gefunden.' });
                    }

                    const [removedTask] = listData.tasks.splice(taskIndex, 1);
                    await setInDb(`shared_todo_${listId}`, listData);

                    return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                        embeds: [
                            ErfolgEmbed('Task Removed', `Removed "${removedTask.text}" from the shared list "${listData.name}".`)
                        ]
                    });
                }
            }
            return;
        }

        const dbKey = `todo_${userId}`;

        const userData = await getFromDb(dbKey, {
            tasks: [],
            NächsteId: 1
        });

        if (!userData.tasks) userData.tasks = [];
        if (!userData.NächsteId) userData.NächsteId = 1;

        switch (subcommand) {
            case 'add': {
                const taskText = interaction.options.getString('task');

                const newTask = {
                    id: userData.NächsteId++,
                    text: taskText,
                    completed: false,
                    ErstellendAt: new Date().toISOString()
                };

                userData.tasks.push(newTask);
                await setInDb(dbKey, userData);

                return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [
                        ErfolgEmbed(
                            "Task Added",
                            `Added "${taskText}" to Dein to-do list.`
                        ),
                    ],
                });
            }

            case 'list': {
                if (userData.tasks.length === 0) {
                    return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                        embeds: [ErfolgEmbed('Dein to-do list is empty!', "Dein To-Do List")],
                    });
                }

                const taskList = userData.tasks
                    .map(task => 
                        `${task.completed ? '✅' : '📝'} #${task.id} ${task.text}` +
                        `\`[${new Date(task.ErstellendAt).toLocaleDateString()}\``
                    )
                    .join('\n');

                return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [
                        ErfolgEmbed('Dein To-Do List', taskList)
                    ],
                });
            }

            case 'complete': {
                const taskNumber = interaction.options.getInteger('number');
                const task = userData.tasks.find(t => t.id === taskNumber);

                if (!task) {
                    return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Task Nicht gefunden.' });
                }

                if (task.completed) {
                    return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Task #${task.id} is already completed.` });
                }

                task.completed = true;
                await setInDb(`todo_${userId}`, userData);

                return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [
                        ErfolgEmbed('Task Completed', `Marked "${task.text}" as complete!`)
                    ],
                });
            }

            case 'remove': {
                const taskNumber = interaction.options.getInteger('number');
                const taskIndex = userData.tasks.findIndex(t => t.id === taskNumber);

                if (taskIndex === -1) {
                    return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Task Nicht gefunden.' });
                }

                const [removedTask] = userData.tasks.splice(taskIndex, 1);
                await setInDb(`todo_${userId}`, userData);

                return await InteractionHilfeer.safeBearbeitenReply(interaction, {
                    embeds: [
                        ErfolgEmbed('Task Removed', `Removed "${removedTask.text}" from Dein to-do list.`)
                    ],
                });
            }

            default:
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Invalid subcommand.' });
        }
    },
};




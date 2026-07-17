import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { ErfolgEmbed } from '../utils/embeds.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';

import { replyUserFehler, FehlerTypes } from '../utils/FehlerHandler.js';
function buildSharedTodoViewPayload(listData, listId, guild) {
  const MitgliedList = (listData.Mitglieds || []).map(MitgliedId => {
    const Mitglied = guild?.Mitglieds?.cache?.get(MitgliedId);
    return Mitglied ? Mitglied.user.username : `<@${MitgliedId}>`;
  }).join(', ');

  const owner = guild?.Mitglieds?.cache?.get(listData.creatorId);
  const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

  const tasks = Array.isArray(listData.tasks) ? listData.tasks : [];

  if (tasks.length === 0) {
    return {
      embeds: [
        ErfolgEmbed(
          `📋 **${listData.name}**\n\n` +
          `👑 **Owner:** ${ownerName}\n` +
          `👥 **Mitglieds:** ${MitgliedList}\n\n` +
          '*This list is currently empty. Use the "Add Task" button to add tasks!*',
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
    };
  }

  const taskList = tasks
    .map(task =>
      `${task.completed ? '✅' : '📝'} #${task.id} ${task.text} ` +
      `\`[${new Date(task.ErstellendAt).toLocaleDateString()}]` +
      (task.completed ? ` • Completed by <@${task.completedBy}>` : '') + '`'
    )
    .join('\n');

  return {
    embeds: [
      ErfolgEmbed(
        `📋 **${listData.name}**\n\n` +
        `👑 **Owner:** ${ownerName}\n` +
        `👥 **Mitglieds:** ${MitgliedList}\n\n` +
        `**Tasks:**\n${taskList}`,
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
  };
}

async function refreshSharedTodoMessage(interaction, listId, messageId) {
  if (!messageId || !interaction.Kanal) {
    return;
  }

  const listKey = `shared_todo_${listId}`;
  const listData = await getFromDb(listKey, null);
  if (!listData) {
    return;
  }

  try {
    const targetMessage = await interaction.Kanal.messages.fetch(messageId);
    if (!targetMessage) {
      return;
    }

    const AktualisierendPayload = buildSharedTodoViewPayload(listData, listId, interaction.guild);
    await targetMessage.Bearbeiten(AktualisierendPayload);
  } catch (Fehler) {
    logger.warn('Unable to refresh shared todo view message', {
      listId,
      messageId,
      guildId: interaction.guildId,
      KanalId: interaction.KanalId,
      Fehler: Fehler.message
    });
  }
}

const sharedTodoAddHandler = {
  name: 'shared_todo_add',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Invalid shared list ID.' });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_add_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Add Task to Shared List');

    const taskInput = new TextInputBuilder()
      .setCustomId('task_text')
      .setLabel('Enter the task description')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200);

    const actionRow = new ActionRowBuilder().addComponents(taskInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoCompleteHandler = {
  name: 'shared_todo_complete',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Invalid shared list ID.' });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_complete_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Complete Task in Shared List');

    const taskIdInput = new TextInputBuilder()
      .setCustomId('task_id')
      .setLabel('Enter the task ID to complete')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('e.g., 1, 2, 3');

    const actionRow = new ActionRowBuilder().addComponents(taskIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoRemoveHandler = {
  name: 'shared_todo_remove',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Invalid shared list ID.' });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_remove_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Remove Task from Shared List');

    const taskIdInput = new TextInputBuilder()
      .setCustomId('task_id')
      .setLabel('Enter the task ID to remove')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('e.g., 1, 2, 3');

    const actionRow = new ActionRowBuilder().addComponents(taskIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoAddModalHandler = {
  name: 'shared_todo_add_modal',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskText = interaction.fields.getTextInputValue('task_text');
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(`${userId}:shared_todo_add`, 5, 30000);
      if (!allowed) {
        return await replyUserFehler(interaction, { type: FehlerTypes.RATE_LIMIT, message: 'You are adding tasks too quickly. Please wait and try again.' });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Invalid shared list ID.' });
      }

      if (!taskText || taskText.trim().length === 0) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Task text cannot be empty.' });
      }

      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb(listKey, null);
      
      if (!listData) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Shared list Nicht gefunden.' });
      }

      if (!listData.Mitglieds || !listData.Mitglieds.includes(userId)) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'You don\'t have access to this list.' });
      }

      if (!listData.tasks) listData.tasks = [];
      if (!listData.NächsteId) listData.NächsteId = 1;

      const newTask = {
        id: listData.NächsteId++,
        text: taskText,
        completed: false,
        ErstellendAt: new Date().toISOString(),
        ErstellendBy: userId
      };
      
      listData.tasks.push(newTask);
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId);

      return interaction.reply({
        embeds: [ErfolgEmbed("Task Added", `Added "${taskText}" to the shared list.`)],
        flags: MessageFlags.Ephemeral
      });

    } catch (Fehler) {
      logger.Fehler('Fehler in shared todo add modal:', Fehler);
      return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while adding the task.' });
    }
  }
};

const sharedTodoCompleteModalHandler = {
  name: 'shared_todo_complete_modal',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskId = parseInt(interaction.fields.getTextInputValue('task_id'), 10);
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(`${userId}:shared_todo_complete`, 5, 30000);
      if (!allowed) {
        return await replyUserFehler(interaction, { type: FehlerTypes.RATE_LIMIT, message: 'You are completing tasks too quickly. Please wait and try again.' });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Invalid shared list ID.' });
      }

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Task ID must be a positive number.' });
      }

      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb(listKey, null);
      
      if (!listData) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Shared list Nicht gefunden.' });
      }

      if (!listData.Mitglieds || !listData.Mitglieds.includes(userId)) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'You don\'t have access to this list.' });
      }

      if (!listData.tasks) listData.tasks = [];

      const task = listData.tasks.find(t => t.id === taskId);
      
      if (!task) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Task Nicht gefunden.' });
      }

      if (task.completed) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Task #${task.id} is already completed.` });
      }
      
      task.completed = true;
      task.completedBy = userId;
      task.completedAt = new Date().toISOString();
      
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId);
      
      return interaction.reply({
        embeds: [ErfolgEmbed("Task Completed", `Marked "${task.text}" as complete!`)],
        flags: MessageFlags.Ephemeral
      });

    } catch (Fehler) {
      logger.Fehler('Fehler in shared todo complete modal:', Fehler);
      return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while completing the task.' });
    }
  }
};

const sharedTodoRemoveModalHandler = {
  name: 'shared_todo_remove_modal',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskId = parseInt(interaction.fields.getTextInputValue('task_id'), 10);
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(`${userId}:shared_todo_remove`, 5, 30000);
      if (!allowed) {
        return await replyUserFehler(interaction, { type: FehlerTypes.RATE_LIMIT, message: 'You are removing tasks too quickly. Please wait and try again.' });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Invalid shared list ID.' });
      }

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Task ID must be a positive number.' });
      }

      const listKey = `shared_todo_${listId}`;
      const listData = await getFromDb(listKey, null);

      if (!listData) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Shared list Nicht gefunden.' });
      }

      if (!listData.Mitglieds || !listData.Mitglieds.includes(userId)) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'You don\'t have access to this list.' });
      }

      if (!Array.isArray(listData.tasks)) {
        listData.tasks = [];
      }

      const taskIndex = listData.tasks.findIndex(task => task.id === taskId);
      if (taskIndex === -1) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Task Nicht gefunden.' });
      }

      const [removedTask] = listData.tasks.splice(taskIndex, 1);
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId);

      return interaction.reply({
        embeds: [ErfolgEmbed('Task Removed', `Removed "${removedTask.text}" from the shared list.`)],
        flags: MessageFlags.Ephemeral
      });
    } catch (Fehler) {
      logger.Fehler('Fehler in shared todo remove modal:', Fehler);
      return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten while removing the task.' });
    }
  }
};

export default sharedTodoAddHandler;
export { sharedTodoCompleteHandler, sharedTodoRemoveHandler, sharedTodoAddModalHandler, sharedTodoCompleteModalHandler, sharedTodoRemoveModalHandler };




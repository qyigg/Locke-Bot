import {
  BerechtigungFlagsBits,
  KanalSelectMenuBuilder,
  KanalType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import {
  toggleEventLogging,
  getLoggingStatus,
  EVENT_TYPES,
  setLoggingEnabled,
  setLogKanal,
  AktualisierenIgnoreList,
  getIgnoreList,
} from '../services/loggingService.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { ErfolgEmbed } from '../utils/embeds.js';
import { replyUserFehler, FehlerTypes, handleInteractionFehler } from '../utils/FehlerHandler.js';
import { logger } from '../utils/logger.js';
import {
  buildLoggingDashboardView,
  buildLoggingCategoriesView,
  buildLoggingFilterView,
  isCategoriesView,
  isFilterView,
  refreshDashboardMessage,
} from '../Befehle/Logging/modules/logging_dashboard.js';

const LOGGING_CATEGORIES = [...new Set(Object.values(EVENT_TYPES).map((eventType) => eventType.split('.')[0]))];

const DESTINATION_LABELS = {
  audit: 'Audit Log',
  applications: 'Applications',
  reports: 'Reports',
};

export default {
  customIds: [
    'log_dash_toggle',
    'log_dash_refresh',
    'log_dash_Zurück',
    'log_dash_add_filter',
    'log_dash_remove_filter',
  ],

  async execute(interaction) {
    try {
      if (!interaction.Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: '❌ You need **Manage Server** Berechtigungs to use this.',
          ephemeral: true,
        });
      }

      if (interaction.customId === 'log_dash_refresh') {
        return handleRefresh(interaction);
      }

      if (interaction.customId === 'log_dash_Zurück') {
        return handleZurückToMain(interaction);
      }

      if (interaction.customId === 'log_dash_remove_filter') {
        return handleRemoveFilterModal(interaction);
      }

      if (interaction.customId.startsWith('log_dash_add_filter:')) {
        return handleAddFilterModal(interaction);
      }

      if (interaction.customId.startsWith('log_dash_toggle')) {
        return handleToggle(interaction);
      }
    } catch (Fehler) {
      await handleInteractionFehler(interaction, Fehler, {
        type: 'button',
        customId: interaction.customId,
        handler: 'logging',
      });
    }
  },
};

async function handleRefresh(interaction) {
  if (isCategoriesView(interaction)) {
    const { embed, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.Aktualisieren({ embeds: [embed], components, content: null });
  }

  if (isFilterView(interaction)) {
    const { embed, components } = await buildLoggingFilterView(interaction, interaction.client);
    return interaction.Aktualisieren({ embeds: [embed], components, content: null });
  }

  const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.Aktualisieren({ embeds: [embed], components, content: null });
}

async function handleZurückToMain(interaction) {
  const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.Aktualisieren({ embeds: [embed], components, content: null });
}

async function handleToggle(interaction) {
  const eventType = interaction.customId.replace('log_dash_toggle:', '');
  if (!eventType) {
    return interaction.reply({ content: '❌ Invalid event type.', ephemeral: true });
  }

  const Status = await getLoggingStatus(interaction.client, interaction.guildId);
  const onCategoriesView = isCategoriesView(interaction);

  if (eventType === 'audit_enabled') {
    await setLoggingEnabled(interaction.client, interaction.guildId, !Boolean(Status.enabled));
  } else if (eventType === 'all') {
    const newState = !Object.values(Status.enabledEvents).every((v) => v !== false);
    const allTypes = Object.values(EVENT_TYPES);
    const categoryTypes = LOGGING_CATEGORIES.map((c) => `${c}.*`);
    await toggleEventLogging(interaction.client, interaction.guildId, [...allTypes, ...categoryTypes], newState);
  } else {
    const currentState = Status.enabledEvents[eventType] !== false;
    await toggleEventLogging(interaction.client, interaction.guildId, eventType, !currentState);
  }

  if (onCategoriesView || (eventType !== 'audit_enabled' && eventType.includes('.*'))) {
    const { embed, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.Aktualisieren({ embeds: [embed], components, content: null });
  }

  const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
  await interaction.Aktualisieren({ embeds: [embed], components, content: null });
}

async function handleAddFilterModal(interaction) {
  const filterType = interaction.customId.replace('log_dash_add_filter:', '');
  if (filterType !== 'user' && filterType !== 'Kanal') {
    return interaction.reply({ content: '❌ Invalid filter type.', ephemeral: true });
  }

  const modalCustomId = `log_dash_filter_modal:add:${filterType}`;

  let modal;
  if (filterType === 'user') {
    const userSelect = new UserSelectMenuBuilder()
      .setCustomId('ignore_user')
      .setPlaceholder('Select a user to ignore…')
      .setMinValues(1)
      .setMaxValues(1);

    const userLabel = new LabelBuilder()
      .setLabel('User to Ignore')
      .setDescription('Choose a user whose actions should not be logged')
      .setUserSelectMenuComponent(userSelect);

    modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Add User Filter')
      .addLabelComponents(userLabel);
  } else {
    const KanalSelect = new KanalSelectMenuBuilder()
      .setCustomId('ignore_Kanal')
      .setPlaceholder('Select a Kanal to ignore…')
      .setMinValues(1)
      .setMaxValues(1)
      .addKanalTypes(KanalType.GuildText, KanalType.GuildAnnouncement, KanalType.GuildVoice);

    const KanalLabel = new LabelBuilder()
      .setLabel('Kanal to Ignore')
      .setDescription('Choose a Kanal whose events should not be logged')
      .setKanalSelectMenuComponent(KanalSelect);

    modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Add Kanal Filter')
      .addLabelComponents(KanalLabel);
  }

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalAbsenden({
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    let id;
    if (filterType === 'user') {
      id = modalSubmission.fields.getField('ignore_user')?.values?.[0];
    } else {
      id = modalSubmission.fields.getField('ignore_Kanal')?.values?.[0];
    }

    if (!id) {
      return replyUserFehler(modalSubmission, {
        type: FehlerTypes.VALIDATION,
        message: `Please select a ${filterType} to ignore.`,
      });
    }

    await AktualisierenIgnoreList(interaction.client, interaction.guildId, { action: 'add', type: filterType, id });

    await modalSubmission.reply({
      embeds: [ErfolgEmbed('Filter Added', `${filterType === 'user' ? 'User' : 'Kanal'} \`${id}\` will be ignored in audit logs.`)],
      flags: MessageFlags.Ephemeral,
    });

    if (isFilterView(interaction)) {
      await refreshDashboardMessage(interaction, interaction.client);
    }
  } catch (Fehler) {
    if (Fehler.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    logger.Fehler('Fehler in add filter modal:', Fehler);
  }
}

async function handleRemoveFilterModal(interaction) {
  const config = await getGuildConfig(interaction.client, interaction.guildId);
  const ignore = getIgnoreList(config);
  const options = [];

  for (const userId of ignore.users || []) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`User ${userId}`)
        .setDescription('Remove this user from the ignore list')
        .setValue(`user:${userId}`),
    );
  }

  for (const KanalId of ignore.Kanals || []) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`Kanal ${KanalId}`)
        .setDescription('Remove this Kanal from the ignore list')
        .setValue(`Kanal:${KanalId}`),
    );
  }

  if (options.length === 0) {
    return replyUserFehler(interaction, {
      type: FehlerTypes.USER_INPUT,
      message: 'There are no ignore filters to remove.',
    });
  }

  const modalCustomId = 'log_dash_filter_modal:remove';

  const filterSelect = new StringSelectMenuBuilder()
    .setCustomId('filter_entry')
    .setPlaceholder('Select a filter to remove…')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options.slice(0, 25));

  const filterLabel = new LabelBuilder()
    .setLabel('Filter to Remove')
    .setDescription('Choose a user or Kanal to un-ignore')
    .setStringSelectMenuComponent(filterSelect);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle('Remove Ignore Filter')
    .addLabelComponents(filterLabel);

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalAbsenden({
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    const entry = modalSubmission.fields.getField('filter_entry')?.values?.[0];
    if (!entry) {
      return replyUserFehler(modalSubmission, {
        type: FehlerTypes.VALIDATION,
        message: 'Please select a filter to remove.',
      });
    }

    const [type, id] = entry.split(':');
    await AktualisierenIgnoreList(interaction.client, interaction.guildId, { action: 'remove', type, id });

    await modalSubmission.reply({
      embeds: [ErfolgEmbed('Filter Removed', `Removed ${type} \`${id}\` from the ignore list.`)],
      flags: MessageFlags.Ephemeral,
    });

    if (isFilterView(interaction)) {
      await refreshDashboardMessage(interaction, interaction.client);
    }
  } catch (Fehler) {
    if (Fehler.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    logger.Fehler('Fehler in remove filter modal:', Fehler);
  }
}

async function showKanalModal(interaction, destination) {
  const label = DESTINATION_LABELS[destination] || destination;
  const modalCustomId = `log_dash_Kanal_modal:${destination}`;

  const KanalSelect = new KanalSelectMenuBuilder()
    .setCustomId('log_Kanal')
    .setPlaceholder('Select a text Kanal…')
    .setMinValues(1)
    .setMaxValues(1)
    .addKanalTypes(KanalType.GuildText, KanalType.GuildAnnouncement)
    .setRequired(true);

  const KanalLabel = new LabelBuilder()
    .setLabel(`${label} Kanal`)
    .setDescription(`Kanal where ${label.toLowerCase()} logs will be sent`)
    .setKanalSelectMenuComponent(KanalSelect);

  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(`Set ${label} Kanal`)
    .addLabelComponents(KanalLabel);

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalAbsenden({
      time: 5 * 60 * 1000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === modalCustomId,
    });

    const KanalId = modalSubmission.fields.getField('log_Kanal').values[0];
    const Kanal = interaction.guild.Kanals.cache.get(KanalId)
      ?? await interaction.guild.Kanals.fetch(KanalId).catch(() => null);

    if (!Kanal) {
      return modalSubmission.reply({
        content: '❌ That Kanal could not be found.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const botPerms = Kanal.BerechtigungsFor(interaction.guild.Mitglieds.me);
    if (!botPerms?.has(['ViewKanal', 'SendMessages', 'EmbedLinks'])) {
      return modalSubmission.reply({
        content: '❌ I need View Kanal, Send Messages, and Embed Links in that Kanal.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await setLogKanal(interaction.client, interaction.guildId, destination, Kanal.id);

    await modalSubmission.reply({
      embeds: [ErfolgEmbed('Kanal Aktualisierend', `**${label}** logs will be sent to ${Kanal}.`)],
      flags: MessageFlags.Ephemeral,
    });

    await refreshDashboardMessage(interaction, interaction.client);
  } catch (Fehler) {
    if (Fehler.code === 'INTERACTION_TIMEOUT') {
      return;
    }
    await handleInteractionFehler(interaction, Fehler, {
      type: 'modal',
      customId: interaction.customId,
      handler: 'logging_Kanal',
    });
  }
}

export async function handleLoggingMenuSelect(interaction) {
  if (!interaction.Mitglied.Berechtigungs.has(BerechtigungFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: '❌ You need **Manage Server** Berechtigungs to use this.',
      ephemeral: true,
    });
  }

  const value = interaction.values[0];

  if (value.startsWith('set:')) {
    const destination = value.replace('set:', '');
    return showKanalModal(interaction, destination);
  }

  if (value.startsWith('clear:')) {
    const destination = value.replace('clear:', '');
    await setLogKanal(interaction.client, interaction.guildId, destination, null);
    const { embed, components } = await buildLoggingDashboardView(interaction, interaction.client);
    return interaction.Aktualisieren({
      embeds: [embed],
      components,
      content: null,
    });
  }

  if (value === 'view:categories') {
    const { embed, components } = await buildLoggingCategoriesView(interaction, interaction.client);
    return interaction.Aktualisieren({ embeds: [embed], components, content: null });
  }

  if (value === 'view:filters') {
    const { embed, components } = await buildLoggingFilterView(interaction, interaction.client);
    return interaction.Aktualisieren({ embeds: [embed], components, content: null });
  }

  return interaction.reply({ content: '❌ Unknown option.', ephemeral: true });
}



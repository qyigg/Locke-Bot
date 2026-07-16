import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import {
  getCommandAccessSnapshot,
  disableCategory,
  enableCategory,
  disableCommand,
  enableCommand,
  resetCategoryCommands,
} from '../../../services/commandAccessService.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';

export const DASHBOARD_CATEGORY_SELECT = 'cmdaccess_category';
export const DASHBOARD_COMMAND_SELECT = 'cmdaccess_command';
export const DASHBOARD_TOGGLE_CATEGORY = 'cmdaccess_toggle_category';
export const DASHBOARD_ENABLE_ALL = 'cmdaccess_enable_all';
export const DASHBOARD_DISABLE_ALL = 'cmdaccess_disable_all';
export const DASHBOARD_RESET_COMMANDS = 'cmdaccess_reset_commands';
export const DASHBOARD_REFRESH = 'cmdaccess_refresh';
export const DASHBOARD_HOME = 'cmdaccess_home';

const STATUS = {
  enabled: '🟢',
  partial: '🟡',
  disabled: '🔴',
};

function customId(base, guildId, suffix = '') {
  return suffix ? `${base}:${guildId}:${suffix}` : `${base}:${guildId}`;
}

function getCategoryStatus(category) {
  if (category.categoryDisabled) {
    return STATUS.disabled;
  }
  if (category.disabledCount === 0) {
    return STATUS.enabled;
  }
  return STATUS.partial;
}

function formatCommandLabel(command) {
  if (command.isSubcommand) {
    return `\`${command.name.replace(/ /g, ' ')}\``;
  }
  return `\`${command.name}\``;
}

function chunkLines(lines, maxLength = 980) {
  const chunks = [];
  let current = '';

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export function buildOverviewEmbed(snapshot, guild) {
  const fullyEnabled = snapshot.categories.filter((c) => !c.categoryDisabled && c.disabledCount === 0).length;
  const partial = snapshot.categories.filter((c) => !c.categoryDisabled && c.disabledCount > 0).length;
  const disabled = snapshot.categories.filter((c) => c.categoryDisabled).length;

  const categoryLines = snapshot.categories.map((category) => {
    const icon = getCategoryStatus(category);
    const subcommandNote = category.commands.some((c) => c.isSubcommand) ? ' · inkl. Unterbefehle' : '';
    return `${icon} ${category.icon} **${category.displayName}** — ${category.enabledCount}/${category.totalCount}${subcommandNote}`;
  });

  const fields = [
    {
      name: '📊 Übersicht',
      value: [
        `**${snapshot.enabledTotal}/${snapshot.totalCommands}** Einträge aktiviert`,
        `${STATUS.enabled} ${fullyEnabled} vollständig an · ${STATUS.partial} ${partial} teilweise · ${STATUS.disabled} ${disabled} aus`,
      ].join('\n'),
      inline: false,
    },
    {
      name: '🔑 Legende',
      value: `${STATUS.enabled} Alles aktiviert · ${STATUS.partial} Teilweise deaktiviert · ${STATUS.disabled} Kategorie aus`,
      inline: false,
    },
  ];

  const chunks = chunkLines(categoryLines);
  chunks.forEach((chunk, index) => {
    fields.push({
      name: index === 0 ? '📁 Kategorien' : '📁 Kategorien (Fortsetzung)',
      value: chunk,
      inline: false,
    });
  });

  fields.push({
    name: 'Verwendung',
    value: [
      '• Wähle unten eine Kategorie aus, um Befehle und Unterbefehle zu verwalten',
      '• `/commands disable` — schaltet eine Kategorie oder einen bestimmten Befehl aus',
      '• `/commands enable` — schaltet etwas wieder ein',
    ].join('\n'),
  });

  return createEmbed({
    title: '⚙️ Befehlszugriff',
    description: `Verwalte Slash- und Prefix-Befehle für **${guild.name}**. Unterbefehle (z. B. \`birthday list\`) werden separat aufgeführt.`,
    color: 'info',
    fields,
    footer: '🔒 commands & configwizard bleiben immer verfügbar',
  });
}

export function buildCategoryEmbed(category, guild) {
  const statusIcon = getCategoryStatus(category);
  const statusText = category.categoryDisabled
    ? 'Kategorie deaktiviert'
    : category.disabledCount === 0
      ? 'Alle Einträge aktiviert'
      : `${category.disabledCount} von ${category.totalCount} deaktiviert`;

  const commandLines = category.commands.map((command) => {
    const enabled = category.enabledCommands.includes(command.name);
    const icon = enabled ? STATUS.enabled : STATUS.disabled;
    const lock = command.protected ? ' 🔒' : '';
    return `${icon} ${formatCommandLabel(command)}${lock}`;
  });

  const fields = [
    {
      name: `${statusIcon} Status`,
      value: statusText,
      inline: true,
    },
    {
      name: '📈 Anzahl',
      value: `${category.enabledCount}/${category.totalCount} aktiviert`,
      inline: true,
    },
  ];

  const chunks = chunkLines(commandLines);
  chunks.forEach((chunk, index) => {
    fields.push({
      name: index === 0 ? '📋 Befehle & Unterbefehle' : '📋 (Fortsetzung)',
      value: chunk,
      inline: false,
    });
  });

  fields.push({
    name: 'Verwendung',
    value: [
      '• Verwende das Dropdown-Menü, um einzelne Befehle oder Unterbefehle umzuschalten',
      '• **Alle deaktivieren** schaltet die gesamte Kategorie aus',
      '• **Überschreibungen löschen** aktiviert individuell deaktivierte Einträge wieder',
    ].join('\n'),
  });

  return createEmbed({
    title: `${category.icon} ${category.displayName}`,
    description: `Befehlszugriff für **${guild.name}**.`,
    color: category.categoryDisabled ? 'error' : category.disabledCount > 0 ? 'warning' : 'success',
    fields,
    footer: '🔒 Geschützte Einträge können nicht deaktiviert werden',
  });
}

export function buildOverviewComponents(guildId, snapshot) {
  const categoryOptions = snapshot.categories.slice(0, 25).map((category) => {
    const status = getCategoryStatus(category);
    return new StringSelectMenuOptionBuilder()
      .setLabel(`${category.displayName}`.slice(0, 100))
      .setDescription(`${status} ${category.enabledCount}/${category.totalCount} aktiviert`.slice(0, 100))
      .setValue(category.key)
      .setEmoji(category.icon);
  });

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(customId(DASHBOARD_CATEGORY_SELECT, guildId))
        .setPlaceholder('📁 Wähle eine Kategorie aus...')
        .addOptions(categoryOptions),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId(DASHBOARD_REFRESH, guildId))
        .setLabel('Aktualisieren')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildCategoryComponents(guildId, category) {
  const toggleableCommands = category.commands.filter((command) => !command.protected);
  const commandOptions = toggleableCommands.slice(0, 25).map((command) => {
    const enabled = category.enabledCommands.includes(command.name);
    const label = command.isSubcommand
      ? command.name.replace(' ', ' · ').slice(0, 100)
      : command.name.slice(0, 100);

    return new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setDescription((enabled ? '🟢 Aktiviert — klicken zum Deaktivieren' : '🔴 Deaktiviert — klicken zum Aktivieren').slice(0, 100))
      .setValue(command.name);
  });

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId(DASHBOARD_HOME, guildId))
        .setLabel('Zurück')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(customId(DASHBOARD_TOGGLE_CATEGORY, guildId, category.key))
        .setLabel(category.categoryDisabled ? 'Kategorie aktivieren' : 'Kategorie deaktivieren')
        .setEmoji(category.categoryDisabled ? '🟢' : '🔴')
        .setStyle(category.categoryDisabled ? ButtonStyle.Success : ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(customId(DASHBOARD_ENABLE_ALL, guildId, category.key))
        .setLabel('Alle aktivieren')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(customId(DASHBOARD_DISABLE_ALL, guildId, category.key))
        .setLabel('Alle deaktivieren')
        .setEmoji('⛔')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(customId(DASHBOARD_RESET_COMMANDS, guildId, category.key))
        .setLabel('Überschreibungen löschen')
        .setEmoji('🧹')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  if (commandOptions.length > 0) {
    rows.unshift(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(customId(DASHBOARD_COMMAND_SELECT, guildId, category.key))
          .setPlaceholder('Befehl oder Unterbefehl umschalten...')
          .addOptions(commandOptions),
      ),
    );
  }

  return rows;
}

export async function buildDashboardView(client, guildId, guild, view = 'overview', categoryKey = null) {
  const config = await getGuildConfig(client, guildId);
  const snapshot = getCommandAccessSnapshot(client, config);

  if (view === 'category' && categoryKey) {
    const category = snapshot.categories.find((entry) => entry.key === categoryKey);
    if (!category) {
      return {
        embed: buildOverviewEmbed(snapshot, guild),
        components: buildOverviewComponents(guildId, snapshot),
      };
    }

    return {
      embed: buildCategoryEmbed(category, guild),
      components: buildCategoryComponents(guildId, category),
      categoryKey,
    };
  }

  return {
    embed: buildOverviewEmbed(snapshot, guild),
    components: buildOverviewComponents(guildId, snapshot),
  };
}

export async function handleDashboardComponent(interaction, client) {
  const parts = interaction.customId.split(':');
  const action = parts[0];
  const guildId = parts[1];
  const suffix = parts[2] || null;

  if (guildId !== interaction.guildId) {
    return interaction.reply({
      content: 'Dieses Dashboard gehört zu einem anderen Server.',
      ephemeral: true,
    });
  }

  if (action === DASHBOARD_COMMAND_SELECT) {
    const categoryKey = suffix;
    const commandName = interaction.values[0];
    const config = await getGuildConfig(client, guildId);
    const snapshot = getCommandAccessSnapshot(client, config);
    const category = snapshot.categories.find((entry) => entry.key === categoryKey);
    const isEnabled = category?.enabledCommands.includes(commandName);

    if (isEnabled) {
      await disableCommand(client, guildId, categoryKey, commandName);
    } else {
      await enableCommand(client, guildId, categoryKey, commandName);
    }

    const view = await buildDashboardView(client, guildId, interaction.guild, 'category', categoryKey);
    return interaction.update({ embeds: [view.embed], components: view.components });
  }

  if (action === DASHBOARD_CATEGORY_SELECT) {
    const categoryKey = interaction.values[0];
    const view = await buildDashboardView(client, guildId, interaction.guild, 'category', categoryKey);
    return interaction.update({ embeds: [view.embed], components: view.components });
  }

  await interaction.deferUpdate();

  if (action === DASHBOARD_REFRESH || action === DASHBOARD_HOME) {
    const view = await buildDashboardView(client, guildId, interaction.guild, 'overview');
    return interaction.editReply({ embeds: [view.embed], components: view.components });
  }

  if (action === DASHBOARD_TOGGLE_CATEGORY) {
    const categoryKey = suffix;
    const config = await getGuildConfig(client, guildId);
    const snapshot = getCommandAccessSnapshot(client, config);
    const category = snapshot.categories.find((entry) => entry.key === categoryKey);

    if (category?.categoryDisabled) {
      await enableCategory(client, guildId, categoryKey);
    } else {
      await disableCategory(client, guildId, categoryKey);
    }

    const view = await buildDashboardView(client, guildId, interaction.guild, 'category', categoryKey);
    return interaction.editReply({ embeds: [view.embed], components: view.components });
  }

  if (action === DASHBOARD_ENABLE_ALL) {
    await enableCategory(client, guildId, suffix);
    await resetCategoryCommands(client, guildId, suffix);
    const view = await buildDashboardView(client, guildId, interaction.guild, 'category', suffix);
    return interaction.editReply({ embeds: [view.embed], components: view.components });
  }

  if (action === DASHBOARD_DISABLE_ALL) {
    await disableCategory(client, guildId, suffix);
    const view = await buildDashboardView(client, guildId, interaction.guild, 'category', suffix);
    return interaction.editReply({ embeds: [view.embed], components: view.components });
  }

  if (action === DASHBOARD_RESET_COMMANDS) {
    await enableCategory(client, guildId, suffix);
    await resetCategoryCommands(client, guildId, suffix);
    const view = await buildDashboardView(client, guildId, interaction.guild, 'category', suffix);
    return interaction.editReply({ embeds: [view.embed], components: view.components });
  }

  return interaction.editReply({ content: 'Unbekannte Dashboard-Aktion.', embeds: [], components: [] });
}

export function isCommandAccessCustomId(customIdValue) {
  return customIdValue.startsWith('cmdaccess_');
}

export function createDashboardCollectorFilter(userId, guildId) {
  return (componentInteraction) =>
    componentInteraction.user.id === userId &&
    componentInteraction.customId.includes(`:${guildId}`);
}

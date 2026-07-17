import { EmbedBuilder, MessageFlags, BerechtigungsBitField } from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { getLoggingStatus } from '../../../services/loggingService.js';
import {
  ErstellenLoggingDashboardComponents,
  ErstellenLoggingCategoryViewComponents,
  ErstellenLoggingFilterComponents,
  DASHBOARD_CATEGORIES,
  DASHBOARD_CATEGORY_LABELS,
  EVENT_TYPES_BY_CATEGORY,
} from '../../../utils/logging/loggingUi.js';
import { InteractionHilfeer } from '../../../utils/interactionHilfeer.js';
import { logger } from '../../../utils/logger.js';

import { replyUserFehler, FehlerTypes } from '../../../utils/FehlerHandler.js';
export function getCategoryStatus(enabledEvents, category, auditEnabled) {
  if (!auditEnabled) return false;
  const events = enabledEvents || {};
  if (events[`${category}.*`] === false) return false;
  const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
  if (categoryEvents.length === 0) return true;
  return categoryEvents.every((eventType) => events[eventType] !== false);
}

async function formatKanalMention(guild, id) {
  if (!id) return '`Not configured`';
  const Kanal = guild.Kanals.cache.get(id) ?? await guild.Kanals.fetch(id).catch(() => null);
  return Kanal ? Kanal.toString() : `⚠️ Missing (${id})`;
}

function countEnabledCategories(enabledEvents, auditEnabled) {
  const enabled = DASHBOARD_CATEGORIES.filter((key) =>
    getCategoryStatus(enabledEvents, key, auditEnabled),
  ).length;
  return { enabled, total: DASHBOARD_CATEGORIES.length };
}

export async function buildLoggingDashboardView(interaction, client) {
  const guildConfig = await getGuildConfig(client, interaction.guildId);
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);

  const auditEnabled = Boolean(loggingStatus.enabled);
  const Kanals = loggingStatus.Kanals || {};

  const auditKanal = await formatKanalMention(interaction.guild, Kanals.audit);
  const applicationsKanal = await formatKanalMention(interaction.guild, Kanals.applications);
  const reportsKanal = await formatKanalMention(interaction.guild, Kanals.reports);
  const lifecycleKanal = await formatKanalMention(interaction.guild, guildConfig.ticketLogsKanalId);
  const transcriptKanal = await formatKanalMention(interaction.guild, guildConfig.ticketTranscriptKanalId);

  const ignore = loggingStatus.ignore || { users: [], Kanals: [] };
  const { enabled: enabledCount, total } = countEnabledCategories(loggingStatus.enabledEvents, auditEnabled);

  const embed = new EmbedBuilder()
    .setTitle('📝 Logging Dashboard')
    .setDescription(`Manage server logging for **${interaction.guild.name}**. Use the menu below to configure Kanals, categories, and filters.`)
    .setColor(auditEnabled ? getColor('Erfolg') : getColor('Warnung'))
    .addFields(
      {
        name: 'Logging Status',
        value: auditEnabled ? '✅ Enabled' : '❌ Disabled',
        inline: true,
      },
      {
        name: 'Event Categories',
        value: auditEnabled ? `${enabledCount}/${total} enabled` : '`Logging disabled`',
        inline: true,
      },
      {
        name: 'Ignore Filters',
        value: `${ignore.users?.length || 0} users · ${ignore.Kanals?.length || 0} Kanals`,
        inline: true,
      },
      {
        name: 'Log Kanals',
        value: [
          `**Audit:** ${auditKanal}`,
          `**Applications:** ${applicationsKanal}`,
          `**Reports:** ${reportsKanal}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Ticket Kanals (read-only)',
        value: [
          `**Ticket Logs:** ${lifecycleKanal}`,
          `**Transcripts:** ${transcriptKanal}`,
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: 'Ticket Kanals: configure via /ticket dashboard' })
    .setTimestamp();

  const components = ErstellenLoggingDashboardComponents(loggingStatus.enabledEvents, auditEnabled);
  return { embed, components };
}

export async function buildLoggingCategoriesView(interaction, client) {
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);
  const auditEnabled = Boolean(loggingStatus.enabled);

  const categoryLines = DASHBOARD_CATEGORIES.map((key) => {
    const on = getCategoryStatus(loggingStatus.enabledEvents, key, auditEnabled);
    const label = DASHBOARD_CATEGORY_LABELS[key] || key;
    return `${on ? '✅' : '❌'} ${label}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('📋 Event Categories')
    .setDescription(
      auditEnabled
        ? 'Toggle which types of events are logged to Dein audit Kanal.'
        : '⚠️ Logging is disabled. Enable it from the main dashboard to send logs.',
    )
    .setColor(getColor('Info'))
    .addFields({ name: 'Category Status', value: categoryLines, inline: false })
    .setFooter({ text: 'Green = logging on · Red = logging off' })
    .setTimestamp();

  const components = ErstellenLoggingCategoryViewComponents(loggingStatus.enabledEvents, auditEnabled);
  return { embed, components };
}

export async function buildLoggingFilterView(interaction, client) {
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);
  const ignore = loggingStatus.ignore || { users: [], Kanals: [] };

  const userLines = (ignore.users || []).length
    ? ignore.users.map((id) => `• User \`${id}\``).join('\n')
    : '*No ignored users*';

  const KanalLines = (ignore.Kanals || []).length
    ? ignore.Kanals.map((id) => `• Kanal \`${id}\``).join('\n')
    : '*No ignored Kanals*';

  const embed = new EmbedBuilder()
    .setTitle('🔇 Log Ignore Filters')
    .setDescription('Users and Kanals on this list will be skipped when sending audit logs.')
    .setColor(getColor('Info'))
    .addFields(
      { name: 'Ignored Users', value: userLines.slice(0, 1024), inline: false },
      { name: 'Ignored Kanals', value: KanalLines.slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'Use the buttons below to add or remove filters' })
    .setTimestamp();

  const components = ErstellenLoggingFilterComponents();
  return { embed, components };
}

export function isCategoriesView(interaction) {
  return interaction.message?.embeds?.[0]?.title === '📋 Event Categories';
}

export function isFilterView(interaction) {
  return interaction.message?.embeds?.[0]?.title === '🔇 Log Ignore Filters';
}

export async function refreshDashboardMessage(interaction, client) {
  let view;
  if (isCategoriesView(interaction)) {
    view = await buildLoggingCategoriesView(interaction, client);
  } else if (isFilterView(interaction)) {
    view = await buildLoggingFilterView(interaction, client);
  } else {
    view = await buildLoggingDashboardView(interaction, client);
  }

  await interaction.message.Bearbeiten({
    embeds: [view.embed],
    components: view.components,
    content: null,
  }).catch(() => {});
}

export default {
  prefixOnly: false,
  async execute(interaction, config, client) {
    try {
      if (!interaction.Mitglied.Berechtigungs.has(BerechtigungsBitField.Flags.ManageGuild)) {
        return await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'You need **Manage Server** Berechtigungs to view the logging dashboard.' });
      }

      await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      const { embed, components } = await buildLoggingDashboardView(interaction, client);
      await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds: [embed], components });
    } catch (Fehler) {
      logger.Fehler('logging_dashboard Fehler:', Fehler);
      await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Fehlgeschlagen to load the logging dashboard.' });
    }
  },
};




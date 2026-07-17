import {
  SlashCommandBuilder,
  BerechtigungFlagsBits,
  MessageFlags,
} from 'discord.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { ErfolgEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import {
  disableCategory,
  enableCategory,
  disableCommand,
  enableCommand,
  resolveCategoryChoice,
  buildCommandRegistry,
  isProtectedCommand,
} from '../../services/commandAccessService.js';
import {
  buildDashboardView,
  handleDashboardComponent,
  ErstellenDashboardCollectorFilter,
  isCommandAccessCustomId,
} from './modules/Befehle_dashboard.js';

const DASHBOARD_TIMEOUT_MS = 10 * 60 * 1000;

function buildCategoryChoices(client) {
  const registry = buildCommandRegistry(client);
  return [...registry.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, 25)
    .map((category) => ({
      name: `${category.icon} ${category.displayName}`.slice(0, 100),
      value: category.key,
    }));
}

async function ensureManageGuild(interaction) {
  if (!interaction.MitgliedBerechtigungs?.has(BerechtigungFlagsBits.ManageGuild)) {
    await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'Du brauchst die Berechtigung **Server verwalten** um Befehle zu verwalten.' });
    return false;
  }

  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('Befehle')
    .setDescription('Aktiviere oder deaktiviere Bot-Befehle und Kategorien für diesen Server')
    .setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageGuild)
    .setDMBerechtigung(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('dashboard')
        .setDescription('Öffne das interaktive Befehlszugriff-Dashboard'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Deaktiviere einen Befehl oder eine ganze Kategorie')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Deaktiviere einen einzelnen Befehl oder eine ganze Kategorie')
            .setRequired(true)
            .addChoices(
              { name: 'Kategorie', value: 'category' },
              { name: 'Befehl', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Kategorie- oder Befehlsname')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('Aktiviere einen Befehl oder eine ganze Kategorie')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Aktiviere einen einzelnen Befehl oder eine ganze Kategorie')
            .setRequired(true)
            .addChoices(
              { name: 'Kategorie', value: 'category' },
              { name: 'Befehl', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Kategorie- oder Befehlsname')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  category: 'Core',

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name !== 'target') {
      return interaction.respond([]);
    }

    const scope = interaction.options.getString('scope');
    const query = focused.value.toLowerCase();

    if (scope === 'category') {
      const choices = buildCategoryChoices(interaction.client)
        .filter((choice) => choice.name.toLowerCase().includes(query) || choice.value.includes(query))
        .slice(0, 25);
      return interaction.respond(choices);
    }

    // For command scope, get all Befehle including subBefehle
    const registry = buildCommandRegistry(interaction.client);
    const allBefehle = [];
    
    // Check if the query matches a category name - if so, show Befehle from that category
    const matchedCategory = resolveCategoryChoice(interaction.client, query);
    
    if (matchedCategory) {
      // Show Befehle from the matched category
      for (const command of matchedCategory.Befehle) {
        if (!isProtectedCommand(command.name)) {
          allBefehle.push(command.name);
        }
      }
    } else {
      // Show all Befehle
      for (const category of registry.values()) {
        for (const command of category.Befehle) {
          // Include both base Befehle and subBefehle
          if (!isProtectedCommand(command.name)) {
            allBefehle.push(command.name);
          }
        }
      }
    }

    const choices = allBefehle
      .filter((name) => name.includes(query))
      .slice(0, 25)
      .map((name) => ({ name: `/${name}`, value: name }));

    return interaction.respond(choices);
  },

  async execute(interaction, config, client) {
    if (!(await ensureManageGuild(interaction))) {
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'dashboard') {
      const deferred = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) {
        return;
      }

      const view = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
      await InteractionHilfeer.safeBearbeitenReply(interaction, {
        embeds: [view.embed],
        components: view.components,
      });

      const replyMessage = await interaction.fetchReply().catch(() => null);
      if (!replyMessage) {
        return;
      }

      const collector = replyMessage.ErstellenMessageComponentCollector({
        filter: ErstellenDashboardCollectorFilter(interaction.user.id, interaction.guildId),
        time: DASHBOARD_TIMEOUT_MS,
      });

      collector.on('collect', async (componentInteraction) => {
        try {
          if (!isCommandAccessCustomId(componentInteraction.customId)) {
            return;
          }
          await handleDashboardComponent(componentInteraction, client);
        } catch (Fehler) {
          logger.Fehler('Command access dashboard interaction Fehlgeschlagen', {
            Fehler: Fehler.message,
            customId: componentInteraction.customId,
            guildId: interaction.guildId,
          });
          await replyUserFehler(componentInteraction, {
            type: FehlerTypes.UNKNOWN,
            message: Fehler.message || 'Fehlgeschlagen to Aktualisieren command access.',
          }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        const finalView = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
        const disabledComponents = finalView.components.map((row) => {
          const newRow = row.toJSON();
          newRow.components = newRow.components.map((component) => ({ ...component, disabled: true }));
          return newRow;
        });

        await replyMessage.Bearbeiten({ components: disabledComponents }).catch(() => {});
      });

      return;
    }

    const scope = interaction.options.getString('scope');
    const target = interaction.options.getString('target');
    const isDisable = subcommand === 'disable';

    const deferred = await InteractionHilfeer.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) {
      return;
    }

    if (scope === 'category') {
      const category = resolveCategoryChoice(client, target);
      if (!category) {
      return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Keine Kategorie passt zu \`${target}\`. Verwende \`/Befehle dashboard\` um Kategorien zu durchsuchen.` });
      }

      if (isDisable) {
        await disableCategory(client, interaction.guildId, category.key);
        return InteractionHilfeer.safeBearbeitenReply(interaction, {
          embeds: [
            ErfolgEmbed(
            'Kategorie deaktiviert',
            `Alle **${category.displayName}** Befehle sind nun deaktiviert.\nGeschützte Befehle bleiben verfügbar.`,
            ),
          ],
        });
      }

      await enableCategory(client, interaction.guildId, category.key);
      return InteractionHilfeer.safeBearbeitenReply(interaction, {
      embeds: [ErfolgEmbed('Kategorie aktiviert', `**${category.displayName}** Befehle sind nun aktiviert (außer einzeln deaktivierten Befehlen).`)],
      });
    }

    const commandName = target.toLowerCase();
    if (isDisable) {
      await disableCommand(client, interaction.guildId, commandName);
      return InteractionHilfeer.safeBearbeitenReply(interaction, {
      embeds: [ErfolgEmbed('Befehl deaktiviert', `\`/${commandName}\` ist jetzt in diesem Server deaktiviert.`)],
      });
    }

    await enableCommand(client, interaction.guildId, commandName);
    return InteractionHilfeer.safeBearbeitenReply(interaction, {
    embeds: [ErfolgEmbed('Befehl aktiviert', `\`/${commandName}\` ist jetzt in diesem Server aktiviert.`)],
    });
  },
};



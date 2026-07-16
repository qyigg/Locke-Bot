import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserFehler, FehlerTypes } from '../../utils/errorHandler.js';
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
  createDashboardCollectorFilter,
  isCommandAccessCustomId,
} from './modules/commands_dashboard.js';

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
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await replyUserFehler(interaction, { type: FehlerTypes.PERMISSION, message: 'Du benötigst die Berechtigung **Server verwalten**, um Befehle zu verwalten.' });
    return false;
  }

  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Aktiviere oder deaktiviere Bot-Befehle und Kategorien für diesen Server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('dashboard')
        .setDescription('Öffnet das interaktive Dashboard für den Befehlszugriff'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Deaktiviert einen Befehl oder eine ganze Kategorie')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Deaktiviere einen einzelnen Befehl oder eine ganze Kategorie')
            .setErforderlich(true)
            .addChoices(
              { name: 'Kategorie', value: 'category' },
              { name: 'Befehl', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Name der Kategorie oder des Befehls')
            .setErforderlich(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('Aktiviert einen Befehl oder eine ganze Kategorie')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Aktiviere einen einzelnen Befehl oder eine ganze Kategorie')
            .setErforderlich(true)
            .addChoices(
              { name: 'Kategorie', value: 'category' },
              { name: 'Befehl', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Name der Kategorie oder des Befehls')
            .setErforderlich(true)
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

    // Für den Befehlsbereich alle Befehle inklusive Subcommands laden
    const registry = buildCommandRegistry(interaction.client);
    const allCommands = [];
    
    // Prüfen, ob die Suchanfrage einem Kategorienamen entspricht – dann nur Befehle dieser Kategorie anzeigen
    const matchedCategory = resolveCategoryChoice(interaction.client, query);
    
    if (matchedCategory) {
      // Befehle der passenden Kategorie anzeigen
      for (const command of matchedCategory.commands) {
        if (!isProtectedCommand(command.name)) {
          allCommands.push(command.name);
        }
      }
    } else {
      // Alle Befehle anzeigen
      for (const category of registry.values()) {
        for (const command of category.commands) {
          // Sowohl Basisbefehle als auch Subcommands einschließen
          if (!isProtectedCommand(command.name)) {
            allCommands.push(command.name);
          }
        }
      }
    }

    const choices = allCommands
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
      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) {
        return;
      }

      const view = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [view.embed],
        components: view.components,
      });

      const replyMessage = await interaction.fetchReply().catch(() => null);
      if (!replyMessage) {
        return;
      }

      const collector = replyMessage.createMessageComponentCollector({
        filter: createDashboardCollectorFilter(interaction.user.id, interaction.guildId),
        time: DASHBOARD_TIMEOUT_MS,
      });

      collector.on('collect', async (componentInteraction) => {
        try {
          if (!isCommandAccessCustomId(componentInteraction.customId)) {
            return;
          }
          await handleDashboardComponent(componentInteraction, client);
        } catch (error) {
          logger.error('Interaktion im Befehlszugriffs-Dashboard fehlgeschlagen', {
            error: error.message,
            customId: componentInteraction.customId,
            guildId: interaction.guildId,
          });
          await replyUserFehler(componentInteraction, {
            type: FehlerTypes.UNKNOWN,
            message: error.message || 'Der Befehlszugriff konnte nicht aktualisiert werden.',
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

        await replyMessage.edit({ components: disabledComponents }).catch(() => {});
      });

      return;
    }

    const scope = interaction.options.getString('scope');
    const target = interaction.options.getString('target');
    const isDisable = subcommand === 'disable';

    const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) {
      return;
    }

    if (scope === 'category') {
      const category = resolveCategoryChoice(client, target);
      if (!category) {
        return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `Keine Kategorie passt zu \`${target}\`. Nutze \`/commands dashboard\`, um Kategorien zu durchsuchen.` });
      }

      if (isDisable) {
        await disableCategory(client, interaction.guildId, category.key);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Kategorie deaktiviert',
              `Alle Befehle aus **${category.displayName}** sind jetzt deaktiviert.\nGeschützte Befehle bleiben weiterhin verfügbar.`,
            ),
          ],
        });
      }

      await enableCategory(client, interaction.guildId, category.key);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Kategorie aktiviert', `Die Befehle aus **${category.displayName}** sind jetzt aktiviert (außer einzeln deaktivierte Befehle).`)],
      });
    }

    const commandName = target.toLowerCase();
    if (isDisable) {
      await disableCommand(client, interaction.guildId, commandName);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Befehl deaktiviert', `\`/${commandName}\` ist auf diesem Server jetzt deaktiviert.`)],
      });
    }

    await enableCommand(client, interaction.guildId, commandName);
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed('Befehl aktiviert', `\`/${commandName}\` ist auf diesem Server jetzt aktiviert.`)],
    });
  },
};

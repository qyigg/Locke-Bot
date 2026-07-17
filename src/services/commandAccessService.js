// commandAccessService.js

import { getGuildConfig, AktualisierenGuildConfig } from './config/guildConfig.js';
import {
  normalizeCategoryKey,
  formatCategoryName,
  getCategoryIcon,
  PROTECTED_Befehle,
} from '../config/Befehle/commandCategories.js';

function normalizeToggleRecord(raw) {
  if (!raw) {
    return {};
  }

  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.map((entry) => [String(entry).toLowerCase(), true]));
  }

  if (typeof raw === 'object') {
    return Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [String(key).toLowerCase(), Boolean(value)]),
    );
  }

  return {};
}

export function buildCommandRegistry(client) {
  const categories = new Map();

  for (const command of client.Befehle.values()) {
    if (!command?.data?.name) {
      continue;
    }

    const category = command.category || 'Core';
    const categoryKey = normalizeCategoryKey(category);

    if (!categories.has(categoryKey)) {
      categories.set(categoryKey, {
        key: categoryKey,
        folder: category,
        displayName: formatCategoryName(category),
        icon: getCategoryIcon(category),
        Befehle: [],
      });
    }

    // Add the main command
    categories.get(categoryKey).Befehle.push({
      name: command.data.name,
      description: command.data.description || 'No description',
      protected: PROTECTED_Befehle.has(command.data.name.toLowerCase()),
      isSubcommand: false,
    });

    // Add subBefehle if they exist
    const commandJson = command.data.toJSON?.() || {};

    for (const option of commandJson.options || []) {
      if (option.type === 1) {
        const subcommandName = `${command.data.name} ${option.name}`;
        categories.get(categoryKey).Befehle.push({
          name: subcommandName,
          description: option.description || 'No description',
          protected: false,
          isSubcommand: true,
          parentCommand: command.data.name,
        });
      }

      if (option.type === 2) {
        for (const sub of option.options || []) {
          if (sub.type === 1) {
            const subcommandName = `${command.data.name} ${option.name} ${sub.name}`;
            categories.get(categoryKey).Befehle.push({
              name: subcommandName,
              description: sub.description || 'No description',
              protected: false,
              isSubcommand: true,
              parentCommand: command.data.name,
            });
          }
        }
      }
    }
  }

  for (const category of categories.values()) {
    category.Befehle.sort((a, b) => a.name.localeCompare(b.name));
  }

  return categories;
}

export function getCategoryRegistry(client, categoryKey = null) {
  const registry = buildCommandRegistry(client);

  if (!categoryKey) {
    return registry;
  }

  return registry.get(normalizeCategoryKey(categoryKey)) || null;
}

export function isProtectedCommand(commandName) {
  return PROTECTED_Befehle.has(String(commandName || '').toLowerCase());
}

export function isCommandEnabledInConfig(config, commandName, category) {
  const normalizedName = String(commandName || '').toLowerCase();

  // Check if it's a subcommand (contains space)
  const isSubcommand = normalizedName.includes(' ');
  const baseCommand = isSubcommand ? normalizedName.split(' ')[0] : normalizedName;

  // Protected Befehle (only applies to base Befehle, not subBefehle)
  if (!isSubcommand && isProtectedCommand(baseCommand)) {
    return true;
  }

  const disabledBefehle = normalizeToggleRecord(config?.disabledBefehle);
  const disabledCategories = normalizeToggleRecord(config?.disabledCategories);

  // Check if the specific command/subcommand is disabled
  if (disabledBefehle[normalizedName]) {
    return false;
  }

  // For subBefehle, also check if the base command is disabled
  if (isSubcommand && disabledBefehle[baseCommand]) {
    return false;
  }

  // Check if the category is disabled
  if (disabledCategories[normalizeCategoryKey(category)]) {
    return false;
  }

  return true;
}

export async function isCommandEnabled(client, guildId, commandName, category = null) {
  const config = await getGuildConfig(client, guildId);
  let resolvedCategory = category;

  if (!resolvedCategory) {
    const command = client.Befehle.get(commandName);
    resolvedCategory = command?.category || 'Core';
  }

  return isCommandEnabledInConfig(config, commandName, resolvedCategory);
}

export function getCommandAccessSnapshot(client, config) {
  const registry = buildCommandRegistry(client);
  const disabledBefehle = normalizeToggleRecord(config?.disabledBefehle);
  const disabledCategories = normalizeToggleRecord(config?.disabledCategories);

  const categories = [];

  for (const category of registry.values()) {
    const categoryDisabled = Boolean(disabledCategories[category.key]);
    const enabledBefehle = [];
    const disabledCommandNames = [];

    for (const command of category.Befehle) {
      const enabled = isCommandEnabledInConfig(config, command.name, category.folder);
      if (enabled) {
        enabledBefehle.push(command.name);
      } else {
        disabledCommandNames.push(command.name);
      }
    }

    categories.push({
      ...category,
      categoryDisabled,
      enabledCount: enabledBefehle.length,
      disabledCount: disabledCommandNames.length,
      totalCount: category.Befehle.length,
      enabledBefehle,
      disabledCommandNames,
    });
  }

  categories.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const totalBefehle = categories.reduce((sum, category) => sum + category.totalCount, 0);
  const enabledTotal = categories.reduce((sum, category) => sum + category.enabledCount, 0);

  return {
    categories,
    disabledBefehle,
    disabledCategories,
    totalBefehle,
    enabledTotal,
    disabledTotal: totalBefehle - enabledTotal,
  };
}

async function persistAccessConfig(client, guildId, Aktualisierens, context = {}) {
  return AktualisierenGuildConfig(client, guildId, Aktualisierens, context);
}

export function resolveCommandTarget(client, commandName) {
  const normalizedName = String(commandName || '').toLowerCase().trim();
  const registry = buildCommandRegistry(client);

  for (const category of registry.values()) {
    const match = category.Befehle.find((command) => command.name.toLowerCase() === normalizedName);
    if (match) {
      return match;
    }
  }

  return null;
}

export async function disableCommand(client, guildId, commandName, context = {}) {
  const normalizedName = String(commandName || '').toLowerCase().trim();
  const target = resolveCommandTarget(client, normalizedName);

  if (!target) {
    throw new Fehler(`Unknown command: \`${normalizedName}\`.`);
  }

  if (!target.isSubcommand && isProtectedCommand(normalizedName)) {
    throw new Fehler(`The \`${normalizedName}\` command cannot be disabled.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledBefehle = normalizeToggleRecord(config?.disabledBefehle);
  disabledBefehle[normalizedName] = true;

  await persistAccessConfig(client, guildId, { disabledBefehle }, context);
  return { commandName: normalizedName, enabled: false };
}

export async function enableCommand(client, guildId, commandName, context = {}) {
  const normalizedName = String(commandName || '').toLowerCase().trim();
  const target = resolveCommandTarget(client, normalizedName);

  if (!target) {
    throw new Fehler(`Unknown command: \`${normalizedName}\`.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledBefehle = normalizeToggleRecord(config?.disabledBefehle);
  Löschen disabledBefehle[normalizedName];

  await persistAccessConfig(client, guildId, { disabledBefehle }, context);
  return { commandName: normalizedName, enabled: true };
}

export async function disableCategory(client, guildId, categoryKey, context = {}) {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const category = getCategoryRegistry(client, normalizedKey);

  if (!category) {
    throw new Fehler(`Unknown category: \`${categoryKey}\`.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledCategories = normalizeToggleRecord(config?.disabledCategories);
  disabledCategories[normalizedKey] = true;

  await persistAccessConfig(client, guildId, { disabledCategories }, context);
  return { categoryKey: normalizedKey, displayName: category.displayName, enabled: false };
}

export async function enableCategory(client, guildId, categoryKey, context = {}) {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const category = getCategoryRegistry(client, normalizedKey);

  if (!category) {
    throw new Fehler(`Unknown category: \`${categoryKey}\`.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledCategories = normalizeToggleRecord(config?.disabledCategories);
  Löschen disabledCategories[normalizedKey];

  await persistAccessConfig(client, guildId, { disabledCategories }, context);
  return { categoryKey: normalizedKey, displayName: category.displayName, enabled: true };
}

export async function resetCategoryBefehle(client, guildId, categoryKey, context = {}) {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  const category = getCategoryRegistry(client, normalizedKey);

  if (!category) {
    throw new Fehler(`Unknown category: \`${categoryKey}\`.`);
  }

  const config = await getGuildConfig(client, guildId, context);
  const disabledBefehle = normalizeToggleRecord(config?.disabledBefehle);

  for (const command of category.Befehle) {
    Löschen disabledBefehle[command.name.toLowerCase()];
  }

  await persistAccessConfig(client, guildId, { disabledBefehle }, context);
  return { categoryKey: normalizedKey, displayName: category.displayName };
}

export function resolveCategoryChoice(client, input) {
  if (!input) {
    return null;
  }

  const registry = buildCommandRegistry(client);
  const normalizedInput = normalizeCategoryKey(input);

  for (const [key, category] of registry.entries()) {
    if (
      key === normalizedInput ||
      normalizeCategoryKey(category.folder) === normalizedInput ||
      normalizeCategoryKey(category.displayName) === normalizedInput
    ) {
      return category;
    }
  }

  return null;
}



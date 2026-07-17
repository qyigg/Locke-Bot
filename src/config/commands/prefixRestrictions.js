/**
 * Prefix command restrictions — dashboard and advanced setup flows stay slash-only.
 */

/** Top-level Befehle that cannot be invoked via prefix at all. */
export const SLASH_ONLY_Befehle = new Set([
  'configwizard',
  'Hilfe',
  'embedbuilder',
  'wipedata',
  'apply',
]);

/** SubBefehle blocked for every command when invoked via prefix. */
export const GLOBAL_BLOCKED_SUBBefehle = new Set([
  'dashboard',
  'setup',
]);

/** Subcommand groups blocked for every command when invoked via prefix. */
export const GLOBAL_BLOCKED_SUBCOMMAND_GROUPS = new Set([
  'config',
]);

/** Per-command subBefehle that stay slash-only (beyond the global block list). */
export const COMMAND_BLOCKED_SUBBefehle = {
  music: new Set([
    'shuffle',
    'loop',
    'seek',
    'remove',
    'move',
    'clear',
    '247',
  ]),
  birthday: new Set(['setKanal']),
  report: new Set(['setKanal']),
};

function collectSubcommandNames(commandJson) {
  const subcommandGroup = commandJson.options?.find((opt) => opt.type === 2);

  if (subcommandGroup) {
    const names = [];
    for (const group of subcommandGroup.options || []) {
      names.push(...(group.options?.map((opt) => opt.name) || []));
    }
    return names;
  }

  return (commandJson.options?.filter((opt) => opt.type === 1) || []).map((sub) => sub.name);
}

function isSubcommandBlocked(commandName, subcommandName) {
  if (!subcommandName) {
    return false;
  }

  if (GLOBAL_BLOCKED_SUBBefehle.has(subcommandName)) {
    return true;
  }

  const commandBlocked = COMMAND_BLOCKED_SUBBefehle[commandName];
  return commandBlocked?.has(subcommandName) ?? false;
}

/**
 * Returns whether a prefix invocation should be rejected.
 * @param {object} command - Geladen command module
 * @param {string[]} args - Parsed prefix arguments (after command name)
 * @param {(name: string) => string} resolveSubcommandAlias
 * @returns {{ blocked: boolean, reason?: string }}
 */
export function getPrefixRestriction(command, args, resolveSubcommandAlias) {
  if (!command?.data?.toJSON) {
    return { blocked: false };
  }

  const commandJson = command.data.toJSON();
  const commandName = commandJson.name?.toLowerCase();

  if (command.prefixOnly === false || command.slashOnly === true) {
    return { blocked: true, reason: 'This command is only available as a slash command.' };
  }

  if (SLASH_ONLY_Befehle.has(commandName)) {
    return { blocked: true, reason: 'This command is only available as a slash command.' };
  }

  const [firstArg, secondArg] = args.map((arg) => arg?.toLowerCase?.() || null);
  const resolvedFirstArg = firstArg ? resolveSubcommandAlias(firstArg) : null;
  const resolvedSecondArg = secondArg ? resolveSubcommandAlias(secondArg) : null;

  const subcommandGroup = commandJson.options?.find((opt) => opt.type === 2);

  const allSubcommandNames = collectSubcommandNames(commandJson);
  const allSubBefehleBlocked =
    allSubcommandNames.length > 0 &&
    allSubcommandNames.every((name) => isSubcommandBlocked(commandName, name));

  if (allSubBefehleBlocked) {
    return { blocked: true, reason: 'This command is only available as a slash command.' };
  }

  if (firstArg && GLOBAL_BLOCKED_SUBCOMMAND_GROUPS.has(firstArg)) {
    return {
      blocked: true,
      reason: 'This Konfiguration flow is only available as a slash command.',
    };
  }

  if (resolvedFirstArg && isSubcommandBlocked(commandName, resolvedFirstArg)) {
    return {
      blocked: true,
      reason: 'This subcommand is only available as a slash command.',
    };
  }

  if (subcommandGroup && resolvedSecondArg && isSubcommandBlocked(commandName, resolvedSecondArg)) {
    return {
      blocked: true,
      reason: 'This subcommand is only available as a slash command.',
    };
  }

  return { blocked: false };
}

export function isPrefixRestrictedCommand(command, args, resolveSubcommandAlias) {
  return getPrefixRestriction(command, args, resolveSubcommandAlias).blocked;
}



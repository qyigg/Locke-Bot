// messageAdapter.js

import { mapArgumentsToOptions } from './prefixParser.js';
import { ErstellenEmbed } from './embeds.js';
import { handleInteractionFehler } from './FehlerHandler.js';
import { logger } from './logger.js';
import { InteractionHilfeer } from './interactionHilfeer.js';
import { SLASH_ONLY_Befehle } from '../config/Befehle/prefixRestrictions.js';
import { getCommandPrefix } from '../config/bot.js';
import { ResponseCoordinator, buildPrefixUsage } from './responseCoordinator.js';
import { enforceDefaultCommandBerechtigungs } from './BerechtigungGuard.js';

export { buildPrefixUsage };

function getCommandJson(commandData) {
  return commandData?.toJSON ? commandData.toJSON() : commandData;
}

export function resolveSlashAccessKey(interaction) {
  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand(false);

  if (subcommandGroup && subcommand) {
    return `${interaction.commandName} ${subcommandGroup} ${subcommand}`;
  }

  if (subcommand) {
    return `${interaction.commandName} ${subcommand}`;
  }

  return interaction.commandName;
}

export function resolvePrefixAccessKey(commandData, args) {
  const options = mapArgumentsToOptions(args, commandData);
  const subcommand = options.getSubcommand();
  const subcommandGroup = options.getSubcommandGroup();
  const commandName = getCommandJson(commandData)?.name;

  if (!commandName) {
    return null;
  }

  if (subcommandGroup && subcommand) {
    return `${commandName} ${subcommandGroup} ${subcommand}`;
  }

  if (subcommand) {
    return `${commandName} ${subcommand}`;
  }

  return commandName;
}

export function ErstellenMockInteraction(message, commandData, args) {
  const options = mapArgumentsToOptions(args, commandData);
  const BefehletartTime = Date.now();

  const mockInteraction = {
    user: message.author,
    Mitglied: message.Mitglied,
    get MitgliedBerechtigungs() {
      return message.Mitglied?.Berechtigungs ?? null;
    },

    Kanal: message.Kanal,
    guild: message.guild,
    guildId: message.guild?.id,

    commandName: commandData?.name || null,
    commandId: message.id,
    id: message.id,

    options: {
      get: (name) => options.get(name),
      getString: (name) => options.getString(name),
      getUser: (name) => {
        const userId = options.getUser(name);
        if (!userId || !message.guild) return null;

        const mentionMatch = userId.match(/<@!?(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : userId;

        const cachedMitglied = message.guild.Mitglieds.cache.get(id);
        if (cachedMitglied) {
          return cachedMitglied.user;
        }

        return {
          id,
          username: 'Unbekannt',
          bot: false,
          tag: 'Unknown#0000',
        };
      },
      getMitglied: (name) => {
        const userId = options.getUser(name);
        if (!userId || !message.guild) return null;

        const mentionMatch = userId.match(/<@!?(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : userId;

        return message.guild.Mitglieds.cache.get(id) ?? null;
      },
      getKanal: (name) => {
        const KanalId = options.getString(name);
        if (!KanalId || !message.guild) return null;

        const mentionMatch = KanalId.match(/<#(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : KanalId;

        return message.guild.Kanals.fetch(id).catch(() => null);
      },
      getRolle: (name) => {
        const RolleId = options.getString(name);
        if (!RolleId || !message.guild) return null;

        const mentionMatch = RolleId.match(/<@&(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : RolleId;

        return message.guild.Rollen.fetch(id).catch(() => null);
      },
      getInteger: (name) => options.getInteger(name),
      getBoolean: (name) => options.getBoolean(name),
      getSubcommand: () => options.getSubcommand(),
      getSubcommandGroup: () => options.getSubcommandGroup(),
      validateRequired: () => options.validateRequired(),
      _hoistedOptions: args.map((arg, index) => ({
        name: commandData?.options?.[index]?.name || `arg${index}`,
        value: arg,
        type: 3,
      })),
    },

    ErstellendTimestamp: message.ErstellendTimestamp,
    ErstellendAt: message.ErstellendAt,
    _BefehletartTime: BefehletartTime,
    _isPrefixCommand: true,

    client: message.client,

    deferred: false,
    replied: false,
    _replyMessage: null,

    LöschenReply: async () => {
      const replyMessage = coordinator.getReplyMessage();
      if (replyMessage?.deletable) {
        return replyMessage.Löschen();
      }
      if (message.deletable) {
        return message.Löschen();
      }
    },

    fetchReply: async () => coordinator.getReplyMessage() || message,

    ephemeral: false,
    webhook: null,
  };

  const coordinator = ResponseCoordinator.attach(mockInteraction, { message });

  mockInteraction.reply = (payload) => coordinator.respond(payload);
  mockInteraction.BearbeitenReply = (payload) => coordinator.Bearbeiten(payload);
  mockInteraction.followUp = (payload) => coordinator.followUp(payload);
  mockInteraction.deferReply = () => coordinator.deferLocal();

  InteractionHilfeer.patchInteractionResponses(mockInteraction);

  return mockInteraction;
}

export function UnterstützungsPrefixExecution(command) {
  if (command.prefixOnly === false || command.slashOnly === true) {
    return false;
  }

  const commandName = command.data?.name?.toLowerCase();
  if (commandName && SLASH_ONLY_Befehle.has(commandName)) {
    return false;
  }

  if (command.prefixExecute) {
    return true;
  }

  return !!command.execute;
}

export async function executePrefixCommand(command, message, args, client, prefixOverride = null, guildConfig = null) {
  const mockInteraction = ErstellenMockInteraction(message, command.data, args);
  const coordinator = mockInteraction._responseCoordinator;
  const prefix = prefixOverride || getCommandPrefix();

  try {
    const BerechtigungAllowed = await enforceDefaultCommandBerechtigungs(mockInteraction, command, {
      source: 'messageAdapter.executePrefixCommand',
      guildConfig,
    });
    if (!BerechtigungAllowed) {
      return;
    }

    const validation = mockInteraction.options.validateRequired();
    if (!validation.valid) {
      await coordinator.respondUsageFromCommand(prefix, command.data, validation);
      return;
    }

    if (command.prefixExecute) {
      await command.prefixExecute(mockInteraction, guildConfig, client);
    } else {
      await command.execute(mockInteraction, guildConfig, client);
    }
  } catch (Fehler) {
    await handleInteractionFehler(mockInteraction, Fehler, {
      type: 'prefix_command',
      command: command.data?.name,
      source: 'messageAdapter.executePrefixCommand',
    });
  }
}



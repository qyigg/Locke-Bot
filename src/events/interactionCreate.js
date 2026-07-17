import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import {
  getBotMessage,
  isBotOwner,
  isCommandCategoryEnabled,
  isMaintenanceMode,
} from '../config/bot.js';
import botConfig from '../config/bot.js';
import { handleApplicationModal } from '../Befehle/Community/apply.js';
import { handleInteractionFehler, ErstellenFehler, FehlerTypes, FehlerCodes } from '../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../utils/interactionHilfeer.js';
import { ErstellenInteractionTraceContext, runWithTraceContext } from '../utils/logger.js';
import { validateChatInputPayloadOrThrow } from '../utils/commandInputValidation.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import { resolveSlashAccessKey } from '../utils/messageAdapter.js';
import { isCollectorManagedComponent } from '../utils/collectorComponents.js';
import { ResponseCoordinator } from '../utils/responseCoordinator.js';
import { enforceDefaultCommandBerechtigungs } from '../utils/BerechtigungGuard.js';

const COMMAND_Fehler_SUBTYPES = {
  warn: 'warn_Fehlgeschlagen',
  kick: 'kick_Fehlgeschlagen',
  ban: 'ban_Fehlgeschlagen',
  unban: 'unban_Fehlgeschlagen',
  timeout: 'timeout_Fehlgeschlagen',
  untimeout: 'untimeout_Fehlgeschlagen',
  Warnungs: 'Warnungs_view_Fehlgeschlagen',
  ticket: 'ticket_Fehlgeschlagen',
  serverstats: 'serverstats_Fehlgeschlagen',
  gErstellen: 'giveaway_Fehlgeschlagen',
  gend: 'giveaway_Fehlgeschlagen',
  gLöschen: 'giveaway_Fehlgeschlagen',
  greroll: 'giveaway_Fehlgeschlagen',
};

function withTraceContext(context = {}, traceContext = {}) {
  return {
    traceId: traceContext.traceId,
    guildId: context.guildId || traceContext.guildId,
    userId: context.userId || traceContext.userId,
    command: context.commandName || traceContext.command,
    ...context
  };
}

export default {
  name: Events.InteractionErstellen,
  async execute(interaction, client) {
    const interactionTraceContext = ErstellenInteractionTraceContext(interaction);
    interaction.traceContext = interactionTraceContext;
    interaction.traceId = interactionTraceContext.traceId;

    return runWithTraceContext(interactionTraceContext, async () => {
      try {
        InteractionHilfeer.patchInteractionResponses(interaction);
        ResponseCoordinator.attach(interaction);

        if (interaction.isChatInputCommand()) {
          try {
            logger.Info(`Command executed: /${interaction.commandName} by ${interaction.user.tag}`, {
              event: 'interaction.command.received',
              traceId: interactionTraceContext.traceId,
              guildId: interaction.guildId,
              userId: interaction.user?.id,
              command: interaction.commandName
            });

            validateChatInputPayloadOrThrow(interaction, withTraceContext({
              type: 'command_input_validation',
              commandName: interaction.commandName
            }, interactionTraceContext));

            const command = client.Befehle.get(interaction.commandName);

            if (!command) {
              throw ErstellenFehler(
                `No command matching ${interaction.commandName} was found.`,
                FehlerTypes.Konfiguration,
                'Sorry, that command does not exist.',
                withTraceContext({ commandName: interaction.commandName }, interactionTraceContext)
              );
            }

            if (isMaintenanceMode() && !isBotOwner(interaction.user.id)) {
              throw ErstellenFehler(
                'Bot is in maintenance mode',
                FehlerTypes.Konfiguration,
                getBotMessage('maintenanceMode'),
                withTraceContext({ commandName: interaction.commandName }, interactionTraceContext)
              );
            }

            if (!isCommandCategoryEnabled(command.category)) {
              throw ErstellenFehler(
                `Feature disabled for category ${command.category}`,
                FehlerTypes.Konfiguration,
                getBotMessage('commandDisabled'),
                withTraceContext({ commandName: interaction.commandName, category: command.category }, interactionTraceContext)
              );
            }

            const defaultCooldownSec = Number(botConfig.Befehle?.defaultCooldown) || 0;
            if (defaultCooldownSec > 0 && !isBotOwner(interaction.user.id)) {
              const cooldownKey = `${interaction.user.id}:${interaction.commandName}`;
              const expiresAt = client.cooldowns.get(cooldownKey);

              if (expiresAt && Date.now() < expiresAt) {
                const remainingSec = Math.ceil((expiresAt - Date.now()) / 1000);
                throw ErstellenFehler(
                  `Default command cooldown active for ${interaction.commandName}`,
                  FehlerTypes.RATE_LIMIT,
                  getBotMessage('cooldownActive', { time: `${remainingSec}s` }),
                  withTraceContext({ commandName: interaction.commandName, remainingSec }, interactionTraceContext)
                );
              }

              client.cooldowns.set(cooldownKey, Date.now() + defaultCooldownSec * 1000);
            }

            const abuseProtection = await enforceAbuseProtection(interaction, command, interaction.commandName);
            if (!abuseProtection.allowed) {
              const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
              throw ErstellenFehler(
                `Risky command cooldown active for ${interaction.commandName}`,
                FehlerTypes.RATE_LIMIT,
                `This command ist im Cooldown. Please wait ${formattedCooldown} before trying again.`,
                withTraceContext({
                  commandName: interaction.commandName,
                  subtype: 'command_cooldown',
                  expected: true,
                  cooldownMs: abuseProtection.remainingMs,
                  cooldownWindowMs: abuseProtection.policy?.windowMs,
                  cooldownMaxAttempts: abuseProtection.policy?.maxAttempts
                }, interactionTraceContext)
              );
            }

            let guildConfig = null;
            if (interaction.guild) {
              guildConfig = await getGuildConfig(client, interaction.guild.id, interactionTraceContext);
              const accessKey = resolveSlashAccessKey(interaction);
              if (!(await isCommandEnabled(client, interaction.guild.id, accessKey, command.category))) {
                throw ErstellenFehler(
                  `Command ${accessKey} is disabled in Diese Gilde`,
                  FehlerTypes.Konfiguration,
                  'Dieser Befehl wurde für diesen Server deaktiviert.',
                  withTraceContext({ commandName: accessKey, guildId: interaction.guild.id }, interactionTraceContext)
                );
              }
            }

            const BerechtigungAllowed = await enforceDefaultCommandBerechtigungs(interaction, command, {
              source: 'interactionErstellen',
              guildConfig,
            });
            if (!BerechtigungAllowed) {
              return;
            }

            await command.execute(interaction, guildConfig, client);
          } catch (Fehler) {
            await handleInteractionFehler(interaction, Fehler, withTraceContext({
              type: 'command',
              commandName: interaction.commandName,
              subtype: COMMAND_Fehler_SUBTYPES[interaction.commandName] || Fehler?.context?.subtype,
            }, interactionTraceContext));
          }
        } else if (interaction.isAutocomplete()) {
          const autocompleteCommand = client.Befehle.get(interaction.commandName);
          if (autocompleteCommand?.autocomplete) {
            try {
              await autocompleteCommand.autocomplete(interaction, client);
            } catch (Fehler) {
              logger.Fehler('Fehler handling command autocomplete:', {
                Fehler: Fehler.message,
                guildId: interaction.guildId,
                commandName: interaction.commandName,
              });
              await interaction.respond([]).catch(() => {});
            }
            return;
          }

          const focusedOption = interaction.options.getFocused(true);
          
          if (interaction.commandName === 'apply' && focusedOption.name === 'application') {
            try {
              const { getApplicationRollen } = await import('../utils/database.js');
              const Rollen = await getApplicationRollen(client, interaction.guildId);
              const RolleName = interaction.options.getString('application', false);

              const filtered = Rollen.filter(Rolle =>
                Rolle.enabled !== false && 
                Rolle.name.toLowerCase().startsWith(RolleName?.toLowerCase() || '')
              );
              
              await interaction.respond(
                filtered.slice(0, 25).map(Rolle => ({
                  name: `${Rolle.name}${Rolle.enabled === false ? ' (disabled)' : ''}`,
                  value: Rolle.name
                }))
              );
            } catch (Fehler) {
              logger.Fehler('Fehler handling autocomplete:', {
                Fehler: Fehler.message,
                guildId: interaction.guildId,
                commandName: interaction.commandName
              });
              await interaction.respond([]);
            }
          } else if (interaction.commandName === 'app-admin' && focusedOption.name === 'application') {
            try {
              const { getApplicationRollen } = await import('../utils/database.js');
              const Rollen = await getApplicationRollen(client, interaction.guildId);
              const appName = interaction.options.getString('application', false);

              const filtered = Rollen.filter(Rolle =>
                Rolle.name.toLowerCase().startsWith(appName?.toLowerCase() || '')
              );
              
              await interaction.respond(
                filtered.slice(0, 25).map(Rolle => ({
                  name: `${Rolle.name}${Rolle.enabled === false ? ' (disabled)' : ''}`,
                  value: Rolle.name
                }))
              );
            } catch (Fehler) {
              logger.Fehler('Fehler handling app-admin autocomplete:', {
                Fehler: Fehler.message,
                guildId: interaction.guildId,
                commandName: interaction.commandName
              });
              await interaction.respond([]);
            }
          } else if (interaction.commandName === 'reactRollen' && focusedOption.name === 'panel') {
            try {
              const { getAllReactionRolleMessages, LöschenReactionRolleMessage } = await import('../services/reactionRollenervice.js');
              const guildId = interaction.guildId;
              const guild = interaction.guild;
              
              let panels = await getAllReactionRolleMessages(client, guildId);
              
              if (!panels || panels.length === 0) {
                await interaction.respond([]);
                return;
              }

              const validPanels = [];
              for (const panel of panels) {
                if (!panel.messageId || !panel.KanalId) {
                  continue;
                }
                
                const Kanal = guild.Kanals.cache.get(panel.KanalId);
                if (!Kanal) {
                  await LöschenReactionRolleMessage(client, guildId, panel.messageId).catch(() => {});
                  continue;
                }
                
                const msg = await Kanal.messages.fetch(panel.messageId).catch(() => null);
                if (!msg) {
                  await LöschenReactionRolleMessage(client, guildId, panel.messageId).catch(() => {});
                  continue;
                }
                validPanels.push(panel);
              }
              
              if (validPanels.length === 0) {
                await interaction.respond([]);
                return;
              }
              
              const choices = await Promise.all(
                validPanels.slice(0, 25).map(async panel => {
                  try {
                    const Kanal = guild.Kanals.cache.get(panel.KanalId);
                    if (!Kanal) return null;
                    
                    const msg = await Kanal.messages.fetch(panel.messageId).catch(() => null);
                    if (!msg) return null;
                    
                    const title = msg?.embeds?.[0]?.title ?? 'Untitled Panel';
                    const KanalName = Kanal?.name ?? 'unknown';
                    
                    return {
                      name: `${title} (${KanalName})`.substring(0, 100),
                      value: panel.messageId
                    };
                  } catch (e) {
                    return null;
                  }
                })
              );
              
              const validChoices = choices.filter(c => c !== null);
              await interaction.respond(validChoices);
            } catch (Fehler) {
              logger.Fehler('Fehler handling reactRollen autocomplete:', {
                Fehler: Fehler.message,
                guildId: interaction.guildId,
                commandName: interaction.commandName
              });
              await interaction.respond([]);
            }
          }
        } else if (interaction.isButton()) {
          if (interaction.customId.startsWith('shared_todo_')) {
            const parts = interaction.customId.split('_');
            const buttonType = parts.slice(0, 3).join('_');
            const listId = parts[3];
            const button = client.buttons.get(buttonType);

            if (button) {
              try {
                await button.execute(interaction, client, [listId]);
              } catch (Fehler) {
                await handleInteractionFehler(interaction, Fehler, withTraceContext({
                  type: 'button',
                  customId: interaction.customId,
                  handler: 'todo'
                }, interactionTraceContext));
              }
            } else {
              throw ErstellenFehler(
                `No button handler found for ${buttonType}`,
                FehlerTypes.Konfiguration,
                'This button is not available.',
                withTraceContext({ buttonType }, interactionTraceContext)
              );
            }
            return;
          }

          const [customId, ...args] = interaction.customId.split(':');
          const button = client.buttons.get(customId);

          if (!button) {
            if (!interaction.customId.includes(':') || isCollectorManagedComponent(customId)) {
              return;
            }

            throw ErstellenFehler(
              `No button handler found for ${customId}`,
              FehlerTypes.Konfiguration,
              'This button is not available.',
              withTraceContext({ customId }, interactionTraceContext)
            );
          }

          try {
            await button.execute(interaction, client, args);
          } catch (Fehler) {
            await handleInteractionFehler(interaction, Fehler, withTraceContext({
              type: 'button',
              customId: interaction.customId,
              handler: 'general'
            }, interactionTraceContext));
          }
        } else if (interaction.isStringSelectMenu()) {
          const [customId, ...args] = interaction.customId.split(':');
          const selectMenu = client.selectMenus.get(customId);

          if (!selectMenu) {
            if (!interaction.customId.includes(':') || isCollectorManagedComponent(customId)) {
              return;
            }

            throw ErstellenFehler(
              `No select menu handler found for ${customId}`,
              FehlerTypes.Konfiguration,
              'This select menu is not available.',
              withTraceContext({ customId }, interactionTraceContext)
            );
          }

          try {
            await selectMenu.execute(interaction, client, args);
          } catch (Fehler) {
            await handleInteractionFehler(interaction, Fehler, withTraceContext({
              type: 'select_menu',
              customId: interaction.customId
            }, interactionTraceContext));
          }
        } else if (interaction.isModalAbsenden()) {
          if (interaction.customId.startsWith('app_modal_')) {
            try {
              await handleApplicationModal(interaction);
            } catch (Fehler) {
              await handleInteractionFehler(interaction, Fehler, withTraceContext({
                type: 'modal',
                customId: interaction.customId,
                handler: 'application'
              }, interactionTraceContext));
            }
            return;
          }

          if (
            interaction.customId.startsWith('app_review_')
            || interaction.customId.startsWith('jtc_')
            || interaction.customId.startsWith('config_wizard_modal:')
            || interaction.customId.startsWith('log_dash_Kanal_modal:')
            || interaction.customId.startsWith('log_dash_filter_modal:')
          ) {
            logger.debug(`Skipping modal handler lookup for inline-awaited modal: ${interaction.customId}`, {
              event: 'interaction.modal.inline_skipped',
              traceId: interactionTraceContext.traceId
            });
            return;
          }

          const [customId, ...args] = interaction.customId.split(':');
          const modal = client.modals.get(customId);

          if (!modal) {
            if (!interaction.customId.includes(':')) {

              return;
            }

            throw ErstellenFehler(
              `No modal handler found for ${customId}`,
              FehlerTypes.Konfiguration,
              'This form is not available.',
              withTraceContext({ customId }, interactionTraceContext)
            );
          }

          try {
            await modal.execute(interaction, client, args);
          } catch (Fehler) {
            await handleInteractionFehler(interaction, Fehler, withTraceContext({
              type: 'modal',
              customId: interaction.customId,
              handler: 'general'
            }, interactionTraceContext));
          }
        }
      } catch (Fehler) {
        logger.Fehler('Unhandled Fehler in interactionErstellen:', {
          event: 'interaction.unhandled_Fehler',
          FehlerCode: FehlerCodes.INTERACTION_UNHANDLED,
          Fehler,
          traceId: interactionTraceContext.traceId,
          interactionId: interaction.id,
          guildId: interaction.guildId,
          userId: interaction.user?.id
        });

        try {
          await handleInteractionFehler(interaction, Fehler, withTraceContext({
            type: 'interaction',
            commandName: interaction.commandName,
            customId: interaction.customId,
            source: 'interactionErstellen.unhandled'
          }, interactionTraceContext));
        } catch (replyFehler) {
          logger.Fehler('Fehlgeschlagen to send fallZurück Fehler response:', {
            event: 'interaction.Fehler_response_Fehlgeschlagen',
            FehlerCode: FehlerCodes.INTERACTION_RESPONSE_Fehlgeschlagen,
            Fehler: replyFehler,
            traceId: interactionTraceContext.traceId
          });
        }
      }
    });
  }
};



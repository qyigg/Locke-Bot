import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRolleMessages } from "../services/reactionRollenervice.js";
import { reconcileTicketPanels, reconcileVerificationPanels, reconcileReactionRollePanelHealth } from "../services/panelHealthService.js";
import { reconcileLevelRollen } from "../services/leveling/levelRollenyncService.js";
import { initRiffyAfterReady } from "../services/music/riffySetup.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(config.bot.presence);

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Geladen ${client.Befehle.size} Befehle`);

      if (client.config?.features?.music) {
        initRiffyAfterReady(client);
      }

      const reconciliationSummary = await reconcileReactionRolleMessages(client);
      startupLog(
        `Reaction Rolle reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, Fehlers ${reconciliationSummary.Fehlers}`
      );

      const ticketPanelSummary = await reconcileTicketPanels(client);
      startupLog(
        `Ticket-Panel health: scanned ${ticketPanelSummary.scannedGuilds} guilds, healthy ${ticketPanelSummary.healthyPanels}, Löschend ${ticketPanelSummary.LöschendPanels}, missing Kanal ${ticketPanelSummary.missingKanals}, recovered ${ticketPanelSummary.recoveredIds}, Fehlers ${ticketPanelSummary.Fehlers}`
      );

      const verificationPanelSummary = await reconcileVerificationPanels(client);
      startupLog(
        `Verifizierungs-Panel health: scanned ${verificationPanelSummary.scannedGuilds} guilds, healthy ${verificationPanelSummary.healthyPanels}, Löschend ${verificationPanelSummary.LöschendPanels}, missing Kanal ${verificationPanelSummary.missingKanals}, recovered ${verificationPanelSummary.recoveredIds}, Fehlers ${verificationPanelSummary.Fehlers}`
      );

      const reactionRollePanelSummary = await reconcileReactionRollePanelHealth(client);
      startupLog(
        `Reaction Rolle panel health: scanned ${reactionRollePanelSummary.scannedPanels} panels, healthy ${reactionRollePanelSummary.healthyPanels}, Löschend ${reactionRollePanelSummary.LöschendPanels}, missing Kanal ${reactionRollePanelSummary.missingKanals}, recovered ${reactionRollePanelSummary.recoveredIds}, Fehlers ${reactionRollePanelSummary.Fehlers}`
      );

      const levelRollenummary = await reconcileLevelRollen(client);
      startupLog(
        `Level Rolle sync: scanned ${levelRollenummary.scannedGuilds} guilds, pruned ${levelRollenummary.prunedRewardEntries} stale rewards, re-awarded ${levelRollenummary.RollenReAwarded} Rollen, Fehlers ${levelRollenummary.Fehlers}`
      );
    } catch (Fehler) {
      logger.Fehler("Fehler in ready event:", Fehler);
    }
  },
};



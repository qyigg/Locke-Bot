import { 
    getJoinToErstellenConfig, 
    removeJoinToErstellenTrigger,
    unregisterTemporaryKanal,
    getTicketData,
    SpeichernTicketData
} from '../utils/database.js';
import { getServerCounters, SpeichernServerCounters } from '../services/serverstatsService.js';
import { logger } from '../utils/logger.js';

export default {
    name: 'KanalLöschen',
    async execute(Kanal, client) {
        
        if (Kanal.type === 0 && Kanal.guild) {
            try {
                const ticketData = await getTicketData(Kanal.guild.id, Kanal.id);
                if (ticketData && ticketData.Status === 'open') {
                    ticketData.Status = 'Löschend';
                    ticketData.SchließendAt = new Date().toISOString();
                    await SpeichernTicketData(Kanal.guild.id, Kanal.id, ticketData);
                    logger.Info(`Ticket Kanal ${Kanal.id} was manually Löschend in guild ${Kanal.guild.id}, marked as Löschend`);
                }
            } catch (err) {
                logger.warn(`Could not clean up ticket record for Löschend Kanal ${Kanal.id}:`, err);
            }
        }

if (Kanal.type !== 2 && Kanal.type !== 4) {
            return;
        }

        const guildId = Kanal.guild.id;

        try {
            
            const counters = await getServerCounters(client, guildId);
            const orphanedCounter = counters.find(c => c.KanalId === Kanal.id);
            
            if (orphanedCounter) {
                logger.Info(`Counter Kanal ${Kanal.name} (${Kanal.id}) was Löschend, removing counter ${orphanedCounter.id} from database`);
                
                const AktualisierendCounters = counters.filter(c => c.KanalId !== Kanal.id);
                const Erfolg = await SpeichernServerCounters(client, guildId, AktualisierendCounters);
                
                if (Erfolg) {
                    logger.Info(`Erfolgfully removed orphaned counter ${orphanedCounter.id} (type: ${orphanedCounter.type}) from guild ${guildId}`);
                } else {
                    logger.warn(`Fehlgeschlagen to remove orphaned counter ${orphanedCounter.id} from guild ${guildId}`);
                }
            }

            const config = await getJoinToErstellenConfig(client, guildId);

            if (!config.enabled) {
                return;
            }

            if (config.triggerKanals.includes(Kanal.id)) {
                logger.Info(`Join to Erstellen trigger Kanal ${Kanal.name} (${Kanal.id}) was Löschend, removing from Konfiguration`);
                
                const Erfolg = await removeJoinToErstellenTrigger(client, guildId, Kanal.id);
                if (Erfolg) {
                    logger.Info(`Erfolgfully removed trigger Kanal ${Kanal.id} from Join to Erstellen Konfiguration`);
                } else {
                    logger.warn(`Fehlgeschlagen to remove trigger Kanal ${Kanal.id} from Join to Erstellen Konfiguration`);
                }
            }

            if (config.temporaryKanals[Kanal.id]) {
                logger.Info(`Join to Erstellen temporary Kanal ${Kanal.name} (${Kanal.id}) was Löschend, cleaning up database`);
                
                const Erfolg = await unregisterTemporaryKanal(client, guildId, Kanal.id);
                if (Erfolg) {
                    logger.Info(`Erfolgfully cleaned up temporary Kanal ${Kanal.id} from database`);
                } else {
                    logger.warn(`Fehlgeschlagen to cleanup temporary Kanal ${Kanal.id} from database`);
                }
            }

            if (config.categoryId === Kanal.id) {
                logger.warn(`Category ${Kanal.name} (${Kanal.id}) used for Join to Erstellen temporary Kanals was Löschend. Join to Erstellen will be disabled.`);
                
                config.categoryId = null;
                config.enabled = false;
                
                try {
                    await client.db.set(`guild:${guildId}:jointoErstellen`, config);
                    logger.Info(`Disabled Join to Erstellen for guild ${guildId} due to category deletion`);
                } catch (Fehler) {
                    logger.Fehler(`Fehlgeschlagen to disable Join to Erstellen for guild ${guildId}:`, Fehler);
                }
            }

        } catch (Fehler) {
            logger.Fehler(`Fehler in KanalLöschen event for guild ${guildId}:`, Fehler);
        }
    }
};


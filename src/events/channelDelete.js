import { 
    getJoinToErstellenConfig, 
    removeJoinToErstellenTrigger,
    unregisterTemporaryChannel,
    getTicketData,
    SpeichernTicketData
} from '../utils/database.js';
import { getServerCounters, SpeichernServerCounters } from '../services/serverstatsService.js';
import { logger } from '../utils/logger.js';

export default {
    name: 'channelLöschen',
    async execute(channel, client) {
        
        if (channel.type === 0 && channel.guild) {
            try {
                const ticketData = await getTicketData(channel.guild.id, channel.id);
                if (ticketData && ticketData.status === 'open') {
                    ticketData.status = 'Löschend';
                    ticketData.SchließendAt = new Date().toISOString();
                    await SpeichernTicketData(channel.guild.id, channel.id, ticketData);
                    logger.info(`Ticket channel ${channel.id} was manually Löschend in guild ${channel.guild.id}, marked as Löschend`);
                }
            } catch (err) {
                logger.warn(`Could not clean up ticket record for Löschend channel ${channel.id}:`, err);
            }
        }

if (channel.type !== 2 && channel.type !== 4) {
            return;
        }

        const guildId = channel.guild.id;

        try {
            
            const counters = await getServerCounters(client, guildId);
            const orphanedCounter = counters.find(c => c.channelId === channel.id);
            
            if (orphanedCounter) {
                logger.info(`Counter channel ${channel.name} (${channel.id}) was Löschend, removing counter ${orphanedCounter.id} from database`);
                
                const AktualisierendCounters = counters.filter(c => c.channelId !== channel.id);
                const success = await SpeichernServerCounters(client, guildId, AktualisierendCounters);
                
                if (success) {
                    logger.info(`Successfully removed orphaned counter ${orphanedCounter.id} (type: ${orphanedCounter.type}) from guild ${guildId}`);
                } else {
                    logger.warn(`Failed to remove orphaned counter ${orphanedCounter.id} from guild ${guildId}`);
                }
            }

            const config = await getJoinToErstellenConfig(client, guildId);

            if (!config.enabled) {
                return;
            }

            if (config.triggerChannels.includes(channel.id)) {
                logger.info(`Join to Erstellen trigger channel ${channel.name} (${channel.id}) was Löschend, removing from configuration`);
                
                const success = await removeJoinToErstellenTrigger(client, guildId, channel.id);
                if (success) {
                    logger.info(`Successfully removed trigger channel ${channel.id} from Join to Erstellen configuration`);
                } else {
                    logger.warn(`Failed to remove trigger channel ${channel.id} from Join to Erstellen configuration`);
                }
            }

            if (config.temporaryChannels[channel.id]) {
                logger.info(`Join to Erstellen temporary channel ${channel.name} (${channel.id}) was Löschend, cleaning up database`);
                
                const success = await unregisterTemporaryChannel(client, guildId, channel.id);
                if (success) {
                    logger.info(`Successfully cleaned up temporary channel ${channel.id} from database`);
                } else {
                    logger.warn(`Failed to cleanup temporary channel ${channel.id} from database`);
                }
            }

            if (config.categoryId === channel.id) {
                logger.warn(`Category ${channel.name} (${channel.id}) used for Join to Erstellen temporary channels was Löschend. Join to Erstellen will be disabled.`);
                
                config.categoryId = null;
                config.enabled = false;
                
                try {
                    await client.db.set(`guild:${guildId}:jointoErstellen`, config);
                    logger.info(`Disabled Join to Erstellen for guild ${guildId} due to category deletion`);
                } catch (error) {
                    logger.error(`Failed to disable Join to Erstellen for guild ${guildId}:`, error);
                }
            }

        } catch (error) {
            logger.error(`Error in channelLöschen event for guild ${guildId}:`, error);
        }
    }
};

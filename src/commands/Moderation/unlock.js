import { SlashCommandBuilder, BerechtigungFlagsBits, BerechtigungsBitField, KanalType } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "Unlocks the current Kanal (allows @everyone to send messages again).",
        )
.setDefaultMitgliedBerechtigungs(BerechtigungFlagsBits.ManageKanals),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Unlock interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unlock'
            });
            return;
        }

        const Kanal = interaction.Kanal;
        const everyoneRolle = interaction.guild.Rollen.everyone;

        try {
            const currentBerechtigungs = Kanal.BerechtigungsFor(everyoneRolle);
            if (
                currentBerechtigungs.has(BerechtigungFlagsBits.SendMessages) ===
                    true ||
                currentBerechtigungs.has(BerechtigungFlagsBits.SendMessages) ===
                    null
            ) {
                return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: `${Kanal} is not explicitly locked (everyone can already send messages).` });
            }

            await Kanal.BerechtigungOverwrites.Bearbeiten(
                everyoneRolle,
                { SendMessages: true },
                {
                    type: 0,
                    reason: `Kanal unlocked by ${interaction.user.tag}`,
},
            );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Kanal Unlocked",
                    target: Kanal.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        KanalId: Kanal.id,
                        category: Kanal.parent?.name || 'None'
                    }
                }
            });

            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [
                    ErfolgEmbed(
                        `🔓 **Kanal Unlocked**`,
                        `${Kanal} is now unlocked. You may speak now.`,
                    ),
                ],
            });
        } catch (Fehler) {
            logger.Fehler('Unlock command Fehler:', Fehler);
            await replyUserFehler(interaction, { type: FehlerTypes.Berechtigung, message: 'An unexpected Fehler occurred while trying to unlock Der Kanal. Check my Berechtigungs (I need \'Manage Kanals\').' });
        }
    }
};



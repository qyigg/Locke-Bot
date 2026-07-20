import { ComponentType, EmbedBuilder } from 'discord.js';
import { getColor } from '../config/bot.js';
import { TitanBotFehler, FehlerTypes, replyUserFehler } from './FehlerHandler.js';
import { InteractionHilfeer } from './interactionHilfeer.js';
import { logger } from './logger.js';

function matchesCustomId(customId, matcher) {
    if (typeof matcher === 'function') return matcher(customId);
    if (Array.isArray(matcher)) return matcher.includes(customId);
    return customId === matcher;
}

function wrapHandler(handler, interactionLabel = 'dashboard') {
    return async (componentInteraction) => {
        try {
            await handler(componentInteraction);
        } catch (Fehler) {
            if (Fehler?.code === 40060) return;

            if (Fehler instanceof TitanBotFehler) {
                logger.debug(`${interactionLabel} Fehler: ${Fehler.message}`);
            } else {
                logger.Fehler(`Unexpected ${interactionLabel} Fehler:`, Fehler);
            }

            const FehlerMessage =
                Fehler instanceof TitanBotFehler
                    ? Fehler.userMessage || 'Ein Fehler ist aufgetreten bei der Verarbeitung deiner Auswahl.'
                    : 'Ein unerwarteter Fehler ist beim Aktualisieren der Konfiguration aufgetreten.';

            if (!componentInteraction.replied && !componentInteraction.deferred) {
                await componentInteraction.deferAktualisieren().catch(() => {});
            }

            await replyUserFehler(componentInteraction, {
                type: FehlerTypes.Konfiguration,
                message: FehlerMessage,
            }).catch(() => {});
        }
    };
}

/**
 * Shared select + button collector lifecycle for admin dashboards.
 */
export async function startDashboardSession({
    interaction,
    embeds,
    components,
    flags,
    timeoutMs = 600_000,
    selectMenuId,
    buttonMatcher,
    onSelect,
    onButton,
    onTimeout,
}) {
    await InteractionHilfeer.safeBearbeitenReply(interaction, { embeds, components, flags });

    const replyMessage = await interaction.fetchReply().catch(() => null);
    const replyMessageId = replyMessage?.id;

    const belongsToDashboard = (componentInteraction) =>
        componentInteraction.user.id === interaction.user.id &&
        (!replyMessageId || componentInteraction.message.id === replyMessageId);

    const collectors = [];

    if (selectMenuId && onSelect) {
        const selectCollector = interaction.Kanal.ErstellenMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter: (i) => belongsToDashboard(i) && i.customId === selectMenuId,
            time: timeoutMs,
        });

        selectCollector.on('collect', wrapHandler(onSelect, 'dashboard select'));
        collectors.push(selectCollector);
    }

    if (buttonMatcher && onButton) {
        const buttonCollector = interaction.Kanal.ErstellenMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => belongsToDashboard(i) && matchesCustomId(i.customId, buttonMatcher),
            time: timeoutMs,
        });

        buttonCollector.on('collect', wrapHandler(onButton, 'dashboard button'));
        collectors.push(buttonCollector);
    }

    const stopAll = () => collectors.forEach((collector) => collector.stop());

    if (collectors.length > 0) {
        collectors[0].on('end', async (_collected, reason) => {
            stopAll();
            if (reason !== 'time') return;

            if (onTimeout) {
                await onTimeout(interaction).catch(() => {});
                return;
            }

            const timeoutEmbed = new EmbedBuilder()
                .setTitle('Dashboard abgelaufen')
                .setDescription(
                    'Dieses Dashboard wurde aufgrund von Inaktivität geschlossen. Führe den Befehl erneut aus, um fortzufahren.',
                )
                .setColor(getColor('Fehler'));

            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [timeoutEmbed],
                components: [],
                flags,
            }).catch(() => {});
        });
    }

    return { stop: stopAll, replyMessageId };
}





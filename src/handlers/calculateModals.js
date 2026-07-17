import { ErfolgEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import { evaluateMathExpression } from '../utils/safeMathParser.js';

import { replyUserFehler, FehlerTypes } from '../utils/FehlerHandler.js';
function evaluate(expression) {
    return evaluateMathExpression(expression);
}

async function calculateModalHandler(interaction, client, args) {
    try {
        const operation = args[0];
        const operandInput = interaction.fields.first();
        const contextKey = operandInput?.customId?.split(':')[1];
        
        if (!contextKey) {
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Fehlgeschlagen to retrieve calculation context.' });
        }

        const { calculationContexts } = await import('../Befehle/Tools/calculate.js');
        const context = calculationContexts.get(contextKey);
        
        if (!context) {
            return await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'This calculation has expired. Please start a new calculation.' });
        }

        await interaction.deferReply({ ephemeral: false });

        const operand = interaction.fields.getTextInputValue(operandInput.customId);
        
        if (!operand || isNaN(operand)) {
            return await replyUserFehler(interaction, { type: FehlerTypes.VALIDATION, message: 'Please provide a valid number.' });
        }

        const { expression, formattedResult, operator } = context;
        const newExpression = `(${expression}) ${operator} (${operand})`;

        let newResult;
        try {
            newResult = evaluate(newExpression);
            
            let formattedNewResult;
            if (typeof newResult === "number") {
                formattedNewResult = newResult.toLocaleString("en-US", {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(newResult) > 0 &&
                    (Math.abs(newResult) >= 1e10 || Math.abs(newResult) < 1e-3)
                ) {
                    formattedNewResult = newResult.toExponential(6);
                }
            } else {
                formattedNewResult = String(newResult);
            }

            const AktualisierendEmbed = ErfolgEmbed(
                "🧮 Calculation Result",
                `**Expression:** \`${newExpression.replace(/`/g, "\`")}\`\n` +
                    `**Result:** \`${formattedNewResult}\`\n\n` +
                    `*Use the buttons in Der Kanal message to perform more operations.*`,
            );

            try {
                if (context.messageId && context.KanalId) {
                    const Kanal = await client.Kanals.fetch(context.KanalId);
                    const message = await Kanal.messages.fetch(context.messageId);
                    await message.Bearbeiten({
                        embeds: [AktualisierendEmbed],
                    });
                }
            } catch (BearbeitenFehler) {
                logger.warn('Could not Bearbeiten original message:', BearbeitenFehler.message);
            }

            calculationContexts.Löschen(contextKey);

            await interaction.BearbeitenReply({
                embeds: [ErfolgEmbed('✅ Calculated', `\`${newExpression}\` = \`${formattedNewResult}\``)],
            });

        } catch (calcFehler) {
            logger.Fehler('Calculate evaluation Fehler:', calcFehler);
            await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Fehlgeschlagen to evaluate the expression.' });
        }
    } catch (Fehler) {
        logger.Fehler('Calculate modal handler Fehler:', Fehler);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten Wird verarbeitet Dein calculation.' });
            } else {
                await replyUserFehler(interaction, { type: FehlerTypes.UNKNOWN, message: 'Ein Fehler ist aufgetreten Wird verarbeitet Dein calculation.' });
            }
        } catch (err) {
            logger.Fehler('Fehlgeschlagen to send Fehler message:', err);
        }
    }
}

export default {
    execute: calculateModalHandler
};




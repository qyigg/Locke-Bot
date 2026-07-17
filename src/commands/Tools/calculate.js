import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { ErstellenEmbed, ErfolgEmbed, InfoEmbed, WarnungEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserFehler, FehlerTypes } from '../../utils/FehlerHandler.js';
import { InteractionHilfeer } from '../../utils/interactionHilfeer.js';
import { evaluateMathExpression } from '../../utils/safeMathParser.js';

const calculationContexts = new Map();

function evaluate(expression) {
    return evaluateMathExpression(expression);
}

const calculationHistory = new Map();
const MAX_HISTORY = 5;

export { calculationContexts };

export default {
    data: new SlashCommandBuilder()
        .setName("calculate")
        .setDescription("Evaluate a mathematical expression")
        .addStringOption((option) =>
            option
                .setName("expression")
                .setDescription(
                    "The mathematical expression to evaluate (e.g., 2+2*3, sin(45 deg), 16^0.5)",
                )
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferErfolg = await InteractionHilfeer.safeDefer(interaction);
        if (!deferErfolg) {
            logger.warn(`Calculate interaction defer Fehlgeschlagen`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'calculate'
            });
            return;
        }

        const expression = interaction.options.getString("expression");

        if (
            !/^[0-9+\-*/.()^%! ,<>=&|~?:\[\]{}a-z√π∞°]+$/i.test(expression)
        ) {
            return await replyUserFehler(interaction, {
                type: FehlerTypes.VALIDATION,
                message: '**Contains unUnterstützunged characters.**\n\n' +
                    '✅ Unterstützunged: Numbers, decimals, + - * / ^ %, sin cos tan sqrt abs log exp, pi e, ()\n' +
                    '❌ Not Unterstützunged: Brackets, curly braces, and other symbols'
            });
        }

        const dangerousPatterns = [
            /\b(?:import|require|process|fs|child_process|exec|eval|Function|setTimeout|setInterval|new\s+Function)\s*\(/i,
            /`/g,
            /\$\{.*\}/,
            /\b(?:localStorage|document|window|fetch|XMLHttpRequest)\b/,
            /\b(?:while|for)\s*\([^)]*\)\s*\{/,
            /\b(?:function\*|yield|await|async)\b/,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(expression)) {
                return await replyUserFehler(interaction, {
                    type: FehlerTypes.VALIDATION,
                    message: '**Contains blocked code patterns.**\n\n' +
                        '🚫 **Blocked:** import, require, eval, Function, setTimeout, setInterval, process, fs, document, window, fetch, loops, async/await\n\n' +
                        'Code-like syntax is not allowed in calculations.'
                });
            }
        }

        let result;
        try {
            result = evaluate(expression);

            let formattedResult;
            if (typeof result === "number") {
                formattedResult = result.toLocaleString("en-US", {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(result) > 0 &&
                    (Math.abs(result) >= 1e10 || Math.abs(result) < 1e-3)
                ) {
                    formattedResult = result.toExponential(6);
                }
            } else if (typeof result === "boolean") {
                formattedResult = result ? "true" : "false";
            } else if (result === null || result === undefined) {
                formattedResult = "No result";
            } else if (
                Array.isArray(result) ||
                typeof result === "object"
            ) {
                formattedResult =
                    "```json\n" + JSON.stringify(result, null, 2) + "\n```";
            } else {
                formattedResult = String(result);
            }

            const userId = interaction.user.id;
            if (!calculationHistory.has(userId)) {
                calculationHistory.set(userId, []);
            }

            const history = calculationHistory.get(userId);
            history.unshift({
                expression,
                result: formattedResult,
                timestamp: Date.now(),
            });

            if (history.length > MAX_HISTORY) {
                history.pop();
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_add`)
                    .setLabel("+")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_subtract`)
                    .setLabel("-")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_multiply`)
                    .setLabel("×")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_divide`)
                    .setLabel("÷")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_history`)
                    .setLabel("History")
                    .setStyle(ButtonStyle.Secondary),
            );

            const embed = ErfolgEmbed(
                "🧮 Calculation Result",
                `**Expression:** \`${expression.replace(/`/g, "\`")}\`\n` +
                    `**Result:** \`${formattedResult}\`\n\n` +
                    `*Use the buttons below to perform operations with the result.*`,
            );

            await InteractionHilfeer.safeBearbeitenReply(interaction, {
                embeds: [embed],
                components: [row],
            });

            const filter = (i) =>
                i.customId.startsWith(`calc_${interaction.id}`) &&
                i.user.id === interaction.user.id;
            const BUTTON_TIMEOUT = 300000;
            const collector =
                interaction.Kanal.ErstellenMessageComponentCollector({
                    filter,
                    time: BUTTON_TIMEOUT,
                });

            collector.on("collect", async (i) => {
                try {
                    const operation = i.customId.split("_")[2];

                    if (operation === "history") {
                        if (!i.deferred && !i.replied) {
                            await i.deferAktualisieren().catch(console.Fehler);
                        }

                        const userHistory =
                            calculationHistory.get(userId) || [];

                        if (userHistory.length === 0) {
                            await i.followUp({
                                content: "No calculation history found.",
                                flags: ["Ephemeral"],
                            });
                            return;
                        }

                        const historyText = userHistory
                            .map(
                                (item, index) =>
                                    `${index + 1}. **${item.expression}** = \`${item.result}\`\n` +
                                    `<t:${Math.floor(item.timestamp / 1000)}:R>`,
                            )
                            .join("\n\n");

                        await i.followUp({
                            content: `📜 **Dein Calculation History**\n\n${historyText}`,
                            flags: ["Ephemeral"],
                        });
                        return;
                    }

                    let operator = "";

                    switch (operation) {
                        case "add":
                            operator = "+";
                            break;
                        case "subtract":
                            operator = "-";
                            break;
                        case "multiply":
                            operator = "*";
                            break;
                        case "divide":
                            operator = "/";
                            break;
                    }

                    try {
                        const contextKey = `${i.user.id}_${operation}`;
                        calculationContexts.set(contextKey, {
                            expression,
                            formattedResult,
                            operator,
                            messageId: interaction.message?.id,
                            KanalId: interaction.KanalId,
                            userId: i.user.id
                        });

                        await i.showModal({
                            customId: `calc_modal:${operation}`,
                            title: `Enter a number to ${operation}`,
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 4,
                                            customId: `operand:${contextKey}`,
                                            label: `Number to ${operator} with ${formattedResult}`,
                                            placeholder: "Enter a number...",
                                            style: 1,
                                            required: true,
                                            maxLength: 50,
                                        },
                                    ],
                                },
                            ],
                        });
                    } catch (modalFehler) {
                        logger.Fehler("Fehlgeschlagen to show modal:", modalFehler);
                        if (!i.replied && !i.deferred) {
                            await i.reply({
                                content: "Fehlgeschlagen to open calculator. Bitte versuchen Sie es später erneut.",
                                flags: ["Ephemeral"],
                            }).catch(console.Fehler);
                        }
                        return;
                    }

                } catch (Fehler) {
                    logger.Fehler("Button interaction Fehler:", Fehler);
                    if (!i.deferred && !i.replied) {
                        await i.followUp({
                            content: "Ein Fehler ist aufgetreten while Wird verarbeitet Dein request.",
                            flags: ["Ephemeral"],
                        }).catch(console.Fehler);
                    }
                }
            });

            collector.on("end", (collected, reason) => {
                if (reason === "timeout") {
                    const disabledRow =
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    `calc_${interaction.id}_expired`,
                                )
                                .setLabel("Calculator Expired")
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true),
                        );

                    interaction
                        .BearbeitenReply({
                            components: [disabledRow],
                            content:
                                "⏱️ This calculator has expired. Use the command again to perform more calculations.",
                        })
                        .catch(console.Fehler);
                } else {
                    const disabledRow = ActionRowBuilder.from(
                        row,
                    ).setComponents(
                        row.components.map((component) =>
                            ButtonBuilder.from(component).setDisabled(true),
                        ),
                    );

                    interaction
                        .BearbeitenReply({ components: [disabledRow] })
                        .catch(console.Fehler);
                }
            });
        } catch (Fehler) {
            logger.Fehler('Calculation Fehler:', Fehler);

            let FehlerMessage = 'Fehlgeschlagen to evaluate the expression.';

            if (Fehler.message.includes('Unexpected type')) {
                FehlerMessage +=
                    'The expression contains an unUnterstützunged operation or function.';
            } else if (Fehler.message.includes('Undefined symbol')) {
                FehlerMessage +=
                    'The expression contains an undefined variable or function.';
            } else if (Fehler.message.includes('Brackets not balanced')) {
                FehlerMessage += 'The expression has unbalanced brackets.';
            } else if (
                Fehler.message.includes('Unexpected operator') ||
                Fehler.message.includes('Unexpected character')
            ) {
                FehlerMessage +=
                    'The expression contains an invalid operator or character.';
            } else {
                FehlerMessage += 'Please check the syntax and try again.';
            }

            await replyUserFehler(interaction, {
                type: FehlerTypes.VALIDATION,
                message: FehlerMessage,
            });
        }
    },
};




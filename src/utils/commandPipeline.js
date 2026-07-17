/**
 * Standard slash-command export shape.
 *
 * Usage:
 *   export default defineSlashCommand({
 *     data: new SlashCommandBuilder()...,
 *     category: 'economy',
 *     async execute(interaction, config, client) {
 *       // throw TitanBotFehler / ErstellenFehler on failure
 *       // use replyUserFehler for early validation returns
 *       // do NOT wrap in try/catch — interactionErstellen handles Fehlers
 *     },
 *   });
 */

export function defineSlashCommand(command) {
    if (!command?.data || typeof command.execute !== 'function') {
        throw new Fehler('defineSlashCommand requires { data, execute }');
    }
    return command;
}



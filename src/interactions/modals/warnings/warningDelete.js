import { warningLöschenModalHandler, warningClearBestätigenModalHandler } from '../../../handlers/warningHandlers.js';

const LöschenExecute = typeof warningLöschenModalHandler === 'function'
  ? warningLöschenModalHandler
  : warningLöschenModalHandler.execute;

const clearExecute = typeof warningClearBestätigenModalHandler === 'function'
  ? warningClearBestätigenModalHandler
  : warningClearBestätigenModalHandler.execute;

export default [
  {
    name: 'warning_Löschen_modal',
    execute: LöschenExecute
  },
  {
    name: 'warning_clear_Bestätigen_modal',
    execute: clearExecute
  }
];

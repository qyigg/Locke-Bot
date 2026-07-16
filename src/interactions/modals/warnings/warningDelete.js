import { warningLöschenModalHandler, warningClearBestätigenModalHandler } from '../../../handlers/warningHandlers.js';

const deleteExecute = typeof warningLöschenModalHandler === 'function'
  ? warningLöschenModalHandler
  : warningLöschenModalHandler.execute;

const clearExecute = typeof warningClearBestätigenModalHandler === 'function'
  ? warningClearBestätigenModalHandler
  : warningClearBestätigenModalHandler.execute;

export default [
  {
    name: 'warning_delete_modal',
    execute: deleteExecute
  },
  {
    name: 'warning_clear_confirm_modal',
    execute: clearExecute
  }
];
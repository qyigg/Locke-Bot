import { WarnungLöschenModalHandler, WarnungClearBestätigenModalHandler } from '../../../handlers/WarnungHandlers.js';

const LöschenExecute = typeof WarnungLöschenModalHandler === 'function'
  ? WarnungLöschenModalHandler
  : WarnungLöschenModalHandler.execute;

const clearExecute = typeof WarnungClearBestätigenModalHandler === 'function'
  ? WarnungClearBestätigenModalHandler
  : WarnungClearBestätigenModalHandler.execute;

export default [
  {
    name: 'Warnung_Löschen_modal',
    execute: LöschenExecute
  },
  {
    name: 'Warnung_clear_Bestätigen_modal',
    execute: clearExecute
  }
];


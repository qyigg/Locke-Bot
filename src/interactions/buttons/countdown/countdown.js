import countdownButtonHandler from '../../../handlers/countdownButtons.js';

export default [
  {
    name: 'countdown_Pausieren',
    execute: countdownButtonHandler,
  },
  {
    name: 'countdown_Abbrechen',
    execute: countdownButtonHandler,
  },
];

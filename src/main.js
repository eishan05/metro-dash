import './style.css';
import { Game } from './game/Game.js';

function fail(message) {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100%;
                padding:24px;font-family:system-ui,sans-serif;text-align:center;color:#1d2733">
      <div>
        <h1 style="margin:0 0 8px">Metro Dash can't start</h1>
        <p style="margin:0;color:#55637a;max-width:34ch">${message}</p>
      </div>
    </div>`;
}

const canvas = document.getElementById('scene');

// WebGL is ~98% supported, but a clear message beats a blank blue screen for
// the browsers and locked-down machines where it isn't.
const probe = document.createElement('canvas');
const hasWebGL = !!(
  window.WebGLRenderingContext &&
  (probe.getContext('webgl2') || probe.getContext('webgl'))
);

if (!hasWebGL) {
  fail('This browser doesn’t support WebGL, which the game needs to render. Try Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
} else {
  try {
    const game = new Game(canvas);
    game.start();
    // Handy for tinkering from the console.
    window.game = game;
  } catch (err) {
    console.error(err);
    fail('Something went wrong starting the game. Check the browser console for details.');
  }
}

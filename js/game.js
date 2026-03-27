/**
 * Gameplay bootstrap.
 *
 * NOTE:
 * Existing gameplay logic should live in this file (or modules imported from here).
 * The previous monolithic index.html structure has now been split into:
 * - index.html (markup)
 * - css/styles.css (presentation)
 * - js/game.js (logic)
 */

const gameRoot = document.getElementById('game-root');

if (gameRoot) {
  gameRoot.innerHTML = '<p class="status"><strong>Game initialized.</strong> Add gameplay systems in <code>js/game.js</code>.</p>';
}

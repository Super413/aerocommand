# AeroCommand

A browser strategy/action prototype with aerial, naval, and ground combat.

## Project layout

```text
.
├── index.html           # UI markup and screen/modal structure
├── assets/
│   ├── css/
│   │   └── main.css     # All styling for menus, HUD, and modals
│   └── js/
│       ├── config.js    # Constants, weapons, units, tech tree, shared data
│       └── game.js      # Runtime state, classes, game loop, controls, and UI behavior
└── README.md
```

## Architecture notes for extension

- `index.html` is now focused on **structure only** so menus and overlays can be changed without hunting through gameplay code.
- `assets/js/config.js` contains content/data definitions. Add new weapons, units, buildings, and tech here first.
- `assets/js/game.js` contains simulation and rendering logic. Keep new systems in dedicated sections/functions to avoid coupling.
- `assets/css/main.css` centralizes visuals and component styles to make future UI/asset passes easier.

## Running

Open `index.html` in a browser.

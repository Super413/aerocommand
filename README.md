# AeroCommand

A browser strategy/action prototype with aerial, naval, and ground combat.

## Running

Open `index.html` in a browser, or [**visit it on github**](https://super413.github.io/aerocommand/)

## Project layout

```text
.
├── index.html                       # UI markup and screen/modal structure
├── encyclopedia_discriptions.txt    # Text descriptors for all units for encyclopedia
├── assets/
│   ├── css/
│   │   └── main.css                 # All styling for menus, HUD, and modals
│   ├── images/
│   │   └── units/                   # Optional per-unit UI icon images (PNG/WebP/SVG/etc.)
│   └── js/
│       ├── config.js                # Constants, weapons, units, tech tree, shared data, directs image assets
│       └── game.js                  # Runtime state, classes, game loop, controls, and UI behavior
└── README.md
```

## Architecture notes for extension

- `index.html` is now focused on **structure only** so menus and overlays can be changed without hunting through gameplay code.
- `assets/js/config.js` contains content/data definitions. Add new weapons, units, buildings, and tech here first.
- `assets/js/game.js` contains simulation and rendering logic. Keep new systems in dedicated sections/functions to avoid coupling.
- `assets/css/main.css` centralizes visuals and component styles to make future UI/asset passes easier.
- Unit icons for UI can now be overridden with image assets by filling `UNIT_ICON_ASSETS.units` in `assets/js/config.js` (keyed by unit key, e.g. `FIGHTER: 'fighter.png'`). Images are loaded from `assets/images/units/` and automatically fall back to emoji if missing.

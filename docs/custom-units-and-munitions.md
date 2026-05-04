# AeroCommand Modding Guide: Custom Units & Munitions

This document explains how to add and tune custom **munitions** and **units** for AeroCommand.

Primary data lives in `assets/js/config.js`:
- `WEAPONS` for munition definitions.
- `UNIT_TYPES` for unit definitions.
- Tech/unlock gating in `TECH_TREE` and `DEFAULT_UNLOCKS`.

Runtime behavior is implemented in `assets/js/game.js`.

---

## 1) Quick start workflow

1. Add a new weapon entry under `WEAPONS`.
2. Add that weapon key to unit hardpoints (`allowedWeapons` and/or `ammoByWeapon`) in `UNIT_TYPES`.
3. Optionally add the weapon to `TECH_TREE` and/or `DEFAULT_UNLOCKS`.
4. (Optional) Add icon/profile mappings in `WEAPON_ICON_ASSETS` / `UNIT_ICON_ASSETS` / `UNIT_PROFILE_ASSETS`.
5. Test in-game by spawning a unit that can mount the weapon.

---

## 2) Weapon (munition) config reference

Each weapon in `WEAPONS` is keyed by an ID (example: `AMRAAM`) and uses fields below.

### Core fields

- `name` *(string)*: UI/display name.
- `type` *(string)*: Weapon class. Used for hardpoint compatibility and firing logic.
  - Common values: `GUN`, `ROCKET`, `BOMB`, `AAM_LIGHT`, `AAM_HEAVY`, `AGM`, `CRUISE`, `HYPERSONIC`, `TBM`, `DEPLOY`, `ECM`, `none`.
- `icon` *(string)*: Emoji/icon label in UI.
- `targets` *(string[])*: Valid target categories. Important for targeting and AI.
  - Categories seen in logic: `air`, `heli`, `ground`, `ship`, `structure`, `cruise`, `munition`.

### Kinematics and lethality

- `damage` *(number)*: Direct hit damage.
- `range` *(number)*: Maximum firing distance.
- `speed` *(number)*: Projectile/missile speed contribution.
- `turn` *(number)*: Missile turn rate (homing agility).
- `cooldown` *(number)*: Reload time before the weapon can fire again.

### Ammo and salvo behavior

- `ammo` *(number)*: Default shots carried for this weapon instance (unless overridden by hardpoint `ammoByWeapon`).
- `salvoCount` *(number)*: Number of rounds released per firing cycle (commonly naval systems).
- `salvoDelay` *(number)*: Delay between salvo shots.
- `burstShots` *(number)*: Number of burst rounds (mostly guns).
- `burstInterval` *(number)*: Delay between burst rounds.
- `burst` *(number)*: Rocket-style burst count from one trigger cycle.

### Accuracy and intercept behavior

- `spread` *(number)*: Random shot dispersion angle for bullets.
- `leadMultiplier` *(number)*: Lead compensation multiplier when aiming guns.
- `interceptsMunitions` *(boolean)*: Enables bullet interception logic against hostile munitions.

### Guidance/special behavior

- `guidance` *(string)*: Missile guidance flavor (e.g., `heat`, `radar`), used with EW/countermeasures.
- `guided` *(boolean)*: Used by guided bombs/rockets.
- `priorityTag` *(string)*: Restricts shots to preferred target type (for example `SAM_SITE` behavior).
- `area` *(number)*: Area-effect radius for cluster-like payloads.
- `navalOmni` *(boolean)*: Allows ship weapons to fire omnidirectionally (not nose-locked).
- `passive` *(boolean)*: Non-firing support module (for ECM-style slots).
- `capacity` *(number)*: Used by deploy or ECM-related capacity rules.

### Deploy-class specific fields (`type: 'DEPLOY'`)

- `deployType` *(string)*: `UNIT` or `BUILDING`.
- `unitType` *(string)*: Spawned unit key from `UNIT_TYPES` when deploying a unit.
- `buildType` *(string)*: Spawned building type when deploying a building.

---

## 3) Unit config reference (`UNIT_TYPES`)

Each unit is keyed by ID (example: `DESTROYER`) and includes:

### Core unit fields

- `name` *(string)*: Display name.
- `type` *(string)*: Platform category (`air`, `heli`, `ground`, `ship`, `cruise`).
- `role` *(string)*: UI/AI role description.
- `cost` *(number)*: Purchase cost.
- `hp` *(number)*: Max health.
- `speed` *(number)*: Movement speed.
- `turn` *(number)*: Turning rate.
- `fuel` *(number)*: Fuel pool (aircraft consume; many ground/ship units use high values).
- `ammo` *(number)*: Base ammo field used by some systems.
- `capacity` *(number, optional)*: Transport/support capacity for relevant unit types.
- `icon` *(string)*: Emoji marker.

### Command aura fields (optional, support units)

- `commandAuraRadius` *(number)*: Buff radius around the unit.
- `commandTurnBoost` *(number)*: Multiplier for friendly turn rates in aura.
- `commandCooldownBoost` *(number)*: Multiplier for cooldown/reload behavior in aura.

### Hardpoints

`hardpoints` is an array of mount slots. Each slot can define:

- `name` *(string)*: Slot label in UI.
- `types` *(string[])*: Allowed weapon classes (must match weapon `type`).
- `equipped` *(string)*: Default weapon key.
- `x`, `y` *(number)*: Relative mount position for visuals/firing origin.
- `allowedWeapons` *(string[])*: Optional strict allow-list by weapon key.
- `ammoByWeapon` *(object)*: Per-weapon ammo override for this slot.

### Hardpoint compatibility rules

A weapon is equip-compatible when:
1. Weapon exists.
2. Weapon `type` is included in slot `types`.
3. If `allowedWeapons` exists, weapon key must be listed.
4. Additional platform checks in runtime are satisfied (e.g., some ground gun constraints).

---

## 4) Unlock and tech integration

To make custom weapons available:

- Add to `DEFAULT_UNLOCKS` for immediate access, or
- Add into a branch in `TECH_TREE` with:
  - `id`: weapon/upgrade key
  - `cost`: research cost
  - `req`: prerequisite key or `null`
  - `type: 'passive'` for passive upgrades

Passive tech entries correspond to `TECH_UPGRADES` keys.

---

## 5) Practical examples

### Example A: Add a new anti-ship missile

1. Create `WEAPONS.NEPTUNE_X`:
   - `type: 'CRUISE'`
   - `targets: ['ship', 'structure']`
   - tune `damage`, `range`, `speed`, `turn`, `cooldown`, `ammo`
2. Add `NEPTUNE_X` to ship/aircraft hardpoint `types` that include `CRUISE`.
3. Add slot `ammoByWeapon: { NEPTUNE_X: <count> }` for realistic magazine size.
4. Add to `TECH_TREE` if you want research-gated unlock.

### Example B: Add a new deployable unit package

1. Add `UNIT_TYPES.MY_RECON_TEAM`.
2. Add `WEAPONS.DEPLOY_RECON` with:
   - `type: 'DEPLOY'`
   - `deployType: 'UNIT'`
   - `unitType: 'MY_RECON_TEAM'`
3. Add `DEPLOY_RECON` to a transport hardpoint with `types: ['DEPLOY']` and ammo.

---

## 6) Common pitfalls

- Mismatched slot `types` vs weapon `type` means weapon never appears equipable.
- Forgetting unlock path (`DEFAULT_UNLOCKS`/`TECH_TREE`) makes weapon inaccessible in normal progression.
- Missing `targets` causes weapon to ignore otherwise valid enemies.
- `allowedWeapons` can silently block weapons even when `types` matches.
- Deploy weapons require correct `deployType` + `unitType`/`buildType` pairing.

---

## 7) Validation checklist for new content

- Weapon key is unique and added to `WEAPONS`.
- At least one unit hardpoint can equip it (`types`/`allowedWeapons`).
- Ammo behavior verified (`ammo` or `ammoByWeapon`).
- Targeting verified against intended target categories.
- Unlock route configured (`DEFAULT_UNLOCKS` or `TECH_TREE`).
- Optional art assets mapped for polished UI.


const SPEED_SCALE = 0.2; 
const TEAM_PLAYER = 1;
const TEAM_AI = 2;
const TEAM_NEUTRAL = 0;

const COLORS = {
    [TEAM_NEUTRAL]: '#AAAAAA',
    [TEAM_PLAYER]: '#4488FF',
    [TEAM_AI]: '#FF4444'
};

// --- DATA ---
const WEAPONS = {
    EMPTY: { name: 'Empty', type: 'none', icon: '🚫' },
    GUN_BASIC: { name: '.50 Cal MG', type: 'GUN', damage: 2, cooldown: 2, speed: 12, range: 100, targets: ['air','heli','ground'], icon: '🔫', navalOmni: true, salvoCount: 2, salvoDelay: 2 }, 
    VULCAN: { name: '20mm Vulcan', type: 'GUN', damage: 8, cooldown: 2, speed: 12, range: 150, targets: ['air','heli','ground'], icon: '🌭' },
    CANNON_127MM: { name: '127mm Cannon', type: 'GUN', damage: 40, cooldown: 60, speed: 10, range: 200, targets: ['ground', 'ship'], icon: '💣', navalOmni: true, salvoCount: 3, salvoDelay: 4 },
    RAILGUN: { name: 'Railcannon', type: 'GUN', damage: 260, cooldown: 36, speed: 100, range: 420, targets: ['air','heli','ground','ship','structure'], icon: '⚡' },
    CIWS: { name: 'Phalanx CIWS', type: 'GUN', damage: 10, cooldown: 4, speed: 12, range: 120, targets: ['air','heli', 'cruise'], icon: '🛡️', navalOmni: true, salvoCount: 4, salvoDelay: 1, leadMultiplier: 1.35 },
    RIFLE: { name: 'Assault Rifle', type: 'GUN', damage: 2, cooldown: 30, speed: 8, range: 100, targets: ['ground'], icon: '🔫' },
    ROCKET_HYDRA: { name: 'Hydra 70', type: 'ROCKET', damage: 15, cooldown: 5, speed: 6, range: 160, targets: ['ground', 'ship', 'structure'], burst: 3, ammo: 3, icon: '🎇' },
    ROCKET_DAGR: { name: 'DAGR', type: 'ROCKET', damage: 25, cooldown: 5, speed: 7, range: 200, targets: ['ground', 'ship', 'structure'], burst: 1, guided: true, ammo: 2, icon: '🎯' },
    ROCKET_DU: { name: 'DU Rocket', type: 'ROCKET', damage: 60, cooldown: 5, speed: 8, range: 220, targets: ['ground', 'ship', 'structure'], burst: 2, guided: true, ammo: 2, icon: '☢️' },
    BOMB_IRON: { name: 'Mk82', type: 'BOMB', damage: 150, cooldown: 40, range: 20, targets: ['structure', 'ship', 'ground'], ammo: 1, icon: '💣' },
    BOMB_GUIDED: { name: 'GBU-12', type: 'BOMB', damage: 200, cooldown: 30, range: 30, targets: ['structure', 'ship', 'ground'], speed: 3, guided: true, ammo: 1, icon: '🎯💣' },
    BOMB_CLUSTER: { name: 'CBU-87', type: 'BOMB', damage: 80, cooldown: 20, range: 50, targets: ['ground', 'ship'], area: 80, ammo: 1, icon: '✨' },
    BOMB_SDB: { name: 'SDB Glide', type: 'BOMB', damage: 120, cooldown: 20, range: 400, targets: ['structure', 'ship', 'ground'], speed: 4, guided: true, ammo: 2, icon: '🦅' },
    SIDEWINDER: { name: 'AIM-9X', type: 'AAM_LIGHT', damage: 30, cooldown: 60, speed: 6, range: 250, turn: 0.12, targets: ['air', 'heli', 'cruise'], guidance: 'heat', ammo: 1, icon: '🚀' },
    AMRAAM: { name: 'AIM-120', type: 'AAM_HEAVY', damage: 45, cooldown: 90, speed: 5, range: 350, turn: 0.09, targets: ['air', 'heli', 'cruise'], guidance: 'radar', ammo: 1, icon: '🚀+', navalOmni: true, salvoCount: 2, salvoDelay: 6 },
    LRAAM: { name: 'AIM-174B', type: 'AAM_HEAVY', damage: 65, cooldown: 130, speed: 6, range: 520, turn: 0.08, targets: ['air', 'heli', 'cruise'], guidance: 'radar', ammo: 1, icon: '🛰️🚀', navalOmni: true, salvoCount: 2, salvoDelay: 8 },
    MAVERICK: { name: 'AGM-65', type: 'AGM', damage: 50, cooldown: 80, speed: 4, range: 220, turn: 0.08, targets: ['ground', 'ship', 'structure'], ammo: 1, icon: '🧨', navalOmni: true, salvoCount: 2, salvoDelay: 8 },
    HELLFIRE: { name: 'AGM-114', type: 'AGM', damage: 50, cooldown: 45, speed: 5, range: 180, turn: 0.1, targets: ['ground', 'ship', 'structure'], ammo: 2, icon: '🔥', navalOmni: true, salvoCount: 2, salvoDelay: 5 },
    HYPERSONIC_ASHM: { name: 'Hypersonic AShM', type: 'HYPERSONIC', damage: 260, cooldown: 220, speed: 11, range: 900, turn: 0.07, targets: ['ship', 'structure'], ammo: 1, icon: '🚀🌊', navalOmni: true, salvoCount: 2, salvoDelay: 10 },
    TOMAHAWK: { name: 'Tomahawk', type: 'CRUISE', damage: 300, cooldown: 400, speed: 10, range: 800, turn: 0.05, targets: ['structure', 'ship'], ammo: 1, icon: '🐢', navalOmni: true, salvoCount: 2, salvoDelay: 12 },
    PILE_DRIVER: { name: 'Pile-Driver TBM', type: 'TBM', damage: 420, cooldown: 340, speed: 5.5, range: 5000, targets: ['structure', 'ship', 'ground'], ammo: 1, icon: '🧱🚀', navalOmni: true, salvoCount: 1 },
    ARAD: { name: 'HARM', type: 'AGM', damage: 100, cooldown: 100, speed: 15, range: 800, turn: 0.15, targets: ['structure'], priorityTag: 'SAM_SITE', ammo: 1, icon: '📡💥', navalOmni: true, salvoCount: 2, salvoDelay: 7 },
    SF_DEPLOY: { name: 'SF Team', type: 'DEPLOY', damage: 0, cooldown: 120, range: 20, targets: [], capacity: 1, icon: '🪖', deployType: 'UNIT', unitType: 'SF' },
    DEPLOY_SPAA: { name: 'Light AA', type: 'DEPLOY', damage: 0, cooldown: 200, range: 20, targets: [], capacity: 1, icon: '🔫', deployType: 'BUILDING', buildType: 'DEPLOYED_SPAA' },
    DEPLOY_COASTAL: { name: 'Coast Gun', type: 'DEPLOY', damage: 0, cooldown: 200, range: 20, targets: [], capacity: 1, icon: '🏰', deployType: 'BUILDING', buildType: 'DEPLOYED_COASTAL' },
    DEPLOY_MANPADS: { name: 'MANPADS', type: 'DEPLOY', damage: 0, cooldown: 200, range: 20, targets: [], capacity: 1, icon: '🚀', deployType: 'BUILDING', buildType: 'DEPLOYED_MANPADS' },
    DEPLOY_ASHM: { name: 'AShM Bat', type: 'DEPLOY', damage: 0, cooldown: 300, range: 20, targets: [], capacity: 1, icon: '🚢💥', deployType: 'BUILDING', buildType: 'DEPLOYED_ASHM' },
    DEPLOY_IR_APC: { name: 'Unload IR APC', type: 'DEPLOY', damage: 0, cooldown: 150, range: 25, targets: [], capacity: 2, icon: '🚛', deployType: 'UNIT', unitType: 'IR_APC' },
    DEPLOY_AAA_BATTERY: { name: 'Unload AAA', type: 'DEPLOY', damage: 0, cooldown: 180, range: 25, targets: [], capacity: 2, icon: '🛡️', deployType: 'UNIT', unitType: 'AAA_BATTERY' },
    JAMMER_POD: { name: 'ECM Pod', type: 'ECM', damage: 0, cooldown: 10, range: 100, targets: [], icon: '📡', passive: true, capacity: 2 }
};

const TECH_UPGRADES = { FLARES: { name: 'Flares' }, CHAFF: { name: 'Chaff' }, DEF_JAMMER: { name: 'Defensive Jammer' } };

const TECH_TREE = {
    "Logistics": [ { id: "SF_DEPLOY", cost: 0, req: null }, { id: "DEPLOY_SPAA", cost: 500, req: "SF_DEPLOY" }, { id: "DEPLOY_COASTAL", cost: 800, req: "SF_DEPLOY" }, { id: "DEPLOY_MANPADS", cost: 1500, req: "DEPLOY_SPAA" }, { id: "DEPLOY_ASHM", cost: 2000, req: "DEPLOY_COASTAL" } ],
    "Guns": [ { id: "VULCAN", cost: 500, req: null }, { id: "CIWS", cost: 800, req: "VULCAN" }, { id: "RAILGUN", cost: 2000, req: "CIWS" } ],
    "Bombs": [ { id: "BOMB_GUIDED", cost: 600, req: null }, { id: "BOMB_CLUSTER", cost: 1200, req: "BOMB_GUIDED" }, { id: "BOMB_SDB", cost: 2000, req: "BOMB_CLUSTER" } ],
    "Rockets": [ { id: "ROCKET_DAGR", cost: 600, req: null }, { id: "ROCKET_DU", cost: 1500, req: "ROCKET_DAGR" } ],
    "Air Missiles": [ { id: "SIDEWINDER", cost: 1000, req: null }, { id: "AMRAAM", cost: 1500, req: "SIDEWINDER" }, { id: "LRAAM", cost: 2200, req: "AMRAAM" } ],
    "Strike Missiles": [ { id: "MAVERICK", cost: 800, req: null }, { id: "HELLFIRE", cost: 1200, req: "MAVERICK" } ],
    "Naval Strike": [ { id: "TOMAHAWK", cost: 2500, req: "HELLFIRE" }, { id: "HYPERSONIC_ASHM", cost: 3500, req: "TOMAHAWK" } ],
    "Electronics": [ { id: "JAMMER_POD", cost: 1000, req: null }, { id: "ARAD", cost: 2000, req: "JAMMER_POD" }, { id: "FLARES", cost: 500, req: null, type: 'passive' }, { id: "CHAFF", cost: 1000, req: "FLARES", type: 'passive' }, { id: "DEF_JAMMER", cost: 2000, req: "CHAFF", type: 'passive' } ]
};

// Initial unlocks per team
const DEFAULT_UNLOCKS = ['EMPTY', 'GUN_BASIC', 'RIFLE', 'ROCKET_HYDRA', 'BOMB_IRON', 'SF_DEPLOY', 'CANNON_127MM'];

// State per team (Ensuring robust init)
const TEAMS = {
    [TEAM_PLAYER]: { money: 2000, tech: new Set([...DEFAULT_UNLOCKS]), zones: [] },
    [TEAM_AI]: { money: 2000, tech: new Set([...DEFAULT_UNLOCKS]), zones: [] }
};

const UNIT_TYPES = {
    FIGHTER: { name: 'F-16 Viper', type: 'air', role: 'AA', cost: 400, hp: 100, speed: 3.5, turn: 0.08, fuel: 1500, ammo: 1, icon: '✈️', hardpoints: [
        { name: 'Gun', types: ['GUN'], equipped: 'GUN_BASIC', x: 0, y: -80, allowedWeapons: ['GUN_BASIC', 'VULCAN'] },
        { name: 'Center', types: ['ECM'], equipped: 'EMPTY', x: 0, y: 10, allowedWeapons: ['EMPTY', 'JAMMER_POD'] },
        { name: 'L Wing', types: ['AAM_LIGHT', 'AAM_HEAVY', 'AGM', 'BOMB', 'ROCKET'], equipped: 'ROCKET_HYDRA', x: -70, y: 30, ammoByWeapon: { SIDEWINDER: 2, AMRAAM: 1, ROCKET_HYDRA: 4, HELLFIRE: 2 } },
        { name: 'R Wing', types: ['AAM_LIGHT', 'AAM_HEAVY', 'AGM', 'BOMB', 'ROCKET'], equipped: 'ROCKET_HYDRA', x: 70, y: 30, ammoByWeapon: { SIDEWINDER: 2, AMRAAM: 1, ROCKET_HYDRA: 4, HELLFIRE: 2 } },
        { name: 'L Tip', types: ['AAM_LIGHT', 'AAM_HEAVY'], equipped: 'EMPTY', x: -130, y: 10, ammoByWeapon: { SIDEWINDER: 2, AMRAAM: 1 } },
        { name: 'R Tip', types: ['AAM_LIGHT', 'AAM_HEAVY'], equipped: 'EMPTY', x: 130, y: 10, ammoByWeapon: { SIDEWINDER: 2, AMRAAM: 1 } }
    ] },
    STRIKE: { name: 'F/A-18 Hornet', type: 'air', role: 'Multi', cost: 600, hp: 140, speed: 2.8, turn: 0.06, fuel: 1800, ammo: 1, icon: '⚔️', hardpoints: [
        { name: 'Gun', types: ['GUN'], equipped: 'GUN_BASIC', x: 0, y: -90, allowedWeapons: ['GUN_BASIC', 'VULCAN'] },
        { name: 'Center', types: ['ECM', 'BOMB', 'AGM'], equipped: 'EMPTY', x: 0, y: 10, ammoByWeapon: { BOMB_IRON: 3, BOMB_SDB: 4, MAVERICK: 2 } },
        { name: 'L Outer', types: ['AGM', 'BOMB', 'ROCKET', 'CRUISE'], equipped: 'ROCKET_HYDRA', x: -100, y: 40, ammoByWeapon: { ROCKET_HYDRA: 6, HELLFIRE: 4, TOMAHAWK: 1 } },
        { name: 'R Outer', types: ['AGM', 'BOMB', 'ROCKET', 'CRUISE'], equipped: 'ROCKET_HYDRA', x: 100, y: 40, ammoByWeapon: { ROCKET_HYDRA: 6, HELLFIRE: 4, TOMAHAWK: 1 } },
        { name: 'L Inner', types: ['AAM_HEAVY', 'AGM', 'BOMB', 'ROCKET'], equipped: 'BOMB_IRON', x: -50, y: 60, ammoByWeapon: { AMRAAM: 2, BOMB_IRON: 2, ROCKET_HYDRA: 4 } },
        { name: 'R Inner', types: ['AAM_HEAVY', 'AGM', 'BOMB', 'ROCKET'], equipped: 'BOMB_IRON', x: 50, y: 60, ammoByWeapon: { AMRAAM: 2, BOMB_IRON: 2, ROCKET_HYDRA: 4 } }
    ] },
    BOMBER: { name: 'B-52 Stratos', type: 'air', role: 'Bomber', cost: 1200, hp: 400, speed: 1.5, turn: 0.02, fuel: 3000, ammo: 1, icon: '💣', hardpoints: [
        { name: 'Bay 1', types: ['BOMB', 'CRUISE', 'TBM'], equipped: 'BOMB_IRON', x: -25, y: -20, ammoByWeapon: { BOMB_IRON: 4, BOMB_GUIDED: 2, BOMB_CLUSTER: 2, BOMB_SDB: 4, TOMAHAWK: 2, PILE_DRIVER: 2 } },
        { name: 'Bay 2', types: ['BOMB', 'CRUISE', 'TBM'], equipped: 'BOMB_IRON', x: 25, y: -20, ammoByWeapon: { BOMB_IRON: 4, BOMB_GUIDED: 2, BOMB_CLUSTER: 2, BOMB_SDB: 4, TOMAHAWK: 2, PILE_DRIVER: 2 } },
        { name: 'L Pylon', types: ['AGM', 'CRUISE', 'ECM'], equipped: 'EMPTY', x: -90, y: 20, ammoByWeapon: { MAVERICK: 2, HELLFIRE: 2, TOMAHAWK: 1 } },
        { name: 'R Pylon', types: ['AGM', 'CRUISE', 'ECM'], equipped: 'EMPTY', x: 90, y: 20, ammoByWeapon: { MAVERICK: 2, HELLFIRE: 2, TOMAHAWK: 1 } }
    ] },
    AWACS: { name: 'E-3 Sentry', type: 'air', role: 'Support', cost: 1000, hp: 300, speed: 2.0, turn: 0.03, fuel: 2500, ammo: 1, icon: '📡', hardpoints: [
        { name: 'Rotodome 1', types: ['ECM'], equipped: 'EMPTY', x: -20, y: -10 },
        { name: 'Rotodome 2', types: ['ECM'], equipped: 'EMPTY', x: 20, y: -10 },
        { name: 'L Wing', types: ['ECM', 'AAM_LIGHT'], equipped: 'EMPTY', x: -80, y: 20, ammoByWeapon: { SIDEWINDER: 2 } },
        { name: 'R Wing', types: ['ECM', 'AAM_LIGHT'], equipped: 'EMPTY', x: 80, y: 20, ammoByWeapon: { SIDEWINDER: 2 } }
    ] },
    AC130: { name: 'AC-130 Spectre', type: 'air', role: 'Gunship', cost: 2200, hp: 520, speed: 1.35, turn: 0.03, fuel: 3200, ammo: 1, icon: '🛩️🔫', hardpoints: [
        { name: 'Port Cannon', types: ['GUN'], equipped: 'CANNON_127MM', x: -12, y: 0, allowedWeapons: ['CANNON_127MM', 'RAILGUN'] },
        { name: 'Port Gun 1', types: ['GUN'], equipped: 'VULCAN', x: -30, y: -10, allowedWeapons: ['GUN_BASIC', 'VULCAN'] },
        { name: 'Port Gun 2', types: ['GUN'], equipped: 'GUN_BASIC', x: -30, y: 10, allowedWeapons: ['GUN_BASIC', 'VULCAN'] }
    ] },
    SEAD_FIGHTER: { name: 'F-35G Shrike', type: 'air', role: 'SEAD', cost: 1400, hp: 220, speed: 2.7, turn: 0.055, fuel: 2200, ammo: 1, icon: '🦅📡', hardpoints: [
        { name: 'Gun', types: ['GUN'], equipped: 'VULCAN', x: 0, y: -85, allowedWeapons: ['GUN_BASIC', 'VULCAN'] },
        { name: 'EW Bay', types: ['ECM'], equipped: 'JAMMER_POD', x: 0, y: 0 },
        { name: 'L Inner', types: ['AGM', 'AAM_HEAVY'], equipped: 'ARAD', x: -52, y: 35, ammoByWeapon: { ARAD: 2, AMRAAM: 2, LRAAM: 1, MAVERICK: 2 } },
        { name: 'R Inner', types: ['AGM', 'AAM_HEAVY'], equipped: 'ARAD', x: 52, y: 35, ammoByWeapon: { ARAD: 2, AMRAAM: 2, LRAAM: 1, MAVERICK: 2 } },
        { name: 'L Tip', types: ['AAM_LIGHT', 'AAM_HEAVY'], equipped: 'SIDEWINDER', x: -95, y: 5, ammoByWeapon: { SIDEWINDER: 2, AMRAAM: 1, LRAAM: 1 } },
        { name: 'R Tip', types: ['AAM_LIGHT', 'AAM_HEAVY'], equipped: 'SIDEWINDER', x: 95, y: 5, ammoByWeapon: { SIDEWINDER: 2, AMRAAM: 1, LRAAM: 1 } }
    ] },
    ATTACK_HELI: { name: 'AH-64 Apache', type: 'heli', role: 'CAS', cost: 500, hp: 180, speed: 1.8, turn: 0.1, fuel: 2000, ammo: 1, icon: '🚁', hardpoints: [
        { name: 'Chain Gun', types: ['GUN'], equipped: 'GUN_BASIC', x: 0, y: -100 },
        { name: 'L Stub', types: ['AGM', 'ROCKET'], equipped: 'ROCKET_HYDRA', x: -50, y: -20, ammoByWeapon: { ROCKET_HYDRA: 8, HELLFIRE: 4, MAVERICK: 2 } },
        { name: 'R Stub', types: ['AGM', 'ROCKET'], equipped: 'ROCKET_HYDRA', x: 50, y: -20, ammoByWeapon: { ROCKET_HYDRA: 8, HELLFIRE: 4, MAVERICK: 2 } },
        { name: 'L Tip', types: ['AAM_LIGHT', 'ECM'], equipped: 'EMPTY', x: -70, y: -20, ammoByWeapon: { SIDEWINDER: 2 } },
        { name: 'R Tip', types: ['AAM_LIGHT', 'ECM'], equipped: 'EMPTY', x: 70, y: -20, ammoByWeapon: { SIDEWINDER: 2 } }
    ] },
    TRANSPORT: { name: 'CH-47 Chinook', type: 'heli', role: 'Transport', cost: 300, hp: 200, speed: 1.6, turn: 0.05, fuel: 2500, ammo: 0, capacity: 4, icon: '📦', hardpoints: [ { name: 'Cargo Bay', types: ['DEPLOY'], equipped: 'SF_DEPLOY', x: 0, y: 0, ammoByWeapon: { SF_DEPLOY: 2, DEPLOY_SPAA: 1, DEPLOY_COASTAL: 1, DEPLOY_MANPADS: 2, DEPLOY_ASHM: 1 } } ] },
    SF: { name: 'SF Team', type: 'ground', role: 'Capture', cost: 100, hp: 50, speed: 0.5, turn: 1, fuel: 0, ammo: 999, icon: '🔫', hardpoints: [{ name: 'Gun', types: ['GUN'], equipped: 'RIFLE', x:0, y:0 }] },
    IR_APC: { name: 'IR APC', type: 'ground', role: 'Missile Defense', cost: 700, hp: 260, speed: 0.45, turn: 0.09, fuel: 9999, ammo: 1, icon: '🚛', hardpoints: [
        { name: 'IR Launcher', types: ['AAM_LIGHT'], equipped: 'SIDEWINDER', x: 0, y: -10, ammoByWeapon: { SIDEWINDER: 4 } }
    ] },
    AAA_BATTERY: { name: 'AAA Battery', type: 'ground', role: 'Air Defense', cost: 900, hp: 420, speed: 0.2, turn: 0.2, fuel: 9999, ammo: 1, icon: '🛡️', hardpoints: [
        { name: 'CIWS Mount', types: ['GUN'], equipped: 'CIWS', x: 0, y: 0 }
    ] },
    CONVOY: { name: 'Mechanized Convoy', type: 'ground', role: 'Convoy Command', cost: 1800, hp: 900, speed: 0.34, turn: 0.09, fuel: 9999, ammo: 0, icon: '🚚🚚', hardpoints: [] },
    CARRIER: { name: 'Carrier', type: 'ship', role: 'Base', cost: 2500, hp: 2000, speed: 0.6, turn: 0.04, fuel: 0, ammo: 999, icon: '🚢', commandAuraRadius: 220, commandTurnBoost: 1.2, commandCooldownBoost: 1.15, hardpoints: [
        { name: 'Bow AA', types: ['GUN'], equipped: 'GUN_BASIC', x: 0, y: -50, allowedWeapons: ['GUN_BASIC', 'CIWS'] },
        { name: 'Stern AA', types: ['GUN'], equipped: 'GUN_BASIC', x: 0, y: 80, allowedWeapons: ['GUN_BASIC', 'CIWS'] },
        { name: 'Mid AA', types: ['GUN'], equipped: 'GUN_BASIC', x: 40, y: 20, allowedWeapons: ['GUN_BASIC', 'CIWS'] }
    ] },
    DESTROYER: { name: 'Destroyer', type: 'ship', role: 'Escort', cost: 1500, hp: 1200, speed: 0.8, turn: 0.05, fuel: 9999, ammo: 1, icon: '🛳️', hardpoints: [
        { name: 'Main Gun', types: ['GUN'], equipped: 'CANNON_127MM', x: 0, y: -40, allowedWeapons: ['CANNON_127MM', 'RAILGUN'] },
        { name: 'VLS 1', types: ['AAM_HEAVY', 'CRUISE', 'AGM', 'HYPERSONIC'], equipped: 'EMPTY', x: 0, y: -10, ammoByWeapon: { AMRAAM: 16, TOMAHAWK: 8, MAVERICK: 16, HELLFIRE: 16, ARAD: 6, HYPERSONIC_ASHM: 2 } },
        { name: 'VLS 2', types: ['AAM_HEAVY', 'CRUISE', 'AGM', 'HYPERSONIC'], equipped: 'EMPTY', x: 0, y: 10, ammoByWeapon: { AMRAAM: 16, TOMAHAWK: 8, MAVERICK: 16, HELLFIRE: 16, ARAD: 6, HYPERSONIC_ASHM: 2 } },
        { name: 'Aft AA', types: ['GUN'], equipped: 'GUN_BASIC', x: 0, y: 50, allowedWeapons: ['GUN_BASIC', 'CIWS'] }
    ] },
    ARSENAL_CRUISER: { name: 'Arsenal Cruiser', type: 'ship', role: 'Missile Command', cost: 3200, hp: 1700, speed: 0.65, turn: 0.04, fuel: 9999, ammo: 1, icon: '🚢🚀', hardpoints: [
        { name: 'Main Gun', types: ['GUN'], equipped: 'CANNON_127MM', x: 0, y: -40, allowedWeapons: ['CANNON_127MM', 'RAILGUN'] },
        { name: 'CIWS Bow', types: ['GUN'], equipped: 'CIWS', x: 0, y: -18, allowedWeapons: ['GUN_BASIC', 'CIWS'] },
        { name: 'VLS Heavy 1', types: ['CRUISE', 'AGM', 'AAM_HEAVY', 'HYPERSONIC'], equipped: 'TOMAHAWK', x: -8, y: 2, ammoByWeapon: { TOMAHAWK: 6, AMRAAM: 12, MAVERICK: 10, HELLFIRE: 10, HYPERSONIC_ASHM: 4 } },
        { name: 'VLS Heavy 2', types: ['CRUISE', 'AGM', 'AAM_HEAVY', 'HYPERSONIC'], equipped: 'TOMAHAWK', x: 8, y: 2, ammoByWeapon: { TOMAHAWK: 6, AMRAAM: 12, MAVERICK: 10, HELLFIRE: 10, HYPERSONIC_ASHM: 4 } },
        { name: 'EW Suite', types: ['ECM'], equipped: 'EMPTY', x: 0, y: 22 },
        { name: 'CIWS Aft', types: ['GUN'], equipped: 'CIWS', x: 0, y: 50, allowedWeapons: ['GUN_BASIC', 'CIWS'] }
    ] },
    LANDING_SHIP: { name: 'Landing Ship', type: 'ship', role: 'Amphibious Transport', cost: 1800, hp: 1500, speed: 0.55, turn: 0.04, fuel: 9999, ammo: 1, icon: '🚢📦', hardpoints: [
        { name: 'Bow Gun', types: ['GUN'], equipped: 'GUN_BASIC', x: 0, y: -40 },
        { name: 'Vehicle Bay', types: ['DEPLOY'], equipped: 'DEPLOY_IR_APC', x: -8, y: 10, ammoByWeapon: { DEPLOY_IR_APC: 2, DEPLOY_AAA_BATTERY: 2, SF_DEPLOY: 2 } },
        { name: 'Troop Bay', types: ['DEPLOY'], equipped: 'DEPLOY_AAA_BATTERY', x: 8, y: 12, ammoByWeapon: { DEPLOY_IR_APC: 2, DEPLOY_AAA_BATTERY: 2, SF_DEPLOY: 2 } },
        { name: 'Aft CIWS', types: ['GUN'], equipped: 'CIWS', x: 0, y: 45, allowedWeapons: ['GUN_BASIC', 'CIWS'] }
    ] },
    HUNTER_FRIGATE: { name: 'Hunter Frigate', type: 'ship', role: 'SEAD/Interdiction', cost: 2400, hp: 1400, speed: 0.85, turn: 0.06, fuel: 9999, ammo: 1, icon: '⚓🎯', commandAuraRadius: 170, commandTurnBoost: 1.15, commandCooldownBoost: 1.1, hardpoints: [
        { name: 'Main Gun', types: ['GUN'], equipped: 'CANNON_127MM', x: 0, y: -35, allowedWeapons: ['CANNON_127MM', 'RAILGUN'] },
        { name: 'SEAD Rack', types: ['AGM', 'AAM_HEAVY'], equipped: 'ARAD', x: -8, y: 4, ammoByWeapon: { ARAD: 6, AMRAAM: 8, MAVERICK: 8 } },
        { name: 'Strike Rack', types: ['AGM', 'CRUISE', 'AAM_HEAVY'], equipped: 'MAVERICK', x: 8, y: 8, ammoByWeapon: { ARAD: 4, AMRAAM: 8, MAVERICK: 10, TOMAHAWK: 4 } },
        { name: 'CIWS', types: ['GUN'], equipped: 'CIWS', x: 0, y: 45, allowedWeapons: ['GUN_BASIC', 'CIWS'] }
    ] },
    SSBN: { name: 'SSBN', type: 'ship', role: 'Strategic', cost: 3800, hp: 1800, speed: 0.45, turn: 0.03, fuel: 9999, ammo: 1, icon: '🛳️🧱', hardpoints: [
        { name: 'Missile Tube', types: ['TBM'], equipped: 'PILE_DRIVER', x: 0, y: 0, ammoByWeapon: { PILE_DRIVER: 8 }, allowedWeapons: ['PILE_DRIVER'] }
    ] },
    CRUISE_MISSILE_UNIT: { name: 'Tomahawk', type: 'cruise', role: 'Strategic', cost: 0, hp: 20, speed: 2.5, turn: 0.05, fuel: 600, ammo: 0, icon: '🐢', hardpoints: [] },
    HYPERSONIC_ASHM_UNIT: { name: 'Hypersonic AShM', type: 'cruise', role: 'Strategic', cost: 0, hp: 16, speed: 4.4, turn: 0.09, fuel: 700, ammo: 0, icon: '🚀🌊', hardpoints: [] },
    PILE_DRIVER_TBM_UNIT: { name: 'Pile-Driver TBM', type: 'cruise', role: 'Strategic', cost: 0, hp: 24, speed: 4.8, turn: 0.02, fuel: 650, ammo: 0, icon: '🧱🚀', hardpoints: [] }
};

const BUILDINGS = {
    AIRPORT: { hp: 2000, range: 100, name: 'Airbase' },
    SAM_SITE: { hp: 500, range: 400, damage: 50, reload: 120, name: 'SAM Site' }, 
    SPAA: { hp: 300, range: 150, damage: 5, reload: 10, name: 'SPAA' },
    DEPLOYED_SPAA: { hp: 200, range: 120, damage: 4, reload: 15, name: 'Light AA' },
    DEPLOYED_COASTAL: { hp: 400, range: 250, damage: 80, reload: 180, name: 'Coast Gun' }, 
    DEPLOYED_MANPADS: { hp: 150, range: 180, damage: 35, reload: 100, name: 'MANPADS' },
    DEPLOYED_ASHM: { hp: 300, range: 400, damage: 150, reload: 400, name: 'AShM Bat' },
    PORT: { hp: 1400, range: 60, name: 'Port' },
    CONSTRUCTION_YARD: { hp: 700, range: 0, name: 'Construction Yard' },
    BASE_FORT: { hp: 1100, range: 0, name: 'Base Fortification' }
};

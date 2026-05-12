// --- Game State ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

let width, height;
let worldWidth, worldHeight;
let gameTime = 0;
let gameOver = false;
let editMode = false;
let editingUnitKey = null;
let selectedSlotIndex = null;
let gamePaused = false;
let gameState = 'MENU'; 
let isSpectator = false;
let camera = { x: 0, y: 0 };
let inputKeys = {};
let zoneEditMode = false;
let currentZoneType = null;
let zoneDragStart = null;
let currentMapType = 'ARCHIPELAGO';
let currentAiDifficulty = 'NORMAL';

function isLandMap() { return currentMapType === 'LAND'; }
function isCombinedMap() { return currentMapType === 'COMBINED'; }
function isNavalBattleMap() { return currentMapType === 'NAVAL_BATTLE'; }
function hasRoadNetworkTerrain() { return isLandMap() || isCombinedMap(); }
function supportsGroundUnits() { return isLandMap() || isCombinedMap(); }
function supportsNavalUnits() { return currentMapType === 'ARCHIPELAGO' || isCombinedMap() || isNavalBattleMap(); }
function canBuildNavalUnits() { return supportsNavalUnits() && !isNavalBattleMap(); }
function getCombinedRingWidth() { return Math.max(150, Math.min(240, Math.min(worldWidth || width || 900, worldHeight || height || 650) * 0.22)); }
let tutorialMode = false;
let tutorialState = null;
let tutorialUi = { overlay: null, message: null, highlight: null };
let multiplayerMode = 'OFF';
let multiplayerSessionCode = '';
let selectionSidebarCollapsed = false;
let encyclopediaState = { category: 'ground', index: 0, entries: null };
let encyclopediaDescriptions = { units: {}, structures: {}, munitions: {} };
let encyclopediaDescriptionsLoaded = false;

const entities = [];
const particles = [];
const projectiles = [];
const islands = [];
const landRoads = [];
const roadNodes = [];
let nextEntityId = 1;

const mouse = { x: 0, y: 0, left: false, right: false, worldX: 0, worldY: 0 };
let selection = [];
let manualStrikeMode = false;
let manualStrikePlan = null;
let constructionContext = { yardId: null, selectedBuildType: null };

const DATALINK_RANGE = 260;
const RADAR_PING_INTERVAL_FRAMES = 120;
const RADAR_PING_FLASH_FRAMES = 18;
let radarDetectionBlips = [];
let lastRadarPingFrame = -1;

const AI_DIFFICULTY_PROFILES = {
    EASY: {
        playerStartingMoney: 3000,
        aiStartingMoney: 1500,
        researchChance: 0.45,
        buildChance: 0.55,
        attackChance: 0.5,
        neutralAggression: 0.82,
        baseAggression: 0.25,
        threatReactionChance: 0.45,
        limits: { ground: 1, aa: 2, fighter: 2, strike: 1, sead: 0, heavyAir: 0, awacs: 0, destroyer: 1, landingShip: 1, frigate: 0, ssbn: 0, arsenal: 0, offensive: 2, heliChance: 0.08 }
    },
    NORMAL: {
        playerStartingMoney: 2000,
        aiStartingMoney: 2000,
        researchChance: 1,
        buildChance: 1,
        attackChance: 1,
        neutralAggression: 0.65,
        baseAggression: 0.5,
        threatReactionChance: 0.75,
        limits: { ground: 2, aa: 3, fighter: 3, strike: 3, sead: 1, heavyAir: 1, awacs: 1, destroyer: 2, landingShip: 1, frigate: 1, ssbn: 1, arsenal: 1, offensive: 3, heliChance: 0.22 }
    },
    HARD: {
        playerStartingMoney: 1800,
        aiStartingMoney: 2600,
        researchChance: 1.35,
        buildChance: 1.2,
        attackChance: 1.25,
        neutralAggression: 0.5,
        baseAggression: 0.72,
        threatReactionChance: 0.9,
        limits: { ground: 3, aa: 4, fighter: 4, strike: 4, sead: 2, heavyAir: 2, awacs: 1, destroyer: 3, landingShip: 2, frigate: 2, ssbn: 1, arsenal: 1, offensive: 5, heliChance: 0.34 }
    },
    EXPERT: {
        playerStartingMoney: 1500,
        aiStartingMoney: 3200,
        researchChance: 1.8,
        buildChance: 1.45,
        attackChance: 1.55,
        neutralAggression: 0.35,
        baseAggression: 0.9,
        threatReactionChance: 1,
        limits: { ground: 4, aa: 5, fighter: 5, strike: 5, sead: 2, heavyAir: 2, awacs: 2, destroyer: 3, landingShip: 2, frigate: 2, ssbn: 2, arsenal: 2, offensive: 6, heliChance: 0.45 }
    },
    COMMANDER_EXPERIMENTAL: {
        playerStartingMoney: 1500,
        aiStartingMoney: 3200,
        researchChance: 1.7,
        buildChance: 1.35,
        attackChance: 1.45,
        neutralAggression: 0.42,
        baseAggression: 0.85,
        threatReactionChance: 1,
        commanderEnabled: true,
        plannerCandidateCount: 6,
        plannerReconsiderFrames: 4,
        limits: { ground: 4, aa: 5, fighter: 5, strike: 5, sead: 2, heavyAir: 2, awacs: 2, destroyer: 3, landingShip: 2, frigate: 2, ssbn: 2, arsenal: 2, offensive: 6, heliChance: 0.45 }
    }
};

function getAiDifficultyProfile() {
    return AI_DIFFICULTY_PROFILES[currentAiDifficulty] || AI_DIFFICULTY_PROFILES.NORMAL;
}

function getUnitRadarRange(unit) {
    if (!(unit instanceof Unit) || unit.dead) return 0;
    if (typeof unit.data.radarRange === 'number') return unit.data.radarRange;
    if (unit.data.type === 'ship') return 320;
    if (unit.typeKey === 'AWACS') return 900;
    if (unit.data.type === 'air' || unit.data.type === 'heli') return 260;
    return 0;
}

function getTargetRcs(target) {
    if (target instanceof Unit) return target.data.rcs ?? 1;
    return 1;
}

function isAirborneRadarTarget(target) {
    return target instanceof Unit && (target.data.type === 'air' || target.data.type === 'heli');
}

function canDetectAirTarget(source, target) {
    if (!(source instanceof Unit) || !isAirborneRadarTarget(target)) return false;
    if (target.team === source.team || target.dead) return false;
    const radarRange = getUnitRadarRange(source);
    if (radarRange <= 0) return false;
    return dist(source, target) <= radarRange * getTargetRcs(target);
}

function hasRadarTrackForAirTarget(source, target) {
    if (!(source instanceof Unit) || !(target instanceof Unit)) return false;
    if (!canDetectAirTarget(source, target) && source.data.type !== 'ship') return false;
    if (canDetectAirTarget(source, target)) return true;
    if (source.data.type !== 'ship') return false;
    const friendlies = entities.filter(e => e instanceof Unit && e.team === source.team && !e.dead && e.data.type === 'ship');
    const arsenalShips = friendlies.filter(s => s.typeKey === 'ARSENAL_CRUISER');
    const nearArsenal = arsenalShips.some(a => dist(source, a) <= DATALINK_RANGE);
    if (!nearArsenal) return false;
    const awacsTrack = entities.some(e => e instanceof Unit && e.team === source.team && !e.dead && e.typeKey === 'AWACS' && canDetectAirTarget(e, target));
    if (awacsTrack) return true;
    return friendlies.some(ship => ship !== source && dist(source, ship) <= DATALINK_RANGE && (ship.typeKey === 'ARSENAL_CRUISER' || arsenalShips.some(a => dist(ship, a) <= DATALINK_RANGE)) && canDetectAirTarget(ship, target));
}

function canRadarDetectTarget(source, target) {
    if (!(source instanceof Unit) || !isAirborneRadarTarget(target)) return false;
    if (source.dead || target.dead || source.team === target.team || !target.visible) return false;
    const radarRange = getUnitRadarRange(source);
    if (radarRange <= 0) return false;
    return dist(source, target) <= radarRange * getTargetRcs(target);
}

function updateRadarDetectionPings() {
    if (gameTime === lastRadarPingFrame) return;
    if (lastRadarPingFrame >= 0 && gameTime - lastRadarPingFrame < RADAR_PING_INTERVAL_FRAMES) return;
    lastRadarPingFrame = gameTime;
    radarDetectionBlips = [];

    const radarUnits = entities.filter(e => e instanceof Unit && !e.dead && e.team === TEAM_PLAYER && getUnitRadarRange(e) > 0);
    const hostileAirborne = entities.filter(e => isAirborneRadarTarget(e) && !e.dead && e.team !== TEAM_PLAYER && e.visible);
    radarUnits.forEach(source => {
        hostileAirborne.forEach(target => {
            if (!canRadarDetectTarget(source, target)) return;
            const distanceToTarget = dist(source, target);
            radarDetectionBlips.push({
                sx: source.x,
                sy: source.y,
                tx: target.x,
                ty: target.y,
                targetRadius: target.radius || 10,
                distanceToTarget,
                radarRange: getUnitRadarRange(source) * getTargetRcs(target),
                createdAt: gameTime
            });
        });
    });
}

function drawRadarDetectionWedges(ctx) {
    if (radarDetectionBlips.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    radarDetectionBlips.forEach(blip => {
        const age = Math.max(0, gameTime - blip.createdAt);
        const flash = age < RADAR_PING_FLASH_FRAMES ? 1 - (age / RADAR_PING_FLASH_FRAMES) : 0;
        const alpha = 0.045 + flash * 0.12;
        const heading = Math.atan2(blip.ty - blip.sy, blip.tx - blip.sx);
        const overshoot = Math.max(blip.targetRadius * 2.6, Math.min(70, blip.distanceToTarget * 0.18));
        const farDistance = blip.distanceToTarget + overshoot;
        const farX = blip.sx + Math.cos(heading) * farDistance;
        const farY = blip.sy + Math.sin(heading) * farDistance;
        const halfWidth = Math.max(blip.targetRadius * 1.45, Math.min(32, farDistance * 0.055));
        const sideX = Math.cos(heading + Math.PI * 0.5);
        const sideY = Math.sin(heading + Math.PI * 0.5);
        const gradient = ctx.createLinearGradient(blip.sx, blip.sy, farX, farY);
        const targetStop = Math.max(0.15, Math.min(0.9, blip.distanceToTarget / Math.max(1, farDistance)));
        gradient.addColorStop(0, 'rgba(255, 235, 90, 0)');
        gradient.addColorStop(Math.max(0.05, targetStop * 0.68), `rgba(255, 235, 90, ${alpha * 0.35})`);
        gradient.addColorStop(targetStop, `rgba(255, 235, 90, ${alpha})`);
        gradient.addColorStop(1, 'rgba(255, 235, 90, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(blip.sx, blip.sy);
        ctx.lineTo(farX + sideX * halfWidth, farY + sideY * halfWidth);
        ctx.lineTo(farX - sideX * halfWidth, farY - sideY * halfWidth);
        ctx.closePath();
        ctx.fill();
    });
    ctx.restore();
}

function getArsenalDatalinkGroup(anchor) {
    const friendlyShips = entities.filter(e => e instanceof Unit && !e.dead && e.team === anchor.team && e.data.type === 'ship');
    const visited = new Set([anchor]);
    const stack = [anchor];
    while (stack.length > 0) {
        const current = stack.pop();
        friendlyShips.forEach(ship => {
            if (visited.has(ship)) return;
            if (dist(current, ship) <= DATALINK_RANGE) {
                visited.add(ship);
                stack.push(ship);
            }
        });
    }
    return Array.from(visited);
}

function drawArsenalDatalinkOverlay(ctx) {
    const selectedArsenal = selection.find(u => u instanceof Unit && u.typeKey === 'ARSENAL_CRUISER' && !u.dead);
    if (!selectedArsenal) return;
    const linkedUnits = getArsenalDatalinkGroup(selectedArsenal);
    if (linkedUnits.length < 1) return;

    ctx.save();
    ctx.fillStyle = 'rgba(70, 150, 255, 0.13)';
    linkedUnits.forEach(unit => {
        const radarRange = getUnitRadarRange(unit);
        if (radarRange <= 0) return;
        ctx.beginPath();
        ctx.arc(unit.x, unit.y, radarRange, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(80, 170, 255, 0.9)';
    ctx.lineWidth = 1;
    linkedUnits.forEach((unit, i) => {
        for (let j = i + 1; j < linkedUnits.length; j++) {
            const other = linkedUnits[j];
            if (dist(unit, other) > DATALINK_RANGE) continue;
            ctx.beginPath();
            ctx.moveTo(unit.x, unit.y);
            ctx.lineTo(other.x, other.y);
            ctx.stroke();
        }
    });
    ctx.restore();
}
const CONSTRUCTION_BUILD_OPTIONS = [
    { type: 'AIRPORT', name: 'Airport', cost: 2200, emoji: '🛫' },
    { type: 'SAM_SITE', name: 'SAM Site', cost: 1200, emoji: '📡' },
    { type: 'DEPLOYED_SPAA', name: 'SPAA', cost: 700, emoji: '🔫' },
    { type: 'PORT', name: 'Port', cost: 1400, emoji: '⚓' },
    { type: 'BASE_FORT', name: 'Base Fort', cost: 900, emoji: '🏰' },
    { type: 'DEPLOYED_COASTAL', name: 'Coastal Gun', cost: 900, emoji: '🛡️' },
    { type: 'DEPLOYED_ASHM', name: 'AShM Battery', cost: 1300, emoji: '🚀' },
    { type: 'CIWS_SITE', name: 'CIWS Site', cost: 800, emoji: '🌀' }
];

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

function getCombinedIslandAt(pos, padding = 0) {
    if (!isCombinedMap()) return null;
    return islands.find(i => dist(pos, i) <= i.radius + padding) || null;
}

function isPointOnCombinedRing(pos, padding = 0) {
    if (!isCombinedMap()) return false;
    const ring = getCombinedRingWidth() + padding;
    return pos.x <= ring || pos.x >= worldWidth - ring || pos.y <= ring || pos.y >= worldHeight - ring;
}

function isCombinedLandPoint(pos, padding = 0) {
    if (!isCombinedMap()) return true;
    return isPointOnCombinedRing(pos, padding) || !!getCombinedIslandAt(pos, padding);
}

function getCombinedLandZone(pos) {
    if (!isCombinedMap()) return { type: 'open' };
    if (isPointOnCombinedRing(pos)) return { type: 'ring' };
    const island = getCombinedIslandAt(pos);
    if (island) return { type: 'island', island };
    return { type: 'water' };
}

function projectPointToCombinedRing(pos, margin = 8) {
    const ring = getCombinedRingWidth();
    const left = Math.abs(pos.x - ring);
    const right = Math.abs(pos.x - (worldWidth - ring));
    const top = Math.abs(pos.y - ring);
    const bottom = Math.abs(pos.y - (worldHeight - ring));
    const best = Math.min(left, right, top, bottom);
    if (best === left) return { x: ring - margin, y: Math.max(margin, Math.min(worldHeight - margin, pos.y)) };
    if (best === right) return { x: worldWidth - ring + margin, y: Math.max(margin, Math.min(worldHeight - margin, pos.y)) };
    if (best === top) return { x: Math.max(margin, Math.min(worldWidth - margin, pos.x)), y: ring - margin };
    return { x: Math.max(margin, Math.min(worldWidth - margin, pos.x)), y: worldHeight - ring + margin };
}

function projectPointToIsland(pos, island, margin = 8) {
    const angle = angleTo(island, pos);
    const radius = Math.max(4, island.radius - margin);
    return { x: island.x + Math.cos(angle) * radius, y: island.y + Math.sin(angle) * radius };
}

function getNearestCombinedLandPointForUnit(unit, pos) {
    if (!isCombinedMap()) return pos;
    const zone = getCombinedLandZone(unit);
    if (zone.type === 'island') return projectPointToIsland(pos, zone.island);
    if (zone.type === 'ring') return projectPointToCombinedRing(pos);
    const island = getCombinedIslandAt(pos, 12);
    if (island) return projectPointToIsland(pos, island);
    return projectPointToCombinedRing(pos);
}

function getNearestCombinedWaterPoint(pos, clearance = 18) {
    if (!isCombinedMap()) return pos;
    const ring = getCombinedRingWidth() + clearance;
    let x = Math.max(ring, Math.min(worldWidth - ring, pos.x));
    let y = Math.max(ring, Math.min(worldHeight - ring, pos.y));
    islands.forEach(island => {
        const minDist = island.radius + clearance;
        const dx = x - island.x;
        const dy = y - island.y;
        const d = Math.hypot(dx, dy);
        if (d < minDist) {
            const angle = d > 0.001 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
            x = island.x + Math.cos(angle) * minDist;
            y = island.y + Math.sin(angle) * minDist;
            x = Math.max(ring, Math.min(worldWidth - ring, x));
            y = Math.max(ring, Math.min(worldHeight - ring, y));
        }
    });
    return { x, y };
}

function isCombinedWaterPoint(pos, clearance = 10) {
    if (!isCombinedMap()) return true;
    if (isPointOnCombinedRing(pos, clearance)) return false;
    return !getCombinedIslandAt(pos, clearance);
}

function canGroundUnitReachIsland(unit, island) {
    if (!isCombinedMap() || unit.data?.type !== 'ground') return true;
    const zone = getCombinedLandZone(unit);
    if (zone.type === 'ring') return isPointOnCombinedRing(island);
    if (zone.type === 'island') return zone.island === island;
    return false;
}
function isUnlocked(team, id) { return TEAMS[team] && TEAMS[team].tech.has(id); }
function rectContains(rect, point) {
    let rX = Math.min(rect.x, rect.x + rect.w);
    let rW = Math.abs(rect.w);
    let rY = Math.min(rect.y, rect.y + rect.h);
    let rH = Math.abs(rect.h);
    return point.x >= rX && point.x <= rX + rW && point.y >= rY && point.y <= rY + rH;
}

function getUnitIconAssetPath(unitKey) {
    if (!unitKey || !UNIT_ICON_ASSETS || !UNIT_ICON_ASSETS.units) return null;

    const normalizedKey = String(unitKey).trim();
    const unitAssetMap = UNIT_ICON_ASSETS.units;

    let fileName = unitAssetMap[normalizedKey];
    if (!fileName) {
        const caseInsensitiveKey = Object.keys(unitAssetMap).find(key => key.toUpperCase() === normalizedKey.toUpperCase());
        if (caseInsensitiveKey) fileName = unitAssetMap[caseInsensitiveKey];
    }
    if (!fileName) return null;

    const base = (UNIT_ICON_ASSETS.basePath || 'assets/images/units').replace(/\/$/, '');
    return `${base}/${fileName}`;
}

function getWeaponIconAssetPath(weaponKey) {
    if (!weaponKey || !WEAPON_ICON_ASSETS || !WEAPON_ICON_ASSETS.weapons) return null;

    const normalizedKey = String(weaponKey).trim();
    const weaponAssetMap = WEAPON_ICON_ASSETS.weapons;

    let fileName = weaponAssetMap[normalizedKey];
    if (!fileName) {
        const caseInsensitiveKey = Object.keys(weaponAssetMap).find(key => key.toUpperCase() === normalizedKey.toUpperCase());
        if (caseInsensitiveKey) fileName = weaponAssetMap[caseInsensitiveKey];
    }
    if (!fileName) return null;

    const base = (WEAPON_ICON_ASSETS.basePath || 'assets/images/units').replace(/\/$/, '');
    return `${base}/${fileName}`;
}

function getUnitProfileAssetPath(unitKey) {
    if (!unitKey || !UNIT_PROFILE_ASSETS || !UNIT_PROFILE_ASSETS.units) return null;

    const normalizedKey = String(unitKey).trim();
    const unitAssetMap = UNIT_PROFILE_ASSETS.units;

    let fileName = unitAssetMap[normalizedKey];
    if (!fileName) {
        const caseInsensitiveKey = Object.keys(unitAssetMap).find(key => key.toUpperCase() === normalizedKey.toUpperCase());
        if (caseInsensitiveKey) fileName = unitAssetMap[caseInsensitiveKey];
    }
    if (!fileName) return null;

    const base = (UNIT_PROFILE_ASSETS.basePath || 'assets/images/units').replace(/\/$/, '');
    return `${base}/${fileName}`;
}

const preloadedIconCache = new Map();
function preloadIcons() {
    const iconPaths = new Set();
    if (UNIT_ICON_ASSETS?.units) {
        Object.keys(UNIT_ICON_ASSETS.units).forEach(unitKey => {
            const path = getUnitIconAssetPath(unitKey);
            if (path) iconPaths.add(path);
        });
    }
    if (WEAPON_ICON_ASSETS?.weapons) {
        Object.keys(WEAPON_ICON_ASSETS.weapons).forEach(weaponKey => {
            const path = getWeaponIconAssetPath(weaponKey);
            if (path) iconPaths.add(path);
        });
    }

    iconPaths.forEach(path => {
        if (preloadedIconCache.has(path)) return;
        const img = new Image();
        img.decoding = 'async';
        img.src = path;
        preloadedIconCache.set(path, img);
    });
}

function createIconElement({ emoji, assetPath, alt, className = '' }) {
    const wrapper = document.createElement('span');
    wrapper.className = `icon-wrapper ${className}`.trim();

    const fallback = document.createElement('span');
    fallback.className = 'icon-fallback';
    fallback.textContent = emoji || '🧩';

    if (!assetPath) {
        wrapper.appendChild(fallback);
        return wrapper;
    }

    const img = document.createElement('img');
    img.className = 'icon-image';
    img.alt = alt || 'Icon';
    img.src = assetPath;
    img.loading = 'eager';

    img.onerror = () => {
        if (!wrapper.contains(fallback)) wrapper.appendChild(fallback);
        img.remove();
    };

    wrapper.appendChild(img);
    return wrapper;
}

function getDefaultWeaponAmmo(unit, slot, weaponKey) {
    const def = WEAPONS[weaponKey];
    if (!def) return 0;
    if (def.type === 'GUN' || def.passive) return 9999;
    if (def.type === 'DEPLOY') return def.capacity || 1;
    if (slot && slot.ammoByWeapon && slot.ammoByWeapon[weaponKey] !== undefined) return slot.ammoByWeapon[weaponKey];
    if (weaponKey === 'HELLFIRE' && unit.data.type === 'heli') return 4;
    if (def.ammo !== undefined) return def.ammo;
    if (def.type === 'ROCKET') return 3;
    return 1;
}

function getConfiguredSlotAmmo(unitKey, slotIndex, weaponKey, team = TEAM_PLAYER) {
    const unit = UNIT_TYPES[unitKey];
    if (!unit) return 0;
    const slot = unit.hardpoints[slotIndex];
    if (!slot || !weaponKey || weaponKey === 'EMPTY') return 0;
    const configured = getLoadoutSlotConfig(team, unitKey, slotIndex);
    if (configured?.customAmmoByWeapon && configured.customAmmoByWeapon[weaponKey] !== undefined) {
        return Math.max(1, configured.customAmmoByWeapon[weaponKey]);
    }
    return getDefaultWeaponAmmo({ data: unit }, slot, weaponKey);
}

function cloneUnitLoadout(unitDef) {
    return (unitDef.hardpoints || []).map(slot => ({
        equipped: slot.equipped,
        customAmmoByWeapon: slot.customAmmoByWeapon ? { ...slot.customAmmoByWeapon } : null
    }));
}

const teamUnitLoadoutConfigs = {};

function cloneLoadoutConfig(config) {
    return (config || []).map(slot => ({
        equipped: slot.equipped,
        customAmmoByWeapon: slot.customAmmoByWeapon ? { ...slot.customAmmoByWeapon } : null
    }));
}

function resetTeamLoadoutConfigs() {
    teamUnitLoadoutConfigs[TEAM_PLAYER] = {};
    teamUnitLoadoutConfigs[TEAM_AI] = {};
}

function getTeamUnitLoadout(team, unitKey) {
    if (!teamUnitLoadoutConfigs[team]) teamUnitLoadoutConfigs[team] = {};
    if (!teamUnitLoadoutConfigs[team][unitKey]) {
        teamUnitLoadoutConfigs[team][unitKey] = cloneUnitLoadout(UNIT_TYPES[unitKey]);
    }
    return teamUnitLoadoutConfigs[team][unitKey];
}

function getLoadoutSlotConfig(team, unitKey, slotIndex) {
    return getTeamUnitLoadout(team, unitKey)?.[slotIndex] || null;
}

function getRoadNodeWorldPos(node) {
    if (!node) return null;
    return { x: node.x, y: node.y };
}

function buildPathBetweenRoadNodes(startIdx, endIdx) {
    if (startIdx === endIdx) return [startIdx];
    const open = [startIdx];
    const cameFrom = new Map();
    const gScore = new Map([[startIdx, 0]]);
    const fScore = new Map([[startIdx, dist(roadNodes[startIdx], roadNodes[endIdx])]]);

    while (open.length > 0) {
        let currentPos = 0;
        for (let i = 1; i < open.length; i++) {
            const a = fScore.get(open[i]) ?? Infinity;
            const b = fScore.get(open[currentPos]) ?? Infinity;
            if (a < b) currentPos = i;
        }
        const current = open.splice(currentPos, 1)[0];
        if (current === endIdx) {
            const path = [current];
            let step = current;
            while (cameFrom.has(step)) {
                step = cameFrom.get(step);
                path.unshift(step);
            }
            return path;
        }
        const node = roadNodes[current];
        (node.neighbors || []).forEach(nIdx => {
            let edgeMult = 1.1;
            const edge = landRoads.find(seg => {
                const sa = seg.nodeA === current && seg.nodeB === nIdx;
                const sb = seg.nodeA === nIdx && seg.nodeB === current;
                return sa || sb;
            });
            if (edge?.surface === 'asphalt') edgeMult = 0.75;
            else if (edge?.surface === 'dirt') edgeMult = 1;
            const tentative = (gScore.get(current) ?? Infinity) + dist(roadNodes[current], roadNodes[nIdx]) * edgeMult;
            if (tentative < (gScore.get(nIdx) ?? Infinity)) {
                cameFrom.set(nIdx, current);
                gScore.set(nIdx, tentative);
                fScore.set(nIdx, tentative + dist(roadNodes[nIdx], roadNodes[endIdx]));
                if (!open.includes(nIdx)) open.push(nIdx);
            }
        });
    }
    return null;
}

function getRoadPath(startPos, endPos, unit = null) {
    if (roadNodes.length < 2) return [endPos];
    let startIdx = 0;
    let endIdx = 0;
    let bestStart = Infinity;
    let bestEnd = Infinity;
    const goalDx = endPos.x - startPos.x;
    const goalDy = endPos.y - startPos.y;
    const goalLen = Math.hypot(goalDx, goalDy) || 1;
    roadNodes.forEach((n, idx) => {
        const ds = dist(startPos, n);
        const de = dist(endPos, n);
        const toNodeLen = ds || 1;
        const progressTowardGoal = ((n.x - startPos.x) * goalDx + (n.y - startPos.y) * goalDy) / (toNodeLen * goalLen);
        const behindGoalPenalty = Math.max(0, -progressTowardGoal) * 90;
        const headingPenalty = unit ? Math.max(0, -((n.x - startPos.x) * Math.cos(unit.angle) + (n.y - startPos.y) * Math.sin(unit.angle)) / toNodeLen) * 40 : 0;
        const startScore = ds + behindGoalPenalty + headingPenalty;
        if (startScore < bestStart) { bestStart = startScore; startIdx = idx; }
        if (de < bestEnd) { bestEnd = de; endIdx = idx; }
    });

    const indexPath = buildPathBetweenRoadNodes(startIdx, endIdx);
    if (!indexPath) return [endPos];
    const points = indexPath.map(idx => getRoadNodeWorldPos(roadNodes[idx])).filter(Boolean);
    while (points.length > 1 && dist(startPos, points[0]) < 30) points.shift();
    while (points.length > 1 && dist(startPos, points[1]) + 8 < dist(startPos, points[0])) points.shift();
    points.push({ x: endPos.x, y: endPos.y });
    return points;
}

function distPointToSegment(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abLenSq = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / abLenSq));
    const proj = { x: a.x + abx * t, y: a.y + aby * t };
    return dist(p, proj);
}

function getGroundRoadSpeedMultiplier(unit) {
    if (!hasRoadNetworkTerrain() || landRoads.length === 0) return 1;
    let nearest = Infinity;
    landRoads.forEach(seg => { nearest = Math.min(nearest, distPointToSegment(unit, seg.a, seg.b)); });
    if (nearest < 14) return 2.0;
    if (nearest < 30) return 1.5;
    return 1;
}

function buildLandRoadNetwork() {
    landRoads.length = 0;
    roadNodes.length = 0;
    if (islands.length < 2) return;
    const addNode = (x, y) => {
        roadNodes.push({ x, y, neighbors: [] });
        return roadNodes.length - 1;
    };
    const connect = (aIdx, bIdx, surface = 'dirt') => {
        if (aIdx === bIdx || aIdx < 0 || bIdx < 0) return;
        if (!roadNodes[aIdx].neighbors.includes(bIdx)) roadNodes[aIdx].neighbors.push(bIdx);
        if (!roadNodes[bIdx].neighbors.includes(aIdx)) roadNodes[bIdx].neighbors.push(aIdx);
        landRoads.push({ a: getRoadNodeWorldPos(roadNodes[aIdx]), b: getRoadNodeWorldPos(roadNodes[bIdx]), surface, nodeA: aIdx, nodeB: bIdx });
    };

    const leftBase = islands.find(i => i.isMainBase && i.owner === TEAM_PLAYER) || islands[0];
    const rightBase = islands.find(i => i.isMainBase && i.owner === TEAM_AI) || islands[islands.length - 1];
    const mainCount = Math.max(10, Math.floor(worldWidth / 260));
    const amp = Math.max(90, worldHeight * 0.15);
    const phase = Math.random() * Math.PI * 2;
    let prevMain = -1;
    const mainRoadNodes = [];

    for (let i = 0; i <= mainCount; i++) {
        const t = i / mainCount;
        const x = leftBase.x + (rightBase.x - leftBase.x) * t;
        const centerY = worldHeight * 0.5 + Math.sin((t * Math.PI * 2.1) + phase) * amp * (0.7 + 0.3 * Math.sin(t * Math.PI));
        const y = i === 0 ? leftBase.y : (i === mainCount ? rightBase.y : Math.max(70, Math.min(worldHeight - 70, centerY)));
        const idx = addNode(x, y);
        mainRoadNodes.push(idx);
        if (prevMain !== -1) connect(prevMain, idx, 'asphalt');
        prevMain = idx;
    }

    islands.forEach(isl => {
        let closestMain = mainRoadNodes[0];
        let best = Infinity;
        mainRoadNodes.forEach(idx => {
            const d = dist(isl, roadNodes[idx]);
            if (d < best) { best = d; closestMain = idx; }
        });
        const branchStart = roadNodes[closestMain];
        const mid = addNode((branchStart.x + isl.x) / 2 + (Math.random() - 0.5) * 40, (branchStart.y + isl.y) / 2 + (Math.random() - 0.5) * 40);
        const end = addNode(isl.x, isl.y);
        connect(closestMain, mid, 'dirt');
        connect(mid, end, 'dirt');
    });
}

function buildCombinedRoadNetwork() {
    landRoads.length = 0;
    roadNodes.length = 0;
    const ring = getCombinedRingWidth();
    const inset = ring * 0.5;
    const left = inset;
    const right = worldWidth - inset;
    const top = inset;
    const bottom = worldHeight - inset;

    const addNode = (x, y) => {
        roadNodes.push({ x, y, neighbors: [] });
        return roadNodes.length - 1;
    };
    const connect = (aIdx, bIdx, surface = 'asphalt') => {
        if (aIdx === bIdx || aIdx < 0 || bIdx < 0) return;
        if (!roadNodes[aIdx].neighbors.includes(bIdx)) roadNodes[aIdx].neighbors.push(bIdx);
        if (!roadNodes[bIdx].neighbors.includes(aIdx)) roadNodes[bIdx].neighbors.push(aIdx);
        landRoads.push({ a: getRoadNodeWorldPos(roadNodes[aIdx]), b: getRoadNodeWorldPos(roadNodes[bIdx]), surface, nodeA: aIdx, nodeB: bIdx });
    };

    const perimeter = [
        addNode(left, top),
        addNode(worldWidth * 0.5, top),
        addNode(right, top),
        addNode(right, worldHeight * 0.5),
        addNode(right, bottom),
        addNode(worldWidth * 0.5, bottom),
        addNode(left, bottom),
        addNode(left, worldHeight * 0.5)
    ];
    for (let i = 0; i < perimeter.length; i++) connect(perimeter[i], perimeter[(i + 1) % perimeter.length], 'asphalt');

    islands.forEach(isl => {
        const onRing = isl.x < ring || isl.x > worldWidth - ring || isl.y < ring || isl.y > worldHeight - ring;
        if (!onRing) return;
        let closest = perimeter[0];
        let best = Infinity;
        perimeter.forEach(idx => {
            const d = dist(isl, roadNodes[idx]);
            if (d < best) { best = d; closest = idx; }
        });
        const end = addNode(isl.x, isl.y);
        connect(closest, end, 'dirt');
    });
}

function spawnSoldierSquad(team, x, y) {
    const leader = new Unit(x, y, team, 'SOLDIER_SQUAD');
    entities.push(leader);
    const members = ['SQUAD_AT', 'SQUAD_AA', 'SQUAD_ASSISTANT'];
    leader.convoyMembers = [];
    members.forEach((typeKey, idx) => {
        const side = idx % 2 === 0 ? -1 : 1;
        const depth = idx === 2 ? 2 : 1;
        const m = new Unit(x - depth * 10, y + side * 7, team, typeKey);
        m.convoyLeaderId = leader.id;
        entities.push(m);
        leader.convoyMembers.push(m.id);
    });
    return leader;
}

function findNearestFriendlyAirport(unit, searchRange = 120) {
    let nearestAirport = null;
    let minDistance = searchRange;
    islands.forEach(i => {
        if (i.owner !== unit.team) return;
        i.buildings.forEach(b => {
            if (b.type !== 'AIRPORT' || b.dead) return;
            const d = dist(unit, b);
            if (d < minDistance) {
                minDistance = d;
                nearestAirport = b;
            }
        });
    });
    return nearestAirport;
}

function findNearestFriendlyPort(unit, searchRange = 80) {
    let nearestPort = null;
    let minDistance = searchRange;
    islands.forEach(i => {
        if (i.owner !== unit.team) return;
        i.buildings.forEach(b => {
            if (b.type !== 'PORT' || b.dead) return;
            const d = dist(unit, b);
            if (d < minDistance) {
                minDistance = d;
                nearestPort = b;
            }
        });
    });
    return nearestPort;
}

function getIslandDefenseSpawn(island, index, total, radiusFactor = 0.55) {
    const angle = (-Math.PI / 3) + (index / Math.max(1, total)) * (Math.PI * 2 / 3);
    const r = island.radius * radiusFactor;
    return {
        x: island.x + Math.cos(angle) * r,
        y: island.y + Math.sin(angle) * r
    };
}

function createPortBuilding(island, team, angle = Math.random() * Math.PI * 2) {
    const r = island.radius * 1.02;
    const x = island.x + Math.cos(angle) * r;
    const y = island.y + Math.sin(angle) * r;
    const port = new Building(x, y, team, 'PORT');
    port.dockAngle = angle;
    return port;
}

function isWeaponAllowedForSlot(unitDef, slot, weaponKey) {
    if (!slot || !weaponKey || !WEAPONS[weaponKey]) return false;
    if (weaponKey === 'EMPTY') return true;
    const w = WEAPONS[weaponKey];
    if (!slot.types.includes(w.type)) return false;
    if (slot.allowedWeapons && !slot.allowedWeapons.includes(weaponKey)) return false;

    if (w.type === 'GUN' && (weaponKey === 'RAILGUN' || weaponKey === 'CANNON_127MM')) {
        const isAllowedPlatform = unitDef.type === 'ship' || unitDef.role === 'Gunship' || (unitDef.name && unitDef.name.includes('AC-130'));
        if (!isAllowedPlatform) return false;
    }

    const isArmorGun = unitDef.role === 'Armor' && ['CANNON_127MM', 'RAILGUN'].includes(weaponKey);
    if (unitDef.type === 'ground' && w.type === 'GUN' && !['RIFLE', 'GUN_BASIC', 'VULCAN', 'CIWS'].includes(weaponKey) && !isArmorGun) return false;
    return true;
}

function pickBestUnlockedWeaponForSlot(team, unitDef, slot, currentEquipped = slot.equipped) {
    const candidates = Object.keys(WEAPONS).filter(k => {
        return isUnlocked(team, k) && isWeaponAllowedForSlot(unitDef, slot, k);
    });
    if (candidates.length === 0) return currentEquipped;

    let best = currentEquipped;
    let bestScore = -Infinity;
    candidates.forEach(k => {
        const w = WEAPONS[k];
        let score = (w.damage || 0) * 3 + (w.range || 0) * 0.25;
        if (unitDef.role === 'AA' && w.type.includes('AAM')) score += 180;
        if (unitDef.role === 'SEAD' && (k === 'ARAD' || w.type === 'ECM')) score += 220;
        if (unitDef.type === 'ship' && w.type === 'CRUISE') score += 60;
        if (w.type === 'ECM') score += 25;
        if (k === 'SIDEWINDER' && unitDef.role === 'AA') score += 120;
        if (score > bestScore) { bestScore = score; best = k; }
    });
    return best;
}

function autoOptimizeTeamLoadouts(team) {
    Object.entries(UNIT_TYPES).forEach(([unitKey, unitDef]) => {
        if (!unitDef.hardpoints) return;
        const teamLoadout = getTeamUnitLoadout(team, unitKey);
        unitDef.hardpoints.forEach((slot, slotIndex) => {
            if (!slot.types || slot.types.length === 0) return;
            const current = teamLoadout[slotIndex]?.equipped || slot.equipped;
            const next = pickBestUnlockedWeaponForSlot(team, unitDef, slot, current);
            if (next && next !== 'EMPTY') teamLoadout[slotIndex].equipped = next;
        });
    });
    entities.forEach(e => {
        if (!(e instanceof Unit) || e.team !== team) return;
        if (team === TEAM_AI || isSpectator) {
            e.loadoutConfig = cloneLoadoutConfig(getTeamUnitLoadout(team, e.typeKey));
            e.initLoadout();
        }
    });
}

// --- Classes ---

class Island {
    constructor(x, y, r, isMainBase = false) {
        this.x = x; this.y = y; this.radius = r; this.isMainBase = isMainBase;
        this.poly = [];
        for(let i=0; i<12; i++) {
            const theta = (i / 12) * Math.PI * 2;
            const rad = r * (0.8 + Math.random() * 0.4);
            this.poly.push({x: x + Math.cos(theta)*rad, y: y + Math.sin(theta)*rad});
        }
        this.owner = TEAM_NEUTRAL; this.captureProgress = 0; this.buildings = [];
    }
    draw(ctx) {
        if(hasRoadNetworkTerrain()) {
            // Outpost style
             ctx.fillStyle = this.owner === TEAM_NEUTRAL ? '#5a5a4a' : (this.owner === TEAM_PLAYER ? '#4a5b6c' : '#6c4a4a');
        } else {
             // Island style
             ctx.fillStyle = this.owner === TEAM_NEUTRAL ? '#4a7c4a' : (this.owner === TEAM_PLAYER ? '#4a6b7c' : '#7c4a4a');
        }

        ctx.beginPath(); ctx.moveTo(this.poly[0].x, this.poly[0].y);
        for(let p of this.poly) ctx.lineTo(p.x, p.y);
        ctx.closePath(); ctx.fill(); 
        
        ctx.strokeStyle = hasRoadNetworkTerrain() ? '#222' : '#355235';
        ctx.stroke();

        if (this.buildings.length > 0) {
            ctx.fillStyle = '#333'; ctx.fillRect(this.x - 20, this.y - 10, 40, 20);
            ctx.strokeStyle = '#555'; ctx.beginPath(); ctx.moveTo(this.x-15, this.y); ctx.lineTo(this.x+15, this.y); ctx.stroke();
        }
        if (this.captureProgress > 0) {
            ctx.fillStyle = '#111';
            ctx.fillRect(this.x - 24, this.y - this.radius - 14, 48, 6);
            ctx.fillStyle = this.owner === TEAM_PLAYER ? COLORS[TEAM_AI] : COLORS[TEAM_PLAYER];
            ctx.fillRect(this.x - 24, this.y - this.radius - 14, 48 * Math.min(1, this.captureProgress / 100), 6);
            ctx.strokeStyle = '#ddd';
            ctx.strokeRect(this.x - 24, this.y - this.radius - 14, 48, 6);
        }
    }
}

class Entity {
    constructor(x, y, team) {
        this.x = x; this.y = y; this.team = team;
        this.id = nextEntityId++;
        this.dead = false; this.hp = 100; this.maxHp = 100;
        this.radius = 10; this.angle = 0; this.visible = true; 
    }
    takeDamage(amount) {
        if (isNaN(amount) || amount === undefined || amount === null) return;
        this.hp -= amount;
        if (this.hp <= 0) {
            this.hp = 0;
            this.dead = true;
            createExplosion(this.x, this.y, this.radius * 2);
        }
    }
}

class Building extends Entity {
    constructor(x, y, team, type) {
        super(x, y, team);
        this.type = type; this.stats = BUILDINGS[type];
        this.hp = this.stats.hp; this.maxHp = this.stats.hp;
        this.cooldown = 0; this.radius = 15;
    }
    update() {
        if (this.dead) return;
        if (this.type === 'PORT') return;
        if (this.type === 'CONSTRUCTION_YARD') {
            if (gameTime % 20 === 0) {
                entities.forEach(e => {
                    if (e.team === this.team && e.data && e.data.type === 'ground' && !e.dead && dist(this, e) < this.stats.range) {
                        e.hp = Math.min(e.maxHp, e.hp + 2);
                    }
                });
            }
            return;
        }
        if (!this.stats.range || !this.stats.damage || !this.stats.reload) return;
        if (this.cooldown > 0) this.cooldown -= SPEED_SCALE;
        let validTypes = (this.type.includes('COASTAL') || this.type.includes('ASHM')) ? ['ship'] : ['air', 'heli', 'cruise'];
        if (this.team === TEAM_NEUTRAL) return; 
        
        let target = null;
        
        // Priority check for STRIKE zones
        const teamZones = TEAMS[this.team].zones;
        const strikeZone = teamZones.find(z => z.type === 'STRIKE');
        
        if (strikeZone && (this.type.includes('ASHM') || this.type === 'SAM_SITE' || this.type === 'DEPLOYED_MANPADS')) {
             target = entities.find(e => e.team !== this.team && !e.dead && e.visible && rectContains(strikeZone, e) && isValidTarget(e, validTypes) && dist(this, e) <= this.stats.range);
        }

        if (!target) target = findTarget(this, this.stats.range, validTypes);
        
        if (target && this.cooldown <= 0) {
            let leadX = target.x, leadY = target.y;
            if (target instanceof Unit && (target.data.type === 'air' || target.data.type === 'heli')) {
                const speed = 12; const distToTarget = dist(this, target); const timeToImpact = distToTarget / speed;
                leadX = target.x + Math.cos(target.angle) * target.data.speed * SPEED_SCALE * timeToImpact;
                leadY = target.y + Math.sin(target.angle) * target.data.speed * SPEED_SCALE * timeToImpact;
            }

            if (this.type === 'SAM_SITE' || this.type === 'DEPLOYED_MANPADS' || this.type === 'DEPLOYED_ASHM') {
                const sam = new Missile(this.x, this.y, target, this.team, this.stats.damage, this.type.includes('SAM') || this.type.includes('MANPADS'));
                if (this.type === 'SAM_SITE') {
                    sam.damage = WEAPONS.LRAAM.damage;
                    sam.baseSpeed = WEAPONS.LRAAM.speed;
                    sam.turnRate = WEAPONS.LRAAM.turn || sam.turnRate;
                    sam.guidanceType = 'radar';
                }
                projectiles.push(sam); 
            } else {
                projectiles.push(new Bullet(this.x, this.y, {x: leadX, y: leadY}, this.team, this.stats.damage));
            }
            this.cooldown = this.stats.reload;
        }
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y);
        if (this.hp < this.maxHp) { ctx.fillStyle = 'red'; ctx.fillRect(-10, -20, 20, 4); ctx.fillStyle = '#0f0'; ctx.fillRect(-10, -20, 20 * (this.hp/this.maxHp), 4); }
        if (this.type === 'AIRPORT') { ctx.fillStyle = '#222'; ctx.fillRect(-15, -15, 30, 30); ctx.fillStyle = COLORS[this.team]; ctx.font = '20px Arial'; ctx.fillText('H', -7, 7); } 
        else if (this.type === 'SAM_SITE') { ctx.fillStyle = '#2f3238'; ctx.fillRect(-11, -11, 22, 22); ctx.strokeStyle = '#8ad3ff'; ctx.strokeRect(-11, -11, 22, 22); ctx.beginPath(); ctx.moveTo(-2, 8); ctx.lineTo(7, -8); ctx.stroke(); }
        else if (this.type === 'SPAA' || this.type === 'DEPLOYED_SPAA' || this.type === 'CIWS_SITE') { ctx.fillStyle = '#3d3f42'; ctx.fillRect(-9, -9, 18, 18); ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, -5); ctx.moveTo(0, 0); ctx.lineTo(10, 5); ctx.stroke(); }
        else if (this.type === 'PORT') {
            const parentIsland = islands.find(i => dist(this, i) < i.radius * 1.4);
            const outAngle = this.dockAngle !== undefined ? this.dockAngle : (parentIsland ? angleTo(parentIsland, this) : 0);
            const nx = Math.cos(outAngle), ny = Math.sin(outAngle);
            const tx = -Math.sin(outAngle), ty = Math.cos(outAngle);
            const innerLen = 10, prongLen = 22, prongSpacing = 8;
            const cx = -nx * innerLen * 0.5, cy = -ny * innerLen * 0.5;
            ctx.strokeStyle = '#c8d3dd';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cx - tx * prongSpacing, cy - ty * prongSpacing);
            ctx.lineTo(cx + tx * prongSpacing, cy + ty * prongSpacing);
            ctx.stroke();
            ctx.strokeStyle = '#9fb2c3';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(cx - tx * prongSpacing, cy - ty * prongSpacing);
            ctx.lineTo(cx - tx * prongSpacing + nx * prongLen, cy - ty * prongSpacing + ny * prongLen);
            ctx.moveTo(cx + tx * prongSpacing, cy + ty * prongSpacing);
            ctx.lineTo(cx + tx * prongSpacing + nx * prongLen, cy + ty * prongSpacing + ny * prongLen);
            ctx.stroke();
            ctx.fillStyle = '#2f4f67';
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        else if (this.type === 'CONSTRUCTION_YARD') {
            ctx.fillStyle = '#6d5f3f';
            ctx.fillRect(-12, -10, 24, 20);
            ctx.strokeStyle = '#dbb65d';
            ctx.lineWidth = 2;
            ctx.strokeRect(-12, -10, 24, 20);
            ctx.beginPath();
            ctx.moveTo(-8, 6); ctx.lineTo(8, -6);
            ctx.moveTo(-2, 10); ctx.lineTo(10, -2);
            ctx.stroke();
        }
        else if (this.type === 'BASE_FORT') {
            ctx.fillStyle = '#4d4d52';
            ctx.fillRect(-11, -9, 22, 18);
            ctx.fillStyle = COLORS[this.team];
            ctx.fillRect(-9, -7, 18, 4);
        }
        else if (this.type.includes('COASTAL')) { ctx.fillStyle = '#443'; ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(15,0); ctx.stroke(); } 
        else if (this.type.includes('ASHM')) { ctx.fillStyle = '#444'; ctx.fillRect(-10,-10,20,20); ctx.fillStyle = '#f00'; ctx.fillRect(-5,-5,10,10); } 
        else { ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = COLORS[this.team]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, -10); ctx.stroke(); }
        ctx.restore();
    }
}

function buildFromConstructionYard(yard, buildType) {
    if (!yard || yard.type !== 'CONSTRUCTION_YARD' || yard.team !== TEAM_PLAYER || yard.dead || isSpectator) return;
    const option = CONSTRUCTION_BUILD_OPTIONS.find(o => o.type === buildType);
    if (!option || TEAMS[TEAM_PLAYER].money < option.cost) return;
    const island = islands.find(i => i.owner === TEAM_PLAYER && dist(i, yard) <= i.radius * 1.3);
    if (!island || island.buildings.length >= 10) return;

    const angle = Math.random() * Math.PI * 2;
    const r = island.radius * (0.38 + Math.random() * 0.4);
    const x = island.x + Math.cos(angle) * r;
    const y = island.y + Math.sin(angle) * r;
    if (island.buildings.some(b => Math.hypot(b.x - x, b.y - y) < 22)) return;

    TEAMS[TEAM_PLAYER].money -= option.cost;
    const newBuilding = buildType === 'PORT' ? createPortBuilding(island, TEAM_PLAYER) : new Building(x, y, TEAM_PLAYER, buildType);
    island.buildings.push(newBuilding);
    addParticle(newBuilding.x, newBuilding.y, 'text', `BUILT ${option.name.toUpperCase()}`);
    document.getElementById('money-display').innerText = '$' + Math.floor(TEAMS[TEAM_PLAYER].money);
}

function openConstructionMenu(yard) {
    if (!yard || yard.type !== 'CONSTRUCTION_YARD' || yard.team !== TEAM_PLAYER || yard.dead || isSpectator) return;
    constructionContext = { yardId: yard.id, selectedBuildType: null };
    const container = document.getElementById('construction-menu');
    container.innerHTML = '';
    CONSTRUCTION_BUILD_OPTIONS.forEach(opt => {
        const afford = TEAMS[TEAM_PLAYER].money >= opt.cost;
        const btn = document.createElement('div');
        btn.className = `construction-option ${afford ? '' : 'disabled'}`;
        btn.innerHTML = `<div class="left">${createIconElement({ emoji: opt.emoji, assetPath: getUnitIconAssetPath(opt.type), alt: opt.name, className: 'icon-medium' }).outerHTML}<div>${opt.name}</div></div><div style="color:#ffd700;">$${opt.cost}</div>`;
        if (afford) {
            btn.onclick = () => {
                constructionContext.selectedBuildType = opt.type;
                closeConstructionMenu(false);
            };
        }
        container.appendChild(btn);
    });
    openModal('construction-modal');
}

function closeConstructionMenu(clearSelection = true) {
    if (clearSelection) constructionContext.selectedBuildType = null;
    document.getElementById('construction-modal').style.display = 'none';
}

function openConstructionMenuById(yardId) {
    const yard = islands.flatMap(i => i.buildings).find(b => b.id === yardId);
    openConstructionMenu(yard);
}

function tryPlaceSelectedConstructionAt(worldX, worldY) {
    if (!constructionContext.selectedBuildType || !constructionContext.yardId) return false;
    const yard = islands.flatMap(i => i.buildings).find(b => b.id === constructionContext.yardId && !b.dead);
    const option = CONSTRUCTION_BUILD_OPTIONS.find(o => o.type === constructionContext.selectedBuildType);
    if (!yard || !option || TEAMS[TEAM_PLAYER].money < option.cost) return false;
    const island = islands.find(i => i.owner === TEAM_PLAYER && Math.hypot(i.x - worldX, i.y - worldY) <= i.radius);
    if (!island || island.buildings.length >= 10 || island.buildings.some(b => Math.hypot(b.x - worldX, b.y - worldY) < 22)) return false;

    TEAMS[TEAM_PLAYER].money -= option.cost;
    const newBuilding = option.type === 'PORT'
        ? createPortBuilding(island, TEAM_PLAYER, angleTo(island, { x: worldX, y: worldY }))
        : new Building(worldX, worldY, TEAM_PLAYER, option.type);
    island.buildings.push(newBuilding);
    document.getElementById('money-display').innerText = '$' + Math.floor(TEAMS[TEAM_PLAYER].money);
    addParticle(worldX, worldY, 'text', `BUILT ${option.name.toUpperCase()}`);
    constructionContext.selectedBuildType = null;
    constructionContext.yardId = null;
    return true;
}

class Unit extends Entity {
    constructor(x, y, team, typeKey) {
        super(x, y, team);
        this.data = UNIT_TYPES[typeKey];
        this.typeKey = typeKey;
        this.loadoutConfig = cloneLoadoutConfig(getTeamUnitLoadout(team, typeKey));
        this.hp = this.data.hp; this.maxHp = this.data.hp;
        this.fuel = this.data.fuel;
        this.hasCommand = false;
        this.fireTimer = 0; 
        this.takeoffTimer = (this.data.type === 'air' || this.data.type === 'heli') ? 120 : 0;
        this.isExtending = false; 
        this.extendTimer = 0;

        this.initLoadout();

        this.targetPos = { x: x, y: y }; this.targetUnit = null; this.state = 'IDLE'; this.rtb = false; 
        this.transportMission = null;
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.orbitDir = Math.random() < 0.5 ? 1 : -1;
        this.turnBoost = 1;
        this.cooldownBoost = 1;
        this.pathNodes = null;
        this.pathIndex = 0;
        this.convoyMembers = [];
        this.convoyLeaderId = null;
        this.isConvoyLead = typeKey === 'CONVOY';
        this.convoyTrail = [];
    }

    initLoadout() {
        this.weapons = [];
        this.data.hardpoints.forEach((slot, slotIndex) => {
            const configured = this.loadoutConfig?.[slotIndex];
            let wKey = configured?.equipped ?? slot.equipped;
            if (this.team === TEAM_AI || (this.team === TEAM_PLAYER && isSpectator)) {
               let best = WEAPONS[wKey];
               if(!best) best = WEAPONS['EMPTY'];
               Object.keys(WEAPONS).forEach(k => {
                   const w = WEAPONS[k];
                   if (isUnlocked(this.team, k) && isWeaponAllowedForSlot(this.data, slot, k)) {
                       if (w.damage > best.damage || (w.type === 'ECM' && k === 'JAMMER_POD')) {
                           best = w;
                           wKey = k;
                       }
                   }
               });
            }
            if (wKey && wKey !== 'EMPTY') {
                const def = WEAPONS[wKey];
                let ammoCount = getDefaultWeaponAmmo(this, slot, wKey);
                if (configured?.customAmmoByWeapon && configured.customAmmoByWeapon[wKey] !== undefined) {
                    ammoCount = Math.max(1, configured.customAmmoByWeapon[wKey]);
                }
                this.weapons.push({
                    def: def,
                    hardpointIndex: slotIndex,
                    cooldown: 0,
                    ammo: ammoCount,
                    maxAmmo: ammoCount,
                    burstCount: 0,
                    burstTimer: 0,
                    pendingSalvo: 0,
                    salvoTimer: 0,
                    jammedTargets: []
                });
            }
        });
    }

    update() {
        if (this.dead) return;
        const cooldownScale = SPEED_SCALE * (this.cooldownBoost || 1);
        if (this.fireTimer > 0) this.fireTimer -= cooldownScale;
        if (this.takeoffTimer > 0) this.takeoffTimer -= cooldownScale;

        this.isSquadFollower = false;
        if (this.convoyLeaderId) {
            const leader = entities.find(e => e.id === this.convoyLeaderId && !e.dead);
            if (leader) {
                const idx = (leader.convoyMembers || []).indexOf(this.id);
                const columnIndex = Math.max(0, idx) + 1;
                const isSquadLeader = leader.typeKey === 'SOLDIER_SQUAD';
                this.isSquadFollower = isSquadLeader;
                const trailStep = isSquadLeader ? 2 : 14;
                const trailPos = (leader.convoyTrail && leader.convoyTrail.length > 0)
                    ? leader.convoyTrail[Math.min(leader.convoyTrail.length - 1, columnIndex * trailStep)]
                    : { x: leader.x - Math.cos(leader.angle) * (columnIndex * 30), y: leader.y - Math.sin(leader.angle) * (columnIndex * 30), angle: leader.angle };
                let desired = { x: trailPos.x, y: trailPos.y };
                if (isSquadLeader) {
                    const veeOffsets = [
                        { back: 5, side: -6 },
                        { back: 5, side: 6 },
                        { back: 10, side: 0 }
                    ];
                    const off = veeOffsets[Math.max(0, idx)] || { back: 10, side: 0 };
                    desired = {
                        x: leader.x - Math.cos(leader.angle) * off.back - Math.sin(leader.angle) * off.side,
                        y: leader.y - Math.sin(leader.angle) * off.back + Math.cos(leader.angle) * off.side
                    };
                    this.targetPos = desired;
                } else {
                    this.x += (desired.x - this.x) * 0.24;
                    this.y += (desired.y - this.y) * 0.24;
                    let dA = (trailPos.angle ?? leader.angle) - this.angle;
                    while (dA < -Math.PI) dA += Math.PI * 2;
                    while (dA > Math.PI) dA -= Math.PI * 2;
                    this.angle += dA * 0.25;
                }
                this.state = leader.state;
                this.targetUnit = leader.targetUnit;
                this.hasCommand = true;
                this.rtb = false;

                if (!isSquadLeader) {
                    if (!this.targetUnit || this.targetUnit.dead || dist(this, this.targetUnit) > 260) {
                        this.targetUnit = findTarget(this, 260, this.getValidTargetTypes());
                        leader.targetUnit = this.targetUnit || leader.targetUnit;
                    }
                    if (this.targetUnit && !this.targetUnit.dead) {
                        this.weapons.forEach(w => {
                            if (w.ammo > 0 && w.cooldown <= 0 && dist(this, this.targetUnit) <= (w.def.range || 0)) {
                                this.fireWeapon(w, this.targetUnit);
                            }
                        });
                    }
                    return;
                }
            } else {
                this.convoyLeaderId = null;
            }
        }
        if (this.isConvoyLead) {
            this.convoyTrail.unshift({ x: this.x, y: this.y, angle: this.angle });
            if (this.convoyTrail.length > 180) this.convoyTrail.length = 180;
        }

        if (this.typeKey === 'PILE_DRIVER_TBM_UNIT') {
            if (!this.targetPos) { this.dead = true; return; }
            const startX = this.launchX ?? this.x;
            const startY = this.launchY ?? this.y;
            const totalD = Math.hypot(this.targetPos.x - startX, this.targetPos.y - startY) || 1;
            this.tbmProgress = (this.tbmProgress || 0) + ((this.data.speed * SPEED_SCALE) / totalD);
            const p = Math.min(1, this.tbmProgress);
            const arc = Math.sin(p * Math.PI) * 180;
            this.x = startX + (this.targetPos.x - startX) * p;
            this.y = startY + (this.targetPos.y - startY) * p - arc;
            this.angle = angleTo(this, this.targetPos);
            if (p >= 1 || dist(this, this.targetPos) < 16) {
                this.dead = true;
                createExplosion(this.targetPos.x, this.targetPos.y, 85);
                entities.forEach(e => { if (e.team !== this.team && dist(this.targetPos, e) < 85) e.takeDamage(420); });
                islands.forEach(i => { i.buildings.forEach(b => { if (b.team !== this.team && dist(this.targetPos, b) < 85) b.takeDamage(420); }); });
            }
            if (gameTime % 7 === 0) addParticle(this.x, this.y, 'smoke_light');
            return;
        }

        if (this.typeKey === 'CRUISE_MISSILE_UNIT' || this.typeKey === 'HYPERSONIC_ASHM_UNIT') {
            this.hp -= (this.typeKey === 'HYPERSONIC_ASHM_UNIT' ? 0.02 : 0.01) * SPEED_SCALE; 
            if (this.hp <= 0) this.dead = true;
            if (this.targetPos) {
                 const targetAngle = angleTo(this, this.targetPos);
                 this.angle = targetAngle;
                 const targetDistance = dist(this, this.targetPos);
                 if (this.typeKey === 'HYPERSONIC_ASHM_UNIT' && targetDistance < 220) {
                    const weave = Math.sin(gameTime * 0.35 + this.x * 0.01 + this.y * 0.01) * 0.32;
                    this.angle += weave;
                 }
                 this.x += Math.cos(this.angle) * this.data.speed * SPEED_SCALE;
                 this.y += Math.sin(this.angle) * this.data.speed * SPEED_SCALE;
                 if (dist(this, this.targetPos) < 20) {
                     this.dead = true;
                     const blastRadius = this.typeKey === 'HYPERSONIC_ASHM_UNIT' ? 70 : 60;
                     const blastDamage = this.typeKey === 'HYPERSONIC_ASHM_UNIT' ? 360 : 300;
                     createExplosion(this.x, this.y, blastRadius);
                     entities.forEach(e => { if (e.team !== this.team && dist(this, e) < blastRadius) e.takeDamage(blastDamage); });
                     islands.forEach(i => { i.buildings.forEach(b => { if (b.team !== this.team && dist(this, b) < blastRadius) b.takeDamage(blastDamage); }); });
                 }
            }
            if (this.typeKey === 'HYPERSONIC_ASHM_UNIT' && gameTime % 6 === 0) addParticle(this.x, this.y, 'smoke_light');
            if (this.typeKey === 'CRUISE_MISSILE_UNIT' && gameTime % 8 === 0) addParticle(this.x, this.y, 'smoke_light');
            return; 
        }

        if (this.data.type === 'air' || this.data.type === 'heli') {
            if (this.state !== 'LANDED') this.fuel -= SPEED_SCALE;
            if (this.fuel <= 0) { this.takeDamage(this.maxHp); return; }
            const expendableWeapons = this.weapons.filter(w => !w.def.passive && w.def.type !== 'GUN' && w.def.type !== 'DEPLOY');
            let needsAmmo = expendableWeapons.length > 0 && expendableWeapons.every(w => w.ammo === 0);
            if (needsAmmo && this.typeKey === 'TRANSPORT' && this.weapons.some(w=>w.def.type==='DEPLOY')) needsAmmo = true; 
            if ((this.fuel < this.data.fuel * 0.3 || needsAmmo) && !this.rtb) { this.rtb = true; this.findBase(); }
        }

        if (this.data.type === 'ship') {
            const port = findNearestFriendlyPort(this, 75);
            if (port) {
                this.hp = Math.min(this.maxHp, this.hp + 0.8 * SPEED_SCALE);
                if (gameTime % 45 === 0) {
                    this.weapons.forEach(w => {
                        if (!w.def.passive && w.def.type !== 'GUN' && w.ammo < w.maxAmmo) w.ammo++;
                    });
                }
            }
        }

        if (this.rtb && this.base && dist(this, this.base) < 30) { if (this.state !== 'LANDED') { this.state = 'LANDED'; this.initLoadout(); } }

        if (this.state === 'LANDED') {
            this.visible = false; 
            this.fuel = Math.min(this.fuel + 5 * SPEED_SCALE, this.data.fuel);
            this.hp = Math.min(this.hp + 1 * SPEED_SCALE, this.maxHp);
            this.weapons.forEach(w => {
                if (w.def.type === 'DEPLOY') {
                    if (w.ammo < w.maxAmmo && TEAMS[this.team].money >= 100 && gameTime % 30 === 0) {
                        TEAMS[this.team].money -= 100; w.ammo++; addParticle(this.x, this.y, 'text', '+' + w.def.name);
                    }
                }
            });
            let fullyLoaded = this.weapons.every(w => w.ammo >= w.maxAmmo || w.def.passive || w.def.type === 'GUN');
            if (this.typeKey === 'TRANSPORT') fullyLoaded = this.weapons.some(w => w.def.type === 'DEPLOY' && w.ammo > 0);
            if (this.fuel >= this.data.fuel && this.hp >= this.maxHp && fullyLoaded) {
                this.state = 'IDLE'; this.rtb = false; this.visible = true; 
                this.x += Math.cos(this.angle) * 40; this.y += Math.sin(this.angle) * 40;
                this.takeoffTimer = 120; 
            }
            return; 
        }
        this.visible = true;

        this.weapons.forEach(w => {
            if (w.def.type === 'ECM') {
                w.jammedTargets = w.jammedTargets.filter(p => !p.dead && dist(this, p) < w.def.range);
                const jamCapacity = Math.min(2, w.def.capacity || 2);
                if (w.jammedTargets.length < jamCapacity) {
                    projectiles.forEach(p => {
                        if (p instanceof Missile && !p.isBomb && !p.isRocket && p.team !== this.team && !p.dead && !p.isJammed && dist(this, p) < w.def.range && w.jammedTargets.length < jamCapacity) {
                            w.jammedTargets.push(p); p.isJammed = true; addParticle(p.x, p.y, 'text', 'JAMMED');
                        }
                    });
                }
                w.jammedTargets.forEach(p => { p.jamTimer += SPEED_SCALE; p.angle += (Math.random() - 0.5) * 0.8; });
            }
            if (w.burstCount > 0) {
                w.burstTimer -= cooldownScale;
                if (w.burstTimer <= 0) {
                    w.burstCount--;
                    if (w.def.type === 'ROCKET') {
                        w.burstTimer = 5;
                        let p = new Missile(this.x, this.y, this.targetUnit, this.team, w.def.damage / 3);
                        p.isRocket = true;
                        projectiles.push(p);
                    } else if (w.def.type === 'GUN') {
                        w.burstTimer = w.def.burstInterval || 1.2;
                        const burstTarget = w.burstTarget && !w.burstTarget.dead ? w.burstTarget : null;
                        if (burstTarget) this.spawnWeaponProjectile(w, burstTarget);
                    }
                }
            }
            if (w.pendingSalvo > 0) {
                w.salvoTimer -= cooldownScale;
                if (w.salvoTimer <= 0) {
                    const salvoTarget = w.salvoTarget && !w.salvoTarget.dead ? w.salvoTarget : null;
                    if (!salvoTarget) {
                        w.pendingSalvo = 0;
                        w.salvoTarget = null;
                    } else {
                        w.pendingSalvo--;
                        w.salvoTimer = w.def.salvoDelay || 4;
                        this.spawnWeaponProjectile(w, salvoTarget);
                    }
                }
            }
            if (w.cooldown > 0) w.cooldown -= cooldownScale;
        });

        if (this.typeKey === 'SQUAD_AT' && this.convoyLeaderId) {
            const leader = entities.find(e => e.id === this.convoyLeaderId && !e.dead);
            const assistantAlive = leader && (leader.convoyMembers || []).some(mid => {
                const unit = entities.find(e => e.id === mid);
                return unit && !unit.dead && unit.typeKey === 'SQUAD_ASSISTANT';
            });
            const hydra = this.weapons.find(w => w.def.name === 'Hydra 70');
            const hellfire = this.weapons.find(w => w.def.name === 'AGM-114');
            if (hydra && hellfire) {
                if (assistantAlive) {
                    if (hellfire.ammo <= 0) hellfire.ammo = Math.max(1, hellfire.maxAmmo);
                    hydra.ammo = 0;
                } else {
                    if (hydra.ammo <= 0) hydra.ammo = Math.max(1, hydra.maxAmmo);
                    hellfire.ammo = 0;
                }
            }
        }

        if (this.targetUnit && this.targetUnit.dead) {
            this.targetUnit = null;
            this.isExtending = false;
            this.extendTimer = 0;
        }

        // --- TARGETING ---
        // 1. Check Strike Zones
        if ((!this.convoyLeaderId || this.isSquadFollower) && !this.targetUnit && this.state !== 'RETURN' && this.data.role !== 'Transport') {
            const teamZones = TEAMS[this.team].zones;
            const strikeZone = teamZones.find(z => z.type === 'STRIKE');
            const validTargets = this.getValidTargetTypes();

            if (strikeZone) {
                // Find ANY target in strike zone
                const potential = entities.find(e => e.team !== this.team && e.visible && !e.dead && rectContains(strikeZone, e) && isValidTarget(e, validTargets));
                if (potential) {
                    this.targetUnit = potential;
                    this.hasCommand = false; 
                } else {
                     islands.forEach(i => {
                        if (i.owner !== this.team) {
                            const b = i.buildings.find(b => rectContains(strikeZone, b) && !b.dead);
                            if (b && isValidTarget(b, validTargets)) this.targetUnit = b;
                        }
                     });
                }
            }
        }

        // 2. Default Targeting (Self Defense/Proximity)
        if ((!this.convoyLeaderId || this.isSquadFollower) && !this.targetUnit && this.state !== 'RETURN' && this.data.role !== 'Transport') {
            const validTargets = this.getValidTargetTypes();
            let maxRange = 0; this.weapons.forEach(w => maxRange = Math.max(maxRange, w.def.range));
            if (maxRange === 0) maxRange = 100;
            this.targetUnit = findTarget(this, maxRange * 1.5, validTargets);
        }

        // --- MOVEMENT ---
        let moveTarget = this.targetPos;

        if (this.isConvoyLead) {
            this.convoyMembers = this.convoyMembers.filter(id => entities.some(e => e.id === id && !e.dead));
            if (!this.targetUnit || this.targetUnit.dead || dist(this, this.targetUnit) > 300) {
                this.targetUnit = findTarget(this, 300, ['ground', 'air', 'heli', 'structure']);
            }
            this.convoyMembers.forEach(memberId => {
                const member = entities.find(e => e.id === memberId);
                if (!member || member.dead) return;
                member.targetUnit = this.targetUnit;
                member.rtb = false;
                member.hasCommand = this.hasCommand;
            });
        }
        
        // Zone Patrol Logic (Idle)
        if (this.state === 'IDLE' && !this.hasCommand && !this.targetUnit && !this.rtb) {
            const teamZones = TEAMS[this.team].zones;
            const patrolZone = teamZones.find(z => (z.type === 'CAP' && this.data.type === 'air') || (z.type === 'CAS' && (this.data.type === 'heli' || this.typeKey === 'STRIKE')));
            if (patrolZone) {
                 if (!rectContains(patrolZone, this)) {
                     moveTarget = {x: patrolZone.x + patrolZone.w/2, y: patrolZone.y + patrolZone.h/2};
                 } else if (dist(this, this.targetPos) < 20 || !this.targetPos || !rectContains(patrolZone, this.targetPos)) {
                     // Pick random spot in rect
                     this.targetPos = { 
                         x: patrolZone.x + Math.random() * patrolZone.w, 
                         y: patrolZone.y + Math.random() * patrolZone.h 
                     };
                     moveTarget = this.targetPos;
                 }
            }
        }

        if (this.hasCommand && this.targetPos && !this.targetUnit && !this.rtb && dist(this, this.targetPos) < 18) {
            this.hasCommand = false;
            this.state = 'IDLE';
            this.pathNodes = null;
            this.pathIndex = 0;
        }

        if (this.rtb) {
            this.state = 'RETURN';
            if (!this.base) this.findBase();
            if (this.base) moveTarget = this.base;
        } else if (this.targetUnit && !this.targetUnit.dead && this.data.type !== 'ship') {
            if (this.typeKey === 'AC130') {
                const gunRanges = this.weapons.filter(w => w.def.type === 'GUN').map(w => w.def.range || 300);
                const minRange = gunRanges.length ? Math.min(...gunRanges) : 150;
                const orbitRadius = Math.max(90, Math.min(minRange * 0.72, 170));
                const toTargetAngle = angleTo(this.targetUnit, this);
                const desiredOrbitAngle = toTargetAngle + (Math.PI / 2) * this.orbitDir;
                let orbitDiff = desiredOrbitAngle - this.orbitAngle;
                while (orbitDiff < -Math.PI) orbitDiff += Math.PI * 2;
                while (orbitDiff > Math.PI) orbitDiff -= Math.PI * 2;
                this.orbitAngle += Math.max(-0.04, Math.min(0.04, orbitDiff)) * SPEED_SCALE * 4;
                moveTarget = {
                    x: this.targetUnit.x + Math.cos(this.orbitAngle) * orbitRadius,
                    y: this.targetUnit.y + Math.sin(this.orbitAngle) * orbitRadius
                };
            } else {
                moveTarget = this.targetUnit;
            }
        }
        
        if (!moveTarget) { moveTarget = { x: this.x, y: this.y }; this.targetPos = { x: this.x, y: this.y }; }

        if (isCombinedMap() && this.data.type === 'ground') {
            moveTarget = getNearestCombinedLandPointForUnit(this, moveTarget);
            if (this.targetPos && !this.targetUnit) this.targetPos = { x: moveTarget.x, y: moveTarget.y };
        } else if (isCombinedMap() && this.data.type === 'ship') {
            moveTarget = getNearestCombinedWaterPoint(moveTarget);
            if (this.targetPos && !this.targetUnit) this.targetPos = { x: moveTarget.x, y: moveTarget.y };
        }

        if (this.data.type === 'ground' && hasRoadNetworkTerrain() && moveTarget) {
            const shouldRepath = !this.pathNodes || !this.pathNodes.length || (this.pathGoal && dist(this.pathGoal, moveTarget) > 45);
            if (shouldRepath) {
                this.pathNodes = getRoadPath(this, moveTarget, this);
                this.pathIndex = 0;
                this.pathGoal = { x: moveTarget.x, y: moveTarget.y };
            }
            while (this.pathNodes && this.pathIndex < this.pathNodes.length - 1 && dist(this, this.pathNodes[this.pathIndex]) < 26) this.pathIndex++;
            if (this.pathNodes && this.pathNodes[this.pathIndex]) {
                let waypoint = this.pathNodes[this.pathIndex];
                if (this.pathIndex < this.pathNodes.length - 1 && dist(this, this.pathNodes[this.pathIndex + 1]) + 10 < dist(this, waypoint)) {
                    this.pathIndex++;
                    waypoint = this.pathNodes[this.pathIndex];
                }
                moveTarget = waypoint;
            }
        }

        const dx = moveTarget.x - this.x; const dy = moveTarget.y - this.y;
        const distToTarget = Math.hypot(dx, dy); let desiredAngle = Math.atan2(dy, dx);
        if (this.data.type === 'ship' && !this.hasCommand && !this.rtb && distToTarget < 1) desiredAngle = this.angle;
        let diff = desiredAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2;
        const turnSpeed = this.data.turn * (this.turnBoost || 1) * SPEED_SCALE;
        
        let speed = this.data.speed * SPEED_SCALE; 
        if (this.data.type === 'air' && this.typeKey !== 'FIGHTER') speed *= 1; 
        if ((this.data.type === 'heli' || this.data.type === 'ship') && distToTarget < 15 && !this.rtb) speed = 0;
        if (this.data.type === 'ground') {
            if (!hasRoadNetworkTerrain()) {
                const groundIsland = islands.find(i => dist(this, i) < i.radius * 1.1);
                if (!groundIsland) speed = 0;
            } else {
                speed *= getGroundRoadSpeedMultiplier(this);
                if (distToTarget < 7) speed = 0;
            }
        }

        // --- BOOM & ZOOM / EXTEND LOGIC ---
        if (this.targetUnit && !this.rtb && this.data.type === 'air') {
            if (distToTarget < 150 && Math.abs(diff) > 1.2) {
                this.isExtending = true;
                this.extendTimer = 90;
            }
        }

        if (this.isExtending) {
            this.extendTimer -= SPEED_SCALE;
            const extendTarget = this.targetUnit || moveTarget;
            if (!extendTarget || dist(this, extendTarget) > 350 || this.extendTimer <= 0) {
                this.isExtending = false;
                this.extendTimer = 0;
            } else {
                const extendTurn = Math.max(turnSpeed * 0.35, 0.005);
                if (Math.abs(diff) < extendTurn) this.angle = desiredAngle;
                else this.angle += Math.sign(diff) * extendTurn;
            }
        }
        if (!this.isExtending) {
            if (Math.abs(diff) < turnSpeed) this.angle = desiredAngle;
            else this.angle += Math.sign(diff) * turnSpeed;
        }

        const nextX = this.x + Math.cos(this.angle) * speed;
        const nextY = this.y + Math.sin(this.angle) * speed;
        if (isCombinedMap() && this.data.type === 'ship') {
            const nextPos = { x: nextX, y: nextY };
            if (isCombinedWaterPoint(nextPos)) {
                this.x = nextX; this.y = nextY;
            } else {
                const slideX = { x: nextX, y: this.y };
                const slideY = { x: this.x, y: nextY };
                if (isCombinedWaterPoint(slideX)) this.x = nextX;
                else if (isCombinedWaterPoint(slideY)) this.y = nextY;
                else {
                    const safe = getNearestCombinedWaterPoint(this, 22);
                    this.x += (safe.x - this.x) * 0.08;
                    this.y += (safe.y - this.y) * 0.08;
                }
            }
        } else if (isCombinedMap() && this.data.type === 'ground') {
            const nextPos = { x: nextX, y: nextY };
            if (isCombinedLandPoint(nextPos)) {
                this.x = nextX; this.y = nextY;
            } else {
                this.pathNodes = null;
                this.pathIndex = 0;
                speed = 0;
            }
        } else {
            this.x = nextX; this.y = nextY;
        }

        if (this.rtb && distToTarget < 30 && this.base) { this.state = 'LANDED'; return; }

        if (this.targetUnit && !this.targetUnit.dead && !this.rtb) {
            const d = dist(this, this.targetUnit);
            const angleToT = angleTo(this, this.targetUnit);
            let aimDiff = angleToT - this.angle;
            while (aimDiff < -Math.PI) aimDiff += Math.PI * 2; while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
            this.weapons.forEach(w => {
                if (w.ammo > 0 && w.cooldown <= 0 && w.burstCount === 0 && d <= w.def.range && !w.def.passive) {
                    if (this.takeoffTimer > 0) return;
                    if (w.def.type !== 'GUN' && this.fireTimer > 0) return;
                    if (this.targetUnit && this.targetUnit.typeKey === 'PILE_DRIVER_TBM_UNIT' && w.name !== 'AIM-174B') return;

                    let tolerance = w.def.type === 'GUN' ? 0.3 : 0.8;
                    if (w.def.priorityTag && this.targetUnit.type !== w.def.priorityTag) return; 
                    if ((w.def.name === 'AIM-120' || w.def.name === 'AIM-174B') && !hasRadarTrackForAirTarget(this, this.targetUnit)) return;


                    const omnidirectional = this.data.type === 'ship' && w.def.navalOmni;
                    let firingArcOk = omnidirectional || Math.abs(aimDiff) < tolerance;
                    if (this.typeKey === 'AC130') {
                        const leftBearing = this.angle - Math.PI / 2;
                        let sideDiff = angleToT - leftBearing;
                        while (sideDiff < -Math.PI) sideDiff += Math.PI * 2;
                        while (sideDiff > Math.PI) sideDiff -= Math.PI * 2;
                        const ac130Arc = w.def.range >= 180 ? 1.2 : 1.35;
                        firingArcOk = Math.abs(sideDiff) < ac130Arc;
                    }
                    if (firingArcOk) {
                        if (isValidTarget(this.targetUnit, w.def.targets)) {
                            if (w.def.guided && w.def.type === 'BOMB') {
                                this.fireWeapon(w, this.targetUnit);
                            } else {
                                this.fireWeapon(w, this.targetUnit);
                            }
                            if (w.def.type !== 'GUN') this.fireTimer = 15;
                        }
                    }
                }
            });
        }

        this.handleTransportDeployment();

        if ((this.typeKey === 'IR_APC' || this.typeKey === 'AAA_BATTERY') && gameTime % 90 === 0) {
            const base = findNearestFriendlyAirport(this, 130);
            if (base) {
                this.weapons.forEach(w => {
                    if (!w.def.passive && w.def.type !== 'GUN' && w.ammo < w.maxAmmo) {
                        w.ammo++;
                        addParticle(this.x, this.y - 8, 'text', 'REARM');
                    }
                });
            }
        }
        
        if (this.typeKey === 'CARRIER') {
            entities.forEach(e => { if (e.team === this.team && e !== this && dist(this, e) < 50 && e.data.type !== 'ship') { if (e.rtb) { e.state = 'LANDED'; e.base = this; e.x = this.x; e.y = this.y; } } });
        }
        if (this.typeKey === 'CONVOY' || this.typeKey === 'SOLDIER_SQUAD') {
            const island = islands.find(i => dist(this, i) < i.radius * 1.1);
            if (island && island.owner !== this.team) {
                const rate = this.typeKey === 'SOLDIER_SQUAD' ? 0.38 : 0.28;
                island.captureProgress += rate * SPEED_SCALE;
                if (island.captureProgress >= 100) {
                    island.owner = this.team;
                    island.captureProgress = 0;
                    island.buildings.forEach(b => { b.team = this.team; b.hp = b.maxHp; });
                    addParticle(this.x, this.y, 'text', this.typeKey === 'SOLDIER_SQUAD' ? 'SQUAD CAPTURE' : 'CONVOY CAPTURE');
                }
            }
        }
        if (this.typeKey === 'SF') {
            const island = islands.find(i => dist(this, i) < i.radius * 1.5);
            if (!island) this.targetUnit = null;
            if (island) {
                if (island.owner !== this.team) {
                    island.captureProgress += 0.5 * SPEED_SCALE;
                    if (island.captureProgress >= 100) {
                        island.owner = this.team; island.captureProgress = 0; 
                        island.buildings.forEach(b => { b.team = this.team; b.hp = b.maxHp; });
                        addParticle(this.x, this.y, 'text', 'CAPTURED!');
                    }
                    if (gameTime % 20 === 0) addParticle(this.x, this.y - 10, 'spark', null);
                }
            } else { this.takeDamage(0.8 * SPEED_SCALE); }
        }
    }

    getValidTargetTypes() {
        let types = new Set();
        this.weapons.forEach(w => { if (w.def.targets) w.def.targets.forEach(t => types.add(t)); });
        return Array.from(types);
    }

    findBase() {
        let nearest = null; let minD = Infinity;
        islands.forEach(i => {
            if (i.owner === this.team) {
                const airport = i.buildings.find(b => b.type === 'AIRPORT');
                if (airport) { const d = dist(this, airport); if (d < minD) { minD = d; nearest = airport; } }
            }
        });
        entities.forEach(e => { if (e.team === this.team && e.typeKey === 'CARRIER') { const d = dist(this, e); if (d < minD) { minD = d; nearest = e; } } });
        this.base = nearest; if (!this.base) this.rtb = false; 
    }

    fireWeapon(weaponInstance, target) {
        weaponInstance.cooldown = weaponInstance.def.cooldown;
        const w = weaponInstance.def;
        if (w.type !== 'GUN' && w.type !== 'ECM') weaponInstance.ammo--;

        this.spawnWeaponProjectile(weaponInstance, target);
        if (w.type === 'GUN' && w.burstShots && w.burstShots > 1) {
            weaponInstance.burstCount = w.burstShots - 1;
            weaponInstance.burstTimer = w.burstInterval || 1.2;
            weaponInstance.burstTarget = target;
        }
        if (this.data.type === 'ship' && w.navalOmni) {
            const salvoSize = Math.max(1, w.salvoCount || 1);
            weaponInstance.pendingSalvo = Math.max(0, salvoSize - 1);
            weaponInstance.salvoTimer = w.salvoDelay || 4;
            weaponInstance.salvoTarget = target;
        }
    }

    spawnWeaponProjectile(weaponInstance, target) {
        if (!target) return;
        const w = weaponInstance.def;
        if (w.type === 'ROCKET') { 
            weaponInstance.burstCount = 3; 
            let p = new Missile(this.x, this.y, this.targetUnit, this.team, w.damage / 3);
            p.isRocket = true;
            projectiles.push(p);
        }
        else if (w.type === 'CRUISE') {
            const cm = new Unit(this.x, this.y, this.team, 'CRUISE_MISSILE_UNIT');
            cm.angle = this.angle; cm.targetPos = target; entities.push(cm);
        } else if (w.type === 'TBM') {
            const tbm = new Unit(this.x, this.y, this.team, 'PILE_DRIVER_TBM_UNIT');
            tbm.targetPos = { x: target.x, y: target.y };
            tbm.launchX = this.x;
            tbm.launchY = this.y;
            tbm.tbmProgress = 0;
            entities.push(tbm);
        } else if (w.type === 'HYPERSONIC') {
            const hm = new Unit(this.x, this.y, this.team, 'HYPERSONIC_ASHM_UNIT');
            hm.angle = this.angle; hm.targetPos = target; entities.push(hm);
        } else if (w.type.includes('AAM') || w.type === 'AGM') {
            const missile = new Missile(this.x, this.y, target, this.team, w.damage);
            missile.guidanceType = w.guidance || null;
            projectiles.push(missile);
        } else if (w.type === 'BOMB') {
            if (w.guided) {
                const p = new Missile(this.x, this.y, target, this.team, w.damage);
                p.baseSpeed = w.speed || 3; p.turnRate = 0.05; p.isBomb = true; projectiles.push(p);
            } else { projectiles.push(new Bomb(this.x, this.y, target, this.team)); }
        } else if (w.type === 'GUN') {
            let leadX = target.x, leadY = target.y;
            if (target instanceof Unit) {
                const speed = w.speed || 12;
                const distToTarget = dist(this, target);
                const timeToImpact = distToTarget / speed;
                const leadMultiplier = w.leadMultiplier || 1;
                leadX = target.x + Math.cos(target.angle) * target.data.speed * SPEED_SCALE * timeToImpact * leadMultiplier;
                leadY = target.y + Math.sin(target.angle) * target.data.speed * SPEED_SCALE * timeToImpact * leadMultiplier;
            }
            projectiles.push(new Bullet(this.x, this.y, {x: leadX, y: leadY}, this.team, w.damage, w.name === 'Railcannon', w.spread || 0.02, !!w.interceptsMunitions, w.speed || 8, w.range || 160));
        }
    }

    handleTransportDeployment() {
        if (!this.weapons.some(w => w.def.type === 'DEPLOY') || this.state === 'RETURN' || !this.targetPos) return;
        if (dist(this, this.targetPos) > 70) return;

        const deployContext = this.getTransportDeployContext();
        this.weapons.forEach(weaponInstance => this.tryDeployFromTransportWeapon(weaponInstance, deployContext));
    }

    getTransportDeployContext() {
        return {
            friendlyIsland: islands.find(i => dist(this, i) < i.radius && i.owner === this.team),
            contestedIsland: islands.find(i => dist(this, i) < i.radius && i.owner !== this.team),
            nearbyIsland: islands.find(i => dist(this, i) < i.radius)
        };
    }

    tryDeployFromTransportWeapon(weaponInstance, deployContext) {
        const deployDef = weaponInstance.def;
        if (deployDef.type !== 'DEPLOY' || weaponInstance.ammo <= 0 || weaponInstance.cooldown > 0) return;

        let deployed = false;
        if (deployDef.deployType === 'UNIT') deployed = this.deployTransportUnit(deployDef, deployContext);
        else if (deployDef.deployType === 'BUILDING') deployed = this.deployTransportBuilding(deployDef, deployContext);

        if (deployed) {
            weaponInstance.ammo--;
            weaponInstance.cooldown = deployDef.cooldown;
        }
    }

    deployTransportUnit(deployDef, deployContext) {
        if (!deployDef.unitType || !UNIT_TYPES[deployDef.unitType]) return false;
        const mission = this.transportMission;
        const dropIsland = mission?.targetIsland || deployContext.contestedIsland;
        if (!dropIsland) return false;

        const dropPos = mission?.dropPoint ? { x: mission.dropPoint.x, y: mission.dropPoint.y } : { x: this.x, y: this.y + 10 };
        const toDropX = dropPos.x - dropIsland.x;
        const toDropY = dropPos.y - dropIsland.y;
        const toDropMag = Math.hypot(toDropX, toDropY) || 1;
        const safeInset = dropIsland.radius * 0.92;
        const spawnPoint = {
            x: dropIsland.x + (toDropX / toDropMag) * safeInset,
            y: dropIsland.y + (toDropY / toDropMag) * safeInset
        };

        let deployedUnit = null;
        if (deployDef.unitType === 'SOLDIER_SQUAD') {
            deployedUnit = spawnSoldierSquad(this.team, spawnPoint.x, spawnPoint.y);
            if (deployedUnit) {
                deployedUnit.targetPos = mission?.capturePoint ? { x: mission.capturePoint.x, y: mission.capturePoint.y } : { x: dropIsland.x, y: dropIsland.y };
            }
        } else {
            deployedUnit = new Unit(spawnPoint.x, spawnPoint.y, this.team, deployDef.unitType);
            if (mission && mission.capturePoint) deployedUnit.targetPos = { x: mission.capturePoint.x, y: mission.capturePoint.y };
            else deployedUnit.targetPos = { x: dropIsland.x, y: dropIsland.y };
            entities.push(deployedUnit);
        }
        addParticle(spawnPoint.x, spawnPoint.y, 'text', 'DROP');
        if (mission) {
            this.transportMission = null;
            this.hasCommand = false;
            this.state = 'RETURN';
            this.rtb = true;
            this.findBase();
        }
        return true;
    }

    deployTransportBuilding(deployDef, deployContext) {
        const island = deployContext.friendlyIsland;
        if (!island || island.buildings.length >= 6) return false;

        let offsetX = (Math.random() - 0.5) * 40;
        let offsetY = (Math.random() - 0.5) * 40;
        island.buildings.push(new Building(island.x + offsetX, island.y + offsetY, this.team, deployDef.buildType));
        addParticle(island.x + offsetX, island.y + offsetY, 'text', 'DEPLOYED');
        return true;
    }

    setTransportAssaultMission(targetIsland, capturePoint = null) {
        if (!this.weapons.some(w => w.def.type === 'DEPLOY' && w.def.deployType === 'UNIT' && w.ammo > 0)) return;
        const toTransportX = this.x - targetIsland.x;
        const toTransportY = this.y - targetIsland.y;
        const mag = Math.hypot(toTransportX, toTransportY) || 1;
        const edgeOffset = targetIsland.radius * 0.9;
        const dropPoint = {
            x: targetIsland.x + (toTransportX / mag) * edgeOffset,
            y: targetIsland.y + (toTransportY / mag) * edgeOffset
        };
        this.transportMission = {
            targetIsland,
            capturePoint: capturePoint || { x: targetIsland.x, y: targetIsland.y },
            dropPoint
        };
        this.targetPos = dropPoint;
        this.targetUnit = null;
        this.rtb = false;
        this.hasCommand = true;
        this.state = 'MOVE';
    }

    draw(ctx) {
        if (!this.visible) return;
        if (this.takeoffTimer > 0) {
            ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 8, 0, (this.takeoffTimer/120) * Math.PI*2); ctx.stroke();
        }

        this.weapons.forEach(w => {
            if (w.def.type === 'ECM' && w.jammedTargets) {
                ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
                w.jammedTargets.forEach(t => { if (!t.dead) { ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(t.x, t.y); ctx.stroke(); } });
                ctx.setLineDash([]);
            }
        });
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        if (selection.includes(this)) {
            ctx.strokeStyle = '#0f0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0,0, this.radius + 5, 0, Math.PI*2); ctx.stroke();
            const rangeByType = {};
            this.weapons.forEach(w => {
                if (w.def.passive || !w.def.range || w.def.range <= 0) return;
                const typeKey = w.def.type.includes('AAM') ? 'AAM' : w.def.type;
                rangeByType[typeKey] = Math.max(rangeByType[typeKey] || 0, w.def.range);
            });
            const rangeColors = { GUN: 'rgba(255,255,255,0.35)', AAM: 'rgba(80,180,255,0.35)', AGM: 'rgba(255,120,120,0.35)', ROCKET: 'rgba(255,180,80,0.35)', BOMB: 'rgba(220,220,120,0.35)', CRUISE: 'rgba(200,80,255,0.35)', HYPERSONIC: 'rgba(255,80,180,0.4)', DEPLOY: 'rgba(120,255,120,0.35)' };
            ctx.restore();
            Object.keys(rangeByType).forEach(type => {
                ctx.save();
                ctx.strokeStyle = rangeColors[type] || 'rgba(120,255,120,0.35)';
                ctx.lineWidth = 1;
                ctx.setLineDash([6, 6]);
                ctx.beginPath();
                ctx.arc(this.x, this.y, rangeByType[type], 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            });
             const radarRange = getUnitRadarRange(this);
            if (radarRange > 0) {
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 230, 80, 0.8)';
                ctx.lineWidth = 0.5;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.arc(this.x, this.y, radarRange, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
            ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
            if (this.targetPos && !this.targetUnit && this.state !== 'IDLE') {
                ctx.restore(); ctx.save(); ctx.strokeStyle = '#0f0'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.targetPos.x, this.targetPos.y); ctx.stroke(); ctx.restore(); ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
            }
        }
        ctx.fillStyle = COLORS[this.team]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        
        if (this.typeKey === 'FIGHTER') { ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-8, 6); ctx.lineTo(-5, 0); ctx.lineTo(-8, -6); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        else if (this.typeKey === 'AC130') { ctx.fillStyle = '#4e5a6b'; ctx.fillRect(-16, -7, 30, 14); ctx.fillStyle = '#333'; ctx.fillRect(10, -3, 10, 6); ctx.fillStyle = '#8aa'; ctx.fillRect(-12, -1, 6, 2); ctx.fillRect(-12, 3, 6, 2); }
        else if (this.typeKey === 'SEAD_FIGHTER') { ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(-10, 7); ctx.lineTo(-6, 0); ctx.lineTo(-10, -7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#222'; ctx.fillRect(-3,-3,6,6); }
        else if (this.typeKey === 'STRIKE') { ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-8, 7); ctx.lineTo(-8, -7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(-10, 3); ctx.lineTo(-10, -3); ctx.fill(); }
        else if (this.typeKey === 'BOMBER' || this.typeKey === 'AWACS') { 
            ctx.beginPath(); ctx.moveTo(15,0); ctx.lineTo(-10, 15); ctx.lineTo(-5, 0); ctx.lineTo(-10, -15); ctx.closePath(); ctx.fill(); ctx.stroke(); 
            if(this.typeKey==='AWACS') { ctx.fillStyle='#222'; ctx.beginPath(); ctx.ellipse(-5, 0, 6, 12, 0, 0, Math.PI*2); ctx.fill(); }
        }
        else if (this.typeKey.includes('HELI') || this.typeKey === 'TRANSPORT') {
            ctx.fillStyle = this.typeKey === 'TRANSPORT' ? '#556' : '#444'; ctx.fillRect(-8, -4, 16, 8); ctx.strokeStyle = '#aaa';
            let rAngle = gameTime * 0.8; ctx.beginPath(); ctx.moveTo(-15*Math.cos(rAngle), -15*Math.sin(rAngle)); ctx.lineTo(15*Math.cos(rAngle), 15*Math.sin(rAngle)); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-15*Math.cos(rAngle+1.57), -15*Math.sin(rAngle+1.57)); ctx.lineTo(15*Math.cos(rAngle+1.57), 15*Math.sin(rAngle+1.57)); ctx.stroke();
            if (this.typeKey === 'TRANSPORT') { for(let i=0; i<this.weapons.find(w=>w.def.type==='DEPLOY')?.ammo || 0; i++) { ctx.fillStyle = '#0f0'; ctx.fillRect(-6 + (i*3), -2, 2, 2); } }
        } else if (this.typeKey === 'CARRIER') { ctx.fillStyle = '#444'; ctx.fillRect(-25, -10, 50, 20); ctx.fillStyle = '#666'; ctx.fillRect(-20, -2, 40, 4); ctx.fillStyle = '#777'; ctx.fillRect(0, -10, 10, 5); }
        else if (this.typeKey === 'DESTROYER') { 
            ctx.fillStyle = '#333'; ctx.fillRect(-15, -8, 30, 16); 
            ctx.fillStyle = '#555'; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(-20, 10); ctx.lineTo(-20, -10); ctx.fill();
            ctx.fillStyle = '#222'; ctx.fillRect(0, -5, 10, 10); 
        }
        else if (this.typeKey === 'ARSENAL_CRUISER') {
            ctx.fillStyle = '#2f3640'; ctx.fillRect(-19, -10, 38, 20);
            ctx.fillStyle = '#555'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-24, 12); ctx.lineTo(-24, -12); ctx.fill();
            ctx.fillStyle = '#8892a0'; ctx.fillRect(-4, -6, 8, 12);
            ctx.fillStyle = '#a33'; ctx.fillRect(-12, -3, 5, 6); ctx.fillRect(7, -3, 5, 6);
        }
        else if (this.typeKey === 'LANDING_SHIP') {
            ctx.fillStyle = '#5a5f66'; ctx.fillRect(-18, -9, 36, 18);
            ctx.fillStyle = '#7d8791'; ctx.fillRect(-6, -6, 12, 12);
            ctx.fillStyle = '#333'; ctx.fillRect(-14, 2, 8, 5); ctx.fillRect(6, 2, 8, 5);
        }
        else if (this.typeKey === 'HUNTER_FRIGATE') {
            ctx.fillStyle = '#2e3440'; ctx.fillRect(-16, -8, 32, 16);
            ctx.fillStyle = '#667'; ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(-22, 11); ctx.lineTo(-22, -11); ctx.fill();
            ctx.fillStyle = '#b22'; ctx.fillRect(-3, -5, 6, 10);
        }
        else if (this.typeKey === 'SSBN') {
            ctx.fillStyle = '#1f2730'; ctx.fillRect(-20, -7, 40, 14);
            ctx.fillStyle = '#4b5a6a'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-24, 10); ctx.lineTo(-24, -10); ctx.fill();
            ctx.fillStyle = '#8899aa'; ctx.fillRect(-6, -4, 10, 8);
        }
        else if (this.typeKey === 'IR_APC') {
            ctx.fillStyle = '#4a5a3a'; ctx.fillRect(-9, -5, 18, 10);
            ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-10, -7, 20, 2); ctx.fillRect(-10, 5, 20, 2);
            ctx.strokeStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(10,0); ctx.stroke();
        }
        else if (this.typeKey === 'AAA_BATTERY') {
            ctx.fillStyle = '#3d3d3d'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#9cf'; ctx.beginPath(); ctx.moveTo(-10, -3); ctx.lineTo(10, -3); ctx.moveTo(-10, 3); ctx.lineTo(10, 3); ctx.stroke();
        }
        else if (this.typeKey === 'TANK') {
            ctx.fillStyle = '#4e5a44'; ctx.fillRect(-11, -6, 22, 12);
            ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-12, -8, 24, 3); ctx.fillRect(-12, 5, 24, 3);
            ctx.strokeStyle = '#bbb'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(13, 0); ctx.stroke();
        }
        else if (this.typeKey === 'IFV') {
            ctx.fillStyle = '#5a624a'; ctx.fillRect(-10, -6, 20, 12);
            ctx.fillStyle = '#345'; ctx.fillRect(1, -3, 6, 6);
            ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(12, 0); ctx.stroke();
        }
        else if (this.typeKey === 'APC') {
            ctx.fillStyle = '#64705a'; ctx.fillRect(-10, -5, 20, 10);
            ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-11, -7, 22, 2); ctx.fillRect(-11, 5, 22, 2);
        }
        else if (this.typeKey === 'SOLDIER_SQUAD' || this.typeKey === 'SQUAD_AT' || this.typeKey === 'SQUAD_AA' || this.typeKey === 'SQUAD_ASSISTANT') {
            ctx.fillStyle = this.typeKey === 'SQUAD_AA' ? '#7bf' : (this.typeKey === 'SQUAD_AT' ? '#fb7' : '#8f8');
            ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
        }
        else if (this.typeKey === 'CONVOY') {
            ctx.fillStyle = '#6b5b3f'; ctx.fillRect(-12, -6, 24, 12);
            ctx.fillStyle = '#2f2f2f'; ctx.fillRect(-10, -8, 20, 3); ctx.fillRect(-10, 5, 20, 3);
            ctx.fillStyle = '#89a'; ctx.fillRect(2, -4, 7, 8);
        }
        else if (this.typeKey === 'SF') { ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.arc(0,0, 3, 0, Math.PI*2); ctx.fill(); }
        else if (this.typeKey === 'CRUISE_MISSILE_UNIT') { ctx.fillStyle = '#fff'; ctx.fillRect(-5, -2, 10, 4); }
        else if (this.typeKey === 'HYPERSONIC_ASHM_UNIT') { ctx.fillStyle = '#ffd6d6'; ctx.fillRect(-6, -2, 12, 4); ctx.fillStyle = '#f55'; ctx.fillRect(-2, -3, 4, 6); }
        else if (this.typeKey === 'PILE_DRIVER_TBM_UNIT') { ctx.fillStyle = '#ddd'; ctx.fillRect(-5, -2, 10, 4); ctx.fillStyle = '#a44'; ctx.fillRect(-2, -4, 4, 2); }

        let ammoCount = this.weapons.reduce((sum, w) => sum + (w.def.type==='GUN' || w.def.passive ? 1 : w.ammo), 0);
        if (this.data.type === 'air' && (this.fuel < 300 || ammoCount === 0)) { ctx.fillStyle = 'orange'; ctx.beginPath(); ctx.arc(0, -10, 2, 0, Math.PI*2); ctx.fill(); }
        ctx.restore();
        if (this.hp < this.maxHp) { ctx.fillStyle = 'red'; ctx.fillRect(this.x - 10, this.y - 15, 20, 3); ctx.fillStyle = '#0f0'; ctx.fillRect(this.x - 10, this.y - 15, 20 * (this.hp/this.maxHp), 3); }
    }
}

class Projectile {
    constructor(x, y, target, team, damage) {
        this.x = x; this.y = y; this.target = target; this.team = team; this.damage = damage;
        this.dead = false; this.timer = 100; this.isJammed = false; this.jamTimer = 0;
    }
    update() { this.timer -= SPEED_SCALE; if (this.timer <= 0) this.dead = true; }
    draw(ctx) {}
}

class Missile extends Projectile {
    constructor(x, y, target, team, damage, isSam = false) {
        super(x, y, target, team, damage);
        this.angle = target ? angleTo(this, target) : 0;
        this.baseSpeed = isSam ? 7 : 5;
        this.turnRate = isSam ? 0.08 : 0.12;
        this.isBomb = false;
    }
    update() {
        super.update();
        if (this.dead) return;
        if (this.jamTimer > 36) { this.dead = true; addParticle(this.x, this.y, 'text', 'SELF DESTRUCT'); createExplosion(this.x, this.y, 20); return; }

        if (this.target && !this.target.dead) {
            const angleToT = angleTo(this, this.target);
            let diff = angleToT - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2;
            
            if (gameTime % 30 === 0 && !this.isJammed && !this.isRocket) {
                const flareChance = this.guidanceType === 'heat' ? 0.55 : 0.2;
                if (isUnlocked(this.target.team, 'FLARES') && Math.random() < flareChance) {
                    for (let i = 0; i < 10; i++) {
                        particles.push({
                            x: this.target.x + (Math.random() - 0.5) * 18,
                            y: this.target.y + (Math.random() - 0.5) * 18,
                            type: 'flare',
                            life: 26 + Math.random() * 10,
                            vx: (Math.random() - 0.5) * 1.2,
                            vy: (Math.random() - 0.5) * 1.2
                        });
                    }
                    this.isJammed = true; 
                }
            }

            let turn = this.turnRate * SPEED_SCALE;
            if (this.isJammed) turn *= 0.1; 
            if (Math.abs(diff) < turn) this.angle = angleToT; else this.angle += Math.sign(diff) * turn;
            
            if (dist(this, this.target) < 10) {
                if (this.target instanceof Projectile) this.target.dead = true;
                else this.target.takeDamage(this.damage);
                this.dead = true;
                addParticle(this.x, this.y, 'explosion');
            }
        } else { this.dead = true; }
        const speed = this.baseSpeed * SPEED_SCALE;
        this.x += Math.cos(this.angle) * speed; this.y += Math.sin(this.angle) * speed;
        if (gameTime % 2 === 0 && !this.isBomb) addParticle(this.x, this.y, 'smoke');
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        if (this.isBomb) { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0,0,3,0,Math.PI*2); ctx.fill(); }
        else { ctx.fillStyle = '#fff'; ctx.fillRect(-4, -1, 8, 2); }
        ctx.restore();
    }
}

class Bomb extends Projectile {
    constructor(x, y, target, team) { super(x, y, target, team, 150); this.scale = 1.0; }
    update() {
        this.scale -= 0.02 * SPEED_SCALE;
        if (this.scale <= 0.2) {
            this.dead = true;
            entities.forEach(e => { if (e.team !== this.team && dist(this, e) < 40) e.takeDamage(this.damage); });
            islands.forEach(i => { i.buildings.forEach(b => { if (b.team !== this.team && dist(this, b) < 40) b.takeDamage(this.damage); }); });
            createExplosion(this.x, this.y, 40);
        }
    }
    draw(ctx) { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(this.x, this.y, 4 * this.scale, 0, Math.PI*2); ctx.fill(); }
}

class Bullet extends Projectile {
    constructor(x, y, target, team, damage, isRail = false, spread = 0.02, interceptsMunitions = false, projectileSpeed = 8, maxRange = 160) {
        super(x, y, target, team, damage);
        const a = Math.atan2(target.y - y, target.x - x);
        const speed = Math.max(1, projectileSpeed || 8);
        this.vx = Math.cos(a + (Math.random()-0.5)*spread) * speed * SPEED_SCALE;
        this.vy = Math.sin(a + (Math.random()-0.5)*spread) * speed * SPEED_SCALE;
        this.isRail = isRail;
        this.maxRange = Math.max(1, maxRange || 160);
        this.rangeBuffer = this.isRail ? Math.max(80, this.maxRange * 0.25) : Math.max(Math.hypot(this.vx, this.vy), 1);
        this.distanceTraveled = 0;
        this.timer = Math.ceil((this.maxRange + this.rangeBuffer) / Math.max(0.001, speed * SPEED_SCALE));
        this.interceptsMunitions = interceptsMunitions;
    }
    update() {
        const prev = { x: this.x, y: this.y };
        this.x += this.vx; this.y += this.vy;
        this.distanceTraveled += dist(prev, this);
        entities.forEach(e => {
            if (this.dead || e.team === this.team || e.dead) return;
            const hitRadius = this.isRail ? Math.max(e.radius, 16) : e.radius;
            if (distPointToSegment(e, prev, this) < hitRadius) {
                e.takeDamage(this.damage); this.dead = true; addParticle(this.x, this.y, 'spark');
            }
        });
        islands.forEach(i => {
            i.buildings.forEach(b => {
                if (this.dead || b.team === this.team || b.dead) return;
                const hitRadius = this.isRail ? Math.max(b.radius || 10, 16) : (b.radius || 10);
                if (distPointToSegment(b, prev, this) < hitRadius) {
                    b.takeDamage(this.damage);
                    this.dead = true;
                    addParticle(this.x, this.y, 'spark');
                }
            });
        });
        if (this.interceptsMunitions) {
            projectiles.forEach(p => {
                if (this.dead || p.dead || p.team === this.team || p === this || p instanceof Bullet) return;
                if (distPointToSegment(p, prev, this) < 7) {
                    p.dead = true;
                    this.dead = true;
                    addParticle(this.x, this.y, 'spark');
                }
            });
        }
        this.timer--;
        if (this.timer <= 0 || this.distanceTraveled > this.maxRange + this.rangeBuffer) this.dead = true;
    }
    draw(ctx) {
        if (this.isRail) {
            ctx.strokeStyle = 'rgba(120, 240, 255, 0.95)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.x - this.vx * 0.6, this.y - this.vy * 0.6);
            ctx.lineTo(this.x, this.y);
            ctx.stroke();
            ctx.fillStyle = '#e0ffff';
            ctx.fillRect(this.x - 2, this.y - 2, 4, 4);
            return;
        }
        ctx.fillStyle = '#ff0'; ctx.fillRect(this.x-1, this.y-1, 2, 2);
    }
}

function isValidTarget(target, targetTypes) {
    if (!targetTypes) return false;
    if (target instanceof Projectile) {
        return targetTypes.includes('munition') && !(target instanceof Bullet);
    }
    let type = target.data ? target.data.type : (target.type === 'SAM_SITE' || target.type === 'SPAA' || target.type === 'AIRPORT' ? 'structure' : (target.type ? 'structure' : 'unknown'));
    if (target.type && target.type.includes('DEPLOYED')) type = 'structure';
    if (target.type && (target.type.includes('COASTAL') || target.type.includes('ASHM'))) type = 'structure'; 
    return targetTypes.includes(type);
}

function addParticle(x, y, type, text) { particles.push({x, y, type, life: 30, text, vx: (Math.random()-0.5)*SPEED_SCALE, vy: (Math.random()-0.5)*SPEED_SCALE}); }
function createExplosion(x, y, radius) { for(let i=0; i<8; i++) addParticle(x + (Math.random()-0.5)*10, y + (Math.random()-0.5)*10, 'explosion'); }
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i]; p.life -= SPEED_SCALE; p.x += p.vx; p.y += p.vy;
        if (p.life <= 0) particles.splice(i, 1);
    }
}
function drawParticles(ctx) {
    particles.forEach(p => {
        if (p.type === 'text') { ctx.fillStyle = '#fff'; ctx.font = '12px Arial'; ctx.fillText(p.text, p.x, p.y); }
        else if (p.type === 'explosion') { ctx.fillStyle = `rgba(255, ${Math.floor(Math.random()*200)}, 0, ${p.life/30})`; ctx.beginPath(); ctx.arc(p.x, p.y, (30-p.life)/2, 0, Math.PI*2); ctx.fill(); }
        else if (p.type === 'smoke') { ctx.fillStyle = `rgba(200, 200, 200, ${p.life/30})`; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill(); }
        else if (p.type === 'smoke_light') { ctx.fillStyle = `rgba(210, 210, 210, ${p.life/60})`; ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, Math.PI*2); ctx.fill(); }
        else if (p.type === 'flare') { ctx.fillStyle = `rgba(255, ${180 + Math.floor(Math.random()*70)}, 80, ${p.life/36})`; ctx.beginPath(); ctx.arc(p.x, p.y, 1 + Math.random() * 2.2, 0, Math.PI*2); ctx.fill(); }
        else if (p.type === 'spark') { ctx.fillStyle = '#ff0'; ctx.fillRect(p.x, p.y, 2, 2); }
    });
}

function findTarget(source, range, types = null) {
    let best = null; let minD = range;
    entities.forEach(e => {
        if (e.team !== source.team && !e.dead && e.visible) {
            const d = dist(source, e);
            if (d < minD) { if (!types || isValidTarget(e, types)) { minD = d; best = e; } }
        }
    });
    if (!best && (!types || types.includes('munition'))) {
        projectiles.forEach(p => {
            if (p.team !== source.team && !p.dead && !(p instanceof Bullet)) {
                const d = dist(source, p);
                if (d < minD && (!types || isValidTarget(p, types))) { minD = d; best = p; }
            }
        });
    }
    if (!best && types && types.includes('structure')) {
        islands.forEach(i => {
            if (i.owner !== TEAM_NEUTRAL && i.owner !== source.team) {
                i.buildings.forEach(b => { if (!b.dead) { const d = dist(source, b); if (d < minD) { minD = d; best = b; } } });
            }
        });
    }
    return best;
}

function getAiTargetPriority(target) {
    if (target instanceof Building) {
        if (target.type === 'SAM_SITE' || target.type.includes('MANPADS') || target.type.includes('SPAA')) return 120;
        if (target.type === 'AIRPORT') return 95;
        if (target.type === 'PORT') return 85;
        return 60;
    }
    if (target instanceof Unit) {
        if (target.data.type === 'air' || target.data.type === 'heli') return 80;
        if (target.data.type === 'ship') return 75;
        return 50;
    }
    return 0;
}

function chooseBestAiTarget(unit, team) {
    const candidates = [];
    entities.forEach(e => { if (e.team !== team && !e.dead && e.visible) candidates.push(e); });
    islands.forEach(i => {
        if (i.owner !== TEAM_NEUTRAL && i.owner !== team) {
            i.buildings.forEach(b => { if (!b.dead) candidates.push(b); });
        }
    });

    let best = null;
    let bestScore = -Infinity;
    candidates.forEach(target => {
        const d = dist(unit, target);
        let bestWeaponScore = -Infinity;
        unit.weapons.forEach(w => {
            if (w.ammo <= 0 && w.def.type !== 'GUN' && !w.def.passive) return;
            if (!w.def.targets || !isValidTarget(target, w.def.targets)) return;
            const rangeBias = Math.max(0, (w.def.range || 100) - d) * 0.02;
            const damageBias = (w.def.damage || 5) * 0.3;
            bestWeaponScore = Math.max(bestWeaponScore, rangeBias + damageBias);
        });
        if (bestWeaponScore === -Infinity) return;
        const score = bestWeaponScore + getAiTargetPriority(target) - d * 0.03;
        if (score > bestScore) { bestScore = score; best = target; }
    });
    return best;
}

// --- INITIALIZATION ---

function generateSessionCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function updateMultiplayerSetup() {
    const mode = document.getElementById('mode-select').value;
    const options = document.getElementById('multiplayer-options');
    const codeInput = document.getElementById('session-code');
    const status = document.getElementById('multiplayer-status');
    const isMp = mode === 'multiplayer-host' || mode === 'multiplayer-join';

    options.style.display = isMp ? 'block' : 'none';
    if (!isMp) return;

    if (mode === 'multiplayer-host') {
        codeInput.value = generateSessionCode();
        codeInput.readOnly = true;
        status.innerText = 'Hosting lobby (share code for Firebase sync)';
    } else {
        codeInput.readOnly = false;
        codeInput.value = '';
        status.innerText = 'Enter host code to join lobby';
    }
}

function hideEndOverlay() {
    document.getElementById('overlay').style.display = 'none';
}

function toDisplayStatLabel(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
        .replace(/\b\w/g, c => c.toUpperCase());
}

function formatStatValue(value) {
    if (typeof value === 'number') return Number.isInteger(value) ? `${value}` : value.toFixed(2);
    if (Array.isArray(value)) return value.join(', ');
    return `${value}`;
}

async function loadEncyclopediaDescriptions() {
    if (encyclopediaDescriptionsLoaded) return;
    const response = await fetch('encyclopedia_discriptions.txt', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to load encyclopedia descriptions (${response.status})`);
    const text = await response.text();
    const parsed = { units: {}, structures: {}, munitions: {} };
    let section = null;

    text.split('\n').forEach(rawLine => {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) return;
        if (line.startsWith('[') && line.endsWith(']')) {
            const sectionName = line.slice(1, -1).toLowerCase();
            section = ['units', 'structures', 'munitions'].includes(sectionName) ? sectionName : null;
            return;
        }
        if (!section) return;
        const splitIndex = line.indexOf('|');
        if (splitIndex === -1) return;
        const key = line.slice(0, splitIndex).trim();
        const description = line.slice(splitIndex + 1).trim();
        if (key) parsed[section][key] = description;
    });

    encyclopediaDescriptions = parsed;
    encyclopediaDescriptionsLoaded = true;
}

function getEncyclopediaDescription(type, key, fallback) {
    const sectionMap = {
        unit: encyclopediaDescriptions.units,
        structure: encyclopediaDescriptions.structures,
        munition: encyclopediaDescriptions.munitions
    };
    return sectionMap[type]?.[key] || fallback;
}

function getEncyclopediaData() {
    if (encyclopediaState.entries) return encyclopediaState.entries;
    const unitTypeCategory = { ground: 'ground', ship: 'naval', air: 'air', heli: 'air' };
    const hiddenUnitTypes = new Set(['cruise']);
    const hiddenUnits = new Set(['CRUISE_MISSILE_UNIT', 'HYPERSONIC_ASHM_UNIT', 'PILE_DRIVER_TBM_UNIT']);
    const categories = { ground: [], naval: [], air: [], munitions: [] };
    const unitStats = ['cost', 'hp', 'speed', 'turn', 'fuel', 'ammo', 'capacity', 'range', 'damage', 'reload'];

    Object.entries(UNIT_TYPES).forEach(([key, def]) => {
        if (hiddenUnits.has(key) || hiddenUnitTypes.has(def.type)) return;
        const category = unitTypeCategory[def.type];
        if (!category) return;
        const stats = {};
        unitStats.forEach(statKey => {
            if (def[statKey] !== undefined) stats[toDisplayStatLabel(statKey)] = formatStatValue(def[statKey]);
        });
        stats.Role = def.role || 'N/A';
        stats.Hardpoints = `${def.hardpoints?.length || 0}`;
        categories[category].push({
            key,
            unitKey: key,
            icon: def.icon || '🧩',
            name: def.name || key,
            subtitle: `${category.toUpperCase()} UNIT`,
            description: getEncyclopediaDescription('unit', key, `${def.name || key} (${def.type} unit).`),
            stats
        });
    });

    Object.entries(BUILDINGS).forEach(([key, def]) => {
        const stats = {};
        ['hp', 'range', 'damage', 'reload'].forEach(statKey => {
            if (def[statKey] !== undefined) stats[toDisplayStatLabel(statKey)] = formatStatValue(def[statKey]);
        });
        categories.ground.push({
            key,
            icon: '🏗️',
            name: def.name || key,
            subtitle: 'GROUND STRUCTURE',
            description: getEncyclopediaDescription('structure', key, `${def.name || key} (ground structure).`),
            stats
        });
    });

    Object.entries(WEAPONS).forEach(([key, def]) => {
        const stats = {};
        ['type', 'damage', 'cooldown', 'speed', 'range', 'turn', 'ammo', 'burst', 'guidance', 'targets'].forEach(statKey => {
            if (def[statKey] !== undefined) stats[toDisplayStatLabel(statKey)] = formatStatValue(def[statKey]);
        });
        categories.munitions.push({
            key,
            icon: def.icon || '💥',
            name: def.name || key,
            subtitle: 'MUNITION',
            description: getEncyclopediaDescription('munition', key, `${def.name || key} (${def.type || 'munition'}).`),
            stats
        });
    });

    Object.values(categories).forEach(list => list.sort((a, b) => a.name.localeCompare(b.name)));
    encyclopediaState.entries = categories;
    return categories;
}

function renderEncyclopedia() {
    const data = getEncyclopediaData();
    const tabs = document.getElementById('encyclopedia-category-tabs');
    const categoryLabels = {
        ground: 'Ground Units + Structures',
        naval: 'Naval Units',
        air: 'Air Units',
        munitions: 'Munitions'
    };
    tabs.innerHTML = '';
    Object.entries(categoryLabels).forEach(([key, label]) => {
        const btn = document.createElement('button');
        btn.className = `encyclopedia-tab ${encyclopediaState.category === key ? 'active' : ''}`;
        btn.innerText = label;
        btn.onclick = () => {
            encyclopediaState.category = key;
            encyclopediaState.index = 0;
            renderEncyclopedia();
        };
        tabs.appendChild(btn);
    });

    const activeList = data[encyclopediaState.category] || [];
    if (activeList.length === 0) return;
    encyclopediaState.index = (encyclopediaState.index + activeList.length) % activeList.length;
    const entry = activeList[encyclopediaState.index];

    const title = document.getElementById('encyclopedia-entry-title');
    title.innerHTML = '';
    title.appendChild(createIconElement({
        emoji: entry.icon,
        assetPath: entry.unitKey ? getUnitIconAssetPath(entry.unitKey) : null,
        alt: `${entry.name} icon`,
        className: 'icon-large'
    }));
    const titleText = document.createElement('span');
    titleText.innerText = ` ${entry.name}`;
    title.appendChild(titleText);
    document.getElementById('encyclopedia-entry-subtitle').innerText = entry.subtitle;
    const categoryDescription = ENCYCLOPEDIA_DESCRIPTIONS?.categories?.[encyclopediaState.category] || '';
    document.getElementById('encyclopedia-entry-description').innerText = `${entry.description}\n\n${categoryDescription}`;

    const statsContainer = document.getElementById('encyclopedia-entry-stats');
    statsContainer.innerHTML = '';
    Object.entries(entry.stats).forEach(([label, value]) => {
        const statDiv = document.createElement('div');
        statDiv.className = 'encyclopedia-stat';
        statDiv.innerHTML = `<strong>${label}:</strong> ${value}`;
        statsContainer.appendChild(statDiv);
    });
    document.getElementById('encyclopedia-progress').innerText = `${encyclopediaState.index + 1} / ${activeList.length}`;
}

async function showEncyclopedia() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('setup-menu').style.display = 'none';
    document.getElementById('encyclopedia-menu').style.display = 'flex';
    try {
        await loadEncyclopediaDescriptions();
    } catch (err) {
        console.warn(err);
    }
    encyclopediaState.entries = null;
    renderEncyclopedia();
    gameState = 'ENCYCLOPEDIA';
}

function cycleEncyclopediaEntry(delta) {
    const data = getEncyclopediaData();
    const activeList = data[encyclopediaState.category] || [];
    if (activeList.length === 0) return;
    encyclopediaState.index = (encyclopediaState.index + delta + activeList.length) % activeList.length;
    renderEncyclopedia();
}

function initGame() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight; 
    TEAMS[TEAM_PLAYER].tech = new Set([...DEFAULT_UNLOCKS]);
    TEAMS[TEAM_AI].tech = new Set([...DEFAULT_UNLOCKS]);
    preloadIcons();
    requestAnimationFrame(loop);
}

function showMainMenu() {
    document.getElementById('main-menu').style.display = 'flex';
    document.getElementById('setup-menu').style.display = 'none';
    document.getElementById('encyclopedia-menu').style.display = 'none';
    document.getElementById('ui-layer').style.display = 'none';
    hideEndOverlay();
    gamePaused = false;
    gameState = 'MENU';
}

function returnToMainMenu() {
    showMainMenu();
}

function showSetup() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('setup-menu').style.display = 'flex';
    document.getElementById('map-size').value = "1";
    document.getElementById('island-size').value = "50";
    document.getElementById('tutorial-mode').value = "OFF";
    generateMap(); 
    updateMultiplayerSetup();
    gameState = 'SETUP';
}

function randomizeMap() {
    generateMap();
}

function addBaseIsland(x, y, radius, owner, isMainBase, portAngle = null) {
    const isl = new Island(x, y, radius, isMainBase);
    isl.owner = owner;
    islands.push(isl);
    isl.buildings.push(new Building(x, y, owner, 'AIRPORT'));
    isl.buildings.push(new Building(x + (owner === TEAM_AI ? -30 : 30), y + (owner === TEAM_AI ? -30 : 30), owner, 'SAM_SITE'));
    isl.buildings.push(createPortBuilding(isl, owner, portAngle));
    isl.buildings.push(new Building(x + (owner === TEAM_AI ? 30 : -30), y + 40, owner, 'CONSTRUCTION_YARD'));
    isl.buildings.push(new Building(x + (owner === TEAM_AI ? 35 : -35), y - 35, owner, 'BASE_FORT'));
    return isl;
}

function addNeutralBaseIsland(x, y, radius, includeYard = false) {
    const isl = new Island(x, y, radius);
    islands.push(isl);
    isl.buildings.push(new Building(x, y, TEAM_NEUTRAL, 'AIRPORT'));
    isl.buildings.push(createPortBuilding(isl, TEAM_NEUTRAL));
    if (includeYard) isl.buildings.push(new Building(x + 24, y + 24, TEAM_NEUTRAL, 'CONSTRUCTION_YARD'));
    return isl;
}

function generateNavalBattleMap(islSize, sizeMult) {
    const edgeCount = 6 + sizeMult * 2;
    const margin = 36;
    for (let i = 0; i < edgeCount; i++) {
        const side = i % 4;
        const t = (Math.floor(i / 4) + 1) / (Math.ceil(edgeCount / 4) + 1);
        let x, y;
        if (side === 0) { x = worldWidth * t; y = margin; }
        else if (side === 1) { x = worldWidth - margin; y = worldHeight * t; }
        else if (side === 2) { x = worldWidth * (1 - t); y = worldHeight - margin; }
        else { x = margin; y = worldHeight * (1 - t); }
        islands.push(new Island(x, y, Math.max(18, islSize * 0.45)));
    }
}

function generateCombinedMap(islSize, sizeMult) {
    const ring = getCombinedRingWidth();
    const baseRadius = Math.min(islSize + 40, ring * 0.42);
    addBaseIsland(ring * 0.58, worldHeight / 2, baseRadius, TEAM_PLAYER, true, Math.PI * 0.0);
    addBaseIsland(worldWidth - ring * 0.58, worldHeight / 2, baseRadius, TEAM_AI, true, Math.PI);

    const topBases = 1 + Math.floor(Math.random() * 2);
    const bottomBases = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < topBases; i++) {
        const x = worldWidth * ((i + 1) / (topBases + 1));
        addNeutralBaseIsland(x, ring * 0.55, Math.min(islSize, ring * 0.32), true);
    }
    for (let i = 0; i < bottomBases; i++) {
        const x = worldWidth * ((i + 1) / (bottomBases + 1));
        addNeutralBaseIsland(x, worldHeight - ring * 0.55, Math.min(islSize, ring * 0.32), true);
    }

    const middleIslands = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < middleIslands; i++) {
        const x = ring + islSize + Math.random() * Math.max(20, worldWidth - (ring + islSize) * 2);
        const y = ring + islSize + Math.random() * Math.max(20, worldHeight - (ring + islSize) * 2);
        if (islands.some(isl => Math.hypot(isl.x - x, isl.y - y) < islSize * 3)) { i--; continue; }
        addNeutralBaseIsland(x, y, islSize, false);
    }
    buildCombinedRoadNetwork();
}

function spawnInitialNavalBattleFleet(team) {
    const leftSide = team === TEAM_PLAYER;
    const anchorX = leftSide ? worldWidth * 0.18 : worldWidth * 0.82;
    const facing = leftSide ? 0 : Math.PI;
    const formation = [
        ['CARRIER', 0, 0],
        ['DESTROYER', leftSide ? 85 : -85, -80],
        ['DESTROYER', leftSide ? 85 : -85, 80],
        ['ARSENAL_CRUISER', leftSide ? -70 : 70, -35],
        ['LANDING_SHIP', leftSide ? -70 : 70, 35],
        ['HUNTER_FRIGATE', leftSide ? 155 : -155, 0]
    ];
    formation.forEach(([typeKey, dx, dy]) => {
        const unit = new Unit(anchorX + dx, worldHeight / 2 + dy, team, typeKey);
        unit.angle = facing;
        entities.push(unit);
    });
}

function drawCombinedTerrain(ctx) {
    const ring = getCombinedRingWidth();
    ctx.fillStyle = '#3a5f3a';
    ctx.fillRect(0, 0, worldWidth, ring);
    ctx.fillRect(0, worldHeight - ring, worldWidth, ring);
    ctx.fillRect(0, ring, ring, worldHeight - ring * 2);
    ctx.fillRect(worldWidth - ring, ring, ring, worldHeight - ring * 2);
    ctx.strokeStyle = '#254225';
    ctx.lineWidth = 4;
    ctx.strokeRect(ring, ring, worldWidth - ring * 2, worldHeight - ring * 2);
}

function generateMap() {
    islands.length = 0; 
    entities.length = 0; 
    landRoads.length = 0;
    roadNodes.length = 0;
    radarDetectionBlips = [];
    lastRadarPingFrame = -1;
    TEAMS[TEAM_PLAYER].zones = [];
    TEAMS[TEAM_AI].zones = [];
    
    const sizeMult = parseInt(document.getElementById('map-size').value) || 1;
    const islSize = parseInt(document.getElementById('island-size').value) || 50;
    currentMapType = document.getElementById('map-type').value;

    worldWidth = window.innerWidth * sizeMult;
    worldHeight = (window.innerHeight - 150) * sizeMult; 
    
    camera.x = (worldWidth - window.innerWidth) / 2;
    camera.y = (worldHeight - (window.innerHeight - 150)) / 2;

    if (isNavalBattleMap()) {
        generateNavalBattleMap(islSize, sizeMult);
        return;
    }

    if (isCombinedMap()) {
        generateCombinedMap(islSize, sizeMult);
        return;
    }

    addBaseIsland(200, worldHeight / 2, islSize + 40, TEAM_PLAYER, true, Math.PI * 0.85);
    addBaseIsland(worldWidth - 200, worldHeight / 2, islSize + 40, TEAM_AI, true, Math.PI * -0.2);

    const islandCount = 4 * sizeMult;
    for(let i=0; i<islandCount; i++) {
        let x = worldWidth * 0.15 + Math.random() * (worldWidth * 0.7);
        let y = worldHeight * 0.1 + Math.random() * (worldHeight * 0.8);
        if (islands.some(isl => Math.hypot(isl.x-x, isl.y-y) < (islSize * 3.5))) { i--; continue; }
        addNeutralBaseIsland(x, y, islSize, isLandMap() && Math.random() < 0.45);
    }
    if (isLandMap()) buildLandRoadNetwork();
}

function startGame() {
    const mode = document.getElementById('mode-select').value;
    const difficultySelect = document.getElementById('difficulty-select');
    currentAiDifficulty = difficultySelect ? difficultySelect.value : 'NORMAL';
    const aiProfile = getAiDifficultyProfile();
    isSpectator = (mode === 'spectator');
    multiplayerMode = mode === 'multiplayer-host' ? 'HOST' : (mode === 'multiplayer-join' ? 'JOIN' : 'OFF');
    multiplayerSessionCode = '';
    tutorialMode = document.getElementById('tutorial-mode').value === 'ON';

    if (multiplayerMode !== 'OFF') {
        const sessionInput = document.getElementById('session-code');
        const normalizedCode = sessionInput.value.trim().toUpperCase();
        if (!normalizedCode) {
            alert('Session code is required for multiplayer.');
            return;
        }
        multiplayerSessionCode = normalizedCode;
    }

    TEAMS[TEAM_PLAYER].money = isSpectator ? aiProfile.aiStartingMoney : aiProfile.playerStartingMoney;
    TEAMS[TEAM_AI].money = aiProfile.aiStartingMoney;
    TEAMS[TEAM_PLAYER].tech = new Set([...DEFAULT_UNLOCKS]);
    TEAMS[TEAM_AI].tech = new Set([...DEFAULT_UNLOCKS]);
    TEAMS[TEAM_PLAYER].zones = [];
    TEAMS[TEAM_AI].zones = [];
    gameTime = 0;
    resetAiCommanderStates();
    resetTeamLoadoutConfigs();
    aiCommanderDebugEnabled = false;
    document.getElementById('commander-debug-button')?.classList.remove('active');
    radarDetectionBlips = [];
    lastRadarPingFrame = -1;
    gameOver = false;
    hideEndOverlay();
    gamePaused = false;

    if (isNavalBattleMap()) {
        spawnInitialNavalBattleFleet(TEAM_PLAYER);
        spawnInitialNavalBattleFleet(TEAM_AI);
    } else if(supportsNavalUnits()) {
        entities.push(new Unit(300, worldHeight/2, TEAM_PLAYER, 'CARRIER'));
        entities.push(new Unit(worldWidth - 300, worldHeight/2, TEAM_AI, 'CARRIER'));
    }
    
    if (!isNavalBattleMap()) entities.push(new Unit(250, worldHeight/2 - 50, TEAM_PLAYER, 'FIGHTER'));

    document.getElementById('setup-menu').style.display = 'none';
    document.getElementById('ui-layer').style.display = 'flex';
    
    createUI();
    initTutorial();
    gameState = 'GAME';

    if (multiplayerMode !== 'OFF') {
        const role = multiplayerMode === 'HOST' ? 'HOSTING' : 'JOINED';
        addParticle(camera.x + width / 2, camera.y + 60, 'text', `${role}: ${multiplayerSessionCode}`);
    }
}

function initTutorial() {
    if (!tutorialMode) {
        tutorialState = null;
        if (tutorialUi.overlay) tutorialUi.overlay.style.display = 'none';
        return;
    }
    tutorialUi.overlay = document.getElementById('tutorial-overlay');
    tutorialUi.message = document.getElementById('tutorial-message');
    tutorialUi.highlight = document.getElementById('tutorial-highlight');
    if (tutorialUi.overlay) tutorialUi.overlay.style.display = 'block';
    tutorialState = {
        step: 0,
        isLand: supportsGroundUnits(),
        fighterSpawned: false,
        researchOpened: false,
        researchCompleted: false,
        loadoutOpened: false,
        strikeOpened: false,
        slotSelected: false,
        armamentSelected: false,
        zoneUsed: false,
        islandCaptured: false
    };
    updateTutorialStep();
}

function setTutorialMessage(text) {
    if (!tutorialMode || !tutorialUi.message) return;
    tutorialUi.message.innerText = text;
}
function highlightTutorialElement(el, pad = 12) {
    if (!tutorialMode || !tutorialUi.highlight || !el) return;
    const r = el.getBoundingClientRect();
    const d = Math.max(r.width, r.height) + pad * 2;
    tutorialUi.highlight.style.width = `${d}px`;
    tutorialUi.highlight.style.height = `${d}px`;
    tutorialUi.highlight.style.left = `${r.left + r.width / 2 - d / 2}px`;
    tutorialUi.highlight.style.top = `${r.top + r.height / 2 - d / 2}px`;
}
function updateTutorialStep() {
    if (!tutorialMode || !tutorialState) return;
    if (!tutorialUi.overlay) return;
    const fighterBtn = document.querySelector('.btn-build[data-unit-key="FIGHTER"]');
    const loadoutBtn = document.getElementById('btn-edit-loadout');
    const strikeBtn = document.querySelector('.btn-build[data-unit-key="STRIKE"]');
    const slotEl = document.querySelector('#plane-schematic .slot');
    const armamentEl = document.querySelector('#weapon-selector .weapon-option:not(.locked)');

    if (!tutorialState.fighterSpawned) {
        tutorialState.step = 0;
        setTutorialMessage('Tutorial: Spawn/control an air unit (click Fighter).');
        if (fighterBtn) highlightTutorialElement(fighterBtn, 20);
        return;
    }
    if (!tutorialState.researchOpened) {
        tutorialState.step = 1;
        setTutorialMessage('Open the Research menu.');
        const researchBtn = Array.from(document.querySelectorAll('#controls-panel .btn-toggle')).find(b => b.innerText.trim() === 'Research');
        if (researchBtn) highlightTutorialElement(researchBtn, 18);
        return;
    }
    if (!tutorialState.researchCompleted) {
        tutorialState.step = 2;
        setTutorialMessage('Purchase one research upgrade.');
        const availableNode = document.querySelector('#research-tree .tech-node.available');
        if (availableNode) highlightTutorialElement(availableNode, 12);
        return;
    }
    if (!tutorialState.loadoutOpened) {
        tutorialState.step = 3;
        setTutorialMessage('Click Loadout.');
        if (loadoutBtn) highlightTutorialElement(loadoutBtn, 18);
        return;
    }
    if (!tutorialState.strikeOpened) {
        setTutorialMessage('Click the STRIKE aircraft.');
        if (strikeBtn) highlightTutorialElement(strikeBtn, 20);
        return;
    }
    if (!tutorialState.slotSelected) {
        setTutorialMessage('Click a pylon / hardpoint slot.');
        if (slotEl) highlightTutorialElement(slotEl, 18);
        return;
    }
    if (!tutorialState.armamentSelected) {
        setTutorialMessage('Select an armament.');
        if (armamentEl) highlightTutorialElement(armamentEl, 20);
        return;
    }
    if (!tutorialState.zoneUsed) {
        setTutorialMessage('Use Zones: toggle Zones and draw one.');
        const zonesBtn = document.getElementById('btn-zones');
        if (zonesBtn) highlightTutorialElement(zonesBtn, 18);
        return;
    }
    if (!tutorialState.islandCaptured) {
        setTutorialMessage('Capture a neutral/enemy island with infantry.');
        tutorialUi.highlight.style.width = '0px';
        tutorialUi.highlight.style.height = '0px';
        return;
    }
    setTutorialMessage(tutorialState.isLand ? 'Great! Now use ground units to finish the mission.' : 'Great! Now use naval units to finish the mission.');
    tutorialUi.highlight.style.width = '0px';
    tutorialUi.highlight.style.height = '0px';
}

// --- ZONES ---
function toggleZones() {
    zoneEditMode = !zoneEditMode;
    const btn = document.getElementById('btn-zones');
    const panel = document.getElementById('zone-panel');
    btn.classList.toggle('active');
    panel.style.display = zoneEditMode ? 'flex' : 'none';
    if (!zoneEditMode) currentZoneType = null;
    zoneDragStart = null;
    if (tutorialMode && tutorialState) updateTutorialStep();
}

function setZoneMode(type) {
    currentZoneType = type;
    document.querySelectorAll('.btn-zone').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-zone-${type.toLowerCase()}`).classList.add('active');
}

function clearZones() {
    TEAMS[TEAM_PLAYER].zones = [];
    addParticle(camera.x + width/2, camera.y + height/2, 'text', 'ZONES CLEARED');
}

function openManualStrikeDialog() {
    if (selection.length === 0 || !(selection[0] instanceof Unit)) return;
    const unit = selection[0];
    const eligibleWeapons = unit.weapons.filter(w => !w.def.passive && w.def.type !== 'GUN' && w.ammo > 0);
    if (eligibleWeapons.length === 0) {
        addParticle(unit.x, unit.y - 15, 'text', 'NO MUNITIONS');
        return;
    }
    const menuText = eligibleWeapons.map((w, i) => `${i + 1}. ${w.def.name} (${w.ammo})`).join('\n');
    const weaponChoice = parseInt(prompt(`Select weapon:\n${menuText}`, '1'), 10);
    if (!weaponChoice || weaponChoice < 1 || weaponChoice > eligibleWeapons.length) return;
    const selectedWeapon = eligibleWeapons[weaponChoice - 1];

    const munitionCount = parseInt(prompt(`How many ${selectedWeapon.def.name} to fire? (max ${selectedWeapon.ammo})`, `${Math.min(4, selectedWeapon.ammo)}`), 10);
    if (!munitionCount || munitionCount < 1) return;
    const targetCount = parseInt(prompt('How many targets for this salvo?', '1'), 10);
    if (!targetCount || targetCount < 1) return;

    manualStrikeMode = true;
    manualStrikePlan = {
        unit,
        weapon: selectedWeapon,
        remainingShots: Math.min(selectedWeapon.ammo, munitionCount),
        targetsNeeded: targetCount,
        targets: []
    };
    addParticle(unit.x, unit.y - 20, 'text', `MANUAL STRIKE: PICK ${targetCount} TARGETS`);
}

function executeManualStrikePlan() {
    if (!manualStrikePlan || !manualStrikePlan.unit || manualStrikePlan.unit.dead) return;
    const { unit, weapon, targets, remainingShots } = manualStrikePlan;
    if (!weapon || weapon.ammo <= 0 || targets.length === 0) return;

    const shots = Math.min(remainingShots, weapon.ammo);
    for (let s = 0; s < shots; s++) {
        const target = targets[s % targets.length];
        if (!target || target.dead) continue;
        weapon.ammo--;
        unit.spawnWeaponProjectile(weapon, target);
    }
    weapon.cooldown = Math.max(1, weapon.cooldown);
    unit.fireTimer = 0;
    manualStrikeMode = false;
    manualStrikePlan = null;
}

// --- UI / TECH ---

function toggleEditMode() {
    editMode = !editMode;
    const btn = document.getElementById('btn-edit-loadout');
    btn.classList.toggle('active');
    btn.innerText = editMode ? "Select Unit" : "Loadout";
    const btns = document.querySelectorAll('.btn-build');
    btns.forEach(b => { if(editMode) b.classList.add('edit-mode'); else b.classList.remove('edit-mode'); });
    if (tutorialMode && tutorialState && editMode) tutorialState.loadoutOpened = true;
    if (tutorialMode && tutorialState) updateTutorialStep();
}

function openModal(id) { 
    if (multiplayerMode === 'OFF' && id !== 'construction-modal') gamePaused = true;
    document.getElementById(id).style.display = 'flex'; 
}
function closeModal(id) { 
    if (multiplayerMode === 'OFF' && id !== 'construction-modal') gamePaused = false;
    document.getElementById(id).style.display = 'none'; 
    editingUnitKey = null; 
    selectedSlotIndex = null;
}

function openLoadoutMenu(unitKey) {
    if (tutorialMode && tutorialState && unitKey === 'STRIKE') tutorialState.strikeOpened = true;
    editingUnitKey = unitKey;
    const data = UNIT_TYPES[unitKey];
    const loadout = getTeamUnitLoadout(TEAM_PLAYER, unitKey);
    document.getElementById('loadout-title').innerText = data.name;
    openModal('loadout-modal');
    
    document.getElementById('rotor-visual').style.display = data.type === 'heli' ? 'block' : 'none';
    const container = document.getElementById('plane-schematic');
    const wings = container.querySelectorAll('.schematic-wing');
    const tail = container.querySelector('.schematic-tail');
    
    if(unitKey === 'DESTROYER' || unitKey === 'CARRIER') {
        wings.forEach(w => w.style.display = 'none');
        tail.style.display = 'none';
        document.getElementById('rotor-visual').style.display = 'none';
    } else {
        wings.forEach(w => w.style.display = 'block');
        tail.style.display = 'block';
    }

    const oldSlots = container.querySelectorAll('.slot'); oldSlots.forEach(s => s.remove());
    
    data.hardpoints.forEach((hp, index) => {
        const div = document.createElement('div');
        div.className = 'slot';
        div.style.left = `calc(50% + ${hp.x}px - 40px)`; div.style.top = `calc(50% + ${hp.y}px - 17px)`;
        const equipped = loadout[index]?.equipped || hp.equipped;
        const currentAmmo = getConfiguredSlotAmmo(unitKey, index, equipped, TEAM_PLAYER);
        const ammoLabel = equipped !== 'EMPTY' ? ` (${currentAmmo})` : '';
        div.innerHTML = `<span class="slot-name">${hp.name}</span>${WEAPONS[equipped].name}${ammoLabel}`;
        div.onclick = () => selectSlot(index, div);
        container.appendChild(div);
    });
    selectSlot(null, null); 
    if (tutorialMode && tutorialState) updateTutorialStep();
}

function selectSlot(index, domElement) {
    selectedSlotIndex = index;
    const allSlots = document.querySelectorAll('.slot'); allSlots.forEach(s => s.style.borderColor = '#555');
    const selector = document.getElementById('weapon-selector'); selector.innerHTML = '';

    if (index === null) {
        selector.innerHTML = '<div style="color:#666; width:100%; text-align:center; padding-top:40px;">Select a slot</div>';
        renderSlotAmmoConfig();
        return;
    }
    if (tutorialMode && tutorialState && index !== null) tutorialState.slotSelected = true;
    if (domElement) domElement.style.borderColor = '#ffd700';

    const slotDef = UNIT_TYPES[editingUnitKey].hardpoints[index];
    const slotConfig = getLoadoutSlotConfig(TEAM_PLAYER, editingUnitKey, index);
    const equipped = slotConfig?.equipped || slotDef.equipped;
    const allowedTypes = slotDef.types;

    Object.keys(WEAPONS).forEach(wKey => {
        const w = WEAPONS[wKey];
        if (isWeaponAllowedForSlot(UNIT_TYPES[editingUnitKey], slotDef, wKey)) {
            const opt = document.createElement('div');
            opt.className = 'weapon-option';
            if (equipped === wKey) opt.classList.add('selected');
            if (!isUnlocked(TEAM_PLAYER, wKey)) opt.classList.add('locked');
            
            const iconWrap = createIconElement({
                emoji: w.icon,
                assetPath: getWeaponIconAssetPath(wKey),
                alt: `${w.name} icon`
            });
            iconWrap.style.fontSize = '24px';
            opt.appendChild(iconWrap);
            let html = `<div>${w.name}</div>`;
            if (wKey !== 'EMPTY') {
                html += `<div class="weapon-cap">Cap: ${getConfiguredSlotAmmo(editingUnitKey, index, wKey, TEAM_PLAYER)}</div>`;
            }
            if (!isUnlocked(TEAM_PLAYER, wKey)) html += `<div class="lock-icon">🔒</div>`;
            
            opt.insertAdjacentHTML('beforeend', html);
            opt.onclick = () => { if(isUnlocked(TEAM_PLAYER, wKey)) equipWeapon(wKey); };
            selector.appendChild(opt);
        }
    });
    renderSlotAmmoConfig();
    if (tutorialMode && tutorialState) updateTutorialStep();
}

function equipWeapon(weaponKey) {
    if (editingUnitKey && selectedSlotIndex !== null) {
        if (tutorialMode && tutorialState) tutorialState.armamentSelected = true;
        getTeamUnitLoadout(TEAM_PLAYER, editingUnitKey)[selectedSlotIndex].equipped = weaponKey;
        openLoadoutMenu(editingUnitKey);
        const slots = document.querySelectorAll('.slot'); selectSlot(selectedSlotIndex, slots[selectedSlotIndex]);
        if (tutorialMode && tutorialState) updateTutorialStep();
    }
}

function adjustSlotAmmo(delta) {
    if (!editingUnitKey || selectedSlotIndex === null) return;
    const unit = UNIT_TYPES[editingUnitKey];
    const slot = unit.hardpoints[selectedSlotIndex];
    const slotConfig = getLoadoutSlotConfig(TEAM_PLAYER, editingUnitKey, selectedSlotIndex);
    const weaponKey = slotConfig?.equipped || slot?.equipped;
    if (!slot || !weaponKey || weaponKey === 'EMPTY') return;
    const defaultAmmo = getDefaultWeaponAmmo({ data: unit }, slot, weaponKey);
    if (defaultAmmo >= 9999) return;

    if (!slotConfig.customAmmoByWeapon) slotConfig.customAmmoByWeapon = {};
    const currentAmmo = getConfiguredSlotAmmo(editingUnitKey, selectedSlotIndex, weaponKey, TEAM_PLAYER);
    const nextAmmo = Math.max(1, Math.min(12, currentAmmo + delta));

    if (nextAmmo === defaultAmmo) delete slotConfig.customAmmoByWeapon[weaponKey];
    else slotConfig.customAmmoByWeapon[weaponKey] = nextAmmo;

    openLoadoutMenu(editingUnitKey);
    const slots = document.querySelectorAll('.slot');
    selectSlot(selectedSlotIndex, slots[selectedSlotIndex]);
}

function renderSlotAmmoConfig() {
    const panel = document.getElementById('slot-config-panel');
    if (!panel) return;

    if (!editingUnitKey || selectedSlotIndex === null) {
        panel.innerHTML = '<div class="slot-config-title">Select a hardpoint to configure ammo.</div>';
        return;
    }

    const unit = UNIT_TYPES[editingUnitKey];
    const slot = unit.hardpoints[selectedSlotIndex];
    const slotConfig = getLoadoutSlotConfig(TEAM_PLAYER, editingUnitKey, selectedSlotIndex);
    const weaponKey = slotConfig?.equipped || slot?.equipped;
    if (!slot || !weaponKey || weaponKey === 'EMPTY') {
        panel.innerHTML = '<div class="slot-config-title">Equip a weapon to configure ammo capacity.</div>';
        return;
    }

    const weapon = WEAPONS[weaponKey];
    const ammo = getConfiguredSlotAmmo(editingUnitKey, selectedSlotIndex, weaponKey, TEAM_PLAYER);
    const defaultAmmo = getDefaultWeaponAmmo({ data: unit }, slot, weaponKey);
    if (!weapon || defaultAmmo >= 9999) {
        panel.innerHTML = `<div class="slot-config-title">${slot.name}: ${weapon ? weapon.name : 'N/A'} has unlimited ammo.</div>`;
        return;
    }

    panel.innerHTML = `
        <div class="slot-config-title">${slot.name}: ${weapon.name} ammo capacity</div>
        <div class="slot-ammo-controls">
            <button class="btn-ammo" onclick="adjustSlotAmmo(-1)">−</button>
            <div class="slot-ammo-value">${ammo}</div>
            <button class="btn-ammo" onclick="adjustSlotAmmo(1)">+</button>
            <div class="slot-config-title">(Default: ${defaultAmmo})</div>
        </div>
    `;
}

function openResearch() {
    if (tutorialMode && tutorialState) tutorialState.researchOpened = true;
    const container = document.getElementById('research-tree');
    container.innerHTML = '';
    
    document.getElementById('research-money').innerText = '$' + Math.floor(TEAMS[TEAM_PLAYER].money);

    Object.keys(TECH_TREE).forEach(cat => {
        const div = document.createElement('div');
        div.className = 'tech-category';
        let html = `<h4>${cat}</h4><div class="tech-row">`;
        
        TECH_TREE[cat].forEach((tech, i) => {
            const unlocked = isUnlocked(TEAM_PLAYER, tech.id);
            const w = WEAPONS[tech.id] || TECH_UPGRADES[tech.id];
            const name = w ? w.name : tech.id;
            const icon = w && w.icon ? w.icon : '📶';
            
            let statusClass = unlocked ? 'unlocked' : 'locked';
            let reqMet = true;
            if (tech.req) { if (!isUnlocked(TEAM_PLAYER, tech.req)) reqMet = false; }
            if (!unlocked && reqMet) statusClass = 'available';

            if (i > 0) html += `<div class="tech-arrow">→</div>`;
            const iconHtml = createIconElement({
                emoji: icon,
                assetPath: getWeaponIconAssetPath(tech.id),
                alt: name,
                className: 'icon-medium'
            }).outerHTML;
            html += `<div class="tech-node ${statusClass}" onclick="researchPlayer('${tech.id}', ${tech.cost})">
                        <div>${iconHtml}</div><div>${name}</div>
                        ${!unlocked ? `<div style="color:#ffd700">$${tech.cost}</div>` : ''}
                     </div>`;
        });
        html += `</div>`;
        div.innerHTML = html;
        container.appendChild(div);
    });
    openModal('research-modal');
    if (tutorialMode && tutorialState) updateTutorialStep();
}

function researchPlayer(techId, cost) {
    if (isUnlocked(TEAM_PLAYER, techId)) return;
    let reqMet = true;
    Object.values(TECH_TREE).forEach(arr => {
        const found = arr.find(t => t.id === techId);
        if(found && found.req && !isUnlocked(TEAM_PLAYER, found.req)) reqMet = false;
    });
    if (!reqMet) return;

    if (TEAMS[TEAM_PLAYER].money >= cost) {
        TEAMS[TEAM_PLAYER].money -= cost;
        TEAMS[TEAM_PLAYER].tech.add(techId);
        autoOptimizeTeamLoadouts(TEAM_PLAYER);
        openResearch(); 
        addParticle(width/2, height/2, 'text', `RESEARCH COMPLETE`);
        
        if (techId === 'CIWS') {
            getTeamUnitLoadout(TEAM_PLAYER, 'CARRIER').forEach(slot => { if (slot.equipped === 'GUN_BASIC') slot.equipped = 'CIWS'; });
            entities.forEach(e => {
                if (e.team === TEAM_PLAYER && e.typeKey === 'CARRIER') {
                    e.loadoutConfig = cloneLoadoutConfig(getTeamUnitLoadout(TEAM_PLAYER, 'CARRIER'));
                    e.initLoadout();
                }
            });
        }
        if (tutorialMode && tutorialState) {
            tutorialState.researchCompleted = true;
            updateTutorialStep();
        }
    }
}

function createUI() {
    const panel = document.getElementById('build-panel');
    panel.innerHTML = '';
    
    Object.keys(UNIT_TYPES).forEach(key => {
        if (['SF', 'SOLDIER_SQUAD', 'SQUAD_AT', 'SQUAD_AA', 'SQUAD_ASSISTANT', 'CRUISE_MISSILE_UNIT', 'HYPERSONIC_ASHM_UNIT', 'PILE_DRIVER_TBM_UNIT'].includes(key)) return; 
        const data = UNIT_TYPES[key];
        
        // Hide naval units on Land maps
        if (!supportsNavalUnits() && data.type === 'ship') return;
        if (isNavalBattleMap() && data.type === 'ship') return;
        // Hide ground units on sea-only maps.
        if (!supportsGroundUnits() && data.type === 'ground') return;

        const btn = document.createElement('div');
        btn.className = 'btn-build';
        btn.dataset.unitKey = key;
        const iconDiv = document.createElement('div');
        iconDiv.className = 'btn-icon';
        iconDiv.appendChild(createIconElement({
            emoji: data.icon,
            assetPath: getUnitIconAssetPath(key),
            alt: `${data.name} icon`,
            className: 'icon-medium'
        }));
        const costDiv = document.createElement('div');
        costDiv.className = 'cost';
        costDiv.innerText = `$${data.cost}`;
        btn.appendChild(iconDiv);
        btn.appendChild(costDiv);
        btn.onmouseenter = (e) => {
            const teamLoadout = getTeamUnitLoadout(TEAM_PLAYER, key);
            let wInfo = data.hardpoints.map((h, idx) => WEAPONS[teamLoadout[idx]?.equipped || h.equipped].name).filter(n => n!=='Empty').join(', ');
            if(!wInfo) wInfo = "None";
            tooltip.style.display = 'block';
            tooltip.innerHTML = `<b>${data.name}</b>\n${data.role}\nHP: ${data.hp}\nLoadout: ${wInfo}`;
        };
        btn.onmousemove = (e) => { tooltip.style.left = e.pageX+10+'px'; tooltip.style.top = e.pageY-60+'px'; }
        btn.onmouseleave = () => tooltip.style.display = 'none';
        
        btn.onclick = () => { 
            if (tutorialMode && tutorialState && key === 'FIGHTER') tutorialState.fighterSpawned = true;
            if (editMode) {
                openLoadoutMenu(key);
            } else if (TEAMS[TEAM_PLAYER].money >= data.cost && !isSpectator) {
                let spawner = null;
                if (selection.length > 0 && selection[0] instanceof Entity) {
                    const sel = selection[0];
                    if (sel.team === TEAM_PLAYER && !sel.dead) {
                        if (data.type === 'ship') {
                            // Ships use main base island for now
                        } else if (canSpawnerCreateUnit(sel, TEAM_PLAYER, data.type)) {
                            spawner = sel;
                        } else if (sel.typeKey === 'CARRIER') {
                            return;
                        }
                    }
                }
                spawnUnit(TEAM_PLAYER, key, spawner); 
            }
            if (tutorialMode && tutorialState) updateTutorialStep();
        };
        panel.appendChild(btn);
    });
}

function canSpawnerCreateUnit(spawner, team, unitType) {
    if (!spawner || spawner.dead || spawner.team !== team) return false;
    if (unitType === 'ship') return false;
    if (spawner.typeKey === 'CARRIER') return unitType === 'air' || unitType === 'heli';
    return spawner.type === 'AIRPORT';
}

function getAiUnitSpawners(team, typeKey) {
    const unitType = UNIT_TYPES[typeKey].type;
    if (unitType === 'ship') return [];

    const spawners = [];
    islands.forEach(i => {
        if (i.owner !== team) return;
        const airport = i.buildings.find(b => b.type === 'AIRPORT' && !b.dead);
        if (airport) spawners.push(airport);
    });

    if (unitType === 'air' || unitType === 'heli') {
        entities.forEach(e => {
            if (canSpawnerCreateUnit(e, team, unitType)) spawners.push(e);
        });
    }
    return spawners;
}

function spawnUnit(team, typeKey, specificSpawner = null) {
    if (isNavalBattleMap() && UNIT_TYPES[typeKey].type === 'ship') return;
    const unitType = UNIT_TYPES[typeKey].type;
    const cost = UNIT_TYPES[typeKey].cost;
    if (TEAMS[team].money < cost) return;

    let spawnPoint = null;
    
    if (specificSpawner) {
        if (!canSpawnerCreateUnit(specificSpawner, team, unitType)) return;
        spawnPoint = specificSpawner;
    } else {
        const spawners = getAiUnitSpawners(team, typeKey);
        if (unitType === 'ship') {
            const base = islands.find(i => i.owner === team && i.isMainBase);
            if (base) spawnPoint = {x: base.x + (team===TEAM_PLAYER ? 80 : -80), y: base.y + 50};
        }
        
        const validSpawners = spawners.filter(s => s);
        if (validSpawners.length > 0) {
            spawnPoint = validSpawners[Math.floor(Math.random() * validSpawners.length)];
        }
    }

    if (spawnPoint) {
        TEAMS[team].money -= cost;
        const u = new Unit(spawnPoint.x, spawnPoint.y, team, typeKey);
        u.angle = team === TEAM_PLAYER ? 0 : Math.PI;
        u.state = 'IDLE'; 
        if (UNIT_TYPES[typeKey].type === 'air') u.speed = u.data.speed * SPEED_SCALE;
        entities.push(u);

        if (typeKey === 'CONVOY') {
            const escorts = (u.loadoutConfig || []).map(slot => WEAPONS[slot.equipped]?.unitType).filter(Boolean);
            const escortTypes = escorts.length > 0 ? escorts : ['TANK', 'IFV', 'APC', 'AAA_BATTERY'];
            u.convoyMembers = [];
            escortTypes.forEach((memberType, idx) => {
                const col = idx % 2;
                const row = Math.floor(idx / 2);
                if (memberType === 'SOLDIER_SQUAD') {
                    const squad = spawnSoldierSquad(team, spawnPoint.x - 30 - row * 16, spawnPoint.y + (col === 0 ? -14 : 14));
                    squad.convoyLeaderId = u.id;
                    u.convoyMembers.push(squad.id);
                } else {
                    const member = new Unit(spawnPoint.x - 35 - row * 28, spawnPoint.y + (col === 0 ? -26 : 26), team, memberType);
                    member.convoyLeaderId = u.id;
                    member.hasCommand = true;
                    entities.push(member);
                    u.convoyMembers.push(member.id);
                }
            });
        }
    }
}

// --- AI Controller ---
let aiTimer = 0;

function getAiControlledUnits(team) {
    return entities.filter(e => e.team === team && !e.dead);
}

function countAiUnits(myUnits, typeKey) {
    return myUnits.filter(u => u.typeKey === typeKey).length;
}

function canAiRadarDetectThreat(source, target) {
    if (!(source instanceof Unit) || !(target instanceof Unit)) return false;
    if (source.dead || target.dead || source.team === target.team || !target.visible) return false;
    const radarRange = getUnitRadarRange(source);
    if (radarRange <= 0) return false;
    if (isAirborneRadarTarget(target)) return canRadarDetectTarget(source, target);
    if (target.data.type === 'ship') return dist(source, target) <= radarRange * 0.85;
    return false;
}

function getRadarDetectedThreat(team, profile, preferredTypes = null) {
    if (Math.random() > profile.threatReactionChance) return null;
    const radarUnits = entities.filter(e => e instanceof Unit && !e.dead && e.team === team && getUnitRadarRange(e) > 0);
    if (radarUnits.length === 0) return null;

    const threats = entities.filter(e => e instanceof Unit && !e.dead && e.visible && e.team !== team && (e.data.type === 'air' || e.data.type === 'heli' || e.data.type === 'ship'));
    let best = null;
    let bestScore = -Infinity;
    threats.forEach(threat => {
        if (preferredTypes && !preferredTypes.includes(threat.data.type)) return;
        const detectingRadar = radarUnits.find(source => canAiRadarDetectThreat(source, threat));
        if (!detectingRadar) return;
        const typeBias = (threat.data.type === 'air' || threat.data.type === 'heli') ? 80 : 55;
        const distanceBias = Math.max(0, getUnitRadarRange(detectingRadar) * getTargetRcs(threat) - dist(detectingRadar, threat)) * 0.04;
        const score = typeBias + distanceBias + getAiTargetPriority(threat);
        if (score > bestScore) { bestScore = score; best = threat; }
    });
    return best;
}

function chooseAiResearch(team, profile) {
    if (TEAMS[team].money <= 3000 || Math.random() >= 0.05 * profile.researchChance) return null;
    const available = [];
    Object.values(TECH_TREE).flat().forEach(t => {
        if (!isUnlocked(team, t.id) && (!t.req || isUnlocked(team, t.req))) available.push(t);
    });
    if (available.length === 0) return null;
    const target = available[Math.floor(Math.random() * available.length)];
    if (TEAMS[team].money < target.cost) return null;

    TEAMS[team].money -= target.cost;
    TEAMS[team].tech.add(target.id);
    autoOptimizeTeamLoadouts(team);
    if (team === TEAM_PLAYER && isSpectator) {
        addParticle(camera.x + width/2, camera.y + height/2, 'text', `AI RESEARCHED: ${target.id}`);
        if (document.getElementById('research-modal').style.display === 'flex') openResearch();
    }
    return target;
}

function chooseAiBuild(team, profile, myUnits) {
    if (Math.random() >= profile.buildChance) return null;

    const enemyIslands = islands.filter(i => i.owner !== team);
    const hasTransport = myUnits.some(u => u.typeKey === 'TRANSPORT');
    const limits = profile.limits;
    const offensiveTypes = ['FIGHTER', 'STRIKE', 'SEAD_FIGHTER', 'BOMBER', 'AC130', 'CONVOY', 'ATTACK_HELI', 'HUNTER_FRIGATE', 'ARSENAL_CRUISER'];
    const offensiveCount = myUnits.filter(u => offensiveTypes.includes(u.typeKey)).length;
    const radarThreat = getRadarDetectedThreat(team, profile);

    let toBuild = null;
    if (radarThreat && (radarThreat.data.type === 'air' || radarThreat.data.type === 'heli')) {
        if (countAiUnits(myUnits, 'FIGHTER') < limits.fighter) toBuild = 'FIGHTER';
        else if (countAiUnits(myUnits, 'IR_APC') < limits.aa && supportsGroundUnits()) toBuild = 'IR_APC';
        else if (countAiUnits(myUnits, 'DESTROYER') < limits.destroyer && canBuildNavalUnits()) toBuild = 'DESTROYER';
    } else if (radarThreat && radarThreat.data.type === 'ship') {
        if (canBuildNavalUnits() && isUnlocked(team, 'HYPERSONIC_ASHM') && countAiUnits(myUnits, 'ARSENAL_CRUISER') < limits.arsenal) toBuild = 'ARSENAL_CRUISER';
        else if (countAiUnits(myUnits, 'STRIKE') < limits.strike) toBuild = 'STRIKE';
        else if (canBuildNavalUnits() && countAiUnits(myUnits, 'HUNTER_FRIGATE') < limits.frigate) toBuild = 'HUNTER_FRIGATE';
    }

    if (!toBuild && supportsGroundUnits() && enemyIslands.length > 0 && countAiUnits(myUnits, 'CONVOY') < limits.ground) toBuild = 'CONVOY';
    else if (!toBuild && enemyIslands.length > 0 && !hasTransport && supportsNavalUnits() && !isNavalBattleMap()) toBuild = 'TRANSPORT';
    else if (!toBuild && countAiUnits(myUnits, 'TANK') < limits.ground && supportsGroundUnits()) toBuild = 'TANK';
    else if (!toBuild && countAiUnits(myUnits, 'IFV') < limits.ground && supportsGroundUnits()) toBuild = 'IFV';
    else if (!toBuild && countAiUnits(myUnits, 'APC') < Math.max(1, Math.ceil(limits.ground / 2)) && supportsGroundUnits()) toBuild = 'APC';
    else if (!toBuild && countAiUnits(myUnits, 'IR_APC') < limits.aa) toBuild = 'IR_APC';
    else if (!toBuild && countAiUnits(myUnits, 'AAA_BATTERY') < Math.max(1, limits.aa - 1)) toBuild = 'AAA_BATTERY';
    else if (!toBuild && supportsGroundUnits() && countAiUnits(myUnits, 'CONVOY') < Math.max(1, limits.ground)) toBuild = 'CONVOY';
    else if (!toBuild && countAiUnits(myUnits, 'FIGHTER') < limits.fighter) toBuild = 'FIGHTER';
    else if (!toBuild && countAiUnits(myUnits, 'SEAD_FIGHTER') < limits.sead) toBuild = 'SEAD_FIGHTER';
    else if (!toBuild && countAiUnits(myUnits, 'STRIKE') < limits.strike) toBuild = 'STRIKE';
    else if (!toBuild && countAiUnits(myUnits, 'AC130') < limits.heavyAir) toBuild = 'AC130';
    else if (!toBuild && countAiUnits(myUnits, 'BOMBER') < limits.heavyAir) toBuild = 'BOMBER';
    else if (!toBuild && countAiUnits(myUnits, 'AWACS') < limits.awacs) toBuild = 'AWACS';
    else if (!toBuild && countAiUnits(myUnits, 'DESTROYER') < limits.destroyer && canBuildNavalUnits()) toBuild = 'DESTROYER';
    else if (!toBuild && countAiUnits(myUnits, 'LANDING_SHIP') < limits.landingShip && canBuildNavalUnits()) toBuild = 'LANDING_SHIP';
    else if (!toBuild && countAiUnits(myUnits, 'HUNTER_FRIGATE') < limits.frigate && canBuildNavalUnits()) toBuild = 'HUNTER_FRIGATE';
    else if (!toBuild && countAiUnits(myUnits, 'SSBN') < limits.ssbn && canBuildNavalUnits()) toBuild = 'SSBN';
    else if (!toBuild && canBuildNavalUnits() && isUnlocked(team, 'HYPERSONIC_ASHM') && countAiUnits(myUnits, 'ARSENAL_CRUISER') < limits.arsenal) toBuild = 'ARSENAL_CRUISER';
    else if (!toBuild && offensiveCount < limits.offensive) toBuild = supportsGroundUnits() ? 'CONVOY' : 'STRIKE';
    else if (!toBuild && Math.random() < limits.heliChance && offensiveCount >= Math.max(2, limits.offensive - 1)) toBuild = 'ATTACK_HELI';

    if (toBuild && (!UNIT_TYPES[toBuild].type.includes('ship') || canBuildNavalUnits())) return toBuild;
    return null;
}

function chooseAiObjective(unit, team, profile, requiresGroundReach = false) {
    const canReach = island => !requiresGroundReach || canGroundUnitReachIsland(unit, island);
    const neutralTargets = islands.filter(i => i.owner === TEAM_NEUTRAL && canReach(i));
    const enemyTargets = islands.filter(i => i.owner !== TEAM_NEUTRAL && i.owner !== team && canReach(i));
    const neutralFirst = Math.random() < profile.neutralAggression;
    const baseAllowed = Math.random() < profile.baseAggression;

    if (neutralFirst && neutralTargets.length > 0) return neutralTargets[Math.floor(Math.random() * neutralTargets.length)];
    if (baseAllowed && enemyTargets.length > 0) return enemyTargets[Math.floor(Math.random() * enemyTargets.length)];
    if (neutralTargets.length > 0) return neutralTargets[Math.floor(Math.random() * neutralTargets.length)];
    if (enemyTargets.length > 0) return enemyTargets[Math.floor(Math.random() * enemyTargets.length)];
    return null;
}

function assignAiOrders(team, profile, myUnits) {
    const radarAirThreat = getRadarDetectedThreat(team, profile, ['air', 'heli']);
    const radarNavalThreat = getRadarDetectedThreat(team, profile, ['ship']);

    myUnits.forEach(u => {
        if (u.state !== 'IDLE' || !u.visible) return;

        const deployWeapon = u.weapons.find(w => w.def.type === 'DEPLOY' && w.ammo > 0);
        if (radarAirThreat && (u.data.role === 'AA' || u.data.role === 'Multi' || u.typeKey === 'DESTROYER') && Math.random() < profile.threatReactionChance) {
            u.targetUnit = radarAirThreat;
            u.hasCommand = true;
        } else if (radarNavalThreat && ['STRIKE', 'BOMBER', 'HUNTER_FRIGATE', 'ARSENAL_CRUISER', 'SSBN'].includes(u.typeKey) && Math.random() < profile.threatReactionChance) {
            u.targetUnit = radarNavalThreat;
            u.hasCommand = true;
        } else if (u.typeKey === 'TRANSPORT' && deployWeapon) {
            if (deployWeapon.def.deployType === 'UNIT') {
                const target = chooseAiObjective(u, team, profile);
                if (target) { u.targetPos = target; u.hasCommand = true; }
            } else {
                const target = islands.find(i => i.owner === team && i.buildings.length < 4);
                if (target) { u.targetPos = target; u.hasCommand = true; }
            }
        } else if (u.typeKey === 'APC' && deployWeapon) {
            const target = chooseAiObjective(u, team, profile, true);
            if (target) {
                u.targetPos = { x: target.x, y: target.y };
                u.hasCommand = true;
            }
        } else if (u.typeKey === 'LANDING_SHIP' && deployWeapon) {
            const target = chooseAiObjective(u, team, profile);
            if (target) u.setTransportAssaultMission(target, { x: target.x, y: target.y });
        } else if (u.typeKey === 'CONVOY') {
            const target = chooseAiObjective(u, team, profile, true);
            if (target) {
                u.targetPos = { x: target.x, y: target.y };
                u.targetUnit = null;
                u.hasCommand = true;
                u.state = 'MOVE';
            }
        } else if ((u.data.role === 'AA' || u.data.role === 'Multi') && Math.random() < profile.attackChance) {
            const preferred = chooseBestAiTarget(u, team);
            if (preferred) u.targetUnit = preferred;
        } else if (u.typeKey === 'IR_APC' || u.typeKey === 'AAA_BATTERY') {
            const ownedIslands = islands.filter(i => i.owner === team);
            const defendIsland = ownedIslands.find(i => dist(u, i) > i.radius * 0.8) || ownedIslands.find(i => i.isMainBase) || ownedIslands[0];
            if (defendIsland) {
                const dx = (Math.random() - 0.5) * defendIsland.radius * 0.6;
                const dy = (Math.random() - 0.5) * defendIsland.radius * 0.6;
                u.targetPos = { x: defendIsland.x + dx, y: defendIsland.y + dy };
                u.hasCommand = true;
            }
        } else if ((u.typeKey === 'HUNTER_FRIGATE' || u.typeKey === 'ARSENAL_CRUISER' || u.typeKey === 'BOMBER' || u.typeKey === 'STRIKE') && Math.random() < profile.attackChance) {
            const suppressionTarget = chooseBestAiTarget(u, team);
            if (suppressionTarget) {
                u.targetUnit = suppressionTarget;
                u.hasCommand = true;
            }
        } else if (u.typeKey === 'CARRIER') {
            if (!u.hasCommand) {
                const target = islands.find(i => i.owner === team && Math.hypot(i.x - u.x, i.y - u.y) > 100);
                if (target) { u.targetPos = target; u.hasCommand = true; }
            }
        } else if (u.typeKey === 'DESTROYER') {
            const carrier = myUnits.find(c => c.typeKey === 'CARRIER');
            if (carrier && dist(u, carrier) > 150) {
                u.targetPos = carrier;
                u.hasCommand = true;
            } else if (!carrier) {
                const base = islands.find(i => i.owner === team && i.isMainBase);
                if (base && dist(u, base) > 200) { u.targetPos = base; u.hasCommand = true; }
            }
        }
    });
}


const aiCommanderStates = new Map();
let aiCommanderDebugEnabled = false;
const AI_COMMANDER_TOP_LEVEL_GOAL = 'DEFEAT_PLAYER';
const AI_COMMANDER_GOALS = [
    'DEFEND_BASE',
    'BREAK_AIR_DEFENSE',
    'EXPAND_ECONOMY',
    'ASSEMBLE_INVASION_FORCE',
    'HUNT_CARRIER',
    'SECURE_AIR_SUPERIORITY',
    'DISRUPT_ECONOMY',
    'NAVAL_SCREEN',
    'RUSH_MAIN_BASE'
];

function seededCommanderRandom(state) {
    state.seed = (1664525 * state.seed + 1013904223) >>> 0;
    return state.seed / 4294967296;
}

function weightedCommanderPick(items, state) {
    const total = items.reduce((sum, item) => sum + Math.max(0.01, item.weight ?? item.score ?? 1), 0);
    let roll = seededCommanderRandom(state) * total;
    for (const item of items) {
        roll -= Math.max(0.01, item.weight ?? item.score ?? 1);
        if (roll <= 0) return item;
    }
    return items[items.length - 1] || null;
}

function getAiCommanderState(team) {
    if (!aiCommanderStates.has(team)) {
        aiCommanderStates.set(team, {
            team,
            topLevelGoal: AI_COMMANDER_TOP_LEVEL_GOAL,
            currentGoal: null,
            activePlan: null,
            activeOperations: [],
            candidatePlans: [],
            recentFailures: [],
            planHistory: [],
            threatObservations: [],
            reservations: new Map(),
            ticksUntilReplan: 0,
            seed: (((Date.now() & 0xfffffff) ^ ((team + 1) * 2654435761)) >>> 0),
            personality: null,
            debug: { lastReason: 'boot', lastAction: 'none', snapshot: null }
        });
    }
    const state = aiCommanderStates.get(team);
    if (!state.personality) {
        state.personality = {
            aggression: 0.65 + seededCommanderRandom(state) * 0.35,
            economyBias: 0.35 + seededCommanderRandom(state) * 0.4,
            defenseBias: 0.35 + seededCommanderRandom(state) * 0.35,
            navalBias: 0.35 + seededCommanderRandom(state) * 0.4,
            jitter: 0.75 + seededCommanderRandom(state) * 0.5
        };
    }
    return state;
}

function resetAiCommanderStates() {
    aiCommanderStates.clear();
}

function releaseCommanderReservations(state) {
    const aliveIds = new Set(entities.filter(e => e instanceof Unit && !e.dead && e.team === state.team).map(e => e.id));
    const activeOperationIds = new Set(state.activeOperations.map(op => op.id));
    for (const [unitId, opId] of state.reservations.entries()) {
        const unit = entities.find(e => e.id === unitId);
        if (!aliveIds.has(unitId) || !unit || unit.state === 'IDLE' || !activeOperationIds.has(opId)) {
            state.reservations.delete(unitId);
        }
    }
    state.activeOperations.forEach(op => {
        op.reservedIds = (op.reservedIds || []).filter(id => state.reservations.get(id) === op.id);
    });
    state.activeOperations = state.activeOperations.filter(op => {
        const age = gameTime - (op.lastTouched || op.startedAt);
        return age < 1200 || (op.reservedIds && op.reservedIds.length > 0);
    });
}

function reserveCommanderUnits(state, units, opId) {
    units.forEach(u => state.reservations.set(u.id, opId));
    const op = state.activeOperations.find(active => active.id === opId) || state.activePlan;
    if (op) op.reservedIds = [...new Set([...(op.reservedIds || []), ...units.map(u => u.id)])];
}

function getFreeCommanderUnits(state, myUnits, predicate) {
    return myUnits.filter(u => !state.reservations.has(u.id) && u.state === 'IDLE' && u.visible && (!predicate || predicate(u)));
}

function upsertCommanderOperation(state, plan, priority = 1) {
    if (!plan) return null;
    let op = state.activeOperations.find(active => active.goal === plan.goal);
    if (!op) {
        op = {
            id: plan.id,
            topLevelGoal: plan.topLevelGoal,
            goal: plan.goal,
            reason: plan.reason,
            score: plan.score,
            priority,
            reservedIds: [],
            startedAt: gameTime,
            lastTouched: gameTime
        };
        state.activeOperations.push(op);
    } else {
        op.reason = plan.reason;
        op.score = plan.score;
        op.priority = Math.max(op.priority || 0, priority);
        op.lastTouched = gameTime;
    }
    state.activeOperations.sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.score || 0) - (a.score || 0));
    state.activeOperations = state.activeOperations.slice(0, 4);
    return op;
}

function bindCommanderPlanToOperation(plan, op) {
    return {
        ...plan,
        id: op.id,
        reservedIds: op.reservedIds || [],
        startedAt: op.startedAt,
        reason: op.reason || plan.reason
    };
}

function evaluateCommanderWorld(team, profile, myUnits) {
    const enemyTeam = team === TEAM_AI ? TEAM_PLAYER : TEAM_AI;
    const enemyUnits = entities.filter(e => e instanceof Unit && e.team === enemyTeam && !e.dead && e.visible);
    const friendlyIslands = islands.filter(i => i.owner === team);
    const neutralIslands = islands.filter(i => i.owner === TEAM_NEUTRAL);
    const enemyIslands = islands.filter(i => i.owner === enemyTeam);
    const friendlyBase = islands.find(i => i.owner === team && i.isMainBase) || friendlyIslands[0];
    const enemyBase = islands.find(i => i.owner === enemyTeam && i.isMainBase) || enemyIslands[0];
    const enemyCarrier = enemyUnits.find(u => u.typeKey === 'CARRIER');
    const ownValue = myUnits.reduce((sum, u) => sum + (u.data.cost || 100), 0) + friendlyIslands.length * 650 + TEAMS[team].money * 0.25;
    const enemyValue = enemyUnits.reduce((sum, u) => sum + (u.data.cost || 100), 0) + enemyIslands.length * 650 + TEAMS[enemyTeam].money * 0.25;
    const baseThreats = friendlyBase ? enemyUnits.filter(u => dist(u, friendlyBase) < 520) : [];
    const enemyAirThreats = enemyUnits.filter(u => u.data.type === 'air' || u.data.type === 'heli');
    const enemyNavalThreats = enemyUnits.filter(u => u.data.type === 'ship');
    const enemyGroundThreats = enemyUnits.filter(u => u.data.type === 'ground');
    const enemyAirDefense = [];
    const enemyEconomyTargets = [];
    enemyIslands.forEach(i => i.buildings.forEach(b => {
        if (b.dead) return;
        if (b.type === 'SAM_SITE' || b.type.includes('SPAA') || b.type.includes('MANPADS')) enemyAirDefense.push(b);
        if (['AIRPORT', 'PORT', 'CONSTRUCTION_YARD'].includes(b.type)) enemyEconomyTargets.push(b);
    }));
    enemyUnits.forEach(u => { if (u.data.role === 'AA' || u.data.role === 'Multi' || u.typeKey === 'DESTROYER') enemyAirDefense.push(u); });
    const vulnerableIslands = islands.filter(i => i.owner !== team).sort((a, b) => {
        const baseA = friendlyBase ? dist(friendlyBase, a) : 0;
        const baseB = friendlyBase ? dist(friendlyBase, b) : 0;
        const defenseA = iDefenseScore(a, enemyAirDefense);
        const defenseB = iDefenseScore(b, enemyAirDefense);
        return (baseA + defenseA * 4) - (baseB + defenseB * 4);
    });
    const counts = {
        fighter: countAiUnits(myUnits, 'FIGHTER'), strike: countAiUnits(myUnits, 'STRIKE'), sead: countAiUnits(myUnits, 'SEAD_FIGHTER'),
        transport: countAiUnits(myUnits, 'TRANSPORT') + countAiUnits(myUnits, 'LANDING_SHIP'), convoy: countAiUnits(myUnits, 'CONVOY'),
        aa: countAiUnits(myUnits, 'IR_APC') + countAiUnits(myUnits, 'AAA_BATTERY') + countAiUnits(myUnits, 'DESTROYER'),
        awacs: countAiUnits(myUnits, 'AWACS'),
        naval: myUnits.filter(u => u.data.type === 'ship').length
    };
    const baseRisk = assessCommanderTargetRisk({ enemyAirDefense, enemyNavalThreats, enemyGroundThreats, enemyBase, friendlyBase, counts: {} }, friendlyBase);
    return { enemyTeam, myUnits, enemyUnits, friendlyIslands, neutralIslands, enemyIslands, friendlyBase, enemyBase, enemyCarrier, baseThreats, enemyAirThreats, enemyNavalThreats, enemyGroundThreats, enemyAirDefense, enemyEconomyTargets, vulnerableIslands, counts, baseRisk, scoreRatio: ownValue / Math.max(1, enemyValue), money: TEAMS[team].money, profile };
}

function iDefenseScore(island, defenses) {
    return defenses.filter(d => dist(d, island) < (d instanceof Building ? 480 : 650)).length;
}

function assessCommanderTargetRisk(snapshot, target) {
    const point = target instanceof Island ? target : (target || snapshot.enemyBase || snapshot.friendlyBase);
    if (!point) return { airDefense: 0, naval: 0, ground: 0, total: 0 };
    const airDefense = snapshot.enemyAirDefense.filter(d => dist(d, point) < (d instanceof Building ? 520 : 620)).length;
    const naval = snapshot.enemyNavalThreats.filter(u => dist(u, point) < 700).length;
    const ground = snapshot.enemyGroundThreats.filter(u => dist(u, point) < 380).length;
    const total = airDefense * 1.4 + naval * 1.1 + ground * 0.7;
    return { airDefense, naval, ground, total };
}

function commanderUnitRiskAcceptable(snapshot, unit, target, purpose = 'strike') {
    if (!unit) return false;
    const risk = assessCommanderTargetRisk(snapshot, target);
    if (purpose === 'sead' || unit.typeKey === 'SEAD_FIGHTER') return true;
    if (unit.data.type === 'air' || unit.data.type === 'heli') {
        const tolerance = purpose === 'air-superiority' ? 3 : 1;
        return risk.airDefense <= tolerance || snapshot.counts.sead > 0;
    }
    if (unit.data.type === 'ship') return risk.naval <= 2 || ['ARSENAL_CRUISER', 'SSBN'].includes(unit.typeKey);
    if (unit.data.type === 'ground') return risk.ground <= 3;
    return risk.total <= 4;
}

function scoreCommanderGoals(state, snapshot) {
    const p = state.personality;
    const goals = [];
    goals.push({ goal: 'DEFEND_BASE', score: 20 + snapshot.baseThreats.length * 95 + snapshot.baseRisk.total * 12 + (snapshot.counts.aa < 2 ? 25 : 0) + p.defenseBias * 30 });
    goals.push({ goal: 'BREAK_AIR_DEFENSE', score: 25 + snapshot.enemyAirDefense.length * 18 + (snapshot.counts.sead > 0 ? 25 : -10) });
    goals.push({ goal: 'EXPAND_ECONOMY', score: 35 + snapshot.neutralIslands.length * 28 + p.economyBias * 35 - snapshot.enemyIslands.length * 4 });
    goals.push({ goal: 'ASSEMBLE_INVASION_FORCE', score: 35 + (snapshot.counts.transport === 0 ? 45 : 10) + (snapshot.counts.strike < 2 ? 20 : 0) });
    goals.push({ goal: 'HUNT_CARRIER', score: snapshot.enemyCarrier ? 70 + snapshot.counts.strike * 12 + p.navalBias * 25 : 5 });
    goals.push({ goal: 'SECURE_AIR_SUPERIORITY', score: 28 + snapshot.enemyAirThreats.length * 26 + (snapshot.counts.fighter < snapshot.enemyAirThreats.length ? 35 : 0) + (snapshot.counts.awacs === 0 ? 10 : 0) });
    goals.push({ goal: 'DISRUPT_ECONOMY', score: 22 + snapshot.enemyEconomyTargets.length * 15 + p.aggression * 25 + (snapshot.scoreRatio < 0.95 ? 22 : 0) });
    goals.push({ goal: 'NAVAL_SCREEN', score: 18 + snapshot.enemyNavalThreats.length * 28 + (snapshot.counts.naval < 2 && canBuildNavalUnits() ? 25 : 0) + p.navalBias * 25 });
    goals.push({ goal: 'RUSH_MAIN_BASE', score: 25 + p.aggression * 50 + (snapshot.scoreRatio > 1.15 ? 45 : -20) + (snapshot.enemyBase ? 15 : -100) });
    state.recentFailures.slice(-5).forEach(f => {
        const entry = goals.find(g => g.goal === f.goal);
        if (entry) entry.score -= 18;
    });
    return goals.filter(g => AI_COMMANDER_GOALS.includes(g.goal)).map(g => ({ ...g, score: Math.max(1, g.score) }));
}

function buildCommanderBehaviorLibrary(state, snapshot, myUnits, profile) {
    const targetIsland = snapshot.vulnerableIslands[0] || snapshot.enemyBase;
    const airDefenseTarget = snapshot.enemyAirDefense.sort((a, b) => getAiTargetPriority(b) - getAiTargetPriority(a))[0];
    const closestThreat = snapshot.baseThreats.sort((a, b) => dist(a, snapshot.friendlyBase || a) - dist(b, snapshot.friendlyBase || b))[0];
    const airThreatTarget = snapshot.enemyAirThreats.sort((a, b) => getAiTargetPriority(b) - getAiTargetPriority(a))[0];
    const navalThreatTarget = snapshot.enemyNavalThreats.sort((a, b) => getAiTargetPriority(b) - getAiTargetPriority(a))[0];
    const economyTarget = snapshot.enemyEconomyTargets.sort((a, b) => getAiTargetPriority(b) - getAiTargetPriority(a))[0];
    return {
        build: typeKey => ({ name: `build:${typeKey}`, execute: () => commanderBuildUnit(state, typeKey, profile) }),
        research: () => ({ name: 'research', execute: () => !!chooseAiResearch(state.team, profile) }),
        defendBase: () => ({ name: 'defend-base', execute: () => commanderAssignDefense(state, snapshot, myUnits, closestThreat) }),
        strikeTarget: target => ({ name: 'strike-target', execute: () => commanderAssignStrike(state, snapshot, myUnits, target) }),
        sead: target => ({ name: 'sead', execute: () => commanderAssignSead(state, snapshot, myUnits, target) }),
        invade: island => ({ name: 'invade', execute: () => commanderAssignInvasion(state, snapshot, myUnits, island) }),
        huntCarrier: () => ({ name: 'hunt-carrier', execute: () => commanderAssignStrike(state, snapshot, myUnits, snapshot.enemyCarrier) }),
        airSuperiority: target => ({ name: 'air-superiority', execute: () => commanderAssignAirSuperiority(state, snapshot, myUnits, target) }),
        navalScreen: target => ({ name: 'naval-screen', execute: () => commanderAssignNavalScreen(state, snapshot, myUnits, target) }),
        patrolDefense: () => ({ name: 'patrol-defense', execute: () => commanderAssignPatrol(state, snapshot, myUnits) }),
        targetIsland,
        airDefenseTarget,
        airThreatTarget,
        navalThreatTarget,
        economyTarget
    };
}

function generateCommanderPlans(state, snapshot, myUnits, profile) {
    const lib = buildCommanderBehaviorLibrary(state, snapshot, myUnits, profile);
    const plans = [];
    const add = (goal, score, behaviors, reason) => plans.push({ id: `op-${gameTime}-${Math.floor(seededCommanderRandom(state) * 999999)}`, topLevelGoal: AI_COMMANDER_TOP_LEVEL_GOAL, goal, score, behaviors: behaviors.filter(Boolean), reservedIds: [], startedAt: gameTime, reason });
    add('DEFEND_BASE', 75 + snapshot.baseThreats.length * 80, [lib.defendBase(), lib.patrolDefense(), lib.build(snapshot.counts.aa < 3 ? 'IR_APC' : 'FIGHTER')], 'base threat response');
    add('BREAK_AIR_DEFENSE', 55 + snapshot.enemyAirDefense.length * 25, [lib.sead(lib.airDefenseTarget), lib.strikeTarget(lib.airDefenseTarget), lib.build('SEAD_FIGHTER')], 'clear SAM/SPAA before offense');
    add('EXPAND_ECONOMY', 50 + snapshot.neutralIslands.length * 35, [lib.invade(lib.targetIsland), lib.build(supportsGroundUnits() ? 'CONVOY' : 'TRANSPORT'), lib.research()], 'capture income');
    add('ASSEMBLE_INVASION_FORCE', 62 + snapshot.counts.transport * 12 + snapshot.counts.strike * 8, [lib.invade(lib.targetIsland), lib.strikeTarget(lib.targetIsland), lib.build(snapshot.counts.transport === 0 ? 'TRANSPORT' : 'STRIKE')], 'combined assault package');
    add('HUNT_CARRIER', snapshot.enemyCarrier ? 95 : 5, [lib.huntCarrier(), lib.build(canBuildNavalUnits() ? 'HUNTER_FRIGATE' : 'STRIKE')], 'remove carrier threat');
    add('SECURE_AIR_SUPERIORITY', 45 + snapshot.enemyAirThreats.length * 30, [lib.airSuperiority(lib.airThreatTarget), lib.patrolDefense(), lib.build(snapshot.counts.fighter < 3 ? 'FIGHTER' : 'AWACS')], 'win the air picture');
    add('DISRUPT_ECONOMY', 45 + snapshot.enemyEconomyTargets.length * 20, [lib.sead(lib.airDefenseTarget), lib.strikeTarget(lib.economyTarget || lib.targetIsland), lib.build(snapshot.counts.strike < 2 ? 'STRIKE' : 'BOMBER')], 'raid enemy production and income');
    add('NAVAL_SCREEN', 38 + snapshot.enemyNavalThreats.length * 34, [lib.navalScreen(lib.navalThreatTarget), lib.patrolDefense(), lib.build(canBuildNavalUnits() ? (snapshot.counts.naval < 2 ? 'DESTROYER' : 'HUNTER_FRIGATE') : 'STRIKE')], 'screen fleet and base approaches');
    add('RUSH_MAIN_BASE', snapshot.enemyBase ? 70 + state.personality.aggression * 45 : 1, [lib.sead(lib.airDefenseTarget), lib.strikeTarget(snapshot.enemyBase), lib.invade(snapshot.enemyBase)], 'direct defeat-player push');
    const goalWeights = scoreCommanderGoals(state, snapshot);
    plans.forEach(plan => {
        const goalWeight = goalWeights.find(g => g.goal === plan.goal)?.score || 1;
        plan.score = Math.max(1, plan.score + goalWeight * 0.65 + (seededCommanderRandom(state) - 0.5) * 35 * state.personality.jitter);
    });
    return plans.filter(p => p.behaviors.length > 0).sort((a, b) => b.score - a.score).slice(0, profile.plannerCandidateCount || 4);
}

function commanderBuildUnit(state, typeKey, profile) {
    if (!typeKey || !UNIT_TYPES[typeKey]) return false;
    const before = entities.length;
    spawnUnit(state.team, typeKey);
    const built = entities.length > before;
    if (built) state.debug.lastAction = `build ${typeKey}`;
    return built;
}

function commanderAssignDefense(state, snapshot, myUnits, threat) {
    const defenders = getFreeCommanderUnits(state, myUnits, u => u.data.role === 'AA' || u.data.role === 'Multi' || u.typeKey === 'DESTROYER' || u.typeKey === 'FIGHTER').slice(0, 3);
    if (defenders.length === 0) return false;
    const target = threat || getRadarDetectedThreat(state.team, snapshot.profile) || snapshot.baseThreats[0];
    defenders.forEach(u => {
        if (target) u.targetUnit = target;
        else if (snapshot.friendlyBase) u.targetPos = { x: snapshot.friendlyBase.x + (seededCommanderRandom(state) - 0.5) * 180, y: snapshot.friendlyBase.y + (seededCommanderRandom(state) - 0.5) * 180 };
        u.hasCommand = true;
    });
    reserveCommanderUnits(state, defenders, state.activePlan?.id || 'defense');
    state.debug.lastAction = `defend with ${defenders.length}`;
    return true;
}

function commanderAssignStrike(state, snapshot, myUnits, target) {
    if (!target) return false;
    const strikers = getFreeCommanderUnits(state, myUnits, u => ['STRIKE', 'BOMBER', 'AC130', 'HUNTER_FRIGATE', 'ARSENAL_CRUISER', 'SSBN'].includes(u.typeKey) && commanderUnitRiskAcceptable(snapshot, u, target, 'strike')).slice(0, 3);
    if (strikers.length === 0) return false;
    strikers.forEach(u => { u.targetUnit = target instanceof Unit || target instanceof Building ? target : null; u.targetPos = target instanceof Island ? { x: target.x, y: target.y } : null; u.hasCommand = true; });
    reserveCommanderUnits(state, strikers, state.activePlan?.id || 'strike');
    state.debug.lastAction = `strike ${target.typeKey || target.type || 'island'}`;
    return true;
}

function commanderAssignSead(state, snapshot, myUnits, target) {
    if (!target) return false;
    const sead = getFreeCommanderUnits(state, myUnits, u => ['SEAD_FIGHTER', 'STRIKE', 'BOMBER'].includes(u.typeKey)).slice(0, 2);
    if (sead.length === 0) return false;
    sead.forEach(u => { u.targetUnit = target; u.hasCommand = true; });
    reserveCommanderUnits(state, sead, state.activePlan?.id || 'sead');
    state.threatObservations.push({ frame: gameTime, kind: 'air-defense', x: target.x, y: target.y });
    state.debug.lastAction = `SEAD ${target.typeKey || target.type}`;
    return true;
}

function commanderAssignAirSuperiority(state, snapshot, myUnits, target) {
    const fighters = getFreeCommanderUnits(state, myUnits, u => (['FIGHTER', 'AWACS'].includes(u.typeKey) || u.data.role === 'AA') && commanderUnitRiskAcceptable(snapshot, u, target || snapshot.enemyBase, 'air-superiority')).slice(0, 4);
    if (fighters.length === 0) return false;
    fighters.forEach(u => {
        if (target && u.typeKey !== 'AWACS') u.targetUnit = target;
        else if (snapshot.enemyBase) u.targetPos = { x: snapshot.enemyBase.x + (seededCommanderRandom(state) - 0.5) * 320, y: snapshot.enemyBase.y + (seededCommanderRandom(state) - 0.5) * 320 };
        u.hasCommand = true;
    });
    reserveCommanderUnits(state, fighters, state.activePlan?.id || 'air-superiority');
    state.debug.lastAction = `air superiority ${fighters.length}`;
    return true;
}

function commanderAssignNavalScreen(state, snapshot, myUnits, target) {
    const ships = getFreeCommanderUnits(state, myUnits, u => ['DESTROYER', 'HUNTER_FRIGATE', 'ARSENAL_CRUISER', 'SSBN'].includes(u.typeKey) && commanderUnitRiskAcceptable(snapshot, u, target || snapshot.friendlyBase, 'naval-screen')).slice(0, 3);
    if (ships.length === 0) return false;
    const anchor = snapshot.friendlyBase || snapshot.enemyBase;
    ships.forEach(u => {
        if (target) u.targetUnit = target;
        else if (anchor) u.targetPos = { x: anchor.x + (seededCommanderRandom(state) - 0.5) * 420, y: anchor.y + (seededCommanderRandom(state) - 0.5) * 420 };
        u.hasCommand = true;
    });
    reserveCommanderUnits(state, ships, state.activePlan?.id || 'naval-screen');
    state.debug.lastAction = `naval screen ${ships.length}`;
    return true;
}

function commanderAssignInvasion(state, snapshot, myUnits, island) {
    if (!island) return false;
    const transports = getFreeCommanderUnits(state, myUnits, u => ['TRANSPORT', 'LANDING_SHIP', 'CONVOY', 'APC'].includes(u.typeKey) && commanderUnitRiskAcceptable(snapshot, u, island, 'invasion')).slice(0, 2);
    if (transports.length === 0) return false;
    transports.forEach(u => {
        const deployWeapon = u.weapons.find(w => w.def.type === 'DEPLOY' && w.ammo > 0);
        if (u.typeKey === 'LANDING_SHIP' && deployWeapon) u.setTransportAssaultMission(island, { x: island.x, y: island.y });
        else { u.targetPos = { x: island.x, y: island.y }; u.targetUnit = null; u.hasCommand = true; if (u.typeKey === 'CONVOY') u.state = 'MOVE'; }
    });
    reserveCommanderUnits(state, transports, state.activePlan?.id || 'invasion');
    state.debug.lastAction = `invade island ${Math.round(island.x)},${Math.round(island.y)}`;
    return true;
}

function commanderAssignPatrol(state, snapshot, myUnits) {
    const patrolUnits = getFreeCommanderUnits(state, myUnits, u => ['FIGHTER', 'DESTROYER', 'IR_APC', 'AAA_BATTERY'].includes(u.typeKey)).slice(0, 2);
    if (patrolUnits.length === 0 || !snapshot.friendlyBase) return false;
    patrolUnits.forEach(u => { u.targetPos = { x: snapshot.friendlyBase.x + (seededCommanderRandom(state) - 0.5) * 260, y: snapshot.friendlyBase.y + (seededCommanderRandom(state) - 0.5) * 260 }; u.hasCommand = true; });
    reserveCommanderUnits(state, patrolUnits, state.activePlan?.id || 'patrol');
    state.debug.lastAction = `patrol ${patrolUnits.length}`;
    return true;
}

function executeCommanderPlan(state, snapshot, myUnits, profile) {
    if (!state.activePlan || state.ticksUntilReplan <= 0 || snapshot.baseThreats.length > 2) {
        state.candidatePlans = generateCommanderPlans(state, snapshot, myUnits, profile);
        const goalScores = scoreCommanderGoals(state, snapshot);
        const selectedGoal = weightedCommanderPick(goalScores.map(g => ({ ...g, weight: g.score })), state);
        const candidatePool = state.candidatePlans.filter(p => !selectedGoal || p.goal === selectedGoal.goal);
        const selectedPlan = weightedCommanderPick((candidatePool.length ? candidatePool : state.candidatePlans).map(p => ({ ...p, weight: p.score })), state);
        const urgentDefensePlan = snapshot.baseThreats.length > 0 || snapshot.baseRisk.total > 2
            ? state.candidatePlans.find(p => p.goal === 'DEFEND_BASE')
            : null;
        const secondaryPlan = state.activeOperations.length < 3
            ? state.candidatePlans.find(p => p.goal !== selectedPlan?.goal && p.goal !== urgentDefensePlan?.goal)
            : null;

        [
            { plan: urgentDefensePlan, priority: 100 },
            { plan: selectedPlan, priority: selectedPlan?.goal === 'DEFEND_BASE' ? 90 : 60 },
            { plan: secondaryPlan, priority: 35 }
        ].forEach(entry => {
            const op = upsertCommanderOperation(state, entry.plan, entry.priority);
            if (op && entry.plan) {
                state.planHistory.push({ frame: gameTime, goal: entry.plan.goal, reason: entry.plan.reason });
            }
        });
        state.planHistory = state.planHistory.slice(-12);
        state.currentGoal = state.activeOperations[0]?.goal || selectedGoal?.goal || null;
        state.activePlan = selectedPlan || state.activePlan;
        state.ticksUntilReplan = (profile.plannerReconsiderFrames || 4) + Math.floor(seededCommanderRandom(state) * 3);
        state.debug.lastReason = state.activeOperations.map(op => op.goal).join(' + ') || 'no candidate';
    } else {
        state.candidatePlans = generateCommanderPlans(state, snapshot, myUnits, profile);
    }

    if (state.activeOperations.length === 0) return false;
    state.ticksUntilReplan--;

    let executed = false;
    const operations = [...state.activeOperations]
        .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.score || 0) - (a.score || 0))
        .slice(0, 3);

    for (const op of operations) {
        const freshPlan = state.candidatePlans.find(p => p.goal === op.goal);
        if (!freshPlan) continue;
        state.activePlan = bindCommanderPlanToOperation(freshPlan, op);
        let opExecuted = false;
        for (const behavior of state.activePlan.behaviors.slice(0, 3)) {
            if (behavior.execute()) { opExecuted = true; break; }
        }
        if (opExecuted) {
            op.lastTouched = gameTime;
            op.score = freshPlan.score;
            op.reservedIds = state.activePlan.reservedIds || op.reservedIds || [];
            executed = true;
        } else if (gameTime - (op.lastTouched || op.startedAt) > 500) {
            state.recentFailures.push({ frame: gameTime, goal: op.goal, reason: 'no executable behavior' });
            state.recentFailures = state.recentFailures.slice(-8);
            state.activeOperations = state.activeOperations.filter(active => active.id !== op.id);
            op.reservedIds?.forEach(id => { if (state.reservations.get(id) === op.id) state.reservations.delete(id); });
        }
    }

    if (!executed) state.ticksUntilReplan = 0;
    return executed;
}


function updateCommanderAI(team, profile, myUnits) {
    const state = getAiCommanderState(team);
    releaseCommanderReservations(state);
    const snapshot = evaluateCommanderWorld(team, profile, myUnits);
    state.debug.snapshot = snapshot;
    if (snapshot.baseThreats.length > 0) state.threatObservations.push({ frame: gameTime, kind: 'base-threat', count: snapshot.baseThreats.length });
    state.threatObservations = state.threatObservations.filter(obs => gameTime - obs.frame < 1800).slice(-20);
    const executed = executeCommanderPlan(state, snapshot, myUnits, profile);
    return executed;
}

function updateTeamAI(team) {
    const profile = { ...getAiDifficultyProfile() };
    profile.limits = { ...profile.limits };
    const isTutorialEnemy = tutorialMode && tutorialState && team === TEAM_AI && !isSpectator;
    if (isTutorialEnemy) {
        profile.buildChance *= 0.3;
        profile.attackChance *= 0.2;
        profile.researchChance *= 0.15;
        profile.threatReactionChance *= 0.35;
    }

    chooseAiResearch(team, profile);
    const myUnits = getAiControlledUnits(team);
    if (profile.commanderEnabled && updateCommanderAI(team, profile, myUnits)) return;

    const toBuild = chooseAiBuild(team, profile, myUnits);
    if (toBuild) spawnUnit(team, toBuild);
    assignAiOrders(team, profile, myUnits);
}

// --- Loop & Camera ---
window.addEventListener('keydown', e => {
    inputKeys[e.key] = true;
    if (e.key === 'Escape' && manualStrikeMode) {
        manualStrikeMode = false;
        manualStrikePlan = null;
    }
});
window.addEventListener('keyup', e => inputKeys[e.key] = false);

canvas.addEventListener('mousedown', e => {
    if (editMode || isSpectator || gamePaused || gameState !== 'GAME') return; 
    const rect = canvas.getBoundingClientRect(); 
    mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
    mouse.worldX = mouse.x + camera.x; mouse.worldY = mouse.y + camera.y;

    if (e.button === 0) {
        if (tryPlaceSelectedConstructionAt(mouse.worldX, mouse.worldY)) return;
        if (zoneEditMode && currentZoneType) {
            zoneDragStart = { x: mouse.worldX, y: mouse.worldY };
        } else {
            selection = [];
            const clickedUnit = entities.find(u => Math.hypot(u.x - mouse.worldX, u.y - mouse.worldY) < 20 && u.team === TEAM_PLAYER && u.typeKey !== 'SF' && !u.convoyLeaderId && u.visible);
            if (clickedUnit) selection.push(clickedUnit);
            else {
                islands.forEach(i => {
                    if (i.owner === TEAM_PLAYER) i.buildings.forEach(b => { if (Math.hypot(b.x - mouse.worldX, b.y - mouse.worldY) < 20) selection.push(b); });
                });
            }
            updateSelectionUI();
        }
    } else if (e.button === 2) { 
        e.preventDefault();
        if (manualStrikeMode && manualStrikePlan) {
            let target = entities.find(u => Math.hypot(u.x - mouse.worldX, u.y - mouse.worldY) < 20 && u.team !== TEAM_PLAYER && u.visible);
            if (!target) { islands.forEach(i => { if (i.owner !== TEAM_PLAYER) i.buildings.forEach(b => { if(Math.hypot(b.x - mouse.worldX, b.y - mouse.worldY) < 20) target = b; }); }); }
            if (target) {
                manualStrikePlan.targets.push(target);
                addParticle(target.x, target.y, 'text', `SALVO ${manualStrikePlan.targets.length}/${manualStrikePlan.targetsNeeded}`);
                if (manualStrikePlan.targets.length >= manualStrikePlan.targetsNeeded) executeManualStrikePlan();
            }
            return;
        }
        if (selection.length > 0 && selection[0] instanceof Unit) {
            let friendlyBase = null;
            let clickedCarrier = entities.find(u => Math.hypot(u.x - mouse.worldX, u.y - mouse.worldY) < 20 && u.team === TEAM_PLAYER && u.typeKey === 'CARRIER');
            if (clickedCarrier) friendlyBase = clickedCarrier;
            if (!friendlyBase) { islands.forEach(i => { if (i.owner === TEAM_PLAYER) i.buildings.forEach(b => { if(b.type === 'AIRPORT' && Math.hypot(b.x - mouse.worldX, b.y - mouse.worldY) < 20) friendlyBase = b; }); }); }
            if (friendlyBase) {
                selection.forEach(u => {
                    if (u.data.type === 'air' || u.data.type === 'heli') { u.rtb = true; u.base = friendlyBase; u.targetUnit = null; u.targetPos = null; addParticle(friendlyBase.x, friendlyBase.y, 'text', 'LANDING'); }
                }); return;
            }
            let target = entities.find(u => Math.hypot(u.x - mouse.worldX, u.y - mouse.worldY) < 20 && u.team !== TEAM_PLAYER && u.visible);
            if (!target) { islands.forEach(i => { if (i.owner !== TEAM_PLAYER) i.buildings.forEach(b => { if(Math.hypot(b.x - mouse.worldX, b.y - mouse.worldY) < 20) target = b; }); }); }
            const clickedEnemyIsland = islands.find(i => i.owner !== TEAM_PLAYER && Math.hypot(i.x - mouse.worldX, i.y - mouse.worldY) < i.radius);
            const clickedAnyIsland = islands.find(i => Math.hypot(i.x - mouse.worldX, i.y - mouse.worldY) < i.radius);
            selection.forEach(u => {
                const hasDropTeam = (u.data.type === 'heli' || u.data.type === 'ship') && u.weapons.some(w => w.def.type === 'DEPLOY' && w.def.deployType === 'UNIT' && w.ammo > 0);
                if (hasDropTeam) {
                    const missionIsland = clickedEnemyIsland || (target ? islands.find(i => Math.hypot(i.x - target.x, i.y - target.y) < i.radius * 1.2 && i.owner !== TEAM_PLAYER) : null) || clickedAnyIsland;
                    if (missionIsland) {
                        const capturePoint = target ? { x: target.x, y: target.y } : { x: missionIsland.x, y: missionIsland.y };
                        if (u.typeKey === 'TRANSPORT' || u.typeKey === 'LANDING_SHIP') {
                            u.setTransportAssaultMission(missionIsland, capturePoint);
                        } else {
                            u.targetPos = capturePoint;
                            u.targetUnit = null;
                            u.hasCommand = true;
                            u.state = 'MOVE';
                        }
                        addParticle(capturePoint.x, capturePoint.y, 'text', 'INSERT');
                        return;
                    }
                }
                if (target) {
                    u.targetUnit = target;
                    if (u.data.type !== 'ship') u.targetPos = null;
                    u.fireTimer = 0;
                    u.weapons.forEach(w => {
                        w.burstCount = 0;
                        w.burstTimer = 0;
                        w.pendingSalvo = 0;
                        w.salvoTimer = 0;
                    });
                    u.hasCommand = true;
                    addParticle(target.x, target.y, 'text', 'ATTACK');
                }
                else { 
                    u.targetPos = { x: mouse.worldX, y: mouse.worldY }; u.targetUnit = null; u.rtb = false; u.state = 'MOVE'; 
                    u.hasCommand = true; addParticle(mouse.worldX, mouse.worldY, 'spark', null); 
                }
            });
        }
    }
});

canvas.addEventListener('mousemove', e => {
    if (zoneDragStart && zoneEditMode) {
        // Just visual update if needed, actual rect calc is on mouse up
    }
});

canvas.addEventListener('mouseup', e => {
    if (e.button === 0 && zoneDragStart && zoneEditMode && currentZoneType) {
        const rect = canvas.getBoundingClientRect(); 
        mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top;
        mouse.worldX = mouse.x + camera.x; mouse.worldY = mouse.y + camera.y;
        
        let w = mouse.worldX - zoneDragStart.x;
        let h = mouse.worldY - zoneDragStart.y;
        
        // Normalize
        let rx = zoneDragStart.x;
        let ry = zoneDragStart.y;
        if(w < 0) { rx += w; w = Math.abs(w); }
        if(h < 0) { ry += h; h = Math.abs(h); }

        if (w > 20 && h > 20) {
            TEAMS[TEAM_PLAYER].zones.push({ x: rx, y: ry, w: w, h: h, type: currentZoneType });
            addParticle(rx + w/2, ry + h/2, 'text', currentZoneType + ' ZONE');
        }
        zoneDragStart = null;
    }
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

function updateSelectionUI() {
    const info = document.getElementById('selection-info');
    const sidebar = document.getElementById('selection-sidebar');
    const sidebarInfo = document.getElementById('selection-sidebar-info');
    if (selection.length === 0) {
        info.innerHTML = '<p>Nothing Selected</p>';
        sidebarInfo.innerHTML = '<p>Nothing Selected</p>';
        sidebar.style.display = 'none';
        updateSelectionImage(null);
    }
    else {
        sidebar.style.display = 'block';
        const u = selection[0];
        if (u instanceof Unit) {
            let ammoStr = ''; let types = {};
            u.weapons.forEach(w => { if(w.def.type === 'GUN') return; let t = w.def.type.includes('AAM') ? 'AAM' : w.def.type; if(!types[t]) types[t] = 0; types[t] += w.ammo; });
            Object.keys(types).forEach(k => { ammoStr += `<div>${k}: ${types[k]}</div>`; });
            if(ammoStr === '') ammoStr = '<div>GUNS</div>';
            info.innerHTML = `<p><b>${u.data.name}</b></p><p>HP: ${Math.floor(u.hp)}/${u.maxHp}</p><p>Fuel: ${Math.floor(u.fuel)}</p>${ammoStr}<p>State: ${u.state}</p>`;
            const detailedLoadout = u.weapons.map(w => `<div class="line"><span>${w.def.name}</span><b>${w.ammo}</b></div>`).join('');
            sidebarInfo.innerHTML = `
                <h4>${u.data.name}</h4>
                <div class="line"><span>Type</span><b>${u.data.type.toUpperCase()}</b></div>
                <div class="line"><span>Role</span><b>${u.data.role}</b></div>
                <div class="line"><span>Health</span><b>${Math.floor(u.hp)} / ${u.maxHp}</b></div>
                <div class="line"><span>Fuel</span><b>${Math.floor(u.fuel)}</b></div>
                <div class="line"><span>State</span><b>${u.state}</b></div>
                <h4>Detailed Loadout</h4>
                ${detailedLoadout}
            `;
            updateSelectionImage(u.typeKey);
        } else if (u instanceof Building) {
            let html = `<p><b>${u.stats.name}</b></p><p>HP: ${Math.floor(u.hp)}/${u.maxHp}</p>`;
            if (u.type === 'CONSTRUCTION_YARD' && u.team === TEAM_PLAYER && !isSpectator) {
                html += `<div style="margin-top:8px;"><button class="btn-toggle" onclick="openConstructionMenuById(${u.id})">Open Construction Menu</button></div>`;
            }
            info.innerHTML = html;
            sidebarInfo.innerHTML = `
                <h4>${u.stats.name}</h4>
                <div class="line"><span>Health</span><b>${Math.floor(u.hp)} / ${u.maxHp}</b></div>
                <div class="line"><span>Team</span><b>${u.team === TEAM_PLAYER ? 'Player' : 'Other'}</b></div>
            `;
            updateSelectionImage(u.type);
        }
    }
}

function updateSelectionImage(unitTypeKey) {
    const preview = document.getElementById('selection-image-preview');
    const empty = document.getElementById('selection-image-empty');
    const src = unitTypeKey ? getUnitProfileAssetPath(unitTypeKey) : null;
    if (src) {
        preview.src = src;
        preview.style.display = 'block';
        empty.style.display = 'none';
    } else {
        preview.src = '';
        preview.style.display = 'none';
        empty.style.display = 'flex';
    }
}

function toggleSelectionSidebar() {
    const sidebar = document.getElementById('selection-sidebar');
    selectionSidebarCollapsed = !selectionSidebarCollapsed;
    sidebar.classList.toggle('collapsed', selectionSidebarCollapsed);
    document.getElementById('selection-sidebar-toggle').innerText = selectionSidebarCollapsed ? '▶' : '◀';
}

function buildFromConstructionYardById(yardId, buildType) {
    const yard = islands.flatMap(i => i.buildings).find(b => b.id === yardId);
    buildFromConstructionYard(yard, buildType);
    updateSelectionUI();
}

function cleanupSelection() {
    selection = selection.filter(s => {
        if (!s || s.dead) return false;
        if (s instanceof Unit) return entities.includes(s);
        if (s instanceof Building) return islands.some(i => i.buildings.includes(s));
        return false;
    });
}

function loop() {
    if (gameOver) return;
    
    if (gameState === 'GAME' && !gamePaused) {
        const moveSpd = 10;
        if (inputKeys['w'] || inputKeys['ArrowUp']) camera.y -= moveSpd;
        if (inputKeys['s'] || inputKeys['ArrowDown']) camera.y += moveSpd;
        if (inputKeys['a'] || inputKeys['ArrowLeft']) camera.x -= moveSpd;
        if (inputKeys['d'] || inputKeys['ArrowRight']) camera.x += moveSpd;
        camera.x = Math.max(0, Math.min(camera.x, worldWidth - width));
        camera.y = Math.max(0, Math.min(camera.y, worldHeight - (height - 150)));

        gameTime++;
        if (gameTime % 60 === 0) {
            TEAMS[TEAM_PLAYER].money += 50;  
            TEAMS[TEAM_AI].money += 50;  
            islands.forEach(i => { 
                if (i.owner === TEAM_PLAYER) TEAMS[TEAM_PLAYER].money += 100; 
                if (i.owner === TEAM_AI) TEAMS[TEAM_AI].money += 100;
                i.buildings.forEach(b => {
                    if (b.type === 'CONSTRUCTION_YARD' && !b.dead) {
                        if (b.team === TEAM_PLAYER) TEAMS[TEAM_PLAYER].money += 25;
                        if (b.team === TEAM_AI) TEAMS[TEAM_AI].money += 25;
                    }
                });
            }); 
            document.getElementById('money-display').innerText = '$' + Math.floor(TEAMS[TEAM_PLAYER].money);
            const pop = entities.filter(e => e.team === TEAM_PLAYER).length;
            document.getElementById('pop-display').innerText = pop + "/50";
        }
        
        aiTimer += SPEED_SCALE;
        if (aiTimer > 100) {
            updateTeamAI(TEAM_AI); // Red AI
            if (isSpectator) updateTeamAI(TEAM_PLAYER); // Blue AI (Spectator Mode)
            aiTimer = 0;
        }
        if (tutorialMode && tutorialState && gameTime % 120 === 0) {
            updateTutorialStep();
        }

        entities.forEach(e => { if (e instanceof Unit) { e.turnBoost = 1; e.cooldownBoost = 1; } });
        entities.forEach(source => {
            if (!(source instanceof Unit) || !source.data.commandAuraRadius) return;
            entities.forEach(target => {
                if (!(target instanceof Unit) || target.team !== source.team || target === source || target.dead) return;
                if (dist(source, target) <= source.data.commandAuraRadius) {
                    target.turnBoost = Math.max(target.turnBoost || 1, source.data.commandTurnBoost || 1);
                    target.cooldownBoost = Math.max(target.cooldownBoost || 1, source.data.commandCooldownBoost || 1);
                }
            });
        });

        entities.forEach(e => e.update());
        islands.forEach(i => i.buildings.forEach(b => b.update()));
        projectiles.forEach(p => p.update());
        updateRadarDetectionPings();
        updateParticles();
        for (let i = entities.length - 1; i >= 0; i--) { if (entities[i].dead) entities.splice(i, 1); }
        for (let i = projectiles.length - 1; i >= 0; i--) { if (projectiles[i].dead) projectiles.splice(i, 1); }
        islands.forEach(i => { for (let b = i.buildings.length - 1; b >= 0; b--) { if (i.buildings[b].dead) i.buildings.splice(b, 1); } });
        if (tutorialMode && tutorialState) {
            tutorialState.zoneUsed = tutorialState.zoneUsed || TEAMS[TEAM_PLAYER].zones.length > 0;
            tutorialState.islandCaptured = islands.some(i => !i.isMainBase && i.owner === TEAM_PLAYER);
            updateTutorialStep();
        }
        cleanupSelection();
        
        if (isNavalBattleMap()) {
            const playerShips = entities.some(e => e instanceof Unit && e.team === TEAM_PLAYER && e.data.type === 'ship');
            const aiShips = entities.some(e => e instanceof Unit && e.team === TEAM_AI && e.data.type === 'ship');
            if (!playerShips) endGame("DEFEAT"); else if (!aiShips) endGame("VICTORY");
        } else {
            const playerBase = islands.find(i => i.isMainBase && i.owner === TEAM_PLAYER);
            const aiBase = islands.find(i => i.isMainBase && i.owner === TEAM_AI);
            if (!playerBase || playerBase.owner !== TEAM_PLAYER) endGame("DEFEAT"); else if (!aiBase || aiBase.owner !== TEAM_AI) endGame("VICTORY");
        }
    }
    
    draw();
    if (selection.length > 0 && gameTime % 10 === 0 && !gamePaused) updateSelectionUI();
    if (!gameOver) requestAnimationFrame(loop);
}

function endGame(msg) {
    gameOver = true;
    const overlay = document.getElementById('overlay');
    const overlayMsg = document.getElementById('overlay-msg');
    const overlaySubmsg = document.getElementById('overlay-submsg');
    overlay.style.display = 'flex';
    overlayMsg.innerText = msg;
    overlayMsg.style.color = msg === 'VICTORY' ? '#4f4' : '#f44';

    const modeText = multiplayerMode === 'HOST' ? `Hosted Session: ${multiplayerSessionCode}` : (multiplayerMode === 'JOIN' ? `Joined Session: ${multiplayerSessionCode}` : 'Skirmish Complete');
    overlaySubmsg.innerText = `${modeText} • Return to main menu to host/join a new mission.`;
}


function toggleCommanderDebug() {
    aiCommanderDebugEnabled = !aiCommanderDebugEnabled;
    const button = document.getElementById('commander-debug-button');
    if (button) {
        button.classList.toggle('active', aiCommanderDebugEnabled);
        button.title = aiCommanderDebugEnabled ? 'Hide commander AI debug' : 'Show commander AI debug';
    }
    addParticle(camera.x + width / 2, camera.y + 60, 'text', aiCommanderDebugEnabled ? 'COMMANDER DEBUG ON' : 'COMMANDER DEBUG OFF');
}

function drawCommanderDebugOverlay(ctx) {
    if (!aiCommanderDebugEnabled || currentAiDifficulty !== 'COMMANDER_EXPERIMENTAL') return;
    const state = aiCommanderStates.get(TEAM_AI);
    if (!state) return;
    const plan = state.activePlan;
    const snap = state.debug.snapshot;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.fillRect(12, 12, 460, 164);
    ctx.fillStyle = '#9ff';
    ctx.font = '12px monospace';
    const lines = [
        `Commander: ${state.topLevelGoal} / ${state.currentGoal || 'none'}`,
        `Plan: ${plan ? plan.goal + ' (' + Math.round(plan.score) + ')' : 'none'}`,
        `Active: ${state.activeOperations.map(op => op.goal.replace(/_/g, '-')).join(' + ') || 'none'}`,
        `Reason: ${state.debug.lastReason}`,
        `Action: ${state.debug.lastAction}`,
        `Reservations: ${state.reservations.size}  Failures: ${state.recentFailures.length}`,
        `History: ${state.planHistory.slice(-3).map(h => h.goal.replace(/_/g, '-')).join(' > ') || 'none'}`,
        snap ? `World: ratio ${snap.scoreRatio.toFixed(2)} threats ${snap.baseThreats.length} air ${snap.enemyAirThreats.length} sea ${snap.enemyNavalThreats.length} SAMs ${snap.enemyAirDefense.length}` : 'World: pending'
    ];
    lines.forEach((line, idx) => ctx.fillText(line, 22, 34 + idx * 18));
    if (snap) {
        ctx.translate(-camera.x, -camera.y);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.55)';
        ctx.setLineDash([8, 6]);
        if (snap.enemyBase) {
            ctx.beginPath();
            ctx.arc(snap.enemyBase.x, snap.enemyBase.y, snap.enemyBase.radius + 18, 0, Math.PI * 2);
            ctx.stroke();
        }
        state.threatObservations.forEach(obs => {
            if (obs.x == null || obs.y == null) return;
            ctx.strokeStyle = obs.kind === 'air-defense' ? 'rgba(255, 180, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.arc(obs.x, obs.y, 34, 0, Math.PI * 2);
            ctx.stroke();
        });
    }
    ctx.restore();
}

function draw() {
    if (isLandMap()) ctx.fillStyle = '#3a5f3a';
    else ctx.fillStyle = '#2b6da5'; 
    ctx.fillRect(0, 0, width, height);
    
    ctx.save();
    // Apply Camera
    if (gameState === 'GAME') ctx.translate(-camera.x, -camera.y);

    if (isCombinedMap()) drawCombinedTerrain(ctx);

    // Draw Zones
    [TEAM_PLAYER, TEAM_AI].forEach(t => {
        if(t === TEAM_PLAYER && !zoneEditMode && !isSpectator) return; 
        TEAMS[t].zones.forEach(z => {
            if(z.type === 'CAP') ctx.fillStyle = 'rgba(0,100,255,0.2)';
            else if(z.type === 'CAS') ctx.fillStyle = 'rgba(0,255,100,0.2)';
            else ctx.fillStyle = 'rgba(255,0,0,0.2)';
            ctx.fillRect(z.x, z.y, z.w, z.h);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.setLineDash([5,5]);
            ctx.strokeRect(z.x, z.y, z.w, z.h);
            ctx.setLineDash([]);
        });
    });
    
    // Draw Dragging Zone
    if (zoneEditMode && zoneDragStart && mouse.worldX) {
        let w = mouse.worldX - zoneDragStart.x;
        let h = mouse.worldY - zoneDragStart.y;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(zoneDragStart.x, zoneDragStart.y, w, h);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(zoneDragStart.x, zoneDragStart.y, w, h);
    }

    if (hasRoadNetworkTerrain() && landRoads.length > 0) {
        ctx.lineCap = 'round';
        landRoads.forEach(seg => {
            if (seg.surface === 'asphalt') {
                ctx.strokeStyle = '#2f3338';
                ctx.lineWidth = 16;
            } else {
                ctx.strokeStyle = '#7a6543';
                ctx.lineWidth = 10;
            }
            ctx.beginPath();
            ctx.moveTo(seg.a.x, seg.a.y);
            ctx.lineTo(seg.b.x, seg.b.y);
            ctx.stroke();
            ctx.strokeStyle = seg.surface === 'asphalt' ? '#d4c17a' : '#a98e63';
            ctx.lineWidth = seg.surface === 'asphalt' ? 2 : 1.5;
            ctx.beginPath();
            ctx.moveTo(seg.a.x, seg.a.y);
            ctx.lineTo(seg.b.x, seg.b.y);
            ctx.stroke();
        });
    }
     drawArsenalDatalinkOverlay(ctx);


    drawArsenalDatalinkOverlay(ctx);

    islands.forEach(i => { i.draw(ctx); i.buildings.forEach(b => b.draw(ctx)); });
    entities.filter(e => e.data.type === 'ship').forEach(e => e.draw(ctx));
    entities.filter(e => e.data.type === 'ground').forEach(e => e.draw(ctx));
    entities.filter(e => e.data.type !== 'ship' && e.data.type !== 'ground').forEach(e => e.draw(ctx));
    drawRadarDetectionWedges(ctx);

    projectiles.forEach(p => p.draw(ctx));
    drawParticles(ctx);
    
    ctx.restore();
    drawCommanderDebugOverlay(ctx);
}

window.onresize = () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; };
document.getElementById('mode-select').addEventListener('change', updateMultiplayerSetup);
['map-size', 'map-type', 'island-size'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', randomizeMap);
});
initGame();

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
let multiplayerMode = 'OFF';
let multiplayerSessionCode = '';

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

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function angleTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
function isUnlocked(team, id) { return TEAMS[team] && TEAMS[team].tech.has(id); }
function rectContains(rect, point) {
    let rX = Math.min(rect.x, rect.x + rect.w);
    let rW = Math.abs(rect.w);
    let rY = Math.min(rect.y, rect.y + rect.h);
    let rH = Math.abs(rect.h);
    return point.x >= rX && point.x <= rX + rW && point.y >= rY && point.y <= rY + rH;
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

function getConfiguredSlotAmmo(unitKey, slotIndex, weaponKey) {
    const unit = UNIT_TYPES[unitKey];
    if (!unit) return 0;
    const slot = unit.hardpoints[slotIndex];
    if (!slot || !weaponKey || weaponKey === 'EMPTY') return 0;
    if (slot.customAmmoByWeapon && slot.customAmmoByWeapon[weaponKey] !== undefined) {
        return Math.max(1, slot.customAmmoByWeapon[weaponKey]);
    }
    return getDefaultWeaponAmmo({ data: unit }, slot, weaponKey);
}

function cloneUnitLoadout(unitDef) {
    return (unitDef.hardpoints || []).map(slot => ({
        equipped: slot.equipped,
        customAmmoByWeapon: slot.customAmmoByWeapon ? { ...slot.customAmmoByWeapon } : null
    }));
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

function getRoadPath(startPos, endPos) {
    if (roadNodes.length < 2) return [endPos];
    let startIdx = 0;
    let endIdx = 0;
    let bestStart = Infinity;
    let bestEnd = Infinity;
    roadNodes.forEach((n, idx) => {
        const ds = dist(startPos, n);
        const de = dist(endPos, n);
        if (ds < bestStart) { bestStart = ds; startIdx = idx; }
        if (de < bestEnd) { bestEnd = de; endIdx = idx; }
    });

    const indexPath = buildPathBetweenRoadNodes(startIdx, endIdx);
    if (!indexPath) return [endPos];
    const points = indexPath.map(idx => getRoadNodeWorldPos(roadNodes[idx])).filter(Boolean);
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
    if (currentMapType !== 'LAND' || landRoads.length === 0) return 1;
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

    if (unitDef.type === 'ground' && w.type === 'GUN' && !['RIFLE', 'GUN_BASIC', 'VULCAN', 'CIWS'].includes(weaponKey)) return false;
    return true;
}

function pickBestUnlockedWeaponForSlot(team, unitDef, slot) {
    const candidates = Object.keys(WEAPONS).filter(k => {
        return isUnlocked(team, k) && isWeaponAllowedForSlot(unitDef, slot, k);
    });
    if (candidates.length === 0) return slot.equipped;

    let best = slot.equipped;
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
    Object.values(UNIT_TYPES).forEach(unitDef => {
        if (!unitDef.hardpoints) return;
        unitDef.hardpoints.forEach(slot => {
            if (!slot.types || slot.types.length === 0) return;
            const next = pickBestUnlockedWeaponForSlot(team, unitDef, slot);
            if (next && next !== 'EMPTY') slot.equipped = next;
        });
    });
    entities.forEach(e => {
        if (!(e instanceof Unit) || e.team !== team) return;
        if (team === TEAM_AI || isSpectator) {
            e.loadoutConfig = cloneUnitLoadout(e.data);
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
        if(currentMapType === 'LAND') {
            // Outpost style
             ctx.fillStyle = this.owner === TEAM_NEUTRAL ? '#5a5a4a' : (this.owner === TEAM_PLAYER ? '#4a5b6c' : '#6c4a4a');
        } else {
             // Island style
             ctx.fillStyle = this.owner === TEAM_NEUTRAL ? '#4a7c4a' : (this.owner === TEAM_PLAYER ? '#4a6b7c' : '#7c4a4a');
        }

        ctx.beginPath(); ctx.moveTo(this.poly[0].x, this.poly[0].y);
        for(let p of this.poly) ctx.lineTo(p.x, p.y);
        ctx.closePath(); ctx.fill(); 
        
        ctx.strokeStyle = currentMapType === 'LAND' ? '#222' : '#355235'; 
        ctx.stroke();

        ctx.fillStyle = '#333'; ctx.fillRect(this.x - 20, this.y - 10, 40, 20); 
        ctx.strokeStyle = '#555'; ctx.beginPath(); ctx.moveTo(this.x-15, this.y); ctx.lineTo(this.x+15, this.y); ctx.stroke();
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

class Unit extends Entity {
    constructor(x, y, team, typeKey) {
        super(x, y, team);
        this.data = UNIT_TYPES[typeKey];
        this.typeKey = typeKey;
        this.loadoutConfig = cloneUnitLoadout(this.data);
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
                let ammoCount = getConfiguredSlotAmmo(this.typeKey, slotIndex, wKey);
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

        if (this.convoyLeaderId) {
            const leader = entities.find(e => e.id === this.convoyLeaderId && !e.dead);
            if (leader) {
                const idx = (leader.convoyMembers || []).indexOf(this.id);
                const columnIndex = Math.max(0, idx) + 1;
                const trailStep = 8;
                const trailPos = (leader.convoyTrail && leader.convoyTrail.length > 0)
                    ? leader.convoyTrail[Math.min(leader.convoyTrail.length - 1, columnIndex * trailStep)]
                    : { x: leader.x - Math.cos(leader.angle) * (columnIndex * 16), y: leader.y - Math.sin(leader.angle) * (columnIndex * 16), angle: leader.angle };
                const desired = { x: trailPos.x, y: trailPos.y };
                this.x += (desired.x - this.x) * 0.22;
                this.y += (desired.y - this.y) * 0.22;
                let dA = (trailPos.angle ?? leader.angle) - this.angle;
                while (dA < -Math.PI) dA += Math.PI * 2;
                while (dA > Math.PI) dA -= Math.PI * 2;
                this.angle += dA * 0.25;
                this.state = leader.state;
                this.targetUnit = leader.targetUnit;
                this.hasCommand = true;
                this.rtb = false;
                return;
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
                    w.burstCount--; w.burstTimer = 5; 
                    let p = new Missile(this.x, this.y, this.targetUnit, this.team, w.def.damage / 3);
                    p.isRocket = true; projectiles.push(p); 
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

        if (this.targetUnit && this.targetUnit.dead) {
            this.targetUnit = null;
            this.isExtending = false;
            this.extendTimer = 0;
        }

        // --- TARGETING ---
        // 1. Check Strike Zones
        if (!this.convoyLeaderId && !this.targetUnit && this.state !== 'RETURN' && this.data.role !== 'Transport') {
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
        if (!this.convoyLeaderId && !this.targetUnit && this.state !== 'RETURN' && this.data.role !== 'Transport') {
            const validTargets = this.getValidTargetTypes();
            let maxRange = 0; this.weapons.forEach(w => maxRange = Math.max(maxRange, w.def.range));
            if (maxRange === 0) maxRange = 100;
            this.targetUnit = findTarget(this, maxRange * 1.5, validTargets);
        }

        // --- MOVEMENT ---
        let moveTarget = this.targetPos;

        if (this.isConvoyLead) {
            this.convoyMembers = this.convoyMembers.filter(id => entities.some(e => e.id === id && !e.dead));
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
                this.orbitAngle += 0.01 * this.orbitDir * SPEED_SCALE * 5;
                const gunRanges = this.weapons.filter(w => w.def.type === 'GUN').map(w => w.def.range || 150);
                const minRange = gunRanges.length ? Math.min(...gunRanges) : 150;
                const orbitRadius = Math.max(90, Math.min(minRange * 0.72, 170));
                moveTarget = {
                    x: this.targetUnit.x + Math.cos(this.orbitAngle) * orbitRadius,
                    y: this.targetUnit.y + Math.sin(this.orbitAngle) * orbitRadius
                };
            } else {
                moveTarget = this.targetUnit;
            }
        }
        
        if (!moveTarget) { moveTarget = { x: this.x, y: this.y }; this.targetPos = { x: this.x, y: this.y }; }

        if (this.data.type === 'ground' && currentMapType === 'LAND' && moveTarget) {
            if (!this.pathNodes || !this.pathNodes.length || (this.pathGoal && dist(this.pathGoal, moveTarget) > 25)) {
                this.pathNodes = getRoadPath(this, moveTarget);
                this.pathIndex = 0;
                this.pathGoal = { x: moveTarget.x, y: moveTarget.y };
            }
            if (this.pathNodes && this.pathNodes[this.pathIndex]) {
                const waypoint = this.pathNodes[this.pathIndex];
                moveTarget = waypoint;
                if (dist(this, waypoint) < 22 && this.pathIndex < this.pathNodes.length - 1) this.pathIndex++;
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
            if (currentMapType !== 'LAND') {
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

        this.x += Math.cos(this.angle) * speed; this.y += Math.sin(this.angle) * speed;

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
                    
                    const omnidirectional = this.data.type === 'ship' && w.def.navalOmni;
                    let firingArcOk = omnidirectional || Math.abs(aimDiff) < tolerance;
                    if (this.typeKey === 'AC130') {
                        const leftBearing = this.angle + Math.PI / 2;
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
        if (this.typeKey === 'CONVOY') {
            const island = islands.find(i => dist(this, i) < i.radius * 1.1);
            if (island && island.owner !== this.team) {
                island.captureProgress += 0.28 * SPEED_SCALE;
                if (island.captureProgress >= 100) {
                    island.owner = this.team;
                    island.captureProgress = 0;
                    island.buildings.forEach(b => { b.team = this.team; b.hp = b.maxHp; });
                    addParticle(this.x, this.y, 'text', 'CONVOY CAPTURE');
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
            projectiles.push(new Bullet(this.x, this.y, {x: leadX, y: leadY}, this.team, w.damage, w.name === 'Railcannon'));
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

        const sf = new Unit(spawnPoint.x, spawnPoint.y, this.team, deployDef.unitType);
        if (mission && mission.capturePoint) sf.targetPos = { x: mission.capturePoint.x, y: mission.capturePoint.y };
        else sf.targetPos = { x: dropIsland.x, y: dropIsland.y };
        entities.push(sf);
        addParticle(sf.x, sf.y, 'text', 'DROP');
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
                this.target.takeDamage(this.damage); this.dead = true; addParticle(this.x, this.y, 'explosion');
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
    constructor(x, y, target, team, damage, isRail = false) {
        super(x, y, target, team, damage);
        const a = Math.atan2(target.y - y, target.x - x);
        this.vx = Math.cos(a + (Math.random()-0.5)*0.02) * 8 * SPEED_SCALE;
        this.vy = Math.sin(a + (Math.random()-0.5)*0.02) * 8 * SPEED_SCALE;
        this.timer = 20 / SPEED_SCALE;
        this.isRail = isRail;
    }
    update() {
        this.timer--; if (this.timer <= 0) this.dead = true;
        this.x += this.vx; this.y += this.vy;
        entities.forEach(e => {
            if (e.team !== this.team && !e.dead && dist(this, e) < e.radius) {
                e.takeDamage(this.damage); this.dead = true; addParticle(this.x, this.y, 'spark');
            }
        });
        islands.forEach(i => {
            i.buildings.forEach(b => {
                if (this.dead || b.team === this.team || b.dead) return;
                if (dist(this, b) < 10) {
                    b.takeDamage(this.damage);
                    this.dead = true;
                    addParticle(this.x, this.y, 'spark');
                }
            });
        });
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

function initGame() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight; 
    TEAMS[TEAM_PLAYER].tech = new Set([...DEFAULT_UNLOCKS]);
    TEAMS[TEAM_AI].tech = new Set([...DEFAULT_UNLOCKS]);
    requestAnimationFrame(loop);
}

function showMainMenu() {
    document.getElementById('main-menu').style.display = 'flex';
    document.getElementById('setup-menu').style.display = 'none';
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
    document.getElementById('map-size').value = "2";
    document.getElementById('island-size').value = "50";
    generateMap(); 
    updateMultiplayerSetup();
    gameState = 'SETUP';
}

function randomizeMap() {
    generateMap();
}

function generateMap() {
    islands.length = 0; 
    entities.length = 0; 
    landRoads.length = 0;
    roadNodes.length = 0;
    TEAMS[TEAM_PLAYER].zones = [];
    TEAMS[TEAM_AI].zones = [];
    
    const sizeMult = parseInt(document.getElementById('map-size').value) || 2;
    const islSize = parseInt(document.getElementById('island-size').value) || 50;
    currentMapType = document.getElementById('map-type').value;

    worldWidth = window.innerWidth * sizeMult;
    worldHeight = (window.innerHeight - 150) * sizeMult; 
    
    camera.x = (worldWidth - window.innerWidth) / 2;
    camera.y = (worldHeight - (window.innerHeight - 150)) / 2;

    islands.push(new Island(200, worldHeight/2, islSize + 40, true)); 
    islands[0].owner = TEAM_PLAYER;
    islands[0].buildings.push(new Building(200, worldHeight/2, TEAM_PLAYER, 'AIRPORT'));
    islands[0].buildings.push(new Building(230, worldHeight/2 + 30, TEAM_PLAYER, 'SAM_SITE'));
    islands[0].buildings.push(createPortBuilding(islands[0], TEAM_PLAYER, Math.PI * 0.85));
    islands[0].buildings.push(new Building(170, worldHeight/2 + 40, TEAM_PLAYER, 'CONSTRUCTION_YARD'));
    islands[0].buildings.push(new Building(165, worldHeight/2 - 35, TEAM_PLAYER, 'BASE_FORT'));
    
    islands.push(new Island(worldWidth - 200, worldHeight/2, islSize + 40, true)); 
    islands[1].owner = TEAM_AI;
    islands[1].buildings.push(new Building(worldWidth - 200, worldHeight/2, TEAM_AI, 'AIRPORT'));
    islands[1].buildings.push(new Building(worldWidth - 230, worldHeight/2 - 30, TEAM_AI, 'SAM_SITE'));
    islands[1].buildings.push(createPortBuilding(islands[1], TEAM_AI, Math.PI * -0.2));
    islands[1].buildings.push(new Building(worldWidth - 170, worldHeight/2 - 42, TEAM_AI, 'CONSTRUCTION_YARD'));
    islands[1].buildings.push(new Building(worldWidth - 165, worldHeight/2 + 35, TEAM_AI, 'BASE_FORT'));

    const islandCount = 4 * sizeMult;
    for(let i=0; i<islandCount; i++) {
        let x = worldWidth * 0.15 + Math.random() * (worldWidth * 0.7);
        let y = worldHeight * 0.1 + Math.random() * (worldHeight * 0.8);
        if (islands.some(isl => Math.hypot(isl.x-x, isl.y-y) < (islSize * 3.5))) { i--; continue; }
        let isl = new Island(x, y, islSize);
        isl.buildings.push(new Building(x, y, TEAM_NEUTRAL, 'AIRPORT'));
        isl.buildings.push(createPortBuilding(isl, TEAM_NEUTRAL));
        if (currentMapType === 'LAND' && Math.random() < 0.45) {
            isl.buildings.push(new Building(x + 24, y + 24, TEAM_NEUTRAL, 'CONSTRUCTION_YARD'));
        }
        islands.push(isl);
    }
    if (currentMapType === 'LAND') buildLandRoadNetwork();
}

function startGame() {
    const mode = document.getElementById('mode-select').value;
    isSpectator = (mode === 'spectator');
    multiplayerMode = mode === 'multiplayer-host' ? 'HOST' : (mode === 'multiplayer-join' ? 'JOIN' : 'OFF');
    multiplayerSessionCode = '';

    if (multiplayerMode !== 'OFF') {
        const sessionInput = document.getElementById('session-code');
        const normalizedCode = sessionInput.value.trim().toUpperCase();
        if (!normalizedCode) {
            alert('Session code is required for multiplayer.');
            return;
        }
        multiplayerSessionCode = normalizedCode;
    }

    TEAMS[TEAM_PLAYER].money = 2000;
    TEAMS[TEAM_AI].money = 2000;
    TEAMS[TEAM_PLAYER].tech = new Set([...DEFAULT_UNLOCKS]);
    TEAMS[TEAM_AI].tech = new Set([...DEFAULT_UNLOCKS]);
    TEAMS[TEAM_PLAYER].zones = [];
    TEAMS[TEAM_AI].zones = [];
    gameTime = 0;
    gameOver = false;
    hideEndOverlay();
    gamePaused = false;

    if(currentMapType !== 'LAND') {
        entities.push(new Unit(300, worldHeight/2, TEAM_PLAYER, 'CARRIER'));
        entities.push(new Unit(worldWidth - 300, worldHeight/2, TEAM_AI, 'CARRIER'));
    }
    
    entities.push(new Unit(250, worldHeight/2 - 50, TEAM_PLAYER, 'FIGHTER'));

    document.getElementById('setup-menu').style.display = 'none';
    document.getElementById('ui-layer').style.display = 'flex';
    
    createUI();
    gameState = 'GAME';

    if (multiplayerMode !== 'OFF') {
        const role = multiplayerMode === 'HOST' ? 'HOSTING' : 'JOINED';
        addParticle(camera.x + width / 2, camera.y + 60, 'text', `${role}: ${multiplayerSessionCode}`);
    }
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
}

function openModal(id) { 
    if (multiplayerMode === 'OFF') gamePaused = true;
    document.getElementById(id).style.display = 'flex'; 
}
function closeModal(id) { 
    if (multiplayerMode === 'OFF') gamePaused = false;
    document.getElementById(id).style.display = 'none'; 
    editingUnitKey = null; 
    selectedSlotIndex = null;
}

function openLoadoutMenu(unitKey) {
    editingUnitKey = unitKey;
    const data = UNIT_TYPES[unitKey];
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
        const currentAmmo = getConfiguredSlotAmmo(unitKey, index, hp.equipped);
        const ammoLabel = hp.equipped !== 'EMPTY' ? ` (${currentAmmo})` : '';
        div.innerHTML = `<span class="slot-name">${hp.name}</span>${WEAPONS[hp.equipped].name}${ammoLabel}`;
        div.onclick = () => selectSlot(index, div);
        container.appendChild(div);
    });
    selectSlot(null, null); 
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
    if (domElement) domElement.style.borderColor = '#ffd700';

    const slotDef = UNIT_TYPES[editingUnitKey].hardpoints[index];
    const allowedTypes = slotDef.types;

    Object.keys(WEAPONS).forEach(wKey => {
        const w = WEAPONS[wKey];
        if (isWeaponAllowedForSlot(UNIT_TYPES[editingUnitKey], slotDef, wKey)) {
            const opt = document.createElement('div');
            opt.className = 'weapon-option';
            if (slotDef.equipped === wKey) opt.classList.add('selected');
            if (!isUnlocked(TEAM_PLAYER, wKey)) opt.classList.add('locked');
            
            let html = `<div style="font-size:24px">${w.icon}</div><div>${w.name}</div>`;
            if (wKey !== 'EMPTY') {
                html += `<div class="weapon-cap">Cap: ${getConfiguredSlotAmmo(editingUnitKey, index, wKey)}</div>`;
            }
            if (!isUnlocked(TEAM_PLAYER, wKey)) html += `<div class="lock-icon">🔒</div>`;
            
            opt.innerHTML = html;
            opt.onclick = () => { if(isUnlocked(TEAM_PLAYER, wKey)) equipWeapon(wKey); };
            selector.appendChild(opt);
        }
    });
    renderSlotAmmoConfig();
}

function equipWeapon(weaponKey) {
    if (editingUnitKey && selectedSlotIndex !== null) {
        UNIT_TYPES[editingUnitKey].hardpoints[selectedSlotIndex].equipped = weaponKey;
        openLoadoutMenu(editingUnitKey);
        const slots = document.querySelectorAll('.slot'); selectSlot(selectedSlotIndex, slots[selectedSlotIndex]);
    }
}

function adjustSlotAmmo(delta) {
    if (!editingUnitKey || selectedSlotIndex === null) return;
    const unit = UNIT_TYPES[editingUnitKey];
    const slot = unit.hardpoints[selectedSlotIndex];
    if (!slot || !slot.equipped || slot.equipped === 'EMPTY') return;
    const weaponKey = slot.equipped;
    const defaultAmmo = getDefaultWeaponAmmo({ data: unit }, slot, weaponKey);
    if (defaultAmmo >= 9999) return;

    if (!slot.customAmmoByWeapon) slot.customAmmoByWeapon = {};
    const currentAmmo = getConfiguredSlotAmmo(editingUnitKey, selectedSlotIndex, weaponKey);
    const nextAmmo = Math.max(1, Math.min(12, currentAmmo + delta));

    if (nextAmmo === defaultAmmo) delete slot.customAmmoByWeapon[weaponKey];
    else slot.customAmmoByWeapon[weaponKey] = nextAmmo;

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
    if (!slot || !slot.equipped || slot.equipped === 'EMPTY') {
        panel.innerHTML = '<div class="slot-config-title">Equip a weapon to configure ammo capacity.</div>';
        return;
    }

    const weapon = WEAPONS[slot.equipped];
    const ammo = getConfiguredSlotAmmo(editingUnitKey, selectedSlotIndex, slot.equipped);
    const defaultAmmo = getDefaultWeaponAmmo({ data: unit }, slot, slot.equipped);
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
            html += `<div class="tech-node ${statusClass}" onclick="researchPlayer('${tech.id}', ${tech.cost})">
                        <div>${icon}</div><div>${name}</div>
                        ${!unlocked ? `<div style="color:#ffd700">$${tech.cost}</div>` : ''}
                     </div>`;
        });
        html += `</div>`;
        div.innerHTML = html;
        container.appendChild(div);
    });
    openModal('research-modal');
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
            UNIT_TYPES.CARRIER.hardpoints.forEach(hp => { if (hp.equipped === 'GUN_BASIC') hp.equipped = 'CIWS'; });
            entities.forEach(e => { if (e.team === TEAM_PLAYER && e.typeKey === 'CARRIER') e.initLoadout(); });
        }
    }
}

function createUI() {
    const panel = document.getElementById('build-panel');
    panel.innerHTML = '';
    
    Object.keys(UNIT_TYPES).forEach(key => {
        if (key === 'SF' || key === 'CRUISE_MISSILE_UNIT' || key === 'HYPERSONIC_ASHM_UNIT' || key === 'PILE_DRIVER_TBM_UNIT') return; 
        const data = UNIT_TYPES[key];
        
        // Hide naval units on Land maps
        if (currentMapType === 'LAND' && (data.type === 'ship' || key === 'DESTROYER' || key === 'CARRIER')) return;

        const btn = document.createElement('div');
        btn.className = 'btn-build';
        btn.innerHTML = `<div class="btn-icon">${data.icon}</div><div class="cost">$${data.cost}</div>`;
        btn.onmouseenter = (e) => {
            let wInfo = data.hardpoints.map(h => WEAPONS[h.equipped].name).filter(n => n!=='Empty').join(', ');
            if(!wInfo) wInfo = "None";
            tooltip.style.display = 'block';
            tooltip.innerHTML = `<b>${data.name}</b>\n${data.role}\nHP: ${data.hp}\nLoadout: ${wInfo}`;
        };
        btn.onmousemove = (e) => { tooltip.style.left = e.pageX+10+'px'; tooltip.style.top = e.pageY-60+'px'; }
        btn.onmouseleave = () => tooltip.style.display = 'none';
        
        btn.onclick = () => { 
            if (editMode) {
                openLoadoutMenu(key);
            } else if (TEAMS[TEAM_PLAYER].money >= data.cost && !isSpectator) {
                let spawner = null;
                if (selection.length > 0 && selection[0] instanceof Entity) {
                    const sel = selection[0];
                    if (sel.team === TEAM_PLAYER && !sel.dead) {
                        if (data.type === 'ship') {
                            // Ships use main base island for now
                        } else if (sel.type === 'AIRPORT' || sel.typeKey === 'CARRIER') {
                            spawner = sel;
                        }
                    }
                }
                spawnUnit(TEAM_PLAYER, key, spawner); 
            }
        };
        panel.appendChild(btn);
    });
}

function spawnUnit(team, typeKey, specificSpawner = null) {
    const cost = UNIT_TYPES[typeKey].cost;
    if (TEAMS[team].money < cost) return;

    let spawnPoint = null;
    
    if (specificSpawner && !specificSpawner.dead && specificSpawner.team === team) {
        spawnPoint = specificSpawner;
    } else {
        const spawners = [];
        if (UNIT_TYPES[typeKey].type !== 'ship') {
            islands.forEach(i => { if (i.owner === team) spawners.push(i.buildings.find(b => b.type === 'AIRPORT')); });
            entities.forEach(e => { if (e.team === team && e.typeKey === 'CARRIER') spawners.push(e); });
        } else {
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
            const escorts = ['IR_APC', 'AAA_BATTERY', 'IR_APC', 'AAA_BATTERY'];
            u.convoyMembers = [];
            escorts.forEach((memberType, idx) => {
                const col = idx % 2;
                const row = Math.floor(idx / 2);
                const member = new Unit(spawnPoint.x - 35 - row * 24, spawnPoint.y + (col === 0 ? -20 : 20), team, memberType);
                member.convoyLeaderId = u.id;
                member.hasCommand = true;
                entities.push(member);
                u.convoyMembers.push(member.id);
            });
        }
    }
}

// --- AI Controller ---
let aiTimer = 0;

function updateTeamAI(team) {
    if (TEAMS[team].money > 3000 && Math.random() < 0.05) {
        let available = [];
        Object.values(TECH_TREE).flat().forEach(t => {
            if (!isUnlocked(team, t.id)) {
                if (!t.req || isUnlocked(team, t.req)) available.push(t);
            }
        });
        if (available.length > 0) {
            const target = available[Math.floor(Math.random() * available.length)];
            if (TEAMS[team].money >= target.cost) {
                TEAMS[team].money -= target.cost;
                TEAMS[team].tech.add(target.id);
                autoOptimizeTeamLoadouts(team);
                if (team === TEAM_PLAYER && isSpectator) {
                    addParticle(camera.x + width/2, camera.y + height/2, 'text', `AI RESEARCHED: ${target.id}`);
                    if (document.getElementById('research-modal').style.display === 'flex') openResearch();
                }
            }
        }
    }

    const myUnits = entities.filter(e => e.team === team);
    const enemyIslands = islands.filter(i => i.owner !== team);
    const hasTransport = myUnits.some(u => u.typeKey === 'TRANSPORT');
    const offensiveCount = myUnits.filter(u => ['FIGHTER', 'STRIKE', 'SEAD_FIGHTER', 'BOMBER', 'AC130', 'CONVOY'].includes(u.typeKey)).length;
    
    let toBuild = null;
    if (currentMapType === 'LAND' && enemyIslands.length > 0 && myUnits.filter(u => u.typeKey === 'CONVOY').length < 2) toBuild = 'CONVOY';
    else if (enemyIslands.length > 0 && !hasTransport && currentMapType !== 'LAND') toBuild = 'TRANSPORT';
    else if (myUnits.filter(u => u.typeKey === 'IR_APC').length < 3) toBuild = 'IR_APC';
    else if (myUnits.filter(u => u.typeKey === 'AAA_BATTERY').length < 2) toBuild = 'AAA_BATTERY';
    else if (currentMapType === 'LAND' && myUnits.filter(u => u.typeKey === 'CONVOY').length < 1) toBuild = 'CONVOY';
    else if (myUnits.filter(u => u.typeKey === 'FIGHTER').length < 3) toBuild = 'FIGHTER';
    else if (myUnits.filter(u => u.typeKey === 'SEAD_FIGHTER').length < 1) toBuild = 'SEAD_FIGHTER';
    else if (myUnits.filter(u => u.typeKey === 'STRIKE').length < 3) toBuild = 'STRIKE';
    else if (myUnits.filter(u => u.typeKey === 'AC130').length < 1) toBuild = 'AC130';
    else if (myUnits.filter(u => u.typeKey === 'BOMBER').length < 1) toBuild = 'BOMBER';
    else if (myUnits.filter(u => u.typeKey === 'AWACS').length < 1) toBuild = 'AWACS';
    else if (myUnits.filter(u => u.typeKey === 'DESTROYER').length < 2 && currentMapType !== 'LAND') toBuild = 'DESTROYER';
    else if (myUnits.filter(u => u.typeKey === 'LANDING_SHIP').length < 1 && currentMapType !== 'LAND') toBuild = 'LANDING_SHIP';
    else if (myUnits.filter(u => u.typeKey === 'HUNTER_FRIGATE').length < 1 && currentMapType !== 'LAND') toBuild = 'HUNTER_FRIGATE';
    else if (myUnits.filter(u => u.typeKey === 'SSBN').length < 1 && currentMapType !== 'LAND') toBuild = 'SSBN';
    else if (currentMapType !== 'LAND' && isUnlocked(team, 'HYPERSONIC_ASHM') && myUnits.filter(u => u.typeKey === 'ARSENAL_CRUISER').length < 1) toBuild = 'ARSENAL_CRUISER';
    else if (offensiveCount < 3) toBuild = currentMapType === 'LAND' ? 'CONVOY' : 'STRIKE';
    else if (Math.random() > 0.78 && offensiveCount >= 4) toBuild = 'ATTACK_HELI';

    if (toBuild && (!UNIT_TYPES[toBuild].type.includes('ship') || currentMapType !== 'LAND')) {
         spawnUnit(team, toBuild);
    }

    myUnits.forEach(u => {
        if (u.state === 'IDLE' && u.visible) {
            // Zone Logic for AI?
            // AI doesn't use drawn zones, it uses implicit logic. 
            // We could let Spectator AI use player zones if we wanted.
            
            const deployWeapon = u.weapons.find(w => w.def.type === 'DEPLOY' && w.ammo > 0);
            if (u.typeKey === 'TRANSPORT' && deployWeapon) {
                if (deployWeapon.def.deployType === 'UNIT') {
                    let target = islands.find(i => i.owner === TEAM_NEUTRAL);
                    if (!target) target = islands.find(i => i.owner !== team);
                    if (target) { u.targetPos = target; u.hasCommand = true; }
                } 
                else {
                    const target = islands.find(i => i.owner === team && i.buildings.length < 4);
                    if (target) { u.targetPos = target; u.hasCommand = true; }
                }
            } else if (u.typeKey === 'LANDING_SHIP' && deployWeapon) {
                let target = islands.find(i => i.owner === TEAM_NEUTRAL);
                if (!target) target = islands.find(i => i.owner !== team);
                if (target) u.setTransportAssaultMission(target, { x: target.x, y: target.y });
            } else if (u.typeKey === 'CONVOY') {
                let target = islands.find(i => i.owner === TEAM_NEUTRAL);
                if (!target) target = islands.find(i => i.owner !== team);
                if (target) {
                    u.targetPos = { x: target.x, y: target.y };
                    u.targetUnit = null;
                    u.hasCommand = true;
                    u.state = 'MOVE';
                }
            } else if (u.data.role === 'AA' || u.data.role === 'Multi') {
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
            } else if (u.typeKey === 'HUNTER_FRIGATE' || u.typeKey === 'ARSENAL_CRUISER' || u.typeKey === 'BOMBER' || u.typeKey === 'STRIKE') {
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
        }
    });
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
    if (selection.length === 0) info.innerHTML = '<p>Nothing Selected</p>';
    else {
        const u = selection[0];
        if (u instanceof Unit) {
            let ammoStr = ''; let types = {};
            u.weapons.forEach(w => { if(w.def.type === 'GUN') return; let t = w.def.type.includes('AAM') ? 'AAM' : w.def.type; if(!types[t]) types[t] = 0; types[t] += w.ammo; });
            Object.keys(types).forEach(k => { ammoStr += `<div>${k}: ${types[k]}</div>`; });
            if(ammoStr === '') ammoStr = '<div>GUNS</div>';
            info.innerHTML = `<p><b>${u.data.name}</b></p><p>HP: ${Math.floor(u.hp)}/${u.maxHp}</p><p>Fuel: ${Math.floor(u.fuel)}</p>${ammoStr}<p>State: ${u.state}</p>`;
        } else if (u instanceof Building) {
            info.innerHTML = `<p><b>${u.stats.name}</b></p><p>HP: ${Math.floor(u.hp)}/${u.maxHp}</p>`;
        }
    }
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
        updateParticles();
        for (let i = entities.length - 1; i >= 0; i--) { if (entities[i].dead) entities.splice(i, 1); }
        for (let i = projectiles.length - 1; i >= 0; i--) { if (projectiles[i].dead) projectiles.splice(i, 1); }
        islands.forEach(i => { for (let b = i.buildings.length - 1; b >= 0; b--) { if (i.buildings[b].dead) i.buildings.splice(b, 1); } });
        cleanupSelection();
        
        const playerBase = islands.find(i => i.isMainBase && i.owner === TEAM_PLAYER);
        const aiBase = islands.find(i => i.isMainBase && i.owner === TEAM_AI);
        if (!playerBase || playerBase.owner !== TEAM_PLAYER) endGame("DEFEAT"); else if (!aiBase || aiBase.owner !== TEAM_AI) endGame("VICTORY");
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

function draw() {
    if (currentMapType === 'LAND') ctx.fillStyle = '#3a5f3a';
    else ctx.fillStyle = '#2b6da5'; 
    ctx.fillRect(0, 0, width, height);
    
    ctx.save();
    // Apply Camera
    if (gameState === 'GAME') ctx.translate(-camera.x, -camera.y);

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

    if (currentMapType === 'LAND' && landRoads.length > 0) {
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

    islands.forEach(i => { i.draw(ctx); i.buildings.forEach(b => b.draw(ctx)); });
    entities.filter(e => e.data.type === 'ship').forEach(e => e.draw(ctx));
    entities.filter(e => e.data.type === 'ground').forEach(e => e.draw(ctx));
    entities.filter(e => e.data.type !== 'ship' && e.data.type !== 'ground').forEach(e => e.draw(ctx));
    projectiles.forEach(p => p.draw(ctx));
    drawParticles(ctx);
    
    ctx.restore();
}

window.onresize = () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; };
document.getElementById('mode-select').addEventListener('change', updateMultiplayerSetup);
initGame();

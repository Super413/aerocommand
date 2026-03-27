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

const entities = [];
const particles = [];
const projectiles = [];
const islands = [];

const mouse = { x: 0, y: 0, left: false, right: false, worldX: 0, worldY: 0 };
let selection = [];

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
        this.dead = false; this.hp = 100; this.maxHp = 100;
        this.radius = 10; this.angle = 0; this.visible = true; 
    }
    takeDamage(amount) {
        if (isNaN(amount) || amount === undefined || amount === null) return;
        this.hp -= amount;
        if (this.hp <= 0) { this.dead = true; createExplosion(this.x, this.y, this.radius * 2); }
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
                projectiles.push(new Missile(this.x, this.y, target, this.team, this.stats.damage, this.type.includes('SAM') || this.type.includes('MANPADS'))); 
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
        this.hp = this.data.hp; this.maxHp = this.data.hp;
        this.fuel = this.data.fuel;
        this.hasCommand = false;
        this.fireTimer = 0; 
        this.takeoffTimer = (this.data.type === 'air' || this.data.type === 'heli') ? 120 : 0;
        this.isExtending = false; 

        this.initLoadout();

        this.targetPos = { x: x, y: y }; this.targetUnit = null; this.state = 'IDLE'; this.rtb = false; 
    }

    initLoadout() {
        this.weapons = [];
        this.data.hardpoints.forEach(slot => {
            let wKey = slot.equipped;
            if (this.team === TEAM_AI || (this.team === TEAM_PLAYER && isSpectator)) {
               let best = WEAPONS[wKey];
               if(!best) best = WEAPONS['EMPTY'];
               Object.keys(WEAPONS).forEach(k => {
                   const w = WEAPONS[k];
                   if (isUnlocked(this.team, k) && slot.types.includes(w.type)) {
                       if (w.damage > best.damage || (w.type === 'ECM' && k === 'JAMMER_POD')) {
                           best = w;
                           wKey = k;
                       }
                   }
               });
            }
            if (wKey && wKey !== 'EMPTY') {
                const def = WEAPONS[wKey];
                let ammoCount = 1;
                if (def.type === 'GUN' || def.passive) ammoCount = 9999;
                else if (def.type === 'ROCKET') ammoCount = 3; 
                else if (def.type === 'DEPLOY') ammoCount = def.capacity || 1;
                else if (def.name === 'AGM-114') ammoCount = (this.data.type === 'heli') ? 4 : 2;
                this.weapons.push({ def: def, cooldown: 0, ammo: ammoCount, burstCount: 0, burstTimer: 0, jammedTargets: [] });
            }
        });
    }

    update() {
        if (this.dead) return;
        if (this.fireTimer > 0) this.fireTimer -= SPEED_SCALE;
        if (this.takeoffTimer > 0) this.takeoffTimer -= SPEED_SCALE;

        if (this.typeKey === 'CRUISE_MISSILE_UNIT') {
            this.hp -= 0.01 * SPEED_SCALE; 
            if (this.hp <= 0) this.dead = true;
            if (this.targetPos) {
                 this.angle = angleTo(this, this.targetPos);
                 this.x += Math.cos(this.angle) * this.data.speed * SPEED_SCALE;
                 this.y += Math.sin(this.angle) * this.data.speed * SPEED_SCALE;
                 if (dist(this, this.targetPos) < 20) {
                     this.dead = true; createExplosion(this.x, this.y, 60);
                     entities.forEach(e => { if (e.team !== this.team && dist(this, e) < 60) e.takeDamage(300); });
                     islands.forEach(i => { i.buildings.forEach(b => { if (b.team !== this.team && dist(this, b) < 60) b.takeDamage(300); }); });
                 }
            }
            return; 
        }

        if (this.data.type === 'air' || this.data.type === 'heli') {
            if (this.state !== 'LANDED') this.fuel -= SPEED_SCALE;
            if (this.fuel <= 0) { this.takeDamage(this.maxHp); return; }
            let needsAmmo = this.weapons.every(w => w.ammo === 0 || w.def.passive || w.def.type === 'GUN');
            if (needsAmmo && this.typeKey === 'TRANSPORT' && this.weapons.some(w=>w.def.type==='DEPLOY')) needsAmmo = true; 
            if ((this.fuel < this.data.fuel * 0.3 || needsAmmo) && !this.rtb) { this.rtb = true; this.findBase(); }
        }

        if (this.rtb && dist(this, this.base) < 30) { if (this.state !== 'LANDED') { this.state = 'LANDED'; this.initLoadout(); } }

        if (this.state === 'LANDED') {
            this.visible = false; 
            this.fuel = Math.min(this.fuel + 5 * SPEED_SCALE, this.data.fuel);
            this.hp = Math.min(this.hp + 1 * SPEED_SCALE, this.maxHp);
            this.weapons.forEach(w => {
                if (w.def.type === 'DEPLOY') {
                    if (w.ammo < (w.def.capacity || 1) && TEAMS[this.team].money >= 100 && gameTime % 30 === 0) {
                        TEAMS[this.team].money -= 100; w.ammo++; addParticle(this.x, this.y, 'text', '+' + w.def.name);
                    }
                }
            });
            let fullyLoaded = this.weapons.every(w => w.ammo > 0 || w.def.passive || w.def.type === 'GUN');
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
                if (w.jammedTargets.length < (w.def.capacity || 2)) {
                    projectiles.forEach(p => {
                        if (p instanceof Missile && !p.isBomb && !p.isRocket && p.team !== this.team && !p.dead && !p.isJammed && dist(this, p) < w.def.range && w.jammedTargets.length < (w.def.capacity || 2)) {
                            w.jammedTargets.push(p); p.isJammed = true; addParticle(p.x, p.y, 'text', 'JAMMED');
                        }
                    });
                }
                w.jammedTargets.forEach(p => { p.jamTimer += SPEED_SCALE; p.angle += (Math.random() - 0.5) * 0.8; });
            }
            if (w.burstCount > 0) {
                w.burstTimer -= SPEED_SCALE;
                if (w.burstTimer <= 0) {
                    w.burstCount--; w.burstTimer = 5; 
                    let p = new Missile(this.x, this.y, this.targetUnit, this.team, w.def.damage / 3);
                    p.isRocket = true; projectiles.push(p); 
                }
            }
            if (w.cooldown > 0) w.cooldown -= SPEED_SCALE;
        });

        // --- TARGETING ---
        // 1. Check Strike Zones
        if (!this.targetUnit && this.state !== 'RETURN' && this.data.role !== 'Transport') {
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
        if (!this.targetUnit && this.state !== 'RETURN' && this.data.role !== 'Transport') {
            const validTargets = this.getValidTargetTypes();
            let maxRange = 0; this.weapons.forEach(w => maxRange = Math.max(maxRange, w.def.range));
            if (maxRange === 0) maxRange = 100;
            this.targetUnit = findTarget(this, maxRange * 1.5, validTargets);
        }

        // --- MOVEMENT ---
        let moveTarget = this.targetPos;
        
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

        if (this.rtb) { this.state = 'RETURN'; if (!this.base) this.findBase(); if (this.base) moveTarget = this.base; }
        else if (this.targetUnit && !this.targetUnit.dead) moveTarget = this.targetUnit;
        
        if (!moveTarget) { moveTarget = { x: this.x, y: this.y }; this.targetPos = { x: this.x, y: this.y }; }

        const dx = moveTarget.x - this.x; const dy = moveTarget.y - this.y;
        const distToTarget = Math.hypot(dx, dy); const desiredAngle = Math.atan2(dy, dx);
        let diff = desiredAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2; while (diff > Math.PI) diff -= Math.PI * 2;
        const turnSpeed = this.data.turn * SPEED_SCALE;
        
        let speed = this.data.speed * SPEED_SCALE; 
        if (this.data.type === 'air' && this.typeKey !== 'FIGHTER') speed *= 1; 
        if ((this.data.type === 'heli' || this.data.type === 'ship') && distToTarget < 15 && !this.rtb) speed = 0;

        // --- BOOM & ZOOM / EXTEND LOGIC ---
        if (this.targetUnit && !this.rtb && this.data.type === 'air') {
            if (distToTarget < 150 && Math.abs(diff) > 1.2) {
                this.isExtending = true;
            }
        }

        if (this.isExtending) {
            if (dist(this, this.targetUnit || moveTarget) > 350) {
                this.isExtending = false;
            }
        } else {
             if (Math.abs(diff) < turnSpeed) this.angle = desiredAngle; else this.angle += Math.sign(diff) * turnSpeed;
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

                    let tolerance = w.def.type === 'GUN' ? 0.3 : 0.8;
                    if (w.def.priorityTag && this.targetUnit.type !== w.def.priorityTag) return; 
                    
                    if (Math.abs(aimDiff) < tolerance) {
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

        if (this.typeKey === 'TRANSPORT' && this.state !== 'RETURN') {
             if (this.hasCommand && this.targetPos && dist(this, this.targetPos) < 65) {
                 const island = islands.find(i => dist(this, i) < i.radius && i.owner === this.team);
                 const neutralIsland = islands.find(i => dist(this, i) < i.radius && i.owner !== this.team);
                 
                 this.weapons.forEach(w => {
                     if (w.def.type === 'DEPLOY' && w.ammo > 0 && w.cooldown <= 0) {
                         if (w.def.deployType === 'UNIT' && w.def.unitType === 'SF' && neutralIsland) {
                             w.ammo--; w.cooldown = w.def.cooldown;
                             const sf = new Unit(this.x, this.y + 10, this.team, 'SF'); sf.targetPos = neutralIsland; entities.push(sf);
                         }
                         else if (w.def.deployType === 'BUILDING' && island) {
                             if (island.buildings.length < 6) {
                                 w.ammo--; w.cooldown = w.def.cooldown;
                                 let offsetX = (Math.random() - 0.5) * 40;
                                 let offsetY = (Math.random() - 0.5) * 40;
                                 island.buildings.push(new Building(island.x + offsetX, island.y + offsetY, this.team, w.def.buildType));
                                 addParticle(island.x + offsetX, island.y + offsetY, 'text', 'DEPLOYED');
                             }
                         }
                     }
                 });
             }
        }
        
        if (this.typeKey === 'CARRIER') {
            entities.forEach(e => { if (e.team === this.team && e !== this && dist(this, e) < 50 && e.data.type !== 'ship') { if (e.rtb) { e.state = 'LANDED'; e.base = this; e.x = this.x; e.y = this.y; } } });
        }
        if (this.typeKey === 'SF') {
            const island = islands.find(i => dist(this, i) < i.radius * 1.5);
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
            } else { this.hp -= 0.5 * SPEED_SCALE; }
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

        if (w.type === 'ROCKET') { 
            weaponInstance.burstCount = 3; 
            let p = new Missile(this.x, this.y, this.targetUnit, this.team, w.damage / 3);
            p.isRocket = true;
            projectiles.push(p);
        }
        else if (w.type === 'CRUISE') {
            const cm = new Unit(this.x, this.y, this.team, 'CRUISE_MISSILE_UNIT');
            cm.angle = this.angle; cm.targetPos = target; entities.push(cm);
        } else if (w.type.includes('AAM') || w.type === 'AGM') {
            projectiles.push(new Missile(this.x, this.y, target, this.team, w.damage));
        } else if (w.type === 'BOMB') {
            if (w.guided) {
                const p = new Missile(this.x, this.y, target, this.team, w.damage);
                p.baseSpeed = w.speed || 3; p.turnRate = 0.05; p.isBomb = true; projectiles.push(p);
            } else { projectiles.push(new Bomb(this.x, this.y, target, this.team)); }
        } else if (w.type === 'GUN') {
            let leadX = target.x, leadY = target.y;
            if (target instanceof Unit && (target.data.type === 'air' || target.data.type === 'heli')) {
                const speed = w.speed || 12; const distToTarget = dist(this, target); const timeToImpact = distToTarget / speed;
                leadX = target.x + Math.cos(target.angle) * target.data.speed * SPEED_SCALE * timeToImpact;
                leadY = target.y + Math.sin(target.angle) * target.data.speed * SPEED_SCALE * timeToImpact;
            }
            projectiles.push(new Bullet(this.x, this.y, {x: leadX, y: leadY}, this.team, w.damage));
        }
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
            if (this.targetPos && !this.targetUnit && this.state !== 'IDLE') {
                ctx.restore(); ctx.save(); ctx.strokeStyle = '#0f0'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.targetPos.x, this.targetPos.y); ctx.stroke(); ctx.restore(); ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
            }
        }
        ctx.fillStyle = COLORS[this.team]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        
        if (this.typeKey === 'FIGHTER') { ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-8, 6); ctx.lineTo(-5, 0); ctx.lineTo(-8, -6); ctx.closePath(); ctx.fill(); ctx.stroke(); }
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
        else if (this.typeKey === 'SF') { ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.arc(0,0, 3, 0, Math.PI*2); ctx.fill(); }
        else if (this.typeKey === 'CRUISE_MISSILE_UNIT') { ctx.fillStyle = '#fff'; ctx.fillRect(-5, -2, 10, 4); }

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
                if (isUnlocked(this.target.team, 'FLARES') && Math.random() < 0.2) {
                    addParticle(this.target.x, this.target.y, 'spark', 'FLARES');
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
    constructor(x, y, target, team, damage) {
        super(x, y, target, team, damage);
        const a = Math.atan2(target.y - y, target.x - x);
        this.vx = Math.cos(a + (Math.random()-0.5)*0.02) * 8 * SPEED_SCALE;
        this.vy = Math.sin(a + (Math.random()-0.5)*0.02) * 8 * SPEED_SCALE;
        this.timer = 20 / SPEED_SCALE;
    }
    update() {
        this.timer--; if (this.timer <= 0) this.dead = true;
        this.x += this.vx; this.y += this.vy;
        entities.forEach(e => {
            if (e.team !== this.team && !e.dead && dist(this, e) < e.radius) {
                e.takeDamage(this.damage); this.dead = true; addParticle(this.x, this.y, 'spark');
            }
        });
    }
    draw(ctx) { ctx.fillStyle = '#ff0'; ctx.fillRect(this.x-1, this.y-1, 2, 2); }
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

// --- INITIALIZATION ---

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
    gameState = 'MENU';
}

function showSetup() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('setup-menu').style.display = 'flex';
    document.getElementById('map-size').value = "2";
    document.getElementById('island-size').value = "50";
    generateMap(); 
    gameState = 'SETUP';
}

function randomizeMap() {
    generateMap();
}

function generateMap() {
    islands.length = 0; 
    entities.length = 0; 
    TEAMS[TEAM_PLAYER].zones = [];
    TEAMS[TEAM_AI].zones = [];
    
    const sizeMult = parseInt(document.getElementById('map-size').value) || 2;
    const islSize = parseInt(document.getElementById('island-size').value) || 50;
    currentMapType = document.getElementById('map-type').value;

    worldWidth = window.innerWidth * sizeMult;
    worldHeight = (window.innerHeight - 150) * sizeMult; 
    
    camera.x = (worldWidth - window.innerWidth) / 2;
    camera.y = (worldHeight - (window.innerHeight - 150)) / 2;

    islands.push(new Island(200, worldHeight/2, islSize + 20, true)); 
    islands[0].owner = TEAM_PLAYER;
    islands[0].buildings.push(new Building(200, worldHeight/2, TEAM_PLAYER, 'AIRPORT'));
    islands[0].buildings.push(new Building(230, worldHeight/2 + 30, TEAM_PLAYER, 'SAM_SITE'));
    
    islands.push(new Island(worldWidth - 200, worldHeight/2, islSize + 20, true)); 
    islands[1].owner = TEAM_AI;
    islands[1].buildings.push(new Building(worldWidth - 200, worldHeight/2, TEAM_AI, 'AIRPORT'));
    islands[1].buildings.push(new Building(worldWidth - 230, worldHeight/2 - 30, TEAM_AI, 'SAM_SITE'));

    const islandCount = 4 * sizeMult;
    for(let i=0; i<islandCount; i++) {
        let x = worldWidth * 0.15 + Math.random() * (worldWidth * 0.7);
        let y = worldHeight * 0.1 + Math.random() * (worldHeight * 0.8);
        if (islands.some(isl => Math.hypot(isl.x-x, isl.y-y) < (islSize * 3.5))) { i--; continue; }
        let isl = new Island(x, y, islSize);
        isl.buildings.push(new Building(x, y, TEAM_NEUTRAL, 'AIRPORT'));
        islands.push(isl);
    }
}

function startGame() {
    const mode = document.getElementById('mode-select').value;
    isSpectator = (mode === 'spectator');
    
    TEAMS[TEAM_PLAYER].money = 2000;
    TEAMS[TEAM_AI].money = 2000;
    TEAMS[TEAM_PLAYER].tech = new Set([...DEFAULT_UNLOCKS]);
    TEAMS[TEAM_AI].tech = new Set([...DEFAULT_UNLOCKS]);
    TEAMS[TEAM_PLAYER].zones = [];
    TEAMS[TEAM_AI].zones = [];
    gameTime = 0;
    gameOver = false;

    if(currentMapType !== 'LAND') {
        entities.push(new Unit(300, worldHeight/2, TEAM_PLAYER, 'CARRIER'));
        entities.push(new Unit(worldWidth - 300, worldHeight/2, TEAM_AI, 'CARRIER'));
    }
    
    entities.push(new Unit(250, worldHeight/2 - 50, TEAM_PLAYER, 'FIGHTER'));

    document.getElementById('setup-menu').style.display = 'none';
    document.getElementById('ui-layer').style.display = 'flex';
    
    createUI();
    gameState = 'GAME';
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
    gamePaused = true;
    document.getElementById(id).style.display = 'flex'; 
}
function closeModal(id) { 
    gamePaused = false;
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
        div.innerHTML = `<span class="slot-name">${hp.name}</span>${WEAPONS[hp.equipped].name}`;
        div.onclick = () => selectSlot(index, div);
        container.appendChild(div);
    });
    selectSlot(null, null); 
}

function selectSlot(index, domElement) {
    selectedSlotIndex = index;
    const allSlots = document.querySelectorAll('.slot'); allSlots.forEach(s => s.style.borderColor = '#555');
    const selector = document.getElementById('weapon-selector'); selector.innerHTML = '';

    if (index === null) { selector.innerHTML = '<div style="color:#666; width:100%; text-align:center; padding-top:40px;">Select a slot</div>'; return; }
    if (domElement) domElement.style.borderColor = '#ffd700';

    const slotDef = UNIT_TYPES[editingUnitKey].hardpoints[index];
    const allowedTypes = slotDef.types;

    Object.keys(WEAPONS).forEach(wKey => {
        const w = WEAPONS[wKey];
        if (wKey === 'EMPTY' || allowedTypes.includes(w.type)) {
            const opt = document.createElement('div');
            opt.className = 'weapon-option';
            if (slotDef.equipped === wKey) opt.classList.add('selected');
            if (!isUnlocked(TEAM_PLAYER, wKey)) opt.classList.add('locked');
            
            let html = `<div style="font-size:24px">${w.icon}</div><div>${w.name}</div>`;
            if (!isUnlocked(TEAM_PLAYER, wKey)) html += `<div class="lock-icon">🔒</div>`;
            
            opt.innerHTML = html;
            opt.onclick = () => { if(isUnlocked(TEAM_PLAYER, wKey)) equipWeapon(wKey); };
            selector.appendChild(opt);
        }
    });
}

function equipWeapon(weaponKey) {
    if (editingUnitKey && selectedSlotIndex !== null) {
        UNIT_TYPES[editingUnitKey].hardpoints[selectedSlotIndex].equipped = weaponKey;
        openLoadoutMenu(editingUnitKey);
        const slots = document.querySelectorAll('.slot'); selectSlot(selectedSlotIndex, slots[selectedSlotIndex]);
    }
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
        if (key === 'SF' || key === 'CRUISE_MISSILE_UNIT') return; 
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
    
    let toBuild = null;
    if (enemyIslands.length > 0 && !hasTransport) toBuild = 'TRANSPORT';
    else if (myUnits.filter(u => u.typeKey === 'FIGHTER').length < 3) toBuild = 'FIGHTER';
    else if (myUnits.filter(u => u.typeKey === 'STRIKE').length < 3) toBuild = 'STRIKE';
    else if (myUnits.filter(u => u.typeKey === 'BOMBER').length < 1) toBuild = 'BOMBER';
    else if (myUnits.filter(u => u.typeKey === 'AWACS').length < 1) toBuild = 'AWACS';
    else if (myUnits.filter(u => u.typeKey === 'DESTROYER').length < 2 && currentMapType !== 'LAND') toBuild = 'DESTROYER';
    else if (Math.random() > 0.7) toBuild = 'ATTACK_HELI';

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
            } else if (u.data.role === 'AA' || u.data.role === 'Multi') {
                 // Check zones for targets first? For now simple logic
                 const targets = entities.filter(e => e.team !== team && e.visible);
                 if (targets.length > 0) u.targetUnit = targets[Math.floor(Math.random() * targets.length)];
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
window.addEventListener('keydown', e => inputKeys[e.key] = true);
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
            const clickedUnit = entities.find(u => Math.hypot(u.x - mouse.worldX, u.y - mouse.worldY) < 20 && u.team === TEAM_PLAYER && u.typeKey !== 'SF' && u.visible);
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
            selection.forEach(u => {
                if (target) { u.targetUnit = target; u.targetPos = null; addParticle(target.x, target.y, 'text', 'ATTACK'); }
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

        entities.forEach(e => e.update());
        islands.forEach(i => i.buildings.forEach(b => b.update()));
        projectiles.forEach(p => p.update());
        updateParticles();
        for (let i = entities.length - 1; i >= 0; i--) { if (entities[i].dead) entities.splice(i, 1); }
        for (let i = projectiles.length - 1; i >= 0; i--) { if (projectiles[i].dead) projectiles.splice(i, 1); }
        islands.forEach(i => { for (let b = i.buildings.length - 1; b >= 0; b--) { if (i.buildings[b].dead) i.buildings.splice(b, 1); } });
        
        const playerBase = islands.find(i => i.isMainBase && i.owner === TEAM_PLAYER);
        const aiBase = islands.find(i => i.isMainBase && i.owner === TEAM_AI);
        if (!playerBase || playerBase.owner !== TEAM_PLAYER) endGame("DEFEAT"); else if (!aiBase || aiBase.owner !== TEAM_AI) endGame("VICTORY");
    }
    
    draw();
    if (selection.length > 0 && gameTime % 10 === 0 && !gamePaused) updateSelectionUI();
    if (!gameOver) requestAnimationFrame(loop);
}

function endGame(msg) {
    gameOver = true; document.getElementById('overlay').style.display = 'block'; document.getElementById('overlay-msg').innerText = msg; document.getElementById('overlay-msg').style.color = msg === 'VICTORY' ? '#4f4' : '#f44';
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

    islands.forEach(i => { i.draw(ctx); i.buildings.forEach(b => b.draw(ctx)); });
    entities.filter(e => e.data.type === 'ship').forEach(e => e.draw(ctx));
    entities.filter(e => e.data.type === 'ground').forEach(e => e.draw(ctx));
    entities.filter(e => e.data.type !== 'ship' && e.data.type !== 'ground').forEach(e => e.draw(ctx));
    projectiles.forEach(p => p.draw(ctx));
    drawParticles(ctx);
    
    ctx.restore();
}

window.onresize = () => { width = canvas.width = window.innerWidth; height = canvas.height = window.innerHeight; };
initGame();

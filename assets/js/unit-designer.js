window.UnitDesigner = (() => {
    const state = {
        selectedBase: null,
        style: { hull: '#80a4d8', trim: '#203449', wings: 'delta' },
        hardpoints: [],
        selectedBehavior: null,
        draggingPointId: null
    };

    function buildBehaviorList() {
        const set = new Set();
        Object.values(UNIT_TYPES || {}).forEach(def => {
            if (def.role) set.add(def.role);
            if (def.type) set.add(`type:${def.type}`);
        });
        return [...set].sort((a, b) => a.localeCompare(b));
    }

    function getBaseUnitKeys() {
        return Object.keys(UNIT_TYPES || {}).sort((a, b) => a.localeCompare(b));
    }

    function render() {
        const mount = document.getElementById('unit-designer-app');
        if (!mount) return;
        const bases = getBaseUnitKeys();
        const behaviors = buildBehaviorList();
        if (!state.selectedBase && bases.length) state.selectedBase = bases[0];
        if (!state.selectedBehavior && behaviors.length) state.selectedBehavior = behaviors[0];
        mount.innerHTML = `
            <div class="unit-designer-grid">
                <section class="unit-designer-panel">
                    <h3>Look Designer</h3>
                    <label>Base Unit
                        <select id="ud-base-unit">${bases.map(k => `<option value="${k}" ${k === state.selectedBase ? 'selected' : ''}>${k}</option>`).join('')}</select>
                    </label>
                    <label>Hull Color <input id="ud-hull-color" type="color" value="${state.style.hull}"></label>
                    <label>Trim Color <input id="ud-trim-color" type="color" value="${state.style.trim}"></label>
                    <label>Wing Style
                        <select id="ud-wing-style">
                            <option value="delta" ${state.style.wings === 'delta' ? 'selected' : ''}>Delta</option>
                            <option value="swept" ${state.style.wings === 'swept' ? 'selected' : ''}>Swept</option>
                            <option value="none" ${state.style.wings === 'none' ? 'selected' : ''}>No Wings</option>
                        </select>
                    </label>
                    <canvas id="ud-look-canvas" width="340" height="180"></canvas>
                </section>
                <section class="unit-designer-panel">
                    <h3>UI Layout (Hardpoints)</h3>
                    <p>Drag hardpoints to lay out the loadout UI.</p>
                    <div id="ud-hardpoint-canvas"></div>
                    <button id="ud-add-hardpoint" class="menu-btn tiny">+ Add Hardpoint</button>
                </section>
                <section class="unit-designer-panel">
                    <h3>Behavior Profile</h3>
                    <label>Behavior
                        <select id="ud-behavior">${behaviors.map(b => `<option value="${b}" ${b === state.selectedBehavior ? 'selected' : ''}>${b}</option>`).join('')}</select>
                    </label>
                    <div id="ud-behavior-help">Uses existing in-game behavior tags (roles/types) only.</div>
                </section>
            </div>
        `;
        bindEvents();
        drawLook();
        drawHardpoints();
    }

    function drawLook() {
        const canvas = document.getElementById('ud-look-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#11253a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = state.style.hull;
        ctx.fillRect(120, 65, 100, 48);
        ctx.fillStyle = state.style.trim;
        ctx.fillRect(160, 45, 20, 22);
        if (state.style.wings !== 'none') {
            ctx.fillStyle = state.style.hull;
            ctx.beginPath();
            if (state.style.wings === 'delta') {
                ctx.moveTo(120, 89); ctx.lineTo(50, 130); ctx.lineTo(120, 102);
                ctx.moveTo(220, 89); ctx.lineTo(290, 130); ctx.lineTo(220, 102);
            } else {
                ctx.moveTo(120, 85); ctx.lineTo(70, 110); ctx.lineTo(120, 99);
                ctx.moveTo(220, 85); ctx.lineTo(270, 110); ctx.lineTo(220, 99);
            }
            ctx.fill();
        }
    }

    function drawHardpoints() {
        const surface = document.getElementById('ud-hardpoint-canvas');
        if (!surface) return;
        surface.innerHTML = '';
        state.hardpoints.forEach(point => {
            const node = document.createElement('div');
            node.className = 'ud-hardpoint';
            node.style.left = `${point.x}px`;
            node.style.top = `${point.y}px`;
            node.dataset.id = point.id;
            node.title = point.name;
            surface.appendChild(node);
        });
    }

    function bindEvents() {
        document.getElementById('ud-base-unit')?.addEventListener('change', e => state.selectedBase = e.target.value);
        document.getElementById('ud-hull-color')?.addEventListener('input', e => { state.style.hull = e.target.value; drawLook(); });
        document.getElementById('ud-trim-color')?.addEventListener('input', e => { state.style.trim = e.target.value; drawLook(); });
        document.getElementById('ud-wing-style')?.addEventListener('change', e => { state.style.wings = e.target.value; drawLook(); });
        document.getElementById('ud-behavior')?.addEventListener('change', e => state.selectedBehavior = e.target.value);
        document.getElementById('ud-add-hardpoint')?.addEventListener('click', () => {
            state.hardpoints.push({ id: `hp-${Date.now()}`, name: `HP ${state.hardpoints.length + 1}`, x: 110 + state.hardpoints.length * 16, y: 90 });
            drawHardpoints();
        });

        const surface = document.getElementById('ud-hardpoint-canvas');
        if (!surface) return;
        surface.addEventListener('mousedown', e => {
            const target = e.target.closest('.ud-hardpoint');
            if (!target) return;
            state.draggingPointId = target.dataset.id;
        });
        window.addEventListener('mouseup', () => state.draggingPointId = null);
        surface.addEventListener('mousemove', e => {
            if (!state.draggingPointId) return;
            const rect = surface.getBoundingClientRect();
            const point = state.hardpoints.find(p => p.id === state.draggingPointId);
            if (!point) return;
            point.x = Math.max(0, Math.min(rect.width - 14, e.clientX - rect.left - 7));
            point.y = Math.max(0, Math.min(rect.height - 14, e.clientY - rect.top - 7));
            drawHardpoints();
        });
    }

    return { render };
})();

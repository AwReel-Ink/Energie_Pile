/* ============================================
   ÉNERGIE PILE - Application Principale
   © 2026 LEROY Aurélien - Tous droits réservés
   ============================================ */

(function () {
    'use strict';

    // ========= IndexedDB =========
    const DB_NAME = 'EnergiePilev3.0';
    const DB_STORES = ['devices', 'settings'];
    let db = null;

    function openDB() {
        return new Promise((resolve, reject) => {
            const checkRequest = indexedDB.open(DB_NAME);

            checkRequest.onsuccess = function (e) {
                const existingDb = e.target.result;
                let currentVersion = existingDb.version;
                const existingStores = Array.from(existingDb.objectStoreNames);
                existingDb.close();

                const needsUpgrade = DB_STORES.some(s => !existingStores.includes(s));

                const req = indexedDB.open(DB_NAME, needsUpgrade ? currentVersion + 1 : currentVersion);
                req.onupgradeneeded = function (e2) {
                    const d = e2.target.result;
                    if (!d.objectStoreNames.contains('devices')) {
                        const store = d.createObjectStore('devices', { keyPath: 'id' });
                        store.createIndex('building', 'building', { unique: false });
                    }
                    if (!d.objectStoreNames.contains('settings')) {
                        d.createObjectStore('settings', { keyPath: 'key' });
                    }
                };
                req.onsuccess = function (e2) { db = e2.target.result; resolve(db); };
                req.onerror = function (e2) { reject(e2.target.error); };
            };

            checkRequest.onerror = function (e) { reject(e.target.error); };
        });
    }

    function dbTransaction(storeName, mode) {
        return db.transaction(storeName, mode).objectStore(storeName);
    }

    function dbGetAll(storeName) {
        return new Promise((resolve, reject) => {
            const req = dbTransaction(storeName, 'readonly').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = e => reject(e.target.error);
        });
    }

    function dbGet(storeName, key) {
        return new Promise((resolve, reject) => {
            const req = dbTransaction(storeName, 'readonly').get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = e => reject(e.target.error);
        });
    }

    function dbPut(storeName, data) {
        return new Promise((resolve, reject) => {
            const req = dbTransaction(storeName, 'readwrite').put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = e => reject(e.target.error);
        });
    }

    function dbDelete(storeName, key) {
        return new Promise((resolve, reject) => {
            const req = dbTransaction(storeName, 'readwrite').delete(key);
            req.onsuccess = () => resolve();
            req.onerror = e => reject(e.target.error);
        });
    }

    // ========= State =========
    let currentView = 'home'; // 'home' | 'building'
    let currentBuilding = null;
    let allDevices = [];

    // ========= DOM refs =========
    const $ = id => document.getElementById(id);
    const content = $('content');
    const pageTitle = $('page-title');
    const btnBack = $('btn-back');
    const btnAdd = $('btn-add');
    const btnSettings = $('btn-settings');

    // Modals
    const modalOverlay = $('modal-overlay');
    const modalChangeOverlay = $('modal-change-overlay');
    const modalSettingsOverlay = $('modal-settings-overlay');

    // ========= Themes =========
    const THEMES = [
        { id: 'light', name: 'Clair', icon: '☀️' },
        { id: 'dark', name: 'Sombre', icon: '🌙' },
        { id: 'legend', name: 'Légende', icon: '📜' },
        { id: 'heroic', name: 'Héroïque', icon: '⚔️' },
        { id: 'epic', name: 'Épique', icon: '🔮' },
        { id: 'north', name: 'Nord', icon: '🧭' },
        { id: 'south', name: 'Sud', icon: '🌅' },
        { id: 'east', name: 'Est', icon: '🏮' },
        { id: 'west', name: 'Ouest', icon: '🗽' },
        { id: 'alchemist', name: 'Alchimiste', icon: '⚗️' },
        { id: 'druid', name: 'Druide', icon: '🌿' },
        { id: 'dragon', name: 'Dragon', icon: '🐉' },
        { id: 'fuji', name: 'Fuji', icon: '🗻' },
        { id: 'cherry', name: 'Cerisier', icon: '🌸' },
        { id: 'bamboo', name: 'Bambou', icon: '🎋' },
        { id: 'flower', name: 'Fleur', icon: '🌺' },
        { id: 'forest', name: 'Forêt', icon: '🌲' },
        { id: 'wood', name: 'Bois', icon: '🪵' },
        { id: 'rock', name: 'Roche', icon: '🪨' },
        { id: 'sand', name: 'Sable', icon: '🏖️' },
        { id: 'desert', name: 'Désert', icon: '🏜️' },
        { id: 'steppe', name: 'Steppe', icon: '🌾' },
        { id: 'tundra', name: 'Tundra', icon: '❄️' },
        { id: 'ice', name: 'Banquise', icon: '🧊' },
        { id: 'mountain', name: 'Montagne', icon: '⛰️' },
        { id: 'water', name: 'Eau', icon: '💧' },
        { id: 'seaside', name: 'Bord de mer', icon: '🐚' },
        { id: 'ocean', name: 'Océan', icon: '🌊' },
        { id: 'abyss', name: 'Abysse', icon: '🦑' },
        { id: 'tropic', name: 'Tropique', icon: '🌴' },
        { id: 'moon', name: 'Lune', icon: '🌕' },
        { id: 'space', name: 'Espace', icon: '🚀' },
    ];

    // ========= Helpers =========
    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }

    function formatDate(ts) {
        if (!ts) return '—';
        const d = new Date(ts);
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function daysBetween(a, b) {
        return Math.round((b - a) / (1000 * 60 * 60 * 24));
    }

    function getDeviceStatus(device) {
        // Returns 'ok', 'warn', 'dead'
        if (!device.changes || device.changes.length === 0) return 'ok';
        const lastChange = device.changes[device.changes.length - 1];
        const lastDate = lastChange.date;
        const now = Date.now();
        const elapsed = daysBetween(lastDate, now);

        // Estimate next change based on average interval
        const avgInterval = getAvgInterval(device);
        if (avgInterval === null) {
            // Only one change, can't estimate — show ok if < 365 days
            if (elapsed > 365) return 'dead';
            if (elapsed > 300) return 'warn';
            return 'ok';
        }

        const remaining = avgInterval - elapsed;
        const warningDays = Math.max(avgInterval * 0.1, Math.min(5, avgInterval * 0.3));
        if (remaining < 0) return 'dead';
        if (remaining < warningDays) return 'warn';
        return 'ok';
    }

    function getAvgInterval(device) {
        if (!device.changes || device.changes.length < 2) return null;
        const dates = device.changes.map(c => c.date).sort((a, b) => a - b);
        let total = 0;
        for (let i = 1; i < dates.length; i++) {
            total += daysBetween(dates[i - 1], dates[i]);
        }
        return Math.round(total / (dates.length - 1));
    }

    function getEstimatedNextChange(device) {
        if (!device.changes || device.changes.length === 0) return null;
        const lastDate = device.changes[device.changes.length - 1].date;
        const avg = getAvgInterval(device);
        if (avg === null) return null;
        return lastDate + avg * 24 * 60 * 60 * 1000;
    }

    function statusIcon(status) {
        if (status === 'ok') return '🔋';
        if (status === 'warn') return '⚠️';
        return '🪫';
    }

    function buildingIcon(name) {
        const n = name.toLowerCase();
        if (n.includes('maison')) return '🏠';
        if (n.includes('appartement') || n.includes('appart')) return '🏢';
        if (n.includes('garage')) return '🏗️';
        if (n.includes('bureau')) return '🏛️';
        if (n.includes('dépendance') || n.includes('dependance')) return '🏚️';
        if (n.includes('jardin')) return '🌳';
        if (n.includes('cave')) return '🪨';
        if (n.includes('atelier')) return '🔧';
        return '🏘️';
    }

    // ========= Render: Home (Buildings) =========
    function renderHome() {
        currentView = 'home';
        currentBuilding = null;
        pageTitle.textContent = 'Énergie Pile';
        btnBack.classList.add('hidden');

        const buildings = {};
        allDevices.forEach(d => {
            if (!buildings[d.building]) buildings[d.building] = [];
            buildings[d.building].push(d);
        });

        const keys = Object.keys(buildings).sort((a, b) => a.localeCompare(b, 'fr'));

        if (keys.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔋</div>
                    <p>Aucun appareil enregistré.</p>
                    <p style="margin-top:.5rem;font-size:.9rem;color:var(--text-secondary)">
                        Appuyez sur <strong>+</strong> pour ajouter votre premier appareil à pile.
                    </p>
                </div>`;
            return;
        }

        let html = '<div class="buildings-grid">';
        keys.forEach(name => {
            const devices = buildings[name];
            let ok = 0, warn = 0, dead = 0;
            devices.forEach(d => {
                const s = getDeviceStatus(d);
                if (s === 'ok') ok++;
                else if (s === 'warn') warn++;
                else dead++;
            });
            html += `
                <div class="building-card" data-building="${encodeURIComponent(name)}">
                    <div class="building-icon">${buildingIcon(name)}</div>
                    <div class="building-name">${escapeHtml(name)}</div>
                    <div class="building-stats">
                        <span class="stat stat-ok">🔋 ${ok}</span>
                        <span class="stat stat-warn">⚠️ ${warn}</span>
                        <span class="stat stat-dead">🪫 ${dead}</span>
                    </div>
                </div>`;
        });
        html += '</div>';
        content.innerHTML = html;

        // Events
        content.querySelectorAll('.building-card').forEach(card => {
            card.addEventListener('click', () => {
                const name = decodeURIComponent(card.dataset.building);
                renderBuilding(name);
            });
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ========= Render: Building (Device List) =========
    function renderBuilding(name) {
        currentView = 'building';
        currentBuilding = name;
        pageTitle.textContent = name;
        btnBack.classList.remove('hidden');

        const devices = allDevices
            .filter(d => d.building === name)
            .sort((a, b) => {
                const loc = a.location.localeCompare(b.location, 'fr');
                if (loc !== 0) return loc;
                return a.name.localeCompare(b.name, 'fr');
            });

        if (devices.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📦</div>
                    <p>Aucun appareil dans ce bâtiment.</p>
                </div>`;
            return;
        }

        // Group by location
        const groups = {};
        devices.forEach(d => {
            if (!groups[d.location]) groups[d.location] = [];
            groups[d.location].push(d);
        });

        let html = '';
        Object.keys(groups).sort((a, b) => a.localeCompare(b, 'fr')).forEach(loc => {
            html += `<div class="location-group">`;
            html += `<div class="location-title">📍 ${escapeHtml(loc)}</div>`;
            groups[loc].forEach(d => {
                const status = getDeviceStatus(d);
                const lastChange = d.changes && d.changes.length > 0
                    ? formatDate(d.changes[d.changes.length - 1].date)
                    : 'Jamais';
                const nextEst = getEstimatedNextChange(d);
                const nextStr = nextEst ? formatDate(nextEst) : 'Non estimé';
                html += `
                    <div class="device-item" data-id="${d.id}">
                        <div class="device-status-icon">${statusIcon(status)}</div>
                        <div class="device-info">
                            <div class="device-name">${escapeHtml(d.name)}</div>
                            <div class="device-meta">
                                ${d.batteryCount}× ${d.batteryType} · Dernier : ${lastChange} · Prochain : ${nextStr}
                            </div>
                        </div>
                        <div class="device-arrow">›</div>
                    </div>`;
            });
            html += `</div>`;
        });

        content.innerHTML = html;

        // Events
        content.querySelectorAll('.device-item').forEach(item => {
            item.addEventListener('click', () => {
                openDeviceActions(item.dataset.id);
            });
        });
    }

    // ========= Device Actions (click on device) =========
    function openDeviceActions(deviceId) {
        const device = allDevices.find(d => d.id === deviceId);
        if (!device) return;

        // Show a small action chooser - we use the change modal directly
        // with edit/delete buttons incorporated
        openChangeModal(device);
    }

    // ========= Modal: Add/Edit Device =========
    function openDeviceModal(device, presetBuilding) {
        const isEdit = !!device;
        $('modal-title').textContent = isEdit ? 'Modifier l\'appareil' : 'Ajouter un appareil';
        $('btn-delete-device').classList.toggle('hidden', !isEdit);

        $('device-id').value = isEdit ? device.id : '';
        $('device-name').value = isEdit ? device.name : '';
        $('device-building').value = isEdit ? device.building : (presetBuilding || '');
        $('device-location').value = isEdit ? device.location : '';
        $('device-battery-type').value = isEdit ? device.batteryType : '';
        $('device-battery-count').value = isEdit ? device.batteryCount : 1;
        $('device-rechargeable').checked = isEdit ? device.rechargeable : false;

        modalOverlay.classList.remove('hidden');
        $('device-name').focus();
    }

    function closeDeviceModal() {
        modalOverlay.classList.add('hidden');
        $('device-form').reset();
        $('auto-building').classList.remove('show');
        $('auto-location').classList.remove('show');
    }

    // ========= Modal: Change Batteries =========
    let changeDevice = null;
    let selectedCells = new Set();

    function openChangeModal(device) {
        changeDevice = device;
        selectedCells.clear();
        $('change-device-name').textContent = `${device.name} — ${device.batteryCount}× ${device.batteryType}`;
        $('change-rechargeable').checked = device.rechargeable || false;

        // Build battery visuals
        const container = $('battery-visual');
        container.innerHTML = '';
        for (let i = 0; i < device.batteryCount; i++) {
            const cell = document.createElement('div');
            cell.className = 'battery-cell';
            cell.dataset.index = i;
            cell.innerHTML = `
                <div class="cell-tip"></div>
                <div class="cell-body">
                    <div class="cell-fill"></div>
                </div>
                <div class="cell-label">#${i + 1}</div>`;
            cell.addEventListener('click', () => {
                if (selectedCells.has(i)) {
                    selectedCells.delete(i);
                    cell.classList.remove('selected');
                } else {
                    selectedCells.add(i);
                    cell.classList.add('selected');
                }
            });
            container.appendChild(cell);
        }

        // History
        renderChangeHistory(device);

        modalChangeOverlay.classList.remove('hidden');
    }

    function closeChangeModal() {
        modalChangeOverlay.classList.add('hidden');
        changeDevice = null;
        selectedCells.clear();
    }

    function renderChangeHistory(device) {
        const container = $('change-history');
        if (!device.changes || device.changes.length === 0) {
            container.innerHTML = '<p style="color:var(--text-secondary);font-size:.85rem;text-align:center;margin-top:1rem;">Aucun historique de changement.</p>';
            return;
        }
        let html = '<h4>Historique des changements</h4>';
        const sorted = [...device.changes].sort((a, b) => b.date - a.date);
        sorted.forEach(c => {
            const type = c.rechargeable ? '🔄 Rechargeable' : '🗑️ Jetable';
            html += `
                <div class="history-item">
                    <span class="history-date">${formatDate(c.date)}</span>
                    <span class="history-detail">${c.count} pile${c.count > 1 ? 's' : ''} · ${type}</span>
                </div>`;
        });
        container.innerHTML = html;
    }

    // ========= Modal: Settings =========
    function openSettingsModal() {
        const grid = $('theme-grid');
        grid.innerHTML = '';
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        THEMES.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'theme-btn' + (t.id === currentTheme ? ' active' : '');
            btn.innerHTML = `<span class="theme-icon">${t.icon}</span><span class="theme-name">${t.name}</span>`;
            btn.addEventListener('click', () => {
                applyTheme(t.id);
                grid.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            grid.appendChild(btn);
        });
        modalSettingsOverlay.classList.remove('hidden');
    }

    function closeSettingsModal() {
        modalSettingsOverlay.classList.add('hidden');
    }

    function applyTheme(themeId) {
        document.documentElement.setAttribute('data-theme', themeId);
        dbPut('settings', { key: 'theme', value: themeId });
    }

    // ========= Autocomplete =========
    function setupAutocomplete(inputId, listId, getOptions) {
        const input = $(inputId);
        const list = $(listId);

        input.addEventListener('input', () => {
            const val = input.value.trim().toLowerCase();
            if (val.length === 0) {
                list.classList.remove('show');
                return;
            }
            const options = getOptions().filter(o => o.toLowerCase().includes(val));
            if (options.length === 0) {
                list.classList.remove('show');
                return;
            }
            list.innerHTML = '';
            options.forEach(o => {
                const li = document.createElement('li');
                li.textContent = o;
                li.addEventListener('mousedown', e => {
                    e.preventDefault();
                    input.value = o;
                    list.classList.remove('show');
                });
                list.appendChild(li);
            });
            list.classList.add('show');
        });

        input.addEventListener('blur', () => {
            setTimeout(() => list.classList.remove('show'), 150);
        });

        input.addEventListener('focus', () => {
            if (input.value.trim().length > 0) input.dispatchEvent(new Event('input'));
        });
    }

    function getUniqueBuildings() {
        return [...new Set(allDevices.map(d => d.building))].sort();
    }

    function getUniqueLocations() {
        return [...new Set(allDevices.map(d => d.location))].sort();
    }

    // ========= Data Operations =========
    async function loadDevices() {
        allDevices = await dbGetAll('devices');
    }

    async function saveDevice(deviceData) {
        await dbPut('devices', deviceData);
        await loadDevices();
    }

    async function deleteDevice(id) {
        await dbDelete('devices', id);
        await loadDevices();
    }

    // ========= Event Bindings =========
    function initEvents() {
        // Back
        btnBack.addEventListener('click', () => {
            renderHome();
        });

        // Add
        btnAdd.addEventListener('click', () => {
            const presetBuilding = currentView === 'building' ? currentBuilding : '';
            openDeviceModal(null, presetBuilding);
        });

        // Settings
        btnSettings.addEventListener('click', openSettingsModal);

        // Close modals
        $('modal-close').addEventListener('click', closeDeviceModal);
        $('modal-change-close').addEventListener('click', closeChangeModal);
        $('modal-settings-close').addEventListener('click', closeSettingsModal);

        // Close on overlay click
        modalOverlay.addEventListener('click', e => {
            if (e.target === modalOverlay) closeDeviceModal();
        });
        modalChangeOverlay.addEventListener('click', e => {
            if (e.target === modalChangeOverlay) closeChangeModal();
        });
        modalSettingsOverlay.addEventListener('click', e => {
            if (e.target === modalSettingsOverlay) closeSettingsModal();
        });

        // Stepper
        $('count-minus').addEventListener('click', () => {
            const inp = $('device-battery-count');
            if (parseInt(inp.value) > 1) inp.value = parseInt(inp.value) - 1;
        });
        $('count-plus').addEventListener('click', () => {
            const inp = $('device-battery-count');
            if (parseInt(inp.value) < 20) inp.value = parseInt(inp.value) + 1;
        });

        // Device form submit
        $('device-form').addEventListener('submit', async e => {
            e.preventDefault();
            const id = $('device-id').value || uid();
            const existing = allDevices.find(d => d.id === id);

            const deviceData = {
                id: id,
                name: $('device-name').value.trim(),
                building: $('device-building').value.trim(),
                location: $('device-location').value.trim(),
                batteryType: $('device-battery-type').value,
                batteryCount: parseInt($('device-battery-count').value),
                rechargeable: $('device-rechargeable').checked,
                changes: existing ? existing.changes || [] : [],
                createdAt: existing ? existing.createdAt : Date.now()
            };

            await saveDevice(deviceData);
            closeDeviceModal();
            if (currentView === 'building') {
                renderBuilding(currentBuilding);
            } else {
                renderHome();
            }
        });

        // Delete device
        $('btn-delete-device').addEventListener('click', async () => {
            const id = $('device-id').value;
            if (!id) return;
            if (confirm('Supprimer cet appareil et tout son historique ?')) {
                await deleteDevice(id);
                closeDeviceModal();
                if (currentView === 'building') {
                    // Check if building still has devices
                    const remaining = allDevices.filter(d => d.building === currentBuilding);
                    if (remaining.length === 0) {
                        renderHome();
                    } else {
                        renderBuilding(currentBuilding);
                    }
                } else {
                    renderHome();
                }
            }
        });

        // Select all batteries
        $('btn-select-all').addEventListener('click', () => {
            if (!changeDevice) return;
            const cells = $('battery-visual').querySelectorAll('.battery-cell');
            const allSelected = selectedCells.size === changeDevice.batteryCount;
            cells.forEach((cell, i) => {
                if (allSelected) {
                    selectedCells.delete(i);
                    cell.classList.remove('selected');
                } else {
                    selectedCells.add(i);
                    cell.classList.add('selected');
                }
            });
        });

        // Confirm battery change
        $('btn-confirm-change').addEventListener('click', async () => {
            if (!changeDevice) return;
            if (selectedCells.size === 0) {
                alert('Veuillez sélectionner au moins une pile changée.');
                return;
            }

            const change = {
                date: Date.now(),
                count: selectedCells.size,
                rechargeable: $('change-rechargeable').checked,
                cells: [...selectedCells]
            };

            if (!changeDevice.changes) changeDevice.changes = [];
            changeDevice.changes.push(change);
            await saveDevice(changeDevice);

            renderChangeHistory(changeDevice);

            // Reset selection
            selectedCells.clear();
            $('battery-visual').querySelectorAll('.battery-cell').forEach(c => c.classList.remove('selected'));

            // Refresh view behind
            if (currentView === 'building') {
                renderBuilding(currentBuilding);
            } else {
                renderHome();
            }
        });

        // Edit device from change modal - add edit button dynamically
        // We add two buttons in the change modal header area
        $('btn-edit-device').addEventListener('click', () => {
            const device = changeDevice;
            closeChangeModal();
            openDeviceModal(device);
        });

        // Autocomplete
        setupAutocomplete('device-building', 'auto-building', getUniqueBuildings);
        setupAutocomplete('device-location', 'auto-location', getUniqueLocations);

        // Keyboard escape
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (!modalOverlay.classList.contains('hidden')) closeDeviceModal();
                else if (!modalChangeOverlay.classList.contains('hidden')) closeChangeModal();
                else if (!modalSettingsOverlay.classList.contains('hidden')) closeSettingsModal();
            }
        });
    }

    function addChangeModalActions() {
        const header = $('modal-change').querySelector('.modal-header');
        const actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'display:flex;gap:.35rem;margin-left:auto;margin-right:.5rem;';

        const btnEdit = document.createElement('button');
        btnEdit.className = 'header-btn';
        btnEdit.innerHTML = '✏️';
        btnEdit.title = 'Modifier l\'appareil';
        btnEdit.style.cssText = 'width:34px;height:34px;font-size:1rem;background:var(--accent-light);color:var(--accent);';
        btnEdit.addEventListener('click', () => {
            if (!changeDevice) return;
            closeChangeModal();
            openDeviceModal(changeDevice);
        });

        const btnDel = document.createElement('button');
        btnDel.className = 'header-btn';
        btnDel.innerHTML = '🗑️';
        btnDel.title = 'Supprimer l\'appareil';
        btnDel.style.cssText = 'width:34px;height:34px;font-size:1rem;background:var(--danger);color:#fff;';
        btnDel.addEventListener('click', async () => {
            if (!changeDevice) return;
            if (confirm('Supprimer cet appareil et tout son historique ?')) {
                const bld = changeDevice.building;
                await deleteDevice(changeDevice.id);
                closeChangeModal();
                const remaining = allDevices.filter(d => d.building === bld);
                if (remaining.length === 0 || currentView !== 'building') {
                    renderHome();
                } else {
                    renderBuilding(currentBuilding);
                }
            }
        });

        actionsDiv.appendChild(btnEdit);
        actionsDiv.appendChild(btnDel);

        // Insert before close button
        const closeBtn = header.querySelector('.modal-close');
        header.insertBefore(actionsDiv, closeBtn);
    }

    // ========= Init =========
    async function init() {
        await openDB();

        // Load theme
        const themeSetting = await dbGet('settings', 'theme');
        if (themeSetting && themeSetting.value) {
            document.documentElement.setAttribute('data-theme', themeSetting.value);
        }

        await loadDevices();
        initEvents();
        renderHome();
    }

    // Start
    init().catch(err => {
        console.error('Erreur initialisation Énergie Pile :', err);
        content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>Erreur de chargement. Vérifiez que votre navigateur supporte IndexedDB.</p></div>`;
    });

})();

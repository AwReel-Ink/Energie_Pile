/* ============================================
   ÉNERGIE PILE - Application Principale
   © 2026 LEROY Aurélien - Tous droits réservés
   Version 1.1.0.
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
                const currentVersion = existingDb.version;
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
    let searchQuery = '';

    // ========= DOM refs =========
    const $ = id => document.getElementById(id);
    const content = $('content');
    const pageTitle = $('page-title');
    const pageSubtitle = $('page-subtitle');
    const btnBack = $('btn-back');
    const btnAdd = $('btn-add');
    const btnSettings = $('btn-settings');
    const btnRename = $('btn-rename-building');

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

    // Types de piles proposés en raccourci dans le formulaire
    const COMMON_TYPES = [
        { value: 'AA(LR6)', label: 'AA' },
        { value: 'AAA(LR03)', label: 'AAA' },
        { value: 'CR2032', label: 'CR2032' },
        { value: '6LR61(9V)', label: '9V' },
        { value: 'CR2025', label: 'CR2025' },
        { value: 'LR44(AG13)', label: 'LR44' },
    ];
    const BUILDING_SUGGESTIONS = ['Maison', 'Appartement', 'Garage', 'Bureau'];
    const LOCATION_SUGGESTIONS = ['Salon', 'Cuisine', 'Chambre', 'Salle de bain', 'Entrée', 'Bureau'];

    const DAY = 24 * 60 * 60 * 1000;

    // ========= Helpers =========
    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function normalize(str) {
        return String(str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    }

    function plural(n, singular, pluralForm) {
        return `${n} ${n > 1 ? (pluralForm || singular + 's') : singular}`;
    }

    function formatDate(ts) {
        if (!ts) return '—';
        return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function formatDateShort(ts) {
        if (!ts) return '—';
        return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }

    function daysBetween(a, b) {
        return Math.round((b - a) / DAY);
    }

    function startOfDay(ts) {
        const d = new Date(ts);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }

    // Jours « calendaires » entre deux instants (aujourd'hui = 0, hier = 1…)
    function calendarDays(from, to) {
        return Math.round((startOfDay(to) - startOfDay(from)) / DAY);
    }

    function durationText(days) {
        days = Math.abs(days);
        if (days < 14) return plural(days, 'jour');
        if (days < 60) return plural(Math.round(days / 7), 'semaine');
        if (days < 365) return `${Math.round(days / 30.44)} mois`;
        const years = Math.floor(days / 365);
        const months = Math.round((days - years * 365) / 30.44);
        return months > 0 && months < 12 ? `${plural(years, 'an')} et ${months} mois` : plural(Math.round(days / 365), 'an');
    }

    function agoText(ts) {
        const d = calendarDays(ts, Date.now());
        if (d <= 0) return "aujourd'hui";
        if (d === 1) return 'hier';
        return 'il y a ' + durationText(d);
    }

    function untilText(ts) {
        const d = calendarDays(Date.now(), ts);
        if (d === 0) return "aujourd'hui";
        if (d === 1) return 'demain';
        if (d < 0) return 'en retard de ' + durationText(d);
        return 'dans ' + durationText(d);
    }

    // Valeur d'un <input type="date"> → timestamp (midi, heure locale)
    function dateInputToTs(value) {
        if (!value) return null;
        const [y, m, d] = value.split('-').map(Number);
        if (!y || !m || !d) return null;
        return new Date(y, m - 1, d, 12, 0, 0).getTime();
    }

    function todayInputValue() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function typeLabel(value) {
        return String(value || '').replace('(', ' (');
    }

    // ========= Battery status =========
    function lastChangeDate(device) {
        if (!device.changes || device.changes.length === 0) return null;
        return Math.max(...device.changes.map(c => c.date));
    }

    function getAvgInterval(device) {
        if (!device.changes || device.changes.length < 2) return null;
        const dates = device.changes.map(c => c.date).sort((a, b) => a - b);
        let total = 0;
        for (let i = 1; i < dates.length; i++) {
            total += daysBetween(dates[i - 1], dates[i]);
        }
        const avg = Math.round(total / (dates.length - 1));
        return avg >= 1 ? avg : null;
    }

    function getDeviceStatus(device) {
        // 'ok' | 'warn' | 'dead' | 'new' (aucun changement noté)
        const lastDate = lastChangeDate(device);
        if (lastDate === null) return 'new';
        const elapsed = daysBetween(lastDate, Date.now());

        const avgInterval = getAvgInterval(device);
        if (avgInterval === null) {
            // Un seul changement : on compte environ un an
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

    // { date, approx } ou null
    function getEstimatedNextChange(device) {
        const lastDate = lastChangeDate(device);
        if (lastDate === null) return null;
        const avg = getAvgInterval(device);
        if (avg === null) return { date: lastDate + 365 * DAY, approx: true };
        return { date: lastDate + avg * DAY, approx: false };
    }

    const STATUS = {
        ok: { icon: '🔋', label: 'OK' },
        warn: { icon: '⚠️', label: 'Bientôt' },
        dead: { icon: '🪫', label: 'À changer' },
        new: { icon: '❔', label: 'Date inconnue' },
    };

    function buildingIcon(name) {
        const n = normalize(name);
        if (n.includes('maison')) return '🏠';
        if (n.includes('appartement') || n.includes('appart')) return '🏢';
        if (n.includes('garage')) return '🏗️';
        if (n.includes('bureau') || n.includes('travail')) return '🏛️';
        if (n.includes('dependance') || n.includes('abri') || n.includes('cabane')) return '🏚️';
        if (n.includes('jardin')) return '🌳';
        if (n.includes('cave')) return '🪨';
        if (n.includes('atelier')) return '🔧';
        if (n.includes('voiture') || n.includes('auto')) return '🚗';
        if (n.includes('camping') || n.includes('caravane')) return '🚐';
        if (n.includes('chalet') || n.includes('montagne')) return '🛖';
        if (n.includes('ecole')) return '🏫';
        return '🏘️';
    }

    // ========= Layers (fenêtres + bouton retour du téléphone) =========
    // Chaque fenêtre ouverte (et la vue « bâtiment ») ajoute une entrée dans
    // l'historique : le bouton retour d'Android la ferme au lieu de quitter l'appli.
    const OVERLAYS = {
        device: $('sheet-device'),
        form: $('sheet-form'),
        settings: $('sheet-settings'),
        dialog: $('dialog'),
    };
    const onHide = {};
    const layers = [];
    let pendingBacks = 0;
    let ignoredPops = 0;
    let flushScheduled = false;

    function pushLayer(name) {
        layers.push(name);
        if (pendingBacks > 0) {
            pendingBacks--; // on réutilise une entrée qui allait être retirée
        } else {
            history.pushState({ energiePile: layers.length }, '');
        }
    }

    function popLayer(name) {
        const i = layers.lastIndexOf(name);
        if (i < 0) return false;
        layers.splice(i, 1);
        pendingBacks++;
        if (!flushScheduled) {
            flushScheduled = true;
            setTimeout(() => {
                flushScheduled = false;
                if (pendingBacks > 0) {
                    ignoredPops++;
                    history.go(-pendingBacks);
                    pendingBacks = 0;
                }
            }, 0);
        }
        return true;
    }

    window.addEventListener('popstate', () => {
        if (ignoredPops > 0) { ignoredPops--; return; }
        const name = layers.pop();
        if (!name) return;
        if (name === 'building') renderHome();
        else hideOverlay(name);
    });

    function updateScrollLock() {
        const anyOpen = Object.values(OVERLAYS).some(el => !el.classList.contains('hidden'));
        document.body.classList.toggle('no-scroll', anyOpen);
    }

    function showOverlay(name) {
        OVERLAYS[name].classList.remove('hidden');
        OVERLAYS[name].querySelector('.sheet, .dialog').scrollTop = 0;
        updateScrollLock();
    }

    function hideOverlay(name) {
        const el = OVERLAYS[name];
        if (el.classList.contains('hidden')) return;
        el.classList.add('hidden');
        updateScrollLock();
        if (onHide[name]) onHide[name]();
    }

    function openOverlay(name) {
        if (layers.includes(name)) { showOverlay(name); return; }
        showOverlay(name);
        pushLayer(name);
    }

    function closeOverlay(name) {
        if (popLayer(name)) hideOverlay(name);
        else hideOverlay(name);
    }

    function replaceOverlay(from, to) {
        const i = layers.lastIndexOf(from);
        if (i < 0) { openOverlay(to); return; }
        layers[i] = to;
        hideOverlay(from);
        showOverlay(to);
    }

    function topLayer() {
        return layers[layers.length - 1];
    }

    // ========= Toasts =========
    function showToast(message, opts) {
        const { action, duration } = opts || {};
        const box = $('toasts');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
        let timer = null;
        const remove = () => {
            clearTimeout(timer);
            toast.classList.add('leaving');
            setTimeout(() => toast.remove(), 200);
        };
        if (action) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = action.label;
            b.addEventListener('click', () => { remove(); action.fn(); });
            toast.appendChild(b);
        }
        while (box.firstChild) box.firstChild.remove(); // un seul message à la fois
        box.appendChild(toast);
        timer = setTimeout(remove, duration || (action ? 6000 : 3000));
    }

    // ========= Dialog (confirmation / saisie) =========
    let dialogResolve = null;

    function ask(opts) {
        const { title, message = '', ok = 'OK', cancel = 'Annuler', danger = false, input = null } = opts;
        return new Promise(resolve => {
            if (dialogResolve) { const r = dialogResolve; dialogResolve = null; r(null); }
            dialogResolve = resolve;
            $('dialog-title').textContent = title;
            $('dialog-message').textContent = message;
            const field = $('dialog-input');
            field.classList.toggle('hidden', input === null);
            field.value = input === null ? '' : input;
            const okBtn = $('dialog-ok');
            okBtn.textContent = ok;
            okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
            $('dialog-cancel').textContent = cancel;
            openOverlay('dialog');
            setTimeout(() => (input === null ? okBtn : field).focus(), 50);
            if (input !== null) setTimeout(() => field.select(), 60);
        });
    }

    function finishDialog(value) {
        const r = dialogResolve;
        dialogResolve = null;
        closeOverlay('dialog');
        if (r) r(value);
    }

    onHide.dialog = () => {
        if (dialogResolve) { const r = dialogResolve; dialogResolve = null; r(null); }
    };

    // ========= Header =========
    function setHeader(title, subtitle, inBuilding) {
        pageTitle.textContent = title;
        pageSubtitle.textContent = subtitle || '';
        btnBack.classList.toggle('hidden', !inBuilding);
        btnRename.classList.toggle('hidden', !inBuilding);
    }

    // ========= Device row =========
    function deviceRowHtml(d, showBuilding) {
        const status = getDeviceStatus(d);
        const last = lastChangeDate(d);
        const next = getEstimatedNextChange(d);
        const where = showBuilding
            ? `${escapeHtml(d.building)} › ${escapeHtml(d.location)}`
            : `${escapeHtml(String(d.batteryCount))}× ${escapeHtml(typeLabel(d.batteryType))}`;
        let timing;
        if (!last) {
            timing = 'Aucun changement noté';
        } else {
            timing = 'Changé ' + agoText(last);
            if (next) {
                const approx = next.approx && status === 'ok' ? '≈ ' : '';
                timing += status === 'dead'
                    ? ` · <strong>${untilText(next.date)}</strong>`
                    : ` · prévu ${approx}${untilText(next.date)}`;
            }
        }
        return `
            <button type="button" class="device-item s-${status}" data-id="${escapeHtml(d.id)}">
                <span class="device-status-icon" aria-hidden="true">${STATUS[status].icon}</span>
                <span class="device-info">
                    <span class="device-name">${escapeHtml(d.name)}</span>
                    <span class="device-meta">${where}</span>
                    <span class="device-meta device-timing">${timing}</span>
                </span>
                <span class="pill s-${status}">${STATUS[status].label}</span>
            </button>`;
    }

    function bindDeviceRows(root) {
        root.querySelectorAll('.device-item').forEach(item => {
            item.addEventListener('click', () => openDeviceSheet(item.dataset.id));
        });
    }

    function urgency(d) {
        const next = getEstimatedNextChange(d);
        return next ? next.date : Infinity;
    }

    // ========= Render: Home =========
    function renderHome() {
        currentView = 'home';
        currentBuilding = null;
        setHeader('Énergie Pile', allDevices.length ? plural(allDevices.length, 'appareil') : '', false);

        if (allDevices.length === 0) {
            searchQuery = '';
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔋</div>
                    <h2>Bienvenue !</h2>
                    <p>Notez vos appareils à piles (télécommandes, détecteurs de fumée, horloges…). L'appli vous dira quand changer les piles.</p>
                    <button type="button" class="btn btn-primary btn-big" id="btn-first-device">+ Ajouter mon premier appareil</button>
                </div>`;
            $('btn-first-device').addEventListener('click', () => openDeviceForm(null));
            return;
        }

        content.innerHTML = `
            <div class="search">
                <input type="search" id="search-input" placeholder="Rechercher un appareil, une pièce…" aria-label="Rechercher" autocomplete="off" enterkeyhint="search">
            </div>
            <div id="home-body"></div>`;
        const input = $('search-input');
        input.value = searchQuery;
        input.addEventListener('input', () => {
            searchQuery = input.value;
            renderHomeBody();
        });
        renderHomeBody();
    }

    function renderHomeBody() {
        const body = $('home-body');
        if (!body) return;
        const q = normalize(searchQuery);

        if (q) {
            const results = allDevices
                .filter(d => [d.name, d.building, d.location, d.batteryType].some(v => normalize(v).includes(q)))
                .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
            body.innerHTML = results.length
                ? `<section class="section">
                       <div class="section-title">Résultats <span class="count">${results.length}</span></div>
                       <div class="device-list">${results.map(d => deviceRowHtml(d, true)).join('')}</div>
                   </section>`
                : `<div class="empty-state"><div class="empty-icon">🔎</div><p>Aucun appareil ne correspond à « ${escapeHtml(searchQuery.trim())} ».</p></div>`;
            bindDeviceRows(body);
            return;
        }

        let html = '';
        const alerts = allDevices
            .filter(d => { const s = getDeviceStatus(d); return s === 'dead' || s === 'warn'; })
            .sort((a, b) => urgency(a) - urgency(b));

        if (alerts.length) {
            html += `
                <section class="section">
                    <div class="section-title">🪫 À changer <span class="count">${alerts.length}</span></div>
                    <div class="device-list">${alerts.map(d => deviceRowHtml(d, true)).join('')}</div>
                </section>`;
        } else {
            html += `
                <div class="all-good">
                    <span class="big">✅</span>
                    <span><strong>Tout est en ordre.</strong><br>Aucune pile à changer pour le moment.</span>
                </div>`;
        }

        const buildings = {};
        allDevices.forEach(d => {
            if (!buildings[d.building]) buildings[d.building] = [];
            buildings[d.building].push(d);
        });
        const keys = Object.keys(buildings).sort((a, b) => a.localeCompare(b, 'fr'));

        html += `<section class="section"><div class="section-title">🏘️ Bâtiments</div><div class="buildings-grid">`;
        keys.forEach(name => {
            const devices = buildings[name];
            const c = { ok: 0, warn: 0, dead: 0, new: 0 };
            devices.forEach(d => c[getDeviceStatus(d)]++);
            const pills = ['dead', 'warn', 'ok', 'new']
                .filter(s => c[s] > 0)
                .map(s => `<span class="pill s-${s}">${STATUS[s].icon} ${c[s]}</span>`)
                .join('');
            const badge = c.dead > 0
                ? `<span class="building-alert" title="${plural(c.dead, 'appareil')} à changer">${c.dead}</span>`
                : (c.warn > 0 ? `<span class="building-alert warn" title="${plural(c.warn, 'appareil')} bientôt">${c.warn}</span>` : '');
            html += `
                <button type="button" class="building-card" data-building="${encodeURIComponent(name)}">
                    ${badge}
                    <div class="building-icon" aria-hidden="true">${buildingIcon(name)}</div>
                    <div class="building-name">${escapeHtml(name)}</div>
                    <div class="building-count">${plural(devices.length, 'appareil')}</div>
                    <div class="building-stats">${pills}</div>
                </button>`;
        });
        html += `</div></section>`;

        body.innerHTML = html;
        bindDeviceRows(body);
        body.querySelectorAll('.building-card').forEach(card => {
            card.addEventListener('click', () => renderBuilding(decodeURIComponent(card.dataset.building)));
        });
    }

    // ========= Render: Building =========
    function renderBuilding(name) {
        const devices = allDevices
            .filter(d => d.building === name)
            .sort((a, b) => {
                const loc = a.location.localeCompare(b.location, 'fr');
                if (loc !== 0) return loc;
                return a.name.localeCompare(b.name, 'fr');
            });

        if (currentView !== 'building') pushLayer('building');
        currentView = 'building';
        currentBuilding = name;

        const toChange = devices.filter(d => getDeviceStatus(d) === 'dead').length;
        setHeader(name, plural(devices.length, 'appareil') + (toChange ? ` · ${toChange} à changer` : ''), true);
        window.scrollTo(0, 0);

        if (devices.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📦</div>
                    <p>Aucun appareil dans ce bâtiment.</p>
                </div>`;
            return;
        }

        const groups = {};
        devices.forEach(d => {
            if (!groups[d.location]) groups[d.location] = [];
            groups[d.location].push(d);
        });

        let html = '';
        Object.keys(groups).sort((a, b) => a.localeCompare(b, 'fr')).forEach(loc => {
            html += `
                <div class="location-group">
                    <div class="location-title">📍 ${escapeHtml(loc)}</div>
                    <div class="device-list">${groups[loc].map(d => deviceRowHtml(d, false)).join('')}</div>
                </div>`;
        });
        content.innerHTML = html;
        bindDeviceRows(content);
    }

    function leaveBuilding() {
        popLayer('building');
        renderHome();
    }

    // Réaffiche l'écran courant (après un import, une synchro, une modification…)
    function renderCurrentView() {
        if (currentView === 'building') {
            if (allDevices.some(d => d.building === currentBuilding)) renderBuilding(currentBuilding);
            else leaveBuilding();
        } else {
            renderHome();
        }

        // Fiche appareil ouverte : la mettre à jour, ou la fermer si l'appareil a disparu
        if (sheetDeviceId && !OVERLAYS.device.classList.contains('hidden')) {
            const d = allDevices.find(x => x.id === sheetDeviceId);
            if (d) fillDeviceSheet(d, true);
            else closeOverlay('device');
        }
    }

    // ========= Device sheet =========
    let sheetDeviceId = null;
    let selectedCells = new Set();
    let changeWhen = 'today';
    let changeKind = 'disposable';

    function openDeviceSheet(deviceId) {
        const device = allDevices.find(d => d.id === deviceId);
        if (!device) return;
        fillDeviceSheet(device, false);
        openOverlay('device');
    }

    onHide.device = () => { sheetDeviceId = null; };

    function fillDeviceSheet(device, keepSelection) {
        const sameDevice = sheetDeviceId === device.id;
        sheetDeviceId = device.id;
        const count = Math.max(1, parseInt(device.batteryCount, 10) || 1);

        $('device-sheet-title').textContent = device.name;
        $('device-sheet-where').textContent = `${device.building} › ${device.location} · ${count}× ${typeLabel(device.batteryType)}`;

        // Statut
        const status = getDeviceStatus(device);
        const last = lastChangeDate(device);
        const next = getEstimatedNextChange(device);
        const avg = getAvgInterval(device);
        let lines = '';
        if (last === null) {
            lines = `<div>Aucun changement noté pour l'instant.</div><div>Notez le prochain ci-dessous pour démarrer le suivi.</div>`;
        } else {
            lines += `<div>Dernier changement : <strong>${agoText(last)}</strong> (${formatDate(last)})</div>`;
            if (next) {
                const label = status === 'dead' ? 'Était prévu' : 'Prochain prévu';
                lines += `<div>${label} : <strong>${next.approx ? '≈ ' : ''}${formatDate(next.date)}</strong> (${untilText(next.date)})</div>`;
            }
            lines += avg !== null
                ? `<div>Durée moyenne : ${durationText(avg)} (sur ${plural(device.changes.length, 'changement')})</div>`
                : `<div>Estimation : environ 1 an (un seul changement noté)</div>`;
        }
        const statusEl = $('device-status');
        statusEl.className = `status-card s-${status}`;
        statusEl.innerHTML = `
            <div class="big" aria-hidden="true">${STATUS[status].icon}</div>
            <div>
                <div class="status-label">${STATUS[status].label}</div>
                <div class="status-lines">${lines}</div>
            </div>`;

        // Sélection des piles : toutes cochées par défaut
        if (!(keepSelection && sameDevice)) {
            selectedCells = new Set([...Array(count).keys()]);
            changeWhen = 'today';
            changeKind = device.rechargeable ? 'rechargeable' : 'disposable';
            $('change-date').value = todayInputValue();
        } else {
            selectedCells = new Set([...selectedCells].filter(i => i < count));
        }
        $('change-date').max = todayInputValue();
        setSegmented('change-when', changeWhen);
        setSegmented('change-kind', changeKind);
        $('change-date').classList.toggle('hidden', changeWhen !== 'other');
        $('cells-hint').classList.toggle('hidden', count < 2);

        // Dernière date de changement de chaque pile
        const lastPerCell = new Array(count).fill(null);
        (device.changes || []).forEach(c => {
            const cells = Array.isArray(c.cells) ? c.cells : [...Array(count).keys()];
            cells.forEach(i => {
                if (i < count && (lastPerCell[i] === null || c.date > lastPerCell[i])) lastPerCell[i] = c.date;
            });
        });

        const container = $('battery-visual');
        container.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'battery-cell' + (selectedCells.has(i) ? ' selected' : '');
            cell.setAttribute('aria-pressed', selectedCells.has(i) ? 'true' : 'false');
            cell.setAttribute('aria-label', `Pile ${i + 1}`);
            cell.innerHTML = `
                <div class="cell-tip"></div>
                <div class="cell-body"><div class="cell-fill"></div><span class="cell-check">✓</span></div>
                <div class="cell-label">#${i + 1}</div>
                <div class="cell-date">${lastPerCell[i] ? formatDateShort(lastPerCell[i]) : '—'}</div>`;
            cell.addEventListener('click', () => {
                if (selectedCells.has(i)) selectedCells.delete(i);
                else selectedCells.add(i);
                cell.classList.toggle('selected', selectedCells.has(i));
                cell.setAttribute('aria-pressed', selectedCells.has(i) ? 'true' : 'false');
                updateConfirmButton(count);
            });
            container.appendChild(cell);
        }
        updateConfirmButton(count);
        renderChangeHistory(device);
    }

    function updateConfirmButton(count) {
        const btn = $('btn-confirm-change');
        const n = selectedCells.size;
        btn.disabled = n === 0;
        if (n === 0) btn.textContent = 'Cochez au moins une pile';
        else if (n === count) btn.textContent = count > 1 ? "✅ J'ai changé les piles" : "✅ J'ai changé la pile";
        else btn.textContent = `✅ J'ai changé ${n} pile${n > 1 ? 's' : ''} sur ${count}`;
    }

    function renderChangeHistory(device) {
        const container = $('change-history');
        const changes = (device.changes || []).slice().sort((a, b) => b.date - a.date);
        if (changes.length === 0) {
            container.innerHTML = '<p class="history-empty">Aucun changement enregistré.</p>';
            return;
        }
        container.innerHTML = changes.map((c, i) => {
            const type = c.rechargeable ? '🔄 Rechargeable' : '🗑️ Jetable';
            const prev = changes[i + 1];
            const gap = prev ? `après ${durationText(daysBetween(prev.date, c.date))}` : '';
            return `
                <div class="history-item">
                    <div class="history-main">
                        <div class="history-date">${formatDate(c.date)}</div>
                        <div class="history-detail">${plural(c.count, 'pile')} · ${type}</div>
                    </div>
                    ${gap ? `<span class="history-gap">${gap}</span>` : ''}
                    <button type="button" class="history-del" data-index="${i}" aria-label="Supprimer ce changement" title="Supprimer ce changement">✕</button>
                </div>`;
        }).join('');
        container.querySelectorAll('.history-del').forEach(btn => {
            btn.addEventListener('click', () => removeChange(device.id, changes[+btn.dataset.index]));
        });
    }

    function sameChange(a, b) {
        return a.date === b.date && a.count === b.count &&
            JSON.stringify(a.cells || null) === JSON.stringify(b.cells || null);
    }

    async function removeChange(deviceId, change) {
        const ok = await ask({
            title: 'Supprimer ce changement ?',
            message: `Le changement du ${formatDate(change.date)} sera retiré de l'historique.`,
            ok: 'Supprimer',
            danger: true,
        });
        if (!ok) return;
        const device = allDevices.find(d => d.id === deviceId);
        if (!device) return;
        const idx = (device.changes || []).findIndex(c => sameChange(c, change));
        if (idx < 0) return;
        const updated = { ...device, changes: device.changes.filter((_, i) => i !== idx) };
        await saveDevice(updated);
        renderCurrentView();
        showToast('Changement retiré de l\'historique');
    }

    async function confirmChange() {
        const device = allDevices.find(d => d.id === sheetDeviceId);
        if (!device || selectedCells.size === 0) return;

        let date = Date.now();
        if (changeWhen === 'other') {
            const ts = dateInputToTs($('change-date').value);
            if (!ts) { showToast('Choisissez la date du changement.'); return; }
            if (startOfDay(ts) > startOfDay(Date.now())) { showToast('La date ne peut pas être dans le futur.'); return; }
            date = calendarDays(ts, Date.now()) === 0 ? Date.now() : ts;
        }

        const change = {
            date: date,
            count: selectedCells.size,
            rechargeable: changeKind === 'rechargeable',
            cells: [...selectedCells].sort((a, b) => a - b),
        };
        const updated = {
            ...device,
            changes: [...(device.changes || []), change].sort((a, b) => a.date - b.date),
        };
        await saveDevice(updated);
        closeOverlay('device');
        renderCurrentView();

        showToast(`🔋 Noté pour « ${device.name} »`, {
            action: {
                label: 'Annuler',
                fn: async () => {
                    const current = allDevices.find(d => d.id === device.id);
                    if (!current) return;
                    const idx = (current.changes || []).findIndex(c => sameChange(c, change));
                    if (idx < 0) return;
                    await saveDevice({ ...current, changes: current.changes.filter((_, i) => i !== idx) });
                    renderCurrentView();
                    showToast('Changement annulé');
                },
            },
        });
    }

    // ========= Device form =========
    let formFromSheet = false;
    let firstChange = 'unknown';

    function openDeviceForm(device, presetBuilding, fromSheet) {
        const isEdit = !!device;
        formFromSheet = !!fromSheet;
        $('form-title').textContent = isEdit ? 'Modifier l\'appareil' : 'Nouvel appareil';
        $('btn-delete-device').classList.toggle('hidden', !isEdit);
        $('field-first-change').classList.toggle('hidden', isEdit);
        document.querySelectorAll('#device-form .field-error').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('#device-form .invalid').forEach(el => el.classList.remove('invalid'));

        $('device-id').value = isEdit ? device.id : '';
        $('device-name').value = isEdit ? device.name : '';
        $('device-building').value = isEdit ? device.building : (presetBuilding || '');
        $('device-location').value = isEdit ? device.location : '';
        $('device-battery-count').value = isEdit ? (parseInt(device.batteryCount, 10) || 1) : 1;
        setSegmented('device-kind', isEdit && device.rechargeable ? 'rechargeable' : 'disposable');
        setBatteryType(isEdit ? device.batteryType : '');

        firstChange = 'unknown';
        setSegmented('first-change', firstChange);
        $('first-change-date').classList.add('hidden');
        $('first-change-date').value = todayInputValue();
        $('first-change-date').max = todayInputValue();

        renderBuildingChips();
        renderLocationChips();
        renderTypeChips();

        if (fromSheet) replaceOverlay('device', 'form');
        else openOverlay('form');

        // Sur ordinateur, on place le curseur dans le premier champ
        if (!isEdit && window.matchMedia('(pointer: fine)').matches) {
            setTimeout(() => $('device-name').focus(), 60);
        }
    }

    function knownTypeValues() {
        return Array.from($('device-battery-type').options).map(o => o.value).filter(v => v && v !== '__autre');
    }

    function setBatteryType(value) {
        const select = $('device-battery-type');
        const custom = $('device-battery-custom');
        if (!value) {
            select.value = '';
            custom.value = '';
        } else if (knownTypeValues().includes(value)) {
            select.value = value;
            custom.value = '';
        } else {
            select.value = '__autre';
            custom.value = value;
        }
        custom.classList.toggle('hidden', select.value !== '__autre');
        renderTypeChips();
    }

    function getBatteryType() {
        const select = $('device-battery-type');
        if (select.value === '__autre') return $('device-battery-custom').value.trim();
        return select.value;
    }

    function chipsHtml(values, current, labels) {
        const cur = normalize(current);
        return values.map(v => {
            const label = labels ? labels[v] || v : v;
            return `<button type="button" class="chip${normalize(v) === cur && cur ? ' active' : ''}" data-value="${escapeHtml(v)}">${escapeHtml(label)}</button>`;
        }).join('');
    }

    function uniqueSorted(list) {
        const seen = new Map();
        list.forEach(v => { if (v && !seen.has(normalize(v))) seen.set(normalize(v), v); });
        return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr'));
    }

    function getUniqueBuildings() {
        return uniqueSorted(allDevices.map(d => d.building));
    }

    function locationsFor(building) {
        const b = normalize(building);
        return uniqueSorted(allDevices.filter(d => normalize(d.building) === b).map(d => d.location));
    }

    function renderBuildingChips() {
        const known = getUniqueBuildings();
        const values = known.length ? known : BUILDING_SUGGESTIONS;
        const box = $('chips-building');
        box.innerHTML = chipsHtml(values, $('device-building').value);
        box.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
            $('device-building').value = chip.dataset.value;
            clearError('device-building', 'err-building');
            renderBuildingChips();
            renderLocationChips();
        }));
    }

    function renderLocationChips() {
        const known = locationsFor($('device-building').value);
        const values = (known.length ? known : LOCATION_SUGGESTIONS).slice(0, 14);
        const box = $('chips-location');
        box.innerHTML = chipsHtml(values, $('device-location').value);
        box.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
            $('device-location').value = chip.dataset.value;
            clearError('device-location', 'err-location');
            renderLocationChips();
        }));
    }

    function renderTypeChips() {
        const labels = {};
        COMMON_TYPES.forEach(t => { labels[t.value] = t.label; });
        const values = COMMON_TYPES.map(t => t.value);
        // Types déjà utilisés dans l'appli mais absents des raccourcis
        uniqueSorted(allDevices.map(d => d.batteryType)).forEach(t => {
            if (!values.includes(t)) { values.push(t); labels[t] = typeLabel(t); }
        });
        const box = $('chips-type');
        box.innerHTML = chipsHtml(values.slice(0, 10), getBatteryType(), labels);
        box.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
            setBatteryType(chip.dataset.value);
            clearError('device-battery-type', 'err-type');
        }));
    }

    function showError(inputId, errId) {
        $(inputId).classList.add('invalid');
        $(errId).classList.remove('hidden');
    }

    function clearError(inputId, errId) {
        $(inputId).classList.remove('invalid');
        $(errId).classList.add('hidden');
    }

    // Réutilise l'écriture existante (« maison » → « Maison ») pour éviter les doublons
    function matchExisting(value, list) {
        const n = normalize(value);
        return list.find(v => normalize(v) === n) || value;
    }

    async function submitDeviceForm(e) {
        e.preventDefault();
        const name = $('device-name').value.trim();
        const buildingRaw = $('device-building').value.trim();
        const locationRaw = $('device-location').value.trim();
        const batteryType = getBatteryType();

        const checks = [
            [!name, 'device-name', 'err-name'],
            [!buildingRaw, 'device-building', 'err-building'],
            [!locationRaw, 'device-location', 'err-location'],
            [!batteryType, $('device-battery-type').value === '__autre' ? 'device-battery-custom' : 'device-battery-type', 'err-type'],
        ];
        let firstInvalid = null;
        checks.forEach(([bad, inputId, errId]) => {
            if (bad) { showError(inputId, errId); if (!firstInvalid) firstInvalid = inputId; }
            else clearError(inputId, errId);
        });
        if (firstInvalid) { $(firstInvalid).focus(); return; }

        const building = matchExisting(buildingRaw, getUniqueBuildings());
        const location = matchExisting(locationRaw, locationsFor(building));
        const count = Math.min(20, Math.max(1, parseInt($('device-battery-count').value, 10) || 1));
        const rechargeable = getSegmented('device-kind') === 'rechargeable';

        const id = $('device-id').value || uid();
        const existing = allDevices.find(d => d.id === id);

        let changes = existing ? existing.changes || [] : [];
        if (!existing && firstChange !== 'unknown') {
            let date = Date.now();
            if (firstChange === 'other') {
                const ts = dateInputToTs($('first-change-date').value);
                if (!ts || startOfDay(ts) > startOfDay(Date.now())) {
                    showToast('Choisissez une date passée pour le dernier changement.');
                    return;
                }
                if (calendarDays(ts, Date.now()) !== 0) date = ts;
            }
            changes = [{ date, count, rechargeable, cells: [...Array(count).keys()] }];
        }

        const deviceData = {
            ...(existing || {}),
            id: id,
            name: name,
            building: building,
            location: location,
            batteryType: batteryType,
            batteryCount: count,
            rechargeable: rechargeable,
            changes: changes,
            createdAt: existing ? existing.createdAt : Date.now()
        };

        await saveDevice(deviceData);

        if (existing && formFromSheet) {
            fillDeviceSheet(deviceData, false);
            replaceOverlay('form', 'device');
            renderCurrentView();
            showToast('✅ Modifications enregistrées');
            return;
        }

        closeOverlay('form');
        renderCurrentView();
        if (existing) {
            showToast('✅ Modifications enregistrées');
        } else {
            showToast(`✅ « ${name} » ajouté dans ${building} › ${location}`, {
                action: { label: 'Voir', fn: () => openDeviceSheet(id) },
            });
        }
    }

    async function confirmDeleteDevice(device) {
        if (!device) return;
        const ok = await ask({
            title: 'Supprimer cet appareil ?',
            message: `« ${device.name} » et tout son historique seront effacés.`,
            ok: 'Supprimer',
            danger: true,
        });
        if (!ok) return;
        const backup = JSON.parse(JSON.stringify(device));
        await deleteDevice(device.id);
        closeOverlay('device');
        closeOverlay('form');
        renderCurrentView();
        showToast(`🗑️ « ${device.name} » supprimé`, {
            action: {
                label: 'Annuler',
                fn: async () => {
                    await saveDevice(backup);
                    renderCurrentView();
                    showToast('Appareil restauré');
                },
            },
        });
    }

    async function renameBuilding() {
        if (currentView !== 'building' || !currentBuilding) return;
        const oldName = currentBuilding;
        const value = await ask({
            title: 'Renommer le bâtiment',
            message: 'Nouveau nom :',
            input: oldName,
            ok: 'Renommer',
        });
        if (value === null || value === false) return;
        const newName = matchExisting(String(value).trim(), getUniqueBuildings().filter(b => b !== oldName));
        if (!newName || newName === oldName) return;
        const devices = allDevices.filter(d => d.building === oldName);
        for (const d of devices) {
            await saveDevice({ ...d, building: newName });
        }
        currentBuilding = newName;
        renderCurrentView();
        showToast(`✏️ Renommé en « ${newName} »`);
    }

    // ========= Segmented controls =========
    function setSegmented(id, value) {
        $(id).querySelectorAll('button').forEach(b => {
            const on = b.dataset.value === value;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function getSegmented(id) {
        const active = $(id).querySelector('button.active');
        return active ? active.dataset.value : null;
    }

    function bindSegmented(id, onChange) {
        $(id).querySelectorAll('button').forEach(b => {
            b.addEventListener('click', () => {
                setSegmented(id, b.dataset.value);
                onChange(b.dataset.value);
            });
        });
    }

    // ========= Settings =========
    function openSettings() {
        const grid = $('theme-grid');
        grid.innerHTML = '';
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        THEMES.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theme-btn' + (t.id === currentTheme ? ' active' : '');
            btn.innerHTML = `<span class="theme-icon">${t.icon}</span><span class="theme-name">${t.name}</span>`;
            btn.addEventListener('click', () => {
                applyTheme(t.id);
                grid.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            grid.appendChild(btn);
        });
        openOverlay('settings');
    }

    function updateThemeColor() {
        const color = getComputedStyle(document.documentElement).getPropertyValue('--header-bg').trim();
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta && color) meta.setAttribute('content', color);
    }

    function applyTheme(themeId) {
        document.documentElement.setAttribute('data-theme', themeId);
        updateThemeColor();
        dbPut('settings', { key: 'theme', value: themeId }); // réglage local, non synchronisé
    }

    // ========= Data Operations =========
    // Seuls endroits qui écrivent dans le store « devices » :
    // saveDevice, deleteDevice et replaceAllDevices (import).
    async function loadDevices() {
        allDevices = await dbGetAll('devices');
    }

    function signalerModification() {
        if (window.SyncMaison && typeof window.SyncMaison.modifie === 'function') {
            try { SyncMaison.modifie(); } catch (err) { console.warn('[Énergie Pile] SyncMaison.modifie :', err); }
        }
    }

    async function saveDevice(deviceData) {
        await dbPut('devices', deviceData);
        signalerModification();
        await loadDevices();
    }

    async function deleteDevice(id) {
        await dbDelete('devices', id);
        signalerModification();
        await loadDevices();
    }

    function replaceAllDevices(devices) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['devices'], 'readwrite');
            const store = tx.objectStore('devices');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('Import annulé'));
            try {
                store.clear();
                devices.forEach(device => store.put(device));
            } catch (err) {
                try { tx.abort(); } catch (e) { /* déjà terminée */ }
                reject(err);
            }
        });
    }

    // ========= Export / Import (communs fichier + Serveur maison) =========

    // Contenu stable : pas de date, appareils triés par id.
    async function exporter() {
        const devices = await dbGetAll('devices');
        devices.sort((a, b) => {
            const x = String(a.id), y = String(b.id);
            return x < y ? -1 : (x > y ? 1 : 0);
        });
        return { app: 'energie-pile', version: 1, devices };
    }

    // Vérifie le contenu d'une sauvegarde et renvoie la liste des appareils.
    function lireSauvegarde(texte) {
        const data = typeof texte === 'string' ? JSON.parse(texte) : texte;
        if (!data || data.app !== 'energie-pile' || !Array.isArray(data.devices)) {
            throw new Error('Fichier invalide');
        }
        return data.devices;
    }

    // Remplace TOUTES les données locales, sans confirmation (déjà demandée).
    async function importer(texte) {
        const devices = lireSauvegarde(texte);
        await replaceAllDevices(devices);
        await loadDevices();
        renderCurrentView();
    }

    async function exportData() {
        try {
            const base = await exporter();
            const data = {
                app: base.app,
                version: base.version,
                date: new Date().toISOString(),
                devices: base.devices
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `energie-pile-backup-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showToast('📤 Export réussi !');
        } catch (err) {
            console.error(err);
            showToast('❌ Erreur lors de l\'export');
        }
    }

    async function importData(file) {
        let texte, devices;
        try {
            texte = await file.text();
        } catch (err) {
            showToast('❌ Impossible de lire le fichier');
            return;
        }
        try {
            devices = lireSauvegarde(texte);
        } catch (err) {
            showToast(err instanceof SyntaxError ? '❌ Fichier corrompu ou invalide' : '❌ Fichier invalide');
            return;
        }

        const ok = await ask({
            title: 'Importer ce fichier ?',
            message: `⚠️ ${plural(devices.length, 'appareil')} trouvé${devices.length > 1 ? 's' : ''}.\nCela remplacera TOUTES vos données actuelles.`,
            ok: 'Importer',
            danger: true,
        });
        if (!ok) return;

        try {
            await importer(texte);
            signalerModification();
            showToast('📥 Import réussi !');
        } catch (err) {
            console.error(err);
            showToast('❌ Erreur lors de l\'import');
        }
    }

    // ========= Serveur maison =========
    function brancherServeurMaison() {
        if (!window.SyncMaison) {
            console.warn('[Énergie Pile] sync-maison.js non chargé : synchro désactivée.');
            return;
        }
        try {
            SyncMaison.configurer({ app: 'energie_pile', nom: 'Énergie Pile', mode: 'simple', exporter, importer });
        } catch (err) {
            console.error('[Énergie Pile] Serveur maison :', err);
        }
    }

    function ouvrirServeurMaison() {
        if (!window.SyncMaison) {
            showToast('⚠️ Module Serveur maison introuvable');
            return;
        }
        // Le panneau du module s'affiche par-dessus tout : les Paramètres restent dessous.
        SyncMaison.ouvrirReglages();
    }

    async function demanderStockagePersistant() {
        try {
            if (navigator.storage && navigator.storage.persist) {
                await navigator.storage.persist();
            }
        } catch (err) { /* non supporté : sans gravité */ }
    }

    // ========= Event Bindings =========
    function initEvents() {
        btnBack.addEventListener('click', () => {
            if (layers.includes('building')) history.back();
            else renderHome();
        });

        btnAdd.addEventListener('click', () => {
            openDeviceForm(null, currentView === 'building' ? currentBuilding : '');
        });

        btnSettings.addEventListener('click', openSettings);
        btnRename.addEventListener('click', renameBuilding);

        // Fermeture des fenêtres : bouton ✕ ou clic sur le fond
        Object.entries(OVERLAYS).forEach(([name, el]) => {
            el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeOverlay(name)));
            el.addEventListener('click', e => {
                if (e.target !== el) return;
                if (name === 'dialog') finishDialog(null);
                else closeOverlay(name);
            });
        });

        // Boîte de dialogue
        $('dialog-ok').addEventListener('click', () => {
            const input = $('dialog-input');
            finishDialog(input.classList.contains('hidden') ? true : input.value);
        });
        $('dialog-cancel').addEventListener('click', () => finishDialog(null));
        $('dialog-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); $('dialog-ok').click(); }
        });

        // Fiche appareil
        $('btn-confirm-change').addEventListener('click', confirmChange);
        $('btn-edit-device').addEventListener('click', () => {
            const device = allDevices.find(d => d.id === sheetDeviceId);
            if (device) openDeviceForm(device, null, true);
        });
        $('btn-delete-from-sheet').addEventListener('click', () => {
            confirmDeleteDevice(allDevices.find(d => d.id === sheetDeviceId));
        });
        bindSegmented('change-when', v => {
            changeWhen = v;
            $('change-date').classList.toggle('hidden', v !== 'other');
            if (v === 'other') $('change-date').focus();
        });
        bindSegmented('change-kind', v => { changeKind = v; });

        // Formulaire
        $('device-form').addEventListener('submit', submitDeviceForm);
        $('btn-delete-device').addEventListener('click', () => {
            confirmDeleteDevice(allDevices.find(d => d.id === $('device-id').value));
        });
        $('count-minus').addEventListener('click', () => {
            const inp = $('device-battery-count');
            inp.value = Math.max(1, (parseInt(inp.value, 10) || 1) - 1);
        });
        $('count-plus').addEventListener('click', () => {
            const inp = $('device-battery-count');
            inp.value = Math.min(20, (parseInt(inp.value, 10) || 0) + 1);
        });
        $('device-battery-count').addEventListener('change', () => {
            const inp = $('device-battery-count');
            inp.value = Math.min(20, Math.max(1, parseInt(inp.value, 10) || 1));
        });
        $('device-name').addEventListener('input', () => clearError('device-name', 'err-name'));
        $('device-building').addEventListener('input', () => {
            clearError('device-building', 'err-building');
            renderBuildingChips();
            renderLocationChips();
        });
        $('device-location').addEventListener('input', () => {
            clearError('device-location', 'err-location');
            renderLocationChips();
        });
        $('device-battery-type').addEventListener('change', () => {
            const isOther = $('device-battery-type').value === '__autre';
            $('device-battery-custom').classList.toggle('hidden', !isOther);
            if (isOther) $('device-battery-custom').focus();
            clearError('device-battery-type', 'err-type');
            renderTypeChips();
        });
        $('device-battery-custom').addEventListener('input', () => {
            clearError('device-battery-custom', 'err-type');
            renderTypeChips();
        });
        bindSegmented('device-kind', () => {});
        bindSegmented('first-change', v => {
            firstChange = v;
            $('first-change-date').classList.toggle('hidden', v !== 'other');
        });

        // Sauvegarde
        $('btnExport').addEventListener('click', exportData);
        $('btnImport').addEventListener('click', () => $('fileImport').click());
        $('fileImport').addEventListener('change', e => {
            if (e.target.files[0]) {
                importData(e.target.files[0]);
                e.target.value = '';
            }
        });
        $('btnServeurMaison').addEventListener('click', ouvrirServeurMaison);

        // Échap : ferme la fenêtre du dessus
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            const top = topLayer();
            if (top === 'dialog') finishDialog(null);
            else if (top && top !== 'building') closeOverlay(top);
            else if (top === 'building') history.back();
        });
    }

    // ========= Init =========
    async function init() {
        demanderStockagePersistant();
        initEvents();
        await openDB();

        const themeSetting = await dbGet('settings', 'theme');
        if (themeSetting && themeSetting.value) {
            document.documentElement.setAttribute('data-theme', themeSetting.value);
        }
        updateThemeColor();

        await loadDevices();
        renderHome();

        // La synchro se lance d'elle-même ; on n'attend jamais après elle.
        brancherServeurMaison();
    }

    init().catch(err => {
        console.error('Erreur initialisation Énergie Pile :', err);
        content.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><p>Erreur de chargement. Vérifiez que votre navigateur supporte IndexedDB.</p></div>`;
    });

})();

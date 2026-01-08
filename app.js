// ===== PWA SERVICE WORKER =====
let deferredPrompt = null;
let newWorker = null;

// Enregistrement du Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('Service Worker enregistré:', registration.scope);
            
            // Vérifier les mises à jour
            registration.addEventListener('updatefound', () => {
                newWorker = registration.installing;
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // Nouvelle version disponible
                        showUpdateToast();
                    }
                });
            });
        } catch (error) {
            console.error('Erreur Service Worker:', error);
        }
    });
    
    // Recharger la page quand le nouveau SW prend le contrôle
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });
}

// Gestion de l'installation PWA
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Afficher le prompt d'installation après un délai
    setTimeout(() => {
        showInstallPrompt();
    }, 30000); // 30 secondes après le chargement
});

window.addEventListener('appinstalled', () => {
    console.log('Application installée');
    deferredPrompt = null;
    hideInstallPrompt();
});

// Détection hors ligne
window.addEventListener('online', () => {
    hideOfflineIndicator();
});

window.addEventListener('offline', () => {
    showOfflineIndicator();
});

// ===== PWA UI FUNCTIONS =====
function showUpdateToast() {
    const toast = document.getElementById('update-toast');
    if (toast) {
        toast.classList.add('show');
    }
}

function updateApp() {
    if (newWorker) {
        newWorker.postMessage({ type: 'SKIP_WAITING' });
    }
    const toast = document.getElementById('update-toast');
    if (toast) {
        toast.classList.remove('show');
    }
}

function dismissUpdate() {
    const toast = document.getElementById('update-toast');
    if (toast) {
        toast.classList.remove('show');
    }
}

function showInstallPrompt() {
    if (!deferredPrompt) return;
    
    // Créer le prompt s'il n'existe pas
    let prompt = document.getElementById('install-prompt');
    if (!prompt) {
        prompt = document.createElement('div');
        prompt.id = 'install-prompt';
        prompt.className = 'install-prompt';
        prompt.innerHTML = `
            <h3>🔋 Installer Énergie Pile</h3>
            <p>Installez l'application pour un accès rapide et une utilisation hors ligne !</p>
            <div class="install-prompt-buttons">
                <button class="btn-later" onclick="hideInstallPrompt()">Plus tard</button>
                <button class="btn-install" onclick="installApp()">Installer</button>
            </div>
        `;
        document.body.appendChild(prompt);
    }
    
    setTimeout(() => {
        prompt.classList.add('show');
    }, 100);
}

function hideInstallPrompt() {
    const prompt = document.getElementById('install-prompt');
    if (prompt) {
        prompt.classList.remove('show');
    }
}

async function installApp() {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log('Installation:', outcome);
    deferredPrompt = null;
    hideInstallPrompt();
}

function showOfflineIndicator() {
    let indicator = document.getElementById('offline-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'offline-indicator';
        indicator.className = 'offline-indicator';
        indicator.textContent = '📡 Vous êtes hors ligne';
        document.body.prepend(indicator);
    }
    
    setTimeout(() => {
        indicator.classList.add('show');
    }, 100);
}

function hideOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.classList.remove('show');
    }
}

// Vérifier l'état de connexion au démarrage
if (!navigator.onLine) {
    showOfflineIndicator();
}

// ===== DATABASE =====
let db;
const DB_NAME = 'EnergiePileDB';
const DB_VERSION = 2;

// Ouvrir/Créer la base de données IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            
            // Store pour les appareils
            if (!database.objectStoreNames.contains('devices')) {
                const deviceStore = database.createObjectStore('devices', { keyPath: 'id', autoIncrement: true });
                deviceStore.createIndex('name', 'name', { unique: false });
            }
            
            // Store pour les changements de piles
            if (!database.objectStoreNames.contains('changes')) {
                const changeStore = database.createObjectStore('changes', { keyPath: 'id', autoIncrement: true });
                changeStore.createIndex('deviceId', 'deviceId', { unique: false });
                changeStore.createIndex('date', 'date', { unique: false });
            }
            
            // Store pour les paramètres
            if (!database.objectStoreNames.contains('settings')) {
                database.createObjectStore('settings', { keyPath: 'key' });
            }
        };
    });
}

// ===== CRUD OPERATIONS =====

// Devices
async function getAllDevices() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['devices'], 'readonly');
        const store = transaction.objectStore('devices');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getDevice(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['devices'], 'readonly');
        const store = transaction.objectStore('devices');
        const request = store.get(id);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function addDevice(device) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['devices'], 'readwrite');
        const store = transaction.objectStore('devices');
        const request = store.add(device);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function updateDevice(device) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['devices'], 'readwrite');
        const store = transaction.objectStore('devices');
        const request = store.put(device);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteDeviceById(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['devices', 'changes'], 'readwrite');
        const deviceStore = transaction.objectStore('devices');
        const changeStore = transaction.objectStore('changes');
        
        // Supprimer l'appareil
        deviceStore.delete(id);
        
        // Supprimer tous les changements associés
        const index = changeStore.index('deviceId');
        const request = index.openCursor(IDBKeyRange.only(id));
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                changeStore.delete(cursor.primaryKey);
                cursor.continue();
            }
        };
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
    });
}

// Changes
async function getChangesForDevice(deviceId) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['changes'], 'readonly');
        const store = transaction.objectStore('changes');
        const index = store.index('deviceId');
        const request = index.getAll(deviceId);
        
        request.onsuccess = () => {
            const changes = request.result.sort((a, b) => new Date(b.date) - new Date(a.date));
            resolve(changes);
        };
        request.onerror = () => reject(request.error);
    });
}

async function getAllChanges() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['changes'], 'readonly');
        const store = transaction.objectStore('changes');
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function addChange(change) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['changes'], 'readwrite');
        const store = transaction.objectStore('changes');
        const request = store.add(change);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function updateChange(change) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['changes'], 'readwrite');
        const store = transaction.objectStore('changes');
        const request = store.put(change);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteChangeById(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['changes'], 'readwrite');
        const store = transaction.objectStore('changes');
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Settings
async function getSetting(key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result?.value);
        request.onerror = () => reject(request.error);
    });
}

async function setSetting(key, value) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        const request = store.put({ key, value });
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ===== STATE =====
let currentDeviceId = null;
let editingDeviceId = null;
let editingChangeId = null;
let selectedBatteries = [];

// ===== NAVIGATION =====
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    
    if (pageId === 'devices-page') {
        loadDevicesList();
    }
}

// ===== DEVICES LIST =====
async function loadDevicesList() {
    const devices = await getAllDevices();
    const changes = await getAllChanges();
    
    // Calculer les statistiques
    const totalDevices = devices.length;
    const totalBatteriesInUse = devices.reduce((sum, d) => sum + d.batteryCount, 0);
    const totalDisposable = changes
        .filter(c => !c.rechargeable)
        .reduce((sum, c) => sum + c.count, 0);
    
    document.getElementById('total-devices').textContent = totalDevices;
    document.getElementById('total-batteries-use').textContent = totalBatteriesInUse;
    document.getElementById('total-disposable').textContent = totalDisposable;
    
    // Afficher la liste
    const listContainer = document.getElementById('devices-list');
    
    if (devices.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📱</div>
                <p>Aucun appareil enregistré</p>
                <p style="font-size: 0.9rem; margin-top: 10px;">Appuyez sur + pour ajouter votre premier appareil</p>
            </div>
        `;
        return;
    }
    
    listContainer.innerHTML = devices.map(device => `
        <div class="device-item" onclick="openDeviceDetail(${device.id})">
            <div class="device-info">
                <div class="device-name">${escapeHtml(device.name)}</div>
                <div class="device-details">${device.batteryCount} × ${device.batteryType}</div>
            </div>
            <button class="device-settings" onclick="event.stopPropagation(); openEditDeviceModal(${device.id})">⚙️</button>
        </div>
    `).join('');
}

// ===== DEVICE DETAIL =====
async function openDeviceDetail(deviceId) {
    currentDeviceId = deviceId;
    const device = await getDevice(deviceId);
    const changes = await getChangesForDevice(deviceId);
    
    document.getElementById('device-detail-title').textContent = device.name;
    
    // Générer les sélecteurs de piles
    generateBatterySelector(device.batteryCount);
    
    // Calculer les statistiques
    updateDeviceStats(changes, device);
    
    // Afficher l'historique
    renderChangesHistory(changes);
    
    showPage('device-detail-page');
}

function generateBatterySelector(count) {
    selectedBatteries = [];
    const container = document.getElementById('battery-selector');
    
    container.innerHTML = Array.from({ length: count }, (_, i) => `
        <div class="battery-head" data-index="${i}" onclick="toggleBattery(${i})">
            <div class="battery-top"></div>
            <div class="battery-body">${i + 1}</div>
        </div>
    `).join('');
}

function toggleBattery(index) {
    const battery = document.querySelector(`.battery-head[data-index="${index}"]`);
    
    if (selectedBatteries.includes(index)) {
        selectedBatteries = selectedBatteries.filter(i => i !== index);
        battery.classList.remove('selected');
    } else {
        selectedBatteries.push(index);
        battery.classList.add('selected');
    }
}

function selectAllBatteries() {
    const batteries = document.querySelectorAll('.battery-head');
    selectedBatteries = [];
    
    batteries.forEach((battery, index) => {
        battery.classList.add('selected');
        selectedBatteries.push(index);
    });
}

function updateDeviceStats(changes, device) {
    if (changes.length === 0) {
        document.getElementById('last-change').textContent = '--/--/----';
        document.getElementById('avg-duration').textContent = '-- jours';
        document.getElementById('next-change').textContent = '--/--/----';
        document.getElementById('total-consumed').textContent = '0';
        return;
    }
    
    // Dernier changement
    const lastChange = changes[0];
    document.getElementById('last-change').textContent = formatDate(lastChange.date);
    
    // Total consommé
    const totalConsumed = changes.reduce((sum, c) => sum + c.count, 0);
    document.getElementById('total-consumed').textContent = totalConsumed;
    
    // Durée moyenne
    if (changes.length >= 2) {
        const durations = [];
        for (let i = 0; i < changes.length - 1; i++) {
            const date1 = new Date(changes[i].date);
            const date2 = new Date(changes[i + 1].date);
            const diffDays = Math.floor((date1 - date2) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) durations.push(diffDays);
        }
        
        if (durations.length > 0) {
            const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
            document.getElementById('avg-duration').textContent = `${avgDuration} jours`;
            
            // Prévision prochain changement
            const lastDate = new Date(lastChange.date);
            lastDate.setDate(lastDate.getDate() + avgDuration);
            document.getElementById('next-change').textContent = formatDate(lastDate.toISOString().split('T')[0]);
        } else {
            document.getElementById('avg-duration').textContent = '-- jours';
            document.getElementById('next-change').textContent = '--/--/----';
        }
    } else {
        document.getElementById('avg-duration').textContent = '-- jours';
        document.getElementById('next-change').textContent = '--/--/----';
    }
}

function renderChangesHistory(changes) {
    const container = document.getElementById('changes-list');
    
    if (changes.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 30px;">
                <p>Aucun changement enregistré</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = changes.map(change => `
        <div class="change-item">
            <div class="change-info">
                <div class="change-date">${formatDate(change.date)}</div>
                <div class="change-details">
                    <span>${change.count} pile${change.count > 1 ? 's' : ''}</span>
                    <span class="badge ${change.rechargeable ? 'badge-rechargeable' : 'badge-disposable'}">
                        ${change.rechargeable ? '🔄 Rechargeable' : '🗑️ Jetable'}
                    </span>
                </div>
            </div>
            <button class="change-settings" onclick="openEditChangeModal(${change.id})">⚙️</button>
        </div>
    `).join('');
}

// ===== ADD BATTERY CHANGE =====
async function addBatteryChange() {
    if (selectedBatteries.length === 0) {
        alert('Veuillez sélectionner au moins une pile');
        return;
    }
    
    const rechargeable = document.getElementById('rechargeable-toggle').checked;
    
    const change = {
        deviceId: currentDeviceId,
        date: new Date().toISOString().split('T')[0],
        count: selectedBatteries.length,
        rechargeable: rechargeable
    };
    
    await addChange(change);
    
    // Rafraîchir
    const device = await getDevice(currentDeviceId);
    const changes = await getChangesForDevice(currentDeviceId);
    
    generateBatterySelector(device.batteryCount);
    document.getElementById('rechargeable-toggle').checked = false;
    updateDeviceStats(changes, device);
    renderChangesHistory(changes);
}

// ===== MODALS =====

// Device Modal
function openAddDeviceModal() {
    editingDeviceId = null;
    document.getElementById('modal-title').textContent = 'Ajouter un appareil';
    document.getElementById('device-name').value = '';
    document.getElementById('device-batteries').value = 2;
    document.getElementById('device-battery-type').value = 'AA(LR6)';
    document.getElementById('delete-device-btn').style.display = 'none';
    document.getElementById('device-modal').classList.add('active');
}

async function openEditDeviceModal(deviceId) {
    editingDeviceId = deviceId;
    const device = await getDevice(deviceId);
    
    document.getElementById('modal-title').textContent = 'Modifier l\'appareil';
    document.getElementById('device-name').value = device.name;
    document.getElementById('device-batteries').value = device.batteryCount;
    document.getElementById('device-battery-type').value = device.batteryType;
    document.getElementById('delete-device-btn').style.display = 'block';
    document.getElementById('device-modal').classList.add('active');
}

function closeDeviceModal() {
    document.getElementById('device-modal').classList.remove('active');
    editingDeviceId = null;
}

async function saveDevice() {
    const name = document.getElementById('device-name').value.trim();
    const batteryCount = parseInt(document.getElementById('device-batteries').value);
    const batteryType = document.getElementById('device-battery-type').value;
    
    if (!name) {
        alert('Veuillez entrer un nom pour l\'appareil');
        return;
    }
    
    if (batteryCount < 1 || batteryCount > 20) {
        alert('Le nombre de piles doit être entre 1 et 20');
        return;
    }
    
    const device = {
        name,
        batteryCount,
        batteryType,
        createdAt: new Date().toISOString()
    };
    
    if (editingDeviceId) {
        device.id = editingDeviceId;
        await updateDevice(device);
    } else {
        await addDevice(device);
    }
    
    closeDeviceModal();
    loadDevicesList();
}

async function deleteDevice() {
    if (!editingDeviceId) return;
    
    if (confirm('Êtes-vous sûr de vouloir supprimer cet appareil et tout son historique ?')) {
        await deleteDeviceById(editingDeviceId);
        closeDeviceModal();
        loadDevicesList();
    }
}

// Change Modal
async function openEditChangeModal(changeId) {
    editingChangeId = changeId;
    
    const changes = await getChangesForDevice(currentDeviceId);
    const change = changes.find(c => c.id === changeId);
    
    if (!change) return;
    
    document.getElementById('change-date').value = change.date;
    document.getElementById('change-count').value = change.count;
    document.getElementById('change-rechargeable').checked = change.rechargeable;
    
    const device = await getDevice(currentDeviceId);
    document.getElementById('change-count').max = device.batteryCount;
    
    document.getElementById('change-modal').classList.add('active');
}

function closeChangeModal() {
    document.getElementById('change-modal').classList.remove('active');
    editingChangeId = null;
}

async function saveChange() {
    const date = document.getElementById('change-date').value;
    const count = parseInt(document.getElementById('change-count').value);
    const rechargeable = document.getElementById('change-rechargeable').checked;
    
    if (!date) {
        alert('Veuillez sélectionner une date');
        return;
    }
    
    const change = {
        id: editingChangeId,
        deviceId: currentDeviceId,
        date,
        count,
        rechargeable
    };
    
    await updateChange(change);
    closeChangeModal();
    
    // Rafraîchir
    const device = await getDevice(currentDeviceId);
    const changes = await getChangesForDevice(currentDeviceId);
    updateDeviceStats(changes, device);
    renderChangesHistory(changes);
}

async function deleteChange() {
    if (!editingChangeId) return;
    
    if (confirm('Êtes-vous sûr de vouloir supprimer ce changement ?')) {
        await deleteChangeById(editingChangeId);
        closeChangeModal();
        
        // Rafraîchir
        const device = await getDevice(currentDeviceId);
        const changes = await getChangesForDevice(currentDeviceId);
        updateDeviceStats(changes, device);
        renderChangesHistory(changes);
    }
}

// ===== THEMES =====
async function setTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    await setSetting('theme', themeName);
    
    // Mettre à jour l'UI des boutons de thème
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === themeName);
    });
}

async function loadTheme() {
    const theme = await getSetting('theme') || 'light';
    setTheme(theme);
}

// ===== UTILITIES =====
function formatDate(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        await loadTheme();
        console.log('Application initialisée avec succès');
    } catch (error) {
        console.error('Erreur d\'initialisation:', error);
        alert('Erreur lors de l\'initialisation de l\'application');
    }
});

// Fermer les modals en cliquant à l'extérieur
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

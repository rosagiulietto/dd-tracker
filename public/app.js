// Known landmark titles (add as many as you like to this dictionary).
const TITLES = {
    1: "L'alba dei morti viventi",
    2: "Jack lo squartatore",
    3: "Notti della luna piena",
    10: "Attraverso lo specchio",
    100: "La storia di Dylan Dog",
    101: "La porta dell'inferno",
    200: "Il numero 200",
    300: "Ritratto di famiglia",
    399: "Oggi sposi",
    400: "E ora, l'Apocalisse!",
};

let owned = [];
let totalComics = 500;
let showMissingOnly = false;
let numberToImage = {};

function isPlaceholderFile(file) {
    return /blank|placeholder|missing/i.test(file);
}

async function loadProductsMapping() {
    try {
        // Cache-bust so an updated mapping is picked up immediately.
        const res = await fetch(`images/products_mapping.json?v=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const map = await res.json();

        numberToImage = {};
        for (const [file, num] of Object.entries(map)) {
            const n = Number(num);
            if (!n) continue;

            const current = numberToImage[n];
            // Prefer a real cover over a blank/placeholder image; otherwise keep
            // the first entry (the mapping is ordered newest-first).
            if (!current || (isPlaceholderFile(current) && !isPlaceholderFile(file))) {
                numberToImage[n] = file;
            }
        }
    } catch (e) {
        console.warn('Failed to load product mapping', e);
    }
}

const $ = (id) => document.getElementById(id);

// --- Passkey gate -----------------------------------------------------------

function showPasskeyGate(message = '') {
    const overlay = $('passkeyOverlay');
    const error = $('passkeyError');

    overlay.hidden = false;
    if (message) {
        error.textContent = message;
        error.hidden = false;
    } else {
        error.hidden = true;
    }

    setTimeout(() => $('passkeyInput').focus(), 0);
}

function hidePasskeyGate() {
    $('passkeyOverlay').hidden = true;
    $('passkeyInput').value = '';
}

async function checkAuth() {
    try {
        const res = await fetch('api.php?action=auth', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        return !!(res.ok && data.ok && data.authenticated);
    } catch (e) {
        return false;
    }
}

async function submitPasskey(event) {
    event.preventDefault();

    const input = $('passkeyInput');
    const button = $('passkeySubmit');
    const error = $('passkeyError');
    const passkey = input.value;

    if (!passkey) return;

    button.disabled = true;
    error.hidden = true;

    try {
        const res = await fetch('api.php?action=auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passkey }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.ok !== true) {
            throw new Error(data.error || 'Invalid passkey');
        }

        hidePasskeyGate();
        await startApp();
    } catch (err) {
        error.textContent = 'Passkey non valida. Riprova.';
        error.hidden = false;
        input.select();
    } finally {
        button.disabled = false;
    }
}

// --- API helper -------------------------------------------------------------

async function api(action, payload) {
    const url = 'api.php?action=' + encodeURIComponent(action);
    const options = payload
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }
        : { method: 'GET' };

    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
        showPasskeyGate('Inserisci la passkey per continuare.');
    }

    if (!response.ok || data.ok === false) {
        throw new Error(data.error || ('HTTP ' + response.status));
    }

    return data;
}

function applyState(state) {
    if (!state) return;

    owned = (state.owned || []).map(Number);
    totalComics = Number(state.totalComics) || 500;
    $('maxComicsInput').value = totalComics;
    updateLastUpdateDisplay(state.lastUpdate);
}

// --- Rendering --------------------------------------------------------------

function updateLastUpdateDisplay(iso) {
    const date = iso ? new Date(iso) : null;
    const formatted = date && !isNaN(date)
        ? date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : null;

    $('lastUpdate').textContent = formatted ? `Last update: ${formatted}` : 'Last update: never';
}

function render() {
    const grid = $('grid');
    const searchVal = $('searchInput').value.trim().toLowerCase();
    grid.innerHTML = '';

    for (let i = 1; i <= totalComics; i++) {
        const isOwned = owned.includes(i);
        const title = TITLES[i] || '';

        if (showMissingOnly && isOwned) continue;

        // Filter logic: matches comic number OR title search.
        if (searchVal) {
            const numMatch = i.toString() === searchVal;
            const titleMatch = title.toLowerCase().includes(searchVal);
            if (!numMatch && !titleMatch) continue;
        }

        const div = document.createElement('div');
        div.className = 'box ' + (isOwned ? 'owned' : '');
        if (searchVal && (i.toString() === searchVal || (title && title.toLowerCase().includes(searchVal)))) {
            div.classList.add('highlight');
        }

        div.title = title ? `#${i} - ${title}` : `#${i}`;
        const imgFile = numberToImage[i];
        div.innerHTML = `
          ${imgFile ? `<img class="thumb" src="images/${imgFile}" alt="" loading="lazy">` : ''}
          <span class="num">#${i}</span>
        `;
        div.id = 'comic-' + i;
        div.onclick = () => toggle(i);

        const thumb = div.querySelector('.thumb');
        if (thumb) {
            // A mapping entry can reference an image that isn't present locally;
            // hide the broken thumbnail instead of showing a broken-image icon.
            thumb.onerror = () => thumb.remove();
            thumb.onclick = (e) => {
                e.stopPropagation();
                openLightbox(i);
            };
        }

        grid.appendChild(div);
    }

    $('stats').textContent = `I got ${owned.length} of ${totalComics} comics! (${totalComics - owned.length} missing)`;
}

// --- Actions ----------------------------------------------------------------

async function toggle(num) {
    try {
        const data = await api('toggle', { num });
        applyState(data.state);
        render();
    } catch (error) {
        alert('Could not save: ' + error.message);
    }
}

function openLightbox(num) {
    const imgFile = numberToImage[num];
    if (!imgFile) return;

    const overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.innerHTML = `
        <button class="close-btn" aria-label="Close">&times;</button>
        <img src="images/${imgFile}" alt="Cover #${num}">
    `;
    overlay.onclick = (e) => {
        if (e.target === overlay || e.target.closest('.close-btn')) {
            overlay.remove();
        }
    };
    const fullImg = overlay.querySelector('img');
    if (fullImg) {
        fullImg.onerror = () => overlay.remove();
    }
    document.body.appendChild(overlay);
}

async function updateMaxComics(value) {
    const num = parseInt(value, 10);
    if (!num || num < 1) return;

    try {
        const data = await api('max', { totalComics: num });
        applyState(data.state);
        render();
    } catch (error) {
        alert('Could not save: ' + error.message);
    }
}

function toggleFilter() {
    showMissingOnly = !showMissingOnly;
    const btn = $('filterBtn');
    btn.textContent = showMissingOnly ? 'Show All Comics' : 'Show Missing Only';
    btn.classList.toggle('active', showMissingOnly);
    render();
}

function exportData() {
    const backupObj = { owned, totalComics };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupObj, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'dylan_dog_backup.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            let numbers = [];
            let total = totalComics;

            if (Array.isArray(imported)) {
                numbers = imported;
            } else if (imported.owned && Array.isArray(imported.owned)) {
                numbers = imported.owned;
                if (imported.totalComics) total = imported.totalComics;
            } else {
                throw new Error('Unrecognized format');
            }

            // Support both plain numbers and { numero: ... } objects.
            numbers = numbers
                .map((item) => (item && typeof item === 'object' ? item.numero : item))
                .map(Number)
                .filter((n) => n > 0);

            const data = await api('import', { owned: numbers, totalComics: total });
            applyState(data.state);
            render();
            alert(`Successfully restored ${owned.length} comics!`);
        } catch (error) {
            alert('Error reading backup file.');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

// --- Startup ----------------------------------------------------------------

async function startApp() {
    try {
        await loadProductsMapping();
        const data = await api('state');
        applyState(data.state);
        render();
    } catch (error) {
        $('stats').textContent = 'Error loading data: ' + error.message;
    }
}

async function boot() {
    $('passkeyForm').addEventListener('submit', submitPasskey);

    if (await checkAuth()) {
        await startApp();
    } else {
        showPasskeyGate();
    }
}

boot();

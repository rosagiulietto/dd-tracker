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

const $ = (id) => document.getElementById(id);

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
        div.innerHTML = `
          <span class="num">#${i}</span>
          ${title ? `<span class="title">${title}</span>` : ''}
        `;
        div.id = 'comic-' + i;
        div.onclick = () => toggle(i);
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

async function loadState() {
    try {
        const data = await api('state');
        applyState(data.state);
        render();
    } catch (error) {
        $('stats').textContent = 'Error loading data: ' + error.message;
    }
}

loadState();

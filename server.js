const API_URL = 'https://sector-7.onrender.com/api'; 

function showToast(message, isError = false) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}

async function fetchShipStatus() {
    try {
        const res = await fetch(`${API_URL}/ship-status`);
        if (!res.ok) throw new Error("Connection failed.");
        const ship = await res.json();

        document.getElementById('day-display').innerText = ship.current_day;
        updateBar('hull', ship.hull);
        updateBar('ls', ship.life_support);
        updateBar('nav', ship.nav);

        if (ship.is_destroyed) {
            document.getElementById('death-warning').classList.remove('hidden');
        }
    } catch (error) {
        showToast("Error connecting to server.", true);
    }
}

function updateBar(id, value) {
    document.getElementById(`${id}-text`).innerText = `${value}%`;
    const bar = document.getElementById(`${id}-bar`);
    bar.style.width = `${value}%`;
    
    if (value <= 30) {
        bar.classList.add('critical');
    } else {
        bar.classList.remove('critical');
    }
}

async function submitAction() {
    const payload = {
        player_id: document.getElementById('player-id').value,
        action_type: document.getElementById('action-type').value,
        target_system: document.getElementById('target-system').value,
        eu_invested: parseInt(document.getElementById('eu-amount').value)
    };

    try {
        const res = await fetch(`${API_URL}/submit-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();
        
        if (!res.ok) throw new Error(result.error || "Submission failed");
        showToast(result.message);
    } catch (error) {
        showToast(error.message, true);
    }
}

fetchShipStatus();
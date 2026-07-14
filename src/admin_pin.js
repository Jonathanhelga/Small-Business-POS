import { updateAdminPinHash, getCachedUserProfile, setCachedUserProfile } from './firebase';
import { toggleModal } from './modal-handler';
import { showToast } from "./toast";
let currentUser = null;
let isChangingPin = false;
let resolvePinConfirm = null;

const PIN_INPUT_IDS = ['ap-old-input', 'ap-new-input', 'ap-confirm-input', 'ap-gate-input'];
const rawPinValues = new Map();
const maskTimers = new Map();
const REVEAL_MS = 250;

async function hashPin(pin) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isValidPin(pin) { return /^\d{4}$/.test(pin); }

function getRawPin(inputId) { return rawPinValues.get(inputId) || ''; }

function renderMaskedValue(inputId, revealLast) {
    const raw = getRawPin(inputId);
    const masked = '•'.repeat(revealLast ? raw.length - 1 : raw.length);
    document.getElementById(inputId).value = revealLast ? masked + raw.slice(-1) : masked;
}

function handlePinInputTyped(inputId) {
    const input = document.getElementById(inputId);
    const prevRaw = getRawPin(inputId);
    const displayedLength = input.value.length;

    let nextRaw;
    if (displayedLength > prevRaw.length) { 
        const addedDigits = input.value.slice(-(displayedLength - prevRaw.length)).replace(/\D/g, '');
        nextRaw = (prevRaw + addedDigits).slice(0, 4);
    } 
    else { nextRaw = prevRaw.slice(0, displayedLength); }

    rawPinValues.set(inputId, nextRaw);
    renderMaskedValue(inputId, nextRaw.length > 0);

    clearTimeout(maskTimers.get(inputId));
    if (nextRaw.length > 0) { maskTimers.set(inputId, setTimeout(() => renderMaskedValue(inputId, false), REVEAL_MS)); }
}

function resetPinInput(inputId) {
    clearTimeout(maskTimers.get(inputId));
    rawPinValues.set(inputId, '');
    document.getElementById(inputId).value = '';
}

function setApFeedback(elId, msg) { document.getElementById(elId).textContent = msg; }

function showApPanel(panelId) {
    ['ap-intro', 'ap-old-pin', 'ap-new-pin'].forEach(id => {
        document.getElementById(id).classList.toggle('is-hidden', id !== panelId);
    });
}

function updateFeaturesButtonLabel() {
    const hasPin = Boolean(getCachedUserProfile()?.adminPinHash);
    document.getElementById('admin-pin-open').textContent = hasPin ? 'Change Admin PIN' : 'Set up Admin PIN';
}

function openSetupFlow() {
    isChangingPin = Boolean(getCachedUserProfile()?.adminPinHash);
    resetPinInput('ap-old-input');
    resetPinInput('ap-new-input');
    resetPinInput('ap-confirm-input');
    setApFeedback('ap-old-feedback', '');
    setApFeedback('ap-feedback', '');
    document.getElementById('ap-title').textContent = isChangingPin ? 'Change Admin PIN' : 'Set up Admin PIN';
    showApPanel(isChangingPin ? 'ap-old-pin' : 'ap-intro');
    toggleModal('admin-pin-modal');
}

async function handleVerifyOldPin() {
    const input = getRawPin('ap-old-input');
    if (!isValidPin(input)) {
        setApFeedback('ap-old-feedback', 'Enter a 4-digit PIN.');
        return;
    }
    const hash = await hashPin(input);
    if (hash !== getCachedUserProfile()?.adminPinHash) {
        setApFeedback('ap-old-feedback', 'Incorrect Admin PIN.');
        return;
    }
    showApPanel('ap-new-pin');
}

async function handleSaveNewPin() {
    const newPin = getRawPin('ap-new-input');
    const confirmPin = getRawPin('ap-confirm-input');

    if (!isValidPin(newPin)) {
        setApFeedback('ap-feedback', 'PIN must be exactly 4 digits.');
        return;
    }
    if (newPin !== confirmPin) {
        setApFeedback('ap-feedback', 'PINs do not match.');
        return;
    }

    const btn = document.getElementById('ap-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const hashHex = await hashPin(newPin);
        await updateAdminPinHash(currentUser.uid, hashHex);
        setCachedUserProfile({ ...getCachedUserProfile(), adminPinHash: hashHex });
        updateFeaturesButtonLabel();
        toggleModal('admin-pin-modal');
        showToast('PIN successfully created :)');
    } catch (err) {
        console.error('Failed to save Admin PIN:', err);
        setApFeedback('ap-feedback', 'Failed to save PIN. Please try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save PIN';
    }
}

function openPinGate() {
    resetPinInput('ap-gate-input');
    setApFeedback('ap-gate-feedback', '');
    toggleModal('admin-pin-gate-modal');
}

async function handlePinGateSubmit() {
    const input = getRawPin('ap-gate-input');
    if (!isValidPin(input)) {
        setApFeedback('ap-gate-feedback', 'Enter a 4-digit PIN.');
        return;
    }
    const hash = await hashPin(input);
    if (hash !== getCachedUserProfile()?.adminPinHash) {
        setApFeedback('ap-gate-feedback', 'Incorrect Admin PIN.');
        return;
    }
    toggleModal('admin-pin-gate-modal');
    if (resolvePinConfirm) resolvePinConfirm(true);
    resolvePinConfirm = null;
}

function handlePinGateCancel() {
    toggleModal('admin-pin-gate-modal');
    if (resolvePinConfirm) resolvePinConfirm(false);
    resolvePinConfirm = null;
}

// Exported gate: call before any inventory item / order deletion.
// Returns true only when the user has entered the correct Admin PIN.
// If no PIN is set up yet, routes the user into setup instead and returns false.
export function requireAdminPin() {
    if (!getCachedUserProfile()?.adminPinHash) {
        openSetupFlow();
        return Promise.resolve(false);
    }
    openPinGate();
    return new Promise(resolve => {
        let settled = false;
        const settle = (val) => {
            if (!settled) {
                settled = true;
                observer.disconnect();
                resolve(val);
            }
        };

        const gateModal = document.getElementById('admin-pin-gate-modal');
        const observer = new MutationObserver(() => {
            if (gateModal.classList.contains('is-hidden')) {
                settle(false);
            }
        });
        observer.observe(gateModal, { attributes: true, attributeFilter: ['class'] });

        resolvePinConfirm = settle;
    });
}

export function initAdminPin(user) {
    currentUser = user;
    updateFeaturesButtonLabel();

    PIN_INPUT_IDS.forEach(id => {
        document.getElementById(id).addEventListener('input', () => handlePinInputTyped(id));
    });

    document.getElementById('admin-pin-open').addEventListener('click', () => {
        toggleModal('features-modal');
        openSetupFlow();
    });

    document.getElementById('ap-intro-continue').addEventListener('click', () => showApPanel('ap-new-pin'));
    document.getElementById('ap-save-btn').addEventListener('click', handleSaveNewPin);
    document.getElementById('ap-old-continue').addEventListener('click', handleVerifyOldPin);

    document.getElementById('ap-gate-confirm-btn').addEventListener('click', handlePinGateSubmit);
    document.getElementById('ap-gate-cancel-btn').addEventListener('click', handlePinGateCancel);
}

import { db, fetchUserProfile, getCachedUserProfile, setCachedUserProfile, LogOutUser } from './firebase';
import { setDoc, doc } from 'firebase/firestore';
import { toggleModal } from './modal-handler';
import { setTaxRate, clearOrderTable } from './order-add_item';
import { refreshInsights } from './sales_insight';
import { showToast } from './toast';
import { showConfirm } from './confirm_modal';
export function initProfile(user) {
    applyPrintPaperSizeFromProfile(user);

    document.getElementById('js-profile-open').addEventListener('click', () => {
        loadProfileData(user);
        toggleModal('profile-modal');
    });
    const form = document.getElementById('js-profile-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveProfileData(user);
        });
    }

    logOutAccount();
}

function logOutAccount(){
    const logoutBtn = document.getElementById('js-profile-logout');
    if(!logoutBtn) return;
    logoutBtn.addEventListener('click', async () => {
        const ok = await showConfirm({
        title: 'Want to log out?',                                                                                                                                   
        message: 'GoodBye:( See you next time',                                                                                              
        confirmText: 'Exit',                                      
        danger: true,     
        });
        if (!ok) return;
        toggleModal('profile-modal');
        try {
            await LogOutUser();
            window.location.reload();
        } catch {
            showToast('Sign Out Error: please try again later:)', 'error');
        }
    });
}

async function loadProfileData(user) {
    // Show email and avatar initial in the modal header
    const email = user.email || '';
    document.getElementById('js-profile-email-display').textContent = email;

    const initial = email.charAt(0).toUpperCase();
    const avatarLarge = document.getElementById('js-profile-avatar-large');
    if (avatarLarge) avatarLarge.textContent = initial;

    // Load stored profile fields from Firestore
    const data = await fetchUserProfile(user.uid);
    if (!data) return;

    document.getElementById('profile-username').value            = data.username            || '';
    document.getElementById('profile-currency').value            = data.currency            || 'IDR';
    document.getElementById('profile-business-name').value       = data.business_name       || '';
    document.getElementById('profile-business-address').value    = data.business_address    || '';
    document.getElementById('profile-business-phone').value      = data.business_phone      || '';
    document.getElementById('profile-business-instagram').value  = data.business_instagram  || '';
    document.getElementById('profile-business-email').value      = data.business_email      || '';
    document.getElementById('profile-tax-rate').value            = data.tax_rate            ?? '';
    document.getElementById('profile-invoice-prefix').value      = data.invoice_prefix      || '';
    document.getElementById('profile-paper-size').value          = data.printer_size        || '80';
    document.getElementById('profile-receipt-footer').value      = data.receipt_footer      || '';

    applyPrintPaperSize(data.printer_size || '80');
}

async function applyPrintPaperSizeFromProfile(user) {
    const data = await fetchUserProfile(user.uid);
    applyPrintPaperSize(data?.printer_size || '80');
}

function applyPrintPaperSize(size) {
    const mm = size === '58' ? '58mm' : '80mm';
    const fontSize = size === '58' ? '8px' : '12px';
    let styleEl = document.getElementById('print-paper-size');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'print-paper-size';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
        @media print {
            @page { size: ${mm} auto; margin: 0; }
            #oh-bill-preview { width: ${mm}; font-size: ${fontSize}; padding: 4mm 3mm; }
        }
    `;
}

async function saveProfileData(user) {
    const uid = user.uid;
    const previousCurrency = (getCachedUserProfile() || {}).currency || 'IDR';
    const newCurrency = document.getElementById('profile-currency').value;
    const currencyChanged = newCurrency !== previousCurrency;

    if (currencyChanged) {
        const ok = await showConfirm({
            title: 'Change currency?',
            message: `Warning: item prices won't be converted to ${newCurrency}. Existing item prices keep their numbers, please update item prices manually in (Manage Items), be careful. Your current order will also be cleared. Thank You`,
            confirmText: 'Change Currency',
            danger: true,
        });
        if (!ok) {
            document.getElementById('profile-currency').value = previousCurrency;
            return;
        }
    }

    const saveBtn = document.getElementById('js-profile-save');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const formData = {
        username:           document.getElementById('profile-username').value.trim(),
        currency:           document.getElementById('profile-currency').value,
        business_name:      document.getElementById('profile-business-name').value.trim(),
        business_address:   document.getElementById('profile-business-address').value.trim(),
        business_phone:     document.getElementById('profile-business-phone').value.trim(),
        business_instagram: document.getElementById('profile-business-instagram').value.trim(),
        business_email:     document.getElementById('profile-business-email').value.trim(),
        tax_rate:           document.getElementById('profile-tax-rate').value,
        invoice_prefix:     document.getElementById('profile-invoice-prefix').value.trim(),
        printer_size:       document.getElementById('profile-paper-size').value,
        receipt_footer:     document.getElementById('profile-receipt-footer').value.trim(),
    };

    try {
        await setDoc(doc(db, 'users', uid), formData, { merge: true });

        // Refresh the in-memory profile cache so the next reader gets
        // the new values without doing another Firestore read.
        // We merge instead of replace so fields the form doesn't edit
        // (created_at, ownerId, etc.) are preserved in the cache.
        const previousProfile = getCachedUserProfile() || {};
        const updatedProfile = { ...previousProfile, ...formData };
        setCachedUserProfile(updatedProfile);

        if (currencyChanged) {
            refreshInsights(user);
            clearOrderTable();
        }

        setTaxRate(formData.tax_rate);
        applyPrintPaperSize(formData.printer_size || '80');
        toggleModal('profile-modal');
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;

    } catch (error) {
        showToast(`Failed to save: ${error.message}`, 'error');
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}
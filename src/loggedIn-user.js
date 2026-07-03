import { db, fetchUserProfile } from "./firebase";
import { initInventoryForm } from './add_item_ui';
import { allItems, loadAllItems, initializeSearch, initSort, initGlobalBarcodeListener } from './search_item';
import { initializeOrderForm, initSubmitOrder, setTaxRate, scanAddItem, restoreOrderFromStorage } from "./order-add_item";
import { initProfile } from "./profile";
import { switchView } from "./control_wizard";
import { showToast } from "./toast";

export async function renderLoggedInState(user) {
    const profile = await fetchUserProfile(user.uid);
    if (profile) {
        document.getElementById('setup-wizard').classList.add('is-hidden');
        document.getElementById('pos-app').classList.add('is-active');
        initInventoryForm();
        // Restore the saved cart only after inventory has loaded, so each line can be reconciled against live stock. 
        loadAllItems().then(restoreOrderFromStorage);
        initializeSearch();
        initSort();
        initializeOrderForm();
        initSubmitOrder();
        initProfile(user);
        initGlobalBarcodeListener((sku) => {
            const item = allItems.find(i => i.sku === sku);
            if (item) scanAddItem(item.id);
        });
        if (profile.tax_rate) setTaxRate(profile.tax_rate);
        
        const initial = (user.email || '?').charAt(0).toUpperCase();
        const avatar = document.getElementById('js-profile-avatar');
        if (avatar) avatar.textContent = initial;
    }
    else{
        showToast('Please complete your business profile setup to continue.', 'info');
        const wizard = document.getElementById('setup-wizard');
        wizard.classList.remove('is-hidden');
        wizard.classList.add('is-active');
        // controlSignUpWizardPageDirection auto-starts at step 2 when auth.currentUser exists
        switchView('signUp');
    }
}

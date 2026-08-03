import '../styles/variables.css';
import '../styles/skeleton.css';
import '../styles/setupWizard.css';
import '../styles/container.css';
import '../styles/add_item_modal.css';
import '../styles/features_modal.css';
import '../styles/item_button.css';
import '../styles/order_item_modal.css';
import '../styles/profile_modal.css';
import '../styles/order_history_modal.css';
import '../styles/inventory_update_modal.css';
import '../styles/manage_item_modal.css';
import '../styles/manage_categories_modal.css';
import '../styles/barcode_generator_modal.css';
import '../styles/sales_insights_modal.css';
import '../styles/export_data_modal.css';
import '../styles/customer_checkout_modal.css';
import '../styles/confirm-modal.css';
import '../styles/admin_pin_modal.css';
import '../styles/landing.css';
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { switchView, eventDelegation } from "./control_wizard";
import { renderLoggedInState } from "./loggedIn-user";
import { modal_handler } from './modal-handler';
import { initOrderHistory } from './order_history';
import { initInventoryUpdate } from './inventory_update';
import { initManageItem } from './manage-item';
import { initManageCategories } from './manage_categories';
import { loadCategories } from './categories';
import { initBarcodeGenerator } from './barcode-generator';
import { initInsights } from './sales_insight';
import { initExport } from './export_data';
import { initAdminPin } from './admin_pin';
import { initCustomerCheckout } from './customer_checkout';
import { initClock } from './clock';
import { initThemeToggle } from './theme';
import { showToast } from './toast';
import { populateCurrencySelect } from './formatCurrency';
function initLoggedInApp(user) {
    renderLoggedInState(user);
    initInsights(user);
    initExport(user);
    initOrderHistory(user);
    initInventoryUpdate(user);
    initManageItem(user);
    initManageCategories();
    loadCategories();
    initBarcodeGenerator(user);
    initAdminPin(user);
    initCustomerCheckout();
    initClock();
    initThemeToggle('js-theme-toggle-app');
}

function initLanding() {
  const overlay = document.getElementById('js-wizard-overlay');
  if (!overlay) return;

  initThemeToggle('js-theme-toggle-landing');
  switchView('signUp');
}

initLanding();

document.addEventListener('DOMContentLoaded', function(){
    populateCurrencySelect(document.getElementById('step-currency'));
    populateCurrencySelect(document.getElementById('profile-currency'));
    eventDelegation('js-wizard__body');
    let initialized = false;
    onAuthStateChanged(auth, (user) => {
        // document.body.classList.remove('is-booting');
        document.body.classList.remove('is-booting');
        if (user) {
            document.getElementById('js-landing').style.display = 'none';
            document.getElementById('js-wizard-overlay').classList.add('is-hidden');
            if (initialized) return;
            initialized = true;
            showToast("successfully logging in");
            initLoggedInApp(user);
        } else {
            document.getElementById('pos-app').classList.remove('is-active');
            const wizard = document.getElementById('setup-wizard');
            wizard.classList.remove('is-hidden');
            wizard.classList.add('is-active');
        }
    });
    modal_handler();// Open and close modal controller
});
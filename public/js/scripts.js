// scripts.js - main wiring
import { startClock } from "./time_display.js";
import { setupAddButton, closeNewItemPanel } from "./add_item_ui.js";
import { addItemToOrder, openOrderPanel, getOrderItems } from "./order_logic.js";
import { resetOrderAfterSubmit } from "./order_logic.js";
import { initializeSearch, loadItemsWithSearch } from "./item_search.js";
import { loadListOfOrderHistory, viewOrderDetails, closeOrderHistory } from './order_history.js';
import {loadListItemQuantity} from './stock_manager.js';
import { openFeaturesModal, closeFeaturesModal} from './features_button.js';
import { openBarcodeGenerator, closeBarcodeGenerator } from "./barcode_handler.js";
import { changeStep } from './setup_wizard.js';
import { API_BASE } from './config.js';
import { checkAppState } from "./checkAppState.js";
checkAppState();
function closePanel(panelID, panelBackDropID) {
  const panel = document.getElementById(panelID); 
  const backdrop = document.getElementById(panelBackDropID);
  if (panel) {
    panel.classList.remove('active');
    backdrop.classList.remove('active');
  }
}

let isSubmitting = false;
document.getElementById('setupForm').addEventListener('submit', async function(e) {
  e.preventDefault();
});

document.getElementById('addItemForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  if (isSubmitting) return;
  isSubmitting = true;

  const sku = document.getElementById('sku').value;
  const item_name = document.getElementById('itemName').value;
  const tagCategory = document.getElementById('tagsCategory').value;
  const tagColor = document.getElementById('tagsColor').value;
  const cost_price = parseFloat(document.getElementById('costPrice').value.replace(/[^\d]/g, '')) || 0;
  const selling_price = parseFloat(document.getElementById('itemPrice').value.replace(/[^\d]/g, '')) || 0;
  const minimum_stock_level = parseFloat(document.getElementById('minimum_stock_level').value) || 0;
  const item_quantity = parseFloat(document.getElementById('itemQty').value) || 0;
  const item_unit = document.getElementById('itemUnit').value;
  const supplier_info = document.getElementById('supplier_info').value;
  const description = document.getElementById('description').value;

  if (!sku || !item_name || !selling_price || !item_quantity || !cost_price) {
    alert("Please fill all required fields");
    isSubmitting = false;
    return;
  }

  const newItem = {
    sku, item_name, tagCategory, tagColor, cost_price,
    selling_price, minimum_stock_level, item_quantity, item_unit, supplier_info, description
  };

  try {
    const response = await fetch(`${API_BASE}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem)
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.log(`failed to add item because of ${data.error}`);
      alert(`failed to add item because of ${data.error}`);
      return;
    }

    if (data.success) {
      console.log("Success message from server:", data.message);
      loadItemsWithSearch(openOrderPanel);
      document.getElementById('addItemForm').reset();
      closeNewItemPanel();
      alert("Item added successfully!");
    } else {
      alert(`Failed to add an item. Please try again!`);
    }

  } catch (err) {
    console.error("Detailed error:", err);
    alert("Something went wrong. Please try again later.");
  } finally {
    isSubmitting = false;
  }
});

document.getElementById('orderItemForm').addEventListener('submit', function (e) {
  e.preventDefault();
  if(parseFloat(document.getElementById('quantityInput').value) > parseFloat(document.getElementById('itemStock').textContent)){
    alert("Not enough stock.");
    closePanel('orderItemForm', 'orderItemBackdrop');
    return;
  }
  addItemToOrder(
    document.getElementById('itemNameDetail').textContent,
    parseFloat(document.getElementById('itemPriceSell').textContent),
    parseFloat(document.getElementById('quantityInput').value)
  );
  closePanel('orderItemForm', 'orderItemBackdrop');
});

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('totalItemsOrdered').textContent = '0';
  document.getElementById('priceTotalOrdered').textContent = 'Rp. 0';
  setupAddButton();

  initializeSearch(openOrderPanel);// pass openOrderPanel as the handler for item clicks

  startClock();
});

document.getElementById('orderHistory').addEventListener('click', async  (e) => {
  e.preventDefault();
  await loadListOfOrderHistory();
})

document.getElementById('submitOrder').addEventListener('click', async function(e) {
  e.preventDefault();

  const orderItems = getOrderItems();
  console.log(orderItems);

  if (orderItems === 0) {
    alert('Nothing is submitted');
    return;
  }

  const customerName = document.getElementById('customerName')?.value || 'CustomerX';
  const paymentMethod = document.getElementById('paymentMethod')?.value || 'Cash';

  const orderData = {
    orderItems: orderItems,
    customerName: customerName,
    paymentMethod: paymentMethod
  };

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
  }

  try {
    const response = await fetch(`${API_BASE}/api/submittingOrder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });

    const data = await response.json();

    if (data.success) {
      alert(`Order submitted successfully!\nBill ID: ${data.billId}`);
      resetOrderAfterSubmit();
      initializeSearch(openOrderPanel);
    } else {
      alert(`Failed to submit order`);
    }
  } catch (err) {
    console.error('Error submitting order:', err);
    alert('Something went wrong while submitting the order.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Order';
    }
  }
});

document.getElementById('updateItemInventory').addEventListener('click', async function(e){
  e.preventDefault();
  await loadListItemQuantity();
});
document.getElementById('generateBarcode').addEventListener('click', async function(e){
  e.preventDefault();
  openBarcodeGenerator();
});

window.closePanel = closePanel;
window.viewOrderDetails = viewOrderDetails;
window.closeOrderHistory = closeOrderHistory;
window.openFeaturesModal  = openFeaturesModal;
window.closeFeaturesModal = closeFeaturesModal;
window.closeBarcodeGenerator = closeBarcodeGenerator;
window.changeStep = changeStep;
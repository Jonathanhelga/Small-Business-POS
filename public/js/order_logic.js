// OrderItem.js
import { getAllItems } from "./item_search.js"; // used for find-by-name in your double-click flow

let orderItems = [];
let selectedRowIndex = -1;

export function getOrderItems() { return orderItems; }

export function addItemToOrder(itemName, price, itemQuantity) {
    const existingIndex = orderItems.findIndex(i => i.name === itemName);
    if (existingIndex !== -1) {
      // overwrite quantity
      orderItems[existingIndex].quantity = itemQuantity;
    } else {
      orderItems.push({ name: itemName, price, quantity: itemQuantity });
    }
    updateOrderDisplay();
}
function findItemByName(itemName) {
    return getAllItems().find(item => item.item_name === itemName);
}
export function openOrderPanel(item) {
    const orderPanel = document.getElementById('orderItemForm');
    const backdrop = document.getElementById('orderItemBackdrop');
    if (!orderPanel) return;

    document.getElementById('skuDisplay').textContent = item.sku ?? '';
    document.getElementById('itemNameDetail').textContent = item.item_name ?? '';
    document.getElementById('itemPriceSell').textContent = " " + (item.selling_price ?? '');
    document.getElementById('itemStock').textContent = item.item_quantity ?? '';

    let matchedItem = orderItems.find(o => o.name === item.item_name);
    if (matchedItem) {
      document.getElementById('quantityInput').value = matchedItem.quantity;
    } else {
      document.getElementById('quantityInput').value = 1;
    }

    orderPanel.classList.add('active');
    backdrop.classList.add('active');

    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) {
          orderPanel.classList.remove('active');
          backdrop.classList.remove('active');
      }
  });
}
function updateOrderDisplay() {
    const tableBody = document.getElementById('orderTableBody');
    if (!tableBody) return;

    if (orderItems.length === 0) {
      tableBody.innerHTML = '<tr class="empty-state"><td colspan="3">No items ordered yet</td></tr>';
      selectedRowIndex = -1;
      updateTotals();
      document.getElementById('removeBtn').disabled = true;
      return;
    }

    tableBody.innerHTML = '';
    orderItems.forEach((item, index) => {
      const row = document.createElement('tr');
      row.onclick = () => selectRow(index);
      row.addEventListener('dblclick', function (e) {
        e.stopPropagation();
        const fullItemData = findItemByName(item.name);
        if (fullItemData) {
          openOrderPanel(fullItemData);
          document.getElementById('quantityInput').value = item.quantity;
        } else {
          alert("Error: Could not find item data.");
        }
      });

      row.style.cursor = 'pointer';
      if (index === selectedRowIndex) row.classList.add('selected');

      row.innerHTML = `
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>${formatRupiah(item.price)}</td>
      `;
      tableBody.appendChild(row);
    });

    updateTotals();
}
function selectRow(index) {
    selectedRowIndex = index;
    document.getElementById('removeBtn').disabled = false;
    updateOrderDisplay();
}
function updateTotals() {
    const totalItems = orderItems.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
    const totalPrice = orderItems.reduce((sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || 0)), 0);

    const totalItemsEl = document.getElementById('totalItemsOrdered');
    const totalPriceEl = document.getElementById('priceTotalOrdered');
    if (totalItemsEl) totalItemsEl.textContent = totalItems;
    if (totalPriceEl) totalPriceEl.textContent = `Rp. ${formatRupiah(totalPrice)}`;
}
export function resetOrderTable() {
    if (orderItems.length > 0 && confirm('Reset the entire order?')) {
      orderItems = [];
      selectedRowIndex = -1;
      updateOrderDisplay();
    }
}
function removeItem(index) {
    orderItems.splice(index, 1);
}
export function removeSelectedItem() {
    if (selectedRowIndex !== -1) {
      removeItem(selectedRowIndex);
      selectedRowIndex = -1;
      document.getElementById('removeBtn').disabled = true;
      updateOrderDisplay();
    }
}
function formatRupiah(number) {
    return new Intl.NumberFormat('id-ID').format(number);
}
export function resetOrderAfterSubmit(){
    orderItems.length = 0;
    selectedRowIndex = -1;
    
    // Update the display
    updateOrderDisplay();
    
    // Clear customer form
    const customerNameInput = document.getElementById('customerName');
    const paymentMethodSelect = document.getElementById('paymentMethod');
    
    if (customerNameInput) customerNameInput.value = '';
    if (paymentMethodSelect) paymentMethodSelect.value = 'Cash';
}

window.resetOrderTable = resetOrderTable;
window.removeSelectedItem = removeSelectedItem;

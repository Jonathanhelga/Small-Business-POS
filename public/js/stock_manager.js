import { API_BASE } from './config.js';

const itemCardtemplate = document.getElementById('updateQuantityTemplate');
const container = document.getElementById('itemList');
// const emptyContainer = document.getElementById('noItemList');
let itemListDetails = [];

const formatCurrency = (value) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0 
}).format(value);
async function fetchItemList() {
    try {
        const response = await fetch(`${API_BASE}/api/updateItem/items`);
        const data = await response.json().catch(() => null);
        container.innerHTML = '';
        if (!response.ok) {
            console.error("Backend error:", data?.error || data?.message || "Unknown error");
            closeListItem();
            alert(`⚠️ Error: ${data?.error || data?.message || "Failed to load items"}`);
            return;
        }
        console.log(data);
        if (!data || !Array.isArray(data.items) || data.items.length === 0) {
            container.innerHTML = '<p>No item currently exists to update.</p>';
            return;
        }

        console.log("From update Quantity Items loaded: ", data.items.length);
        itemListDetails = data.items;
        showAsItemCard(itemListDetails);

    } catch (err) {
        console.error("Error fetching items:", err);
        alert("Failed to load items. Please try again.");
    }
}

async function updateQuantityAfterSubmit(itemID, total, minimumStock){
    const el = document.getElementById("stock" + itemID);
    if (el) { el.textContent = total; }

    const statusEl = document.getElementById("status" + itemID);
    if (!statusEl) return;

    if (total >= minimumStock){
        statusEl.textContent = '(GOOD)';
        statusEl.classList.add("good");
        statusEl.classList.remove("alert");
    } else {
        statusEl.textContent = '(ALERT)';
        statusEl.classList.add("alert");
        statusEl.classList.remove("good");

    }
}

async function showAsItemCard(items){
    container.innerHTML = '';         
    const frag = document.createDocumentFragment();

    items.forEach(item => {
        const clone = itemCardtemplate.content.cloneNode(true);
        clone.querySelector('.js-item-name').textContent = item.item_name ?? '';
        clone.querySelector('.js-sku').textContent = item.sku ?? '';
        clone.querySelector('.js-cost-value').textContent = formatCurrency(item.cost_price);
        clone.querySelector('.js-sell-value').textContent = formatCurrency(item.selling_price);

        // stock value div
        const currentStock = Number(item.item_quantity) ;
        clone.querySelector('.js-stock-value').textContent = currentStock ?? 0;
        clone.querySelector('.js-stock-value').id = "stock" + item.itemID;

        // minimum stock div
        const minimumStock = Number(item.minimum_stock_level);
        clone.querySelector('.js-min-stock').textContent = minimumStock ?? 0;
        clone.querySelector('.js-min-stock').id = "minimumStock" + item.itemID;
        const statusEl = clone.querySelector('.status');
        statusEl.id = "status" + item.itemID;
        
        if (currentStock < minimumStock) {
            statusEl.textContent = "(ALERT)";
            statusEl.classList.add("alert");
            statusEl.classList.remove("good");
        } else {
            statusEl.textContent = "(GOOD)";
            statusEl.classList.add("good");
            statusEl.classList.remove("alert");
        }
        
        const input = clone.querySelector('.js-new-stock');
        input.dataset.itemId = item.itemID ?? item.sku;
        const saveBtn = clone.querySelector('.js-save-btn');
        saveBtn.addEventListener('click', async () => {
            const incomingQty = Number(input.value);
            if (isNaN(incomingQty) || incomingQty <= 0) { 
                alert("Please input a value more than 0");
                return;
            }
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            try{
                const currentStock = Number(document.getElementById("stock" + input.dataset.itemId).textContent)
                const total = incomingQty + currentStock;
                const payload = { total };   // rename for clarity

                updateQuantityAfterSubmit(
                    input.dataset.itemId,
                    total,
                    Number(document.getElementById('minimumStock' + input.dataset.itemId).textContent)
                  );
                //backend request
                const response = await fetch(
                    `${API_BASE}/api/updateItem/items/${input.dataset.itemId}`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                    }
                );
                const data = await response.json().catch(() => null);
                //backend error validation
                if (!response.ok) {
                    console.error("Backend error:", data.error || data.message || "Unknown error");
                    alert(`⚠️ Error: ${data.error || data.message || "Failed to update item"}`);
                    return;
                }
                //Success
                console.log("✅ Success:", data);
                console.log(`${input.dataset.itemId} Quantity updated to: ${total}`);

            }catch(err) {
                // Network / unexpected error
                console.error("❌ Error inserting quantity:", err);
                alert("Failed to update stock. Try again later.");
            }
            input.value = '';
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        })
        frag.append(clone);
    });
    container.appendChild(frag);
}

const modal = document.getElementById('updateQuantityModal');
export async function loadListItemQuantity(){
    fetchItemList();
    modal.addEventListener('click', function (event) {
        if(event.target === modal){
            closeListItem();
        }
    })
    modal.style.display = 'flex';
}

async function closeListItem(){
    modal.style.display = 'none';
}

window.closeUpdateQuantity = closeListItem;
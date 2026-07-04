import { submitItemData, auth, getCachedUserProfile } from "./firebase";
import { getCurrencySymbol } from './formatCurrency';
import { addSingleItem, allItems } from "./search_item";
import { toggleModal } from './modal-handler';
import { showToast } from "./toast";

// Currency symbol for the current user, captured when the modal opens so the
// running "added this session" list can label prices without re-reading it.
let currencySymbol = 'Rp';

function generateNextSku(items) {
    const numbers = items
        .map(i => /^SKU-(\d+)$/.exec(i.sku))
        .filter(Boolean)
        .map(m => parseInt(m[1], 10));
    const next = numbers.length ? Math.max(...numbers) + 1 : 1;
    return `SKU-${String(next).padStart(5, '0')}`;
}

function formatPrice(value) {
    return `${currencySymbol} ${new Intl.NumberFormat('id-ID').format(value)}`;
}

// Empty the running list and hide its panel — called each time the modal opens
// so every add session starts fresh.
function clearAddedList() {
    const panel = document.getElementById('js-added-panel');
    const list  = document.getElementById('js-added-list');
    list.replaceChildren();
    panel.hidden = true;
}

// Prepend a just-saved item to the running list (newest on top) and refresh the
// count. Built with createElement/textContent — never innerHTML with DB data.
function appendAddedRow(itemData) {
    const panel = document.getElementById('js-added-panel');
    const list  = document.getElementById('js-added-list');

    const row = document.createElement('li');
    row.className = 'c-added__row';

    const name = document.createElement('span');
    name.className = 'c-added__name';
    name.textContent = itemData.itemName;

    const price = document.createElement('span');
    price.className = 'c-added__price';
    price.textContent = formatPrice(itemData.sellPrice);

    const check = document.createElement('span');
    check.className = 'c-added__check';
    check.textContent = '✓';

    row.append(name, price, check);
    list.prepend(row);

    panel.hidden = false;
    const count = list.children.length;
    document.getElementById('js-added-count').textContent =
        `${count} item${count === 1 ? '' : 's'} added`;
}

// Clear only the per-item fields after a save. Unit and Button Theme stay put
// so a run of similar items (e.g. 20 drinks in "pcs") keeps their shared choice.
function resetItemFields(skuAutoCheckbox, skuInput) {
    ['item-name', 'cost-price', 'sell-price', 'item-qty', 'min-stock-level',
     'supplier-info', 'js-description'].forEach(id => {
        document.getElementById(id).value = '';
    });

    if (skuAutoCheckbox.checked) {
        skuInput.value = generateNextSku(allItems);
        skuInput.readOnly = true;
    } else {
        skuInput.value = '';
    }

    // Land the cursor where the next item's typing begins: the name when SKU is
    // auto-filled, otherwise the SKU field the user still has to type.
    (skuAutoCheckbox.checked
        ? document.getElementById('item-name')
        : skuInput).focus();
}

export function initInventoryForm() {
    const skuAutoCheckbox = document.getElementById('sku-auto-checkbox');
    const skuInput = document.getElementById('sku');

    document.getElementById('js-item-create-open').addEventListener('click', () => {
        const currency = getCachedUserProfile()?.currency || 'IDR';
        currencySymbol = getCurrencySymbol(currency);
        document.getElementById('c-cost-currency').textContent = currencySymbol;
        document.getElementById('c-sell-currency').textContent = currencySymbol;

        clearAddedList();

        if (skuAutoCheckbox.checked) {
            skuInput.value = generateNextSku(allItems);
            skuInput.readOnly = true;
        }

        toggleModal('item-create-modal');
    });

    skuAutoCheckbox.addEventListener('change', () => {
        if (skuAutoCheckbox.checked) {
            skuInput.value = generateNextSku(allItems);
            skuInput.readOnly = true;
        } else {
            skuInput.value = '';
            skuInput.readOnly = false;
            skuInput.focus();
        }
    });

    const form = document.getElementById('js-item-create-form');
    const submitBtn = document.getElementById('js-add-new-item');
    if (!form || !submitBtn) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) {
            showToast("Session expired. Please log in again.", 'error');
            return;
        }
        const requiredFields = [
            { id: 'sku', label: 'SKU' },
            { id: 'item-name', label: 'Item Name' },
            { id: 'cost-price', label: 'Cost Price' },
            { id: 'sell-price', label: 'Selling Price' },
            { id: 'item-qty', label: 'Item Quantity' },
            { id: 'item-unit', label: 'Unit' },
        ];

        const emptyFields = requiredFields.filter(f => !document.getElementById(f.id).value.trim());
        if (emptyFields.length > 0) {
            showToast(`Please fill in the following required fields:\n• ${emptyFields.map(f => f.label).join('\n• ')}`, 'error');
            document.getElementById(emptyFields[0].id).focus();
            return;
        }

        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving Item...";
        const formData = {
            tagColor: document.getElementById('tag-color').value,
            sku: document.getElementById('sku').value.trim().toUpperCase(),
            itemName: document.getElementById('item-name').value.trim(),
            costPrice: Number(document.getElementById('cost-price').value) || 0,
            sellPrice: Number(document.getElementById('sell-price').value) || 0,
            stockLevel: parseFloat(document.getElementById('item-qty').value) || 0,
            minStockLevel: parseFloat(document.getElementById('min-stock-level').value) || 0,
            unit: document.getElementById('item-unit').value,
            supplier: document.getElementById('supplier-info').value.trim(),
            description: document.getElementById('js-description').value.trim(),
        };

        try {
            const itemData = await submitItemData(formData, user.uid);
            addSingleItem(itemData);
            showToast('Inventory updated successfully.');

            // Rapid-add: keep the modal open, log the item, and clear only the
            // per-item fields so the next one flows straight in. The user closes
            // with "Done" (or ×) when finished.
            appendAddedRow(itemData);
            resetItemFields(skuAutoCheckbox, skuInput);
        } catch (err) {
            console.error("Submission Error:", err);
            showToast(`Failed to save: ${err.message}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

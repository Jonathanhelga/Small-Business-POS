import JsBarcode from 'jsbarcode';
import html2canvas from 'html2canvas';
import { fetchInventory, getCurrentCurrency as currentCurrency } from './firebase';
import { toggleModal } from './modal-handler';
import { formatCurrency, getCurrencySymbol } from './formatCurrency';
import { showToast } from './toast';
import { createSelection } from './selection';
import { skeletonBar } from './skeleton';
import { attachListKeyNav } from './listKeyNav';
let allItems      = [];
let filteredItems = [];
const selection   = createSelection();

let currentObjectUrl = null;
let uploadedImageUrl = null;
let activeSize = 'large';
let backgroundColor = null;
// helpers 

function cleanupObjectUrl() {
    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
    }
}

// item list

// Placeholder cards mirroring .bg-card, shown while inventory loads.
function buildItemSkeleton_Barcode(count = 6) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
        const card = document.createElement('div');
        card.className = 'bg-card is-skeleton';

        const topRow = document.createElement('div');
        topRow.className = 'bg-card__top-row';
        topRow.append(skeletonBar('55%', '1rem'), skeletonBar('25%', '0.8rem'));

        const secondRow = document.createElement('div');
        secondRow.className = 'bg-card__second-row';
        secondRow.append(skeletonBar('35%', '0.85rem'), skeletonBar('20%', '0.85rem'));

        card.append(topRow, secondRow);
        frag.appendChild(card);
    }
    return frag;
}

function renderItemList_Barcode(items) {
    const container = document.getElementById('bg-item-list');
    container.replaceChildren();

    if (items.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'bg-empty';
        empty.textContent = 'No items found.';
        container.appendChild(empty);
        return;
    }

    const frag = document.createDocumentFragment();
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-card';
        if (selection.is(item)) card.classList.add('bg-card--active');
        card.dataset.itemId = item.id;
        const topRow = document.createElement('div');
        topRow.className = 'bg-card__top-row';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'bg-card__name';
        nameSpan.textContent = item.itemName ?? '-';
        const skuSpan = document.createElement('span');
        skuSpan.className = 'bg-card__sku';
        skuSpan.textContent = `#${item.sku ?? '-'}`;
        topRow.append(nameSpan, skuSpan);

        const secondRow = document.createElement('div');
        secondRow.className = 'bg-card__second-row';
        const priceSpan = document.createElement('span');
        priceSpan.className = 'bg-card__price';
        priceSpan.textContent = `${getCurrencySymbol(currentCurrency())} ${formatCurrency(item.sellPrice, currentCurrency())}`;
        const stockSpan = document.createElement('span');
        stockSpan.className = 'bg-card__stock';
        stockSpan.textContent = `${item.stockLevel ?? 0} `;
        const unitSpan = document.createElement('span');
        unitSpan.className = 'bg-card__unit';
        unitSpan.textContent = item.unit ?? '';
        stockSpan.appendChild(unitSpan);
        secondRow.append(priceSpan, stockSpan);

        card.append(topRow, secondRow);
        card.addEventListener('click', () => selectItem(item));
        frag.appendChild(card);
    });
    container.appendChild(frag);
}

// selection & preview

function selectItem(item) {
    selection.set(item);

    document.querySelectorAll('.bg-card').forEach(c => {
        c.classList.toggle('bg-card--active', c.dataset.itemId === item.id);
    });

    updatePreview();
    document.getElementById('bg-save-btn').disabled = false;
}

function updatePreview() {
    const item = selection.get();
    if (!item) return;

    const design = document.getElementById('bg-barcode-design');

    const preview = document.createElement('div');
    preview.className = `bg-preview bg-preview--${activeSize}`;
    if (backgroundColor) preview.style.backgroundColor = backgroundColor;

    const nameDiv = document.createElement('div');
    nameDiv.className = 'bg-preview__name';
    nameDiv.textContent = item.itemName ?? '-';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'bg-preview__img-wrap';
    imgWrap.id = 'bg-preview-img-wrap';
    const img = document.createElement('img');
    img.id = 'bg-preview-img';
    img.src = uploadedImageUrl ?? '';
    img.alt = 'Product photo';
    imgWrap.appendChild(img);

    const priceDiv = document.createElement('div');
    priceDiv.className = 'bg-preview__price';
    priceDiv.textContent = `${getCurrencySymbol(currentCurrency())} ${formatCurrency(item.sellPrice, currentCurrency())}`;

    const barcodeCanvas = document.createElement('canvas');
    barcodeCanvas.id = 'bg-barcode-canvas';
    preview.append(nameDiv, imgWrap, priceDiv, barcodeCanvas);
    design.replaceChildren(preview);

    // show/hide image block
    document.getElementById('bg-preview-img-wrap').style.display = uploadedImageUrl ? 'block' : 'none';

    // generate barcode
    const canvasEl = document.getElementById('bg-barcode-canvas');
    const sku   = (item.sku ?? '').trim();
    if (sku) {
        try {
            JsBarcode(canvasEl, sku, {
                height: 110,
                fontSize: 14,
                displayValue: true,
                margin: 5,
                background: 'transparent',
            });
        } catch {
            const errMsg = document.createElement('p');
            errMsg.className = 'bg-empty bg-empty--error';
            errMsg.textContent = 'Invalid SKU for barcode';
            canvasEl.replaceWith(errMsg);
        }
    } else {
        const noSkuMsg = document.createElement('p');
        noSkuMsg.className = 'bg-empty';
        noSkuMsg.textContent = 'No SKU — barcode unavailable';
        canvasEl.replaceWith(noSkuMsg);
    }
}

// save

async function saveDesign() {
    const item = selection.get();
    if (!item) return;

    const previewEl = document.querySelector('.bg-preview');
    if (!previewEl) return;

    const btn = document.getElementById('bg-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        // Capture the preview card as a high-res PNG (scale 3 = 3× pixel density)
        const canvas = await html2canvas(previewEl, {
            scale: 3,
            useCORS: true,
            backgroundColor: null,
        });

        // Build filename: e.g. "barcode-SKU123-sticker-s.png"
        const name = item.sku ?? item.itemName ?? 'barcode';
        const link = document.createElement('a');
        link.download = `barcode-${name}-${activeSize}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('design successfully downloaded');
    } catch (err) {
        console.error('Failed to save design:', err);
        showToast('Failed to save design', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Design';
    }
}

// open / reset

async function openBarcodeGenerator(user) {
    if (!user) return;

    selection.clear();
    cleanupObjectUrl();
    uploadedImageUrl = null;

    document.getElementById('bg-item-list').replaceChildren(buildItemSkeleton_Barcode());
    document.getElementById('bg-search').value        = '';
    document.getElementById('bg-save-btn').disabled   = true;
    document.getElementById('bg-img-upload').value    = '';
    document.getElementById('bg-color-picker').value = "#ffffff";
    document.getElementById('bg-img-filename').textContent = '';
    const selectMsg = document.createElement('p');
    selectMsg.className = 'bg-empty';
    selectMsg.textContent = 'Select an item from the list.';
    document.getElementById('bg-barcode-design').replaceChildren(selectMsg);

    try {
        allItems      = await fetchInventory(user.uid);
        filteredItems = [...allItems];
        renderItemList_Barcode(filteredItems);
    } catch (err) {
        console.error('Failed to load inventory:', err);
        const errMsg = document.createElement('p');
        errMsg.className = 'bg-empty bg-empty--error';
        errMsg.textContent = 'Failed to load inventory.';
        document.getElementById('bg-item-list').replaceChildren(errMsg);
    }
}

// init

export async function initBarcodeGenerator(user) {
    const openBtn = document.getElementById('barcode-generator-open');
    if (!openBtn) return;
    backgroundColor = document.getElementById('bg-color-picker').value;
    openBtn.addEventListener('click', () => {
        toggleModal('features-modal');
        toggleModal('barcode-generator-modal');
        if (!user) return;
        openBarcodeGenerator(user);
    });

    attachListKeyNav({
        scope:       document.getElementById('barcode-generator-modal'),
        container:   document.getElementById('bg-item-list'),
        cardSelector: '.bg-card',
        searchInput: document.getElementById('bg-search'),
        getItems:    () => filteredItems,
        onOpen:      (item) => selectItem(item),
    });

    document.getElementById('bg-search').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        filteredItems = q
            ? allItems.filter(item =>
                (item.itemName ?? '').toLowerCase().includes(q) ||
                (item.sku     ?? '').toLowerCase().includes(q)
              )
            : [...allItems];
        renderItemList_Barcode(filteredItems);
    });

    document.getElementById('bg-img-upload').addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        cleanupObjectUrl();
        if (file) {
            currentObjectUrl = URL.createObjectURL(file);
            uploadedImageUrl = currentObjectUrl;
            document.getElementById('bg-img-filename').textContent = file.name;
        } else {
            uploadedImageUrl = null;
            document.getElementById('bg-img-filename').textContent = '';
        }
        if (selection.get()) updatePreview();
    });

    document.getElementById('bg-color-picker').addEventListener('input', (e) => {
        const background_preview = document.querySelector('.bg-preview');
        backgroundColor = e.target.value;  
        if(!background_preview) { return; }
        background_preview.style.backgroundColor = e.target.value;
        background_preview.style.borderColor = e.target.value;
    }); 

    document.getElementById('bg-size-options').addEventListener('click', (e) => {
        const btn = e.target.closest('.bg-size-btn');
        if (!btn) return;
        activeSize = btn.dataset.size;
        document.querySelectorAll('.bg-size-btn').forEach(b =>
            b.classList.toggle('bg-size-btn--active', b === btn)
        );
        if (selection.get()) updatePreview();
    });

    document.getElementById('bg-save-btn').addEventListener('click', saveDesign);
}

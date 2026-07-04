const FIELD_TYPE_LABELS = {
    choice: 'Multiple Choice',
    date: 'Date',
    time: 'Time',
};
const FIELD_BODY_TEMPLATES = {
    date: 'js-checkout-field-body-date-template',
    time: 'js-checkout-field-body-time-template',
    choice: 'js-checkout-field-body-choice-template',
};
const MAX_CHOICE_OPTIONS = 5;

export function initCustomFields() {
    const addBtn = document.getElementById('js-checkout-add-field');
    const typeMenu = document.getElementById('js-checkout-type-menu');
    if (!addBtn || !typeMenu) return;

    addBtn.addEventListener('click', toggleTypeMenu);
    for (const option of typeMenu.querySelectorAll('.c-checkout__type-option')) { option.addEventListener('click', handleTypeSelect); }//tiap type menu dikasih event listener
    document.addEventListener('click', handleOutsideMenuClick); // to close the type menu when we click on something else
}

// --- Type menu ---

function toggleTypeMenu() {
    const menu = document.getElementById('js-checkout-type-menu');
    if (menu) menu.classList.toggle('is-hidden');
}

function closeTypeMenu() {
    const menu = document.getElementById('js-checkout-type-menu');
    if (menu) menu.classList.add('is-hidden');
}

function handleOutsideMenuClick(e) { 
    if (!e.target.closest('.c-checkout__add-wrap')) { closeTypeMenu(); } 
}

// Build a whole field card (header + body) from the templates, append it, and close the menu.
function handleTypeSelect(e) {
    const type = e.currentTarget.dataset.fieldType;
    const container = document.getElementById('js-checkout-fields');
    if (!container) return;

    const card = document.getElementById('js-checkout-field-card-template').content.firstElementChild.cloneNode(true);
    card.dataset.fieldType = type;
    card.querySelector('.c-checkout__field-card-type').textContent = FIELD_TYPE_LABELS[type] || type;
    card.querySelector('.c-checkout__field-remove').addEventListener('click', handleFieldRemove);

    const bodyTemplate = document.getElementById(FIELD_BODY_TEMPLATES[type]);
    if (bodyTemplate) {
        card.querySelector('.c-checkout__field-card-body').appendChild(bodyTemplate.content.cloneNode(true));
        if (type === 'choice') {
            card.querySelector('.c-checkout__option-add-btn').addEventListener('click', handleOptionTrigger);
            card.querySelector('.c-checkout__option-input').addEventListener('keydown', handleOptionTrigger);
        }
    }
    
    container.appendChild(card);
    closeTypeMenu();
}

function handleFieldRemove(e) {
    const card = e.target.closest('.c-checkout__field-card');
    if (card) card.remove();
}

// Shared by the "+" button (click) and the text input (Enter key).
function handleOptionTrigger(e) {
    if (e.type === 'keydown') {
        if (e.key !== 'Enter') return;
        e.preventDefault();
    }
    addOptionFromInput(e.currentTarget.closest('.c-checkout__field-card'));
}

function addOptionFromInput(card) {
    const input = card.querySelector('.c-checkout__option-input');
    const options = card.querySelector('.c-checkout__options');
    const value = input.value.trim();
    if (!value || options.children.length >= MAX_CHOICE_OPTIONS) return;

    // ignore duplicates (case-insensitive)
    for (const text of options.querySelectorAll('.c-checkout__option-text')) {
        if (text.textContent.toLowerCase() === value.toLowerCase() ) { input.value = ''; return; }
    }
    
    const option = document.getElementById('js-checkout-option-template').content.firstElementChild.cloneNode(true);
    option.querySelector('.c-checkout__option-text').textContent = value;
    option.querySelector('.c-checkout__option-pick').addEventListener('click', handleOptionSelect);
    option.querySelector('.c-checkout__option-remove').addEventListener('click', handleOptionRemove);
    options.appendChild(option);

    if (!options.querySelector('.c-checkout__option.is-selected')) selectOption(option);
    input.value = '';
    input.focus();
    updateOptionLimit(card);
}

function handleOptionSelect(e) {
    selectOption(e.currentTarget.closest('.c-checkout__option'));
}

function selectOption(option) {
    for (const sibling of option.parentElement.children) sibling.classList.remove('is-selected');
    option.classList.add('is-selected');
}

function handleOptionRemove(e) {
    const option = e.currentTarget.closest('.c-checkout__option');
    const card = option.closest('.c-checkout__field-card');
    const options = option.parentElement;
    const wasSelected = option.classList.contains('is-selected');
    option.remove();
    if (wasSelected && options.firstElementChild) selectOption(options.firstElementChild);
    updateOptionLimit(card);
}

function updateOptionLimit(card) {
    const options = card.querySelector('.c-checkout__options');
    const input = card.querySelector('.c-checkout__option-input');
    const addBtn = card.querySelector('.c-checkout__option-add-btn');
    const hint = card.querySelector('.c-checkout__choice-hint');
    const atMax = options.children.length >= MAX_CHOICE_OPTIONS;

    input.disabled = atMax;
    addBtn.disabled = atMax;
    if (hint) hint.textContent = atMax ? '(max reached)' : '(max 5)';
}

export function resetCustomFields() {
    const container = document.getElementById('js-checkout-fields');
    if (container) container.replaceChildren();
    closeTypeMenu();
}

// --- Saved field library (Phase 2, Side B) ---

// Re-render the "Saved fields" section of the Add-field menu from the library
// definitions read off the user doc. Called on every modal open. The divider is
// hidden when the library is empty so the menu stays clean for new users.
export function renderSavedFields(library) {
    const list = document.getElementById('js-checkout-saved-fields');
    const divider = document.getElementById('js-checkout-saved-divider');
    if (!list || !divider) return;

    list.replaceChildren();
    const defs = Array.isArray(library) ? library : [];
    divider.classList.toggle('is-hidden', defs.length === 0);

    for (const def of defs) list.appendChild(buildSavedOption(def));
}

function buildSavedOption(def) {
    const option = document.getElementById('js-checkout-saved-option-template').content.firstElementChild.cloneNode(true);
    option.querySelector('.c-checkout__saved-label').textContent = def.label;
    if (def.type === 'choice' && def.options?.length) {
        option.querySelector('.c-checkout__saved-meta').textContent = `(${def.options.join(' / ')})`;
    }
    option.addEventListener('click', () => attachSavedField(def));
    return option;
}

// Re-attach a saved definition as a locked card: label + options are fixed
// (no redefining, spec §4.3); the cashier only fills the value.
function attachSavedField(def) {
    const container = document.getElementById('js-checkout-fields');
    if (!container) return;
    container.appendChild(buildLockedCard(def));
    closeTypeMenu();
}

function buildLockedCard(def) {
    const card = document.getElementById('js-checkout-field-card-template').content.firstElementChild.cloneNode(true);
    card.classList.add('c-checkout__field-card--locked');
    card.dataset.fieldType = def.type;
    card.dataset.fieldId = def.id;
    card.dataset.fieldLabel = def.label;
    card.querySelector('.c-checkout__field-card-type').textContent = FIELD_TYPE_LABELS[def.type] || def.type;
    card.querySelector('.c-checkout__field-remove').addEventListener('click', handleFieldRemove);

    const body = card.querySelector('.c-checkout__field-card-body');
    const labelEl = document.createElement('div');
    labelEl.className = 'c-checkout__field-readonly-label';
    labelEl.textContent = def.label;
    body.appendChild(labelEl);

    if (def.type === 'choice') {
        body.appendChild(buildLockedOptions(def.options || []));
    } else {
        const input = document.createElement('input');
        input.type = def.type; // 'date' or 'time' — native picker
        input.className = 'c-field__input c-checkout__field-value';
        body.appendChild(input);
    }
    return card;
}

function buildLockedOptions(options) {
    const wrap = document.createElement('div');
    wrap.className = 'c-checkout__options';
    for (const text of options) {
        const option = document.getElementById('js-checkout-option-template').content.firstElementChild.cloneNode(true);
        option.querySelector('.c-checkout__option-text').textContent = text;
        option.querySelector('.c-checkout__option-remove').remove(); // locked: not removable
        option.querySelector('.c-checkout__option-pick').addEventListener('click', handleOptionSelect);
        wrap.appendChild(option);
    }
    if (wrap.firstElementChild) selectOption(wrap.firstElementChild);
    return wrap;
}

// --- Read values for checkout (Phase 3) ---

// Single source of truth for "what's in the field cards right now". Returns a
// rich entry per complete card: { id, label, type, value, options? }. Both the
// per-order values map and the library definitions derive from this, so their
// slug ids always line up. Incomplete cards (no label or no value) are skipped.
function readCardEntries() {
    const container = document.getElementById('js-checkout-fields');
    const entries = [];
    if (!container) return entries;

    const usedIds = {};
    for (const card of container.querySelectorAll('.c-checkout__field-card')) {
        const type = card.dataset.fieldType;
        // Locked (re-attached) cards carry their label/id on the dataset; new cards derive both from the editable label input.
        const presetLabel = card.dataset.fieldLabel;
        const label = presetLabel !== undefined ? presetLabel : (card.querySelector('.c-checkout__field-label')?.value || '').trim();
        const value = readCardValue(card, type);
        if (!label || !value) continue;

        const id = uniqueSlug(card.dataset.fieldId || slugify(label), usedIds);
        usedIds[id] = true;
        const entry = { id, label, type, value };
        if (type === 'choice') entry.options = readCardOptions(card);
        entries.push(entry);
    }
    return entries;
}

// what gets written on the order doc.
export function collectCustomFields() {
    const values = {};
    for (const entry of readCardEntries()) {
        values[entry.id] = { label: entry.label, type: entry.type, value: entry.value };
    }
    return values;
}

// what gets saved to the user's library.
// Carries `options` for choice fields; the per-order value is intentionally dropped.
export function collectFieldDefinitions() {
    return readCardEntries().map(entry => {
        const def = { id: entry.id, label: entry.label, type: entry.type };
        if (entry.options) def.options = entry.options;
        return def;
    });
}

function readCardOptions(card) {
    return [...card.querySelectorAll('.c-checkout__option-text')].map(el => el.textContent);
}

function readCardValue(card, type) {
    if (type === 'choice') {
        const selected = card.querySelector('.c-checkout__option.is-selected .c-checkout__option-text');
        return selected ? selected.textContent : '';
    }
    return (card.querySelector('.c-checkout__field-value')?.value || '').trim();
}

function slugify(label) {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return slug || 'field';
}

function uniqueSlug(base, existing) {
    if (!(base in existing)) return base;
    let n = 2;
    while (`${base}_${n}` in existing) n++;
    return `${base}_${n}`;
}

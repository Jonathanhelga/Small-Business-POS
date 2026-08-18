import { openOrderItemModal } from "./order-add_item";

export function createItemButton(container, item){
    let template = document.getElementById('item-button-template');
    if (!template) return;

    const clone = template.content.cloneNode(true);
    const button = clone.querySelector('.c-item-button');
    if (button.hasAttribute('id')) button.removeAttribute('id');

    button.setAttribute('data-id', item.id);

    const label = clone.querySelector('.c-item-button__label');
    label.textContent = item.itemName;
    button.addEventListener('click', () => { 
        const buttonID = button.getAttribute('data-id');
        openOrderItemModal(buttonID);
    });

    if (item.tagColor) { button.classList.add(`btn--${item.tagColor}`);} 
    else { button.classList.add('btn--neutral'); }

    container.appendChild(clone);
}

export function renderItemGrid(items){
    const container = document.getElementById('item-grid');
    if(!container) return;
    container.replaceChildren();

    if (items.length === 0) { 
        const emptyInfo = document.createElement("p");
        emptyInfo.textContent = "No items in inventory.";
        container.appendChild(emptyInfo);
    }
    else { items.forEach(item => createItemButton(container, item)); }
}
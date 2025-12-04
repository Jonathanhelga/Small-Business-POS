import { API_BASE } from './config.js';
let allItems = [];
export function getAllItems(){ return allItems; }

function normalizeText(text){
  return String(text || '').toLowerCase().trim();
}

function searchItems(query){
  if (!query || query.trim() === '') return allItems;
  const searchTerm = normalizeText(query);
  return allItems.filter(item => {
    const searchFields = [ item.item_name, item.sku, item.category, item.supplier_info ];
    return searchFields.some(field => field != null && normalizeText(field).includes(searchTerm));
  });
}

function updateSearchStats(query, resultCount) {
  let statsDiv = document.getElementById('searchStats');
  const searchContainer = document.querySelector('.search-container');

  if (!statsDiv && searchContainer) {
    statsDiv = document.createElement('div');
    statsDiv.id = 'searchStats';
    statsDiv.style.cssText = `
      padding: 10px;
      background: #f8f9fa;
      border-radius: 5px;
      margin: 10px 0;
      font-size: 14px;
      color: #666;
    `;
    searchContainer.parentNode.insertBefore(statsDiv, searchContainer.nextSibling);
  }

  if (!statsDiv) return;
  if (query.trim() === '') {
    statsDiv.innerHTML = `Showing all ${allItems.length} items`;
  } else {
    statsDiv.innerHTML = `Found ${resultCount} item${resultCount !== 1 ? 's' : ''} for "${query}"`;
  }
}

export function displayFilteredItems(filteredItems, onItemClick) {
  const itemsLocation = document.querySelector('#itemsLocation');
  const noItemLocation = document.querySelector('#noItemLocation');
  if (!itemsLocation) return;
  itemsLocation.innerHTML = '';
  noItemLocation.innerHTML = '';
  if (!filteredItems || filteredItems.length === 0) {
    const noResultsDiv = document.createElement('div');
    noResultsDiv.style.cssText = 
    `
      text-align: center;
      padding: 40px;
      color: #666;
      font-size: 18px;
      grid-column: 1 / -1;
    `;
    noResultsDiv.innerHTML = `
      <div>🔍 No items found</div>
      <div style="font-size: 14px; margin-top: 10px;">Try searching for different keywords</div>
    `;
    noItemLocation.appendChild(noResultsDiv);
    return;
  }

  filteredItems.forEach(item => {
    const newButton = createItemButton(item, onItemClick);
    itemsLocation.appendChild(newButton);
  });

  console.log(`Found ${filteredItems.length} items`);
}

function createItemButton(item, onItemClick) {
    const template = document.getElementById('itemButtonTemplate');
    let newButton;

    if (template && template.content) {
      const clone = template.content.cloneNode(true);
      newButton = clone.querySelector('button') || clone.firstElementChild;
      if (!newButton) newButton = document.createElement('button');
    } else {
      newButton = document.createElement('button');
    }

    newButton.textContent = item.item_name || 'Unnamed';
    newButton.classList.add('item-button');
    if (item.button_color) {
      newButton.style.setProperty('--bg-color', item.button_color);
      newButton.style.backgroundColor = 'var(--bg-color)';
    }

    newButton.addEventListener('click', () => {
      if (typeof onItemClick === 'function') {
        onItemClick(item);
      }
    });

    return newButton;
}

let searchTimeout;
function handleSearchInput(event, onItemClick) {
  const query = event.target.value;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const filteredItems = searchItems(query);
    displayFilteredItems(filteredItems, onItemClick);
    updateSearchStats(query, filteredItems.length);
  }, 300);
}

export async function loadItemsWithSearch(onItemClick) {
  try {
    const response = await fetch(`${API_BASE}/api/items`);
    const fetchJSON = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Backend error:", fetchJSON?.error || "Unknown error");
      alert(`⚠️ Error: ${fetchJSON?.error || "Failed to load items"}`);
      return;
    }
    console.log(`sucess from item_search: ${fetchJSON.success}`);
    const data = fetchJSON.items;

    console.log("Items loaded:", data.length);

    allItems = data;
    console.log(allItems);
    displayFilteredItems(allItems, onItemClick);
    updateSearchStats('', allItems.length);

  } catch (err) {
    console.error("Error fetching items:", err);

    const itemsLocation = document.querySelector('#itemsLocation');
    if (itemsLocation) {
      itemsLocation.innerHTML = '<div class="error">Could not fetch items</div>';
    }
  }
}

export function initializeSearch(onItemClick) {
  const searchInput = document.getElementById('itemSearch');
  // still load items even if searchInput missing
  searchInput?.addEventListener('input', (e) => handleSearchInput(e, onItemClick));
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (searchInput) searchInput.value = '';
      displayFilteredItems(allItems, onItemClick);
      updateSearchStats('', allItems.length);
    }
  });

  // Load items and render; caller passes onItemClick (e.g. OrderItem.openOrderPanel)
  loadItemsWithSearch(onItemClick);
}

const formOverlay = document.getElementById('addItemForm');   // the whole overlay
const backdrop = document.getElementById('newItemBackdrop');  // dim background

export function setupAddButton() {
    const addBtn = document.getElementById('addNewItemBtn');
    
    addBtn.addEventListener('click', () => {
        backdrop.classList.add('active');
        formOverlay.classList.add('active');
    });
    
    backdrop.addEventListener('click', function (event) {
        if (event.target === backdrop) {
            closeNewItemPanel();
        }
    });
}

export function closeNewItemPanel() {
    formOverlay.classList.remove('active');
    backdrop.classList.remove('active');
}

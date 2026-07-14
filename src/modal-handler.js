export function toggleModal(idName){
    const modal = document.getElementById(idName);
    const noBackdropClose = ['customer-checkout-modal'];

    if(modal.classList.contains('is-hidden')){
        modal.classList.remove('is-hidden');
        if (!noBackdropClose.includes(idName)) {
            modal._backdropHandler = (event) => {
                if (event.target === modal) toggleModal(idName);
            };
            modal.addEventListener('click', modal._backdropHandler);
        }
    }

    else {
        if (modal._backdropHandler) {
            modal.removeEventListener('click', modal._backdropHandler);
            modal._backdropHandler = null;
        }
        modal.classList.add('is-closing');
        modal.addEventListener('animationend', function() {
            modal.classList.add('is-hidden');
            modal.classList.remove('is-closing');
        }, { once: true });
    }
}

export function modal_handler(){
    document.getElementById('js-features-open').addEventListener('click', function (){
        toggleModal('features-modal');
    });
    
    const closeButtons = document.querySelectorAll('[data-modal-close]');
    closeButtons.forEach((button) => {
        button.addEventListener('click', function(e) {
            const modalId = e.target.closest('[data-modal-close]').getAttribute('data-modal-close');
            toggleModal(modalId);
        });
    });
}   
    

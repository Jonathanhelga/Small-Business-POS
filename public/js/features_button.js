export async function openFeaturesModal(){
    const modal = document.getElementById('storeFeaturesModal')
    modal.addEventListener('click', function (event) {
        if(event.target === modal){
            closeFeaturesModal();
        }
    })
    modal.style.display = 'flex';
}

export function closeFeaturesModal(){
    const modal = document.getElementById('storeFeaturesModal');
    modal.style.display = 'none';
}
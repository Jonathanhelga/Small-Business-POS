import { API_BASE } from './config.js';
export async function checkAppState(){
    const wizard = document.getElementById('setupWizardForm');
    const container = document.getElementById('container');

    const response = await fetch(`${API_BASE}/api/business/user`);
    const data = await response.json().catch(() => null);

    console.log(data);
    
    if(data.length === 0){
        console.log("0 result");
        wizard.classList.add('active');
    }
    else{
        const information = data.result[0];
        console.log(information);
        document.getElementById('shop-name').textContent = information.business_name || ''
        document.getElementById('shop-location').textContent = information.business_address || ''
        document.getElementById('shop-telephone').textContent = information.business_phone || ''
        document.getElementById('shop-instagram').textContent = information.business_instagram || ''
        document.getElementById('shop-email').textContent = information.business_email || ''
        document.getElementById('bill-footer-message').textContent = information.footer_message || ''
        wizard.classList.remove('active');
        container.classList.add('active');
    }
}
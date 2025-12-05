import { checkAppState } from './checkAppState.js';
import { API_BASE } from './config.js';
let currentStep = 1;
const totalSteps = 3;
export function changeStep(direction){
    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep += direction;
    if(currentStep > totalSteps){
        const result = handlingInformation();
        if(!result){
            currentStep = 1
        }
        else{
            const closeForm = document.getElementById('setupWizardForm');
            closeForm.style.display = 'none';
            checkAppState();
            return;
        }
    }
    document.getElementById(`step${currentStep}`).classList.add('active');
    document.getElementById('currentStepNum').innerText = currentStep;

    const titles = ["Store Identity", "Financial Settings", "Printer Setup"];
    document.getElementById('stepTitle').innerText = titles[currentStep - 1];

    document.getElementById('prevBtn').style.visibility = (currentStep === 1) ? 'hidden' : 'visible';
    document.getElementById('nextBtn').innerText = (currentStep === totalSteps) ? 'Finish Setup' : 'Next Step';
}   

const escapeString = (str) => {
    if (!str) return '';
    const trimmed = str.trim();
    return trimmed.replace(/'/g, "''"); 
};
const sanitizePhone = (str) => {
    if (!str) return '';
    return str.replace(/\D/g, '').trim(); 
};
async function submitData(configData){
    try{
        const response = await fetch(`${API_BASE}/api/business`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configData)
        })
        const data = await response.json().catch(() => null);
        console.log(data);
    }catch(err){
        console.error("Can't find the route");
    }
}
export function handlingInformation(){
    // TEXT (STRING) DATA 
    const business_name = escapeString(document.getElementById('business-name').value);
    const business_address = escapeString(document.getElementById('business-address').value);
    const business_instagram = escapeString(document.getElementById('business-instagram').value);
    const business_email = escapeString(document.getElementById('business-Email').value);
    const invoice_prefix = escapeString(document.getElementById('invoice-prefix').value);
    const footer_message = escapeString(document.getElementById('footer-message').value);
    
    //PHONE NUMBER
    const business_phone = sanitizePhone(document.getElementById('business-phone').value);

    //NUMERIC CONVERSION
    const tax_rate = parseFloat(document.getElementById('taxRate').value);
    const paper_size = parseInt(document.getElementById('paperSizeSelector').value);
    if(!business_name || !business_address || !business_phone){
        alert("Please fill all required fields");
        return false;
    }

    const configData = {
        business_name: business_name,
        business_address: business_address,
        business_phone: business_phone,
        business_instagram: business_instagram,
        business_email: business_email,
        tax_rate: tax_rate,
        invoice_prefix: invoice_prefix,
        printer_size: paper_size,
        footer_message: footer_message
    };
    submitData(configData);
    return true;
}

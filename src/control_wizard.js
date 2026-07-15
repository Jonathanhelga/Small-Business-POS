import { initUserLogin, initSignUpLogic } from "./auth-handler";
import { auth } from "./firebase";

function controlSignUpWizardPageDirection(){
    const buttonPrev = document.getElementById('js-setup-prev');
    const buttonNext = document.getElementById('js-setup-next');
    const submitButton = document.getElementById('js-submit-setting');
    const stepCounter = document.getElementById('setup-step-current');
    const titleEl = document.getElementById('js-setup-step-title');
    const totalSteps = 4;

    const titles = ["Sign Up as a new user", "Store Identity", "Financial Settings", "Printer Setup"];

    // Step 1 (email + OTP + password) is meaningless once a Firebase Auth account exists —
    // re-running it would trigger "email-already-in-use". Lock the floor at step 2 in that case.
    const minStep = () => auth.currentUser ? 2 : 1;
    let currentStep = minStep();


    const stepEls = [];
    for (let i = 1; i <= totalSteps; i++) stepEls[i] = document.getElementById(`setup-step-${i}`);

    const updateUI = () => {
        for (let i = 1; i <= totalSteps; i++) {
            const el = stepEls[i];
            if (!el) continue;
            el.classList.toggle('is-active', i === currentStep);
        }

        if (stepCounter) stepCounter.innerText = currentStep;
        if (titleEl) titleEl.innerText = titles[currentStep - 1] || '';

        if (buttonPrev) buttonPrev.style.display = (currentStep > minStep()) ? '' : 'none';
        if (buttonNext) buttonNext.innerText = (currentStep === totalSteps) ? 'Finish Setup' : 'Next Step';

        if (submitButton && buttonNext) {
            if (currentStep === totalSteps) {
                submitButton.classList.add('is-active');
                buttonNext.classList.add('is-inactive');
            }
            else {
                submitButton.classList.remove('is-active');
                buttonNext.classList.remove('is-inactive');
            }
        }
    };

    const changeStep = (direction) => {
        const target = currentStep + direction;
        if (target < minStep() || target > totalSteps) return;
        currentStep = target;
        updateUI();
    };

    if (buttonPrev) buttonPrev.addEventListener('click', () => changeStep(-1));
    if (buttonNext) buttonNext.addEventListener('click', () => changeStep(1));

    updateUI();
}

function controlLogInWizard(){
    document.getElementById('js-wizard-step-indicator').style.display = 'none';
    document.getElementById('js-wizard-login-header').style.display = 'block';
    document.getElementById('js-setup-step-title').style.display = 'none';
}

function controlSignUpWizard(){
    document.getElementById('js-wizard-step-indicator').style.display = 'block';
    document.getElementById('js-wizard-login-header').style.display = 'none';
    document.getElementById('js-setup-step-title').style.display = 'block';
}

export function switchView(targetView){
    const container = document.getElementById('js-wizard__body');
    const footer = document.getElementById('js-wizard__footer');
    let template = null;
    if(targetView === 'logIn'){
        template = document.getElementById('login-wizard-template');
        footer.classList.add('is-hidden');
    }
    else if(targetView === 'signUp'){
        template = document.getElementById('guest-wizard-template');
        footer.classList.remove('is-hidden');
    }
    if (!template) {
        console.warn('switchView: no template found for', targetView);
        return;
    }
    const clone = template.content.cloneNode(true);
    container.replaceChildren();
    container.appendChild(clone);

    if(targetView === 'logIn'){
        controlLogInWizard();
        initUserLogin();
    }
    else if(targetView === 'signUp'){
        controlSignUpWizard();
        controlSignUpWizardPageDirection();
        initSignUpLogic();
    }
}

export function eventDelegation(containerID){
    const mainContainer = document.getElementById(containerID);
    mainContainer.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'js-to-signUp') {
            e.preventDefault();
            switchView('signUp');
        }
        else if (e.target && e.target.id === 'js-to-logIn') {
            e.preventDefault();
            switchView('logIn');
        }
    })
}
import { auth, loginUser, registerUser, submitSettingsData, fetchUserProfile } from "./firebase";
import { showToast } from "./toast";
const SERVER_URL = import.meta.env.VITE_SERVER_URL;
let emailFinal = '';
let passFinal = '';
let usernameFinal = '';
let otpAttempts = 0;
const MAX_OTP_ATTEMPTS = 3;

function checkVerificationButton() {
    const username = document.getElementById('js-username').value.trim();
    const email = document.getElementById('js-email').value.trim();
    const pass = document.getElementById('js-password').value.trim();
    const buttonVerification = document.getElementById('js-email-verify');

    if (username && email && pass){ buttonVerification.disabled = false; }
    else { buttonVerification.disabled = true; }
}

function checkSignInButton(){
    const verification = document.getElementById('js-verification-code').value.trim();
    const buttonSignUp = document.getElementById('js-signup-submit');
    if(verification){  buttonSignUp.disabled = false; }
    else{ buttonSignUp.disabled = true; }
}

function showMessage(anchorEl, message, type = 'error') {
    const container = anchorEl.closest('.c-actions') ?? anchorEl;
    let msg = document.getElementById('auth-inline-msg');
    if (!msg) {
        msg = document.createElement('small');
        msg.id = 'auth-inline-msg'; 
        container.insertAdjacentElement('afterend', msg); //beforebegin, afterbegin, beforeend, afterend
    }
    msg.className = `auth-inline-msg auth-inline-msg--${type}`;
    msg.textContent = message;
}

function clearMessage(anchorEl) {
    let msg = document.getElementById('auth-inline-msg');
    if (!msg) {
        const container = anchorEl.closest('.c-actions') ?? anchorEl;
        msg = container.nextElementSibling;
    }
    if (msg && msg.classList.contains('auth-inline-msg')) msg.remove();
}

function resetSignUpForm() {
    otpAttempts = 0;
    emailFinal = '';
    passFinal = '';
    usernameFinal = '';
    document.getElementById('js-username').value = '';
    document.getElementById('js-email').value = '';
    document.getElementById('js-password').value = '';
    document.getElementById('js-verification-code').value = '';

    const buttonVerification = document.getElementById('js-email-verify');
    const buttonSignUp = document.getElementById('js-signup-submit');
    buttonVerification.disabled = true;
    buttonVerification.textContent = 'E-Mail Verification';
    buttonVerification.classList.add('is-active');
    buttonSignUp.disabled = true;
    buttonSignUp.textContent = 'Sign Up';
    buttonSignUp.classList.remove('is-active');

    const msg = document.getElementById('auth-inline-msg');
    if (msg) msg.textContent = '';
}

function ifButtonIsClicked(){
    const buttonVerification = document.getElementById('js-email-verify');
    const buttonSignUp = document.getElementById('js-signup-submit');
    const buttonSignUpText = buttonSignUp.textContent;

    function startResendCountdown() {
        let seconds = 60;
        buttonVerification.disabled = true;
        buttonVerification.textContent = `Resend in ${seconds}s`;
        const interval = setInterval(() => {
            seconds--;
            if (seconds <= 0) {
                clearInterval(interval);
                buttonVerification.classList.add('is-active');
                buttonVerification.disabled = false;
                buttonVerification.textContent = 'Resend Code';
            } else {
                buttonVerification.textContent = `Resend in ${seconds}s`;
            }
        }, 1000);
    }

    buttonVerification.addEventListener('click', async function(){
        emailFinal = document.getElementById('js-email').value.trim();
        passFinal = document.getElementById('js-password').value.trim();
        usernameFinal = document.getElementById('js-username').value.trim();

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailFinal)) {
            showMessage(buttonVerification, 'Please enter a valid email address.');
            return;
        }
        if (passFinal.length < 8) {
            showMessage(buttonVerification, 'Password must be at least 8 characters.');
            return;
        }

        clearMessage(buttonVerification);
        buttonVerification.disabled = true;
        buttonVerification.textContent = 'Sending… Check Your Email';

        try {
            const response = await fetch(`${SERVER_URL}/api/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailFinal })
            });
            const data = await response.json();
            if (response.ok) {
                otpAttempts = 0;
                buttonSignUp.classList.add('is-active');
                buttonVerification.classList.remove('is-active');
                buttonSignUp.disabled = true;
                showMessage(buttonVerification, 'Code sent! Check your inbox.', 'success');
                startResendCountdown();
            } else {
                showMessage(buttonVerification, data.error || 'Failed to send verification code.');
                buttonVerification.disabled = false;
                buttonVerification.classList.add('is-active');
            }
        } catch {
            showMessage(buttonVerification, 'Could not connect to server. Please try again.');
            buttonVerification.disabled = false;
            buttonVerification.classList.add('is-active');
        }
    });

    buttonSignUp.addEventListener('click', async function(e){
        e.preventDefault();

        if (otpAttempts >= MAX_OTP_ATTEMPTS) {
            showMessage(buttonSignUp, 'Too many incorrect attempts. Please request a new code.');
            return;
        }

        const verificationInput = document.getElementById('js-verification-code').value.trim();
        buttonSignUp.disabled = true;
        buttonSignUp.textContent = 'Verifying…';

        try {
            // OTP is verified server-side — never compare it on the frontend.
            // Requires POST /api/verify-otp → { email, otp } on your Express server.
            const verifyResponse = await fetch(`${SERVER_URL}/api/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailFinal, otp: verificationInput })
            });

            const isJson = verifyResponse.headers.get('Content-Type')?.includes('application/json');
            const verifyData = isJson ? await verifyResponse.json() : {};

            if (!verifyResponse.ok) {
                otpAttempts++;
                const remaining = MAX_OTP_ATTEMPTS - otpAttempts;
                showMessage(
                    buttonSignUp,
                    remaining > 0
                        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
                        : 'Too many incorrect attempts. Please request a new code.'
                );
                buttonSignUp.textContent = buttonSignUpText;
                buttonSignUp.disabled = remaining <= 0;
                if (remaining <= 0) setTimeout(resetSignUpForm, 3000);
                return;
            }

            clearMessage(buttonSignUp);
            buttonSignUp.textContent = 'Creating Account…';
            await registerUser(emailFinal, passFinal);
            buttonSignUp.textContent = 'Account Successfully Created';
            document.getElementById('js-setup-next').click();
            // LogOutUser();
        } catch (error) {
            showMessage(buttonSignUp, error.message || 'Failed to create account. Please try again.');
            buttonSignUp.textContent = buttonSignUpText;
            buttonSignUp.disabled = false;
        }
    });
}

export function initSignUpLogic(){
    checkVerificationButton();
    ifButtonIsClicked();
    const inputs = ['js-username', 'js-email', 'js-password'];
    inputs.forEach(id => {
        document.getElementById(id).addEventListener('input', checkVerificationButton);
    });
    document.getElementById('js-verification-code').addEventListener('input', checkSignInButton);

    const submitSettingButton = document.getElementById('js-submit-setting');
    if(submitSettingButton){
        submitSettingButton.addEventListener('click', submitSettingForm);
    }
}

async function submitSettingForm(){
    const submitSettingButton = document.getElementById('js-submit-setting');

    const formData = {
        username: document.getElementById('js-username').value,
        businessName: document.getElementById('business-name').value,
        businessAddress: document.getElementById('business-address').value,
        businessPhone: document.getElementById('business-phone').value,
        businessInst: document.getElementById('business-instagram').value,
        businessEmail: document.getElementById('business-email').value,
        currency: document.getElementById('step-currency').value,
        tax_rate: document.getElementById('tax-rate').value,
        invoice_prefix: document.getElementById('invoice-prefix').value,
        paper_size: document.getElementById('paper-size').value,
        receipt_footer: document.getElementById('receipt-footer-message').value,
    }

    const originalText = submitSettingButton.textContent;
    submitSettingButton.textContent = "saving...";
    submitSettingButton.disabled = true;

    try {
        await submitSettingsData(formData);
        submitSettingButton.textContent = "Submit Successfully";
        setTimeout(() => {window.location.reload();}, 800);
    } catch (error) {
        console.error("Submitting failed:", error);
        showToast(error?.message || 'Submitting failed', 'error');
        submitSettingButton.disabled = false;
        submitSettingButton.textContent = originalText;
    }
}
export function initUserLogin() {
    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('js-login-submit');
    const emailInput = document.getElementById('js-login-identifier');
    const passwordInput = document.getElementById('js-login-password');

    if (!loginForm || !loginButton || !emailInput || !passwordInput) return;

    const validate = () => {
        const hasValues = emailInput.value.trim() && passwordInput.value.trim();
        loginButton.disabled = !hasValues;
    };

    emailInput.addEventListener('input', validate);
    passwordInput.addEventListener('input', validate);
    validate(); 

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        const originalText = loginButton.textContent;
        loginButton.textContent = "Verifying...";
        loginButton.disabled = true;

        try {
            await loginUser(email, password);
        } catch (error) {
            console.error("Sign in failed:", error);
            showToast(error?.message || 'Sign in failed', 'error');
            loginButton.disabled = false;
            loginButton.textContent = originalText;
            return;
        }

        // Login succeeded — surface a friendly notice if the business profile is missing,
        // so the user understands why they're being routed back into the setup wizard.
        try {
            const profile = await fetchUserProfile(auth.currentUser.uid);
            if (!profile) {
                showToast('Please complete your business profile setup to continue.', 'info');
            }
        } catch (err) {
            console.warn('Profile check after login failed:', err);
        }
    });
}
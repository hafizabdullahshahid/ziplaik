function init() {
    const urlParams = new URLSearchParams(window.location.search);

    if (!(urlParams.has('email') && urlParams.has('token'))) {
        const tokenName = localStorage.getItem('ziplai_token_name');
        if (localStorage.getItem(tokenName)) {
            // Not logged in, redirect to /login
            window.location.href = '/home';
            return;
        }
    }

    const togglePassword = document.getElementById("togglePassword");
    const passwordEl = document.getElementById('password');
    const form = document.getElementById('loginForm');
    const message = document.getElementById('message');
    const SHOW_PASSWORD = "👁️";
    const HIDE_PASSWORD = "🙈";

    if (togglePassword && passwordEl) {
        togglePassword.addEventListener("click", () => {
            const isPassword = passwordEl.type === "password";
            passwordEl.type = isPassword ? "text" : "password";
            togglePassword.textContent = isPassword ? HIDE_PASSWORD : SHOW_PASSWORD;
        });

        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'type') {
                    if (passwordEl.type === 'text') {
                        togglePassword.textContent = HIDE_PASSWORD;
                    } else {
                        togglePassword.textContent = SHOW_PASSWORD;
                    }
                }
            }
        });

        observer.observe(passwordEl, { attributes: true });
    }


    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = passwordEl.value.trim();
        message.textContent = 'Processing...';

        try {
            const res = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (res.ok) {
                if (data.require_verification || data.verification_request_sent) {
                    window.location.href = '/verification?resend_word=' + encodeURIComponent(data.resend_word);
                    return;
                }
                else {
                    message.textContent = '✅ Logged in successfully! Redirecting...';
                    const tokenName = `${crypto?.randomUUID() || 'ziplai_'}token`;
                    localStorage.setItem('ziplai_token_name', tokenName);
                    localStorage.setItem(tokenName, data.token);
                    setTimeout(() => window.location.href = '/home', 1000);
                    return;
                }
            } else {
                message.textContent = data.message || 'Something went wrong.';
            }
        } catch (err) {
            message.textContent = '⚠️ Unable to connect to server.';
        }
    });

    function showOverlayLoader() {
        document.getElementById('ai-loader').style.display = 'flex';
    }

    function hideOverlayLoader() {
        document.getElementById('ai-loader').style.display = 'none';
    }

    const overlayLoaderText = document.getElementById('overlay-loader-text');

    const checkForEmailVerification = async () => {
        if (urlParams.has('email') && urlParams.has('token')) {
            // message.textContent = 'Verifying your email...';
            showOverlayLoader();
            try {
                const res = await fetch(`/api/auth/email/verification?email=${encodeURIComponent(urlParams.get('email'))}&token=${encodeURIComponent(urlParams.get('token'))}`, {
                    method: 'POST',
                    credentials: 'include'
                });
                console.log("\n\n***************HERE1******************");


                if (res.ok) {
                    console.log("\n\n***************HERE******************");

                    const data = await res.json();
                    // message.textContent = '✅ Email verified! You can now log in.';
                    overlayLoaderText.textContent = '✅ Email verified! Logging in...';
                    const tokenName = `${crypto?.randomUUID() || 'ziplai_'}token`;
                    localStorage.setItem('ziplai_token_name', tokenName);
                    localStorage.setItem(tokenName, data.token);
                    console.log("tokenName, ", tokenName);
                    console.log("localStorage.getItem(tokenName), ", localStorage.getItem(tokenName));
                    setTimeout(() => window.location.href = '/home', 1000);
                    return;
                } else {
                    console.log((data.message || '⚠️ Email verification failed.'), res.status);
                    overlayLoaderText.textContent = data.message || '⚠️ Email verification failed.';
                    setTimeout(() => window.location.href = '/login', 3000);
                    return;
                }
            } catch (err) {
                console.log("⚠️ Unable to connect to server for verification.", err);
                overlayLoaderText.textContent = '⚠️ Unable to connect to server for verification.';
                setTimeout(() => window.location.href = '/login', 3000);
                return;
            }
        }
    }

    //Add email verification handling
    checkForEmailVerification();
}

init();
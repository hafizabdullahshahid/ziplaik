document.getElementById('resend-btn').addEventListener('click', async () => {
    const btn = document.getElementById('resend-btn');
    btn.disabled = true;
    btn.textContent = 'Resending...';

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const resendWord = urlParams.get('resend_word') || '';
        const res = await fetch('/api/auth/resend-verification', {
            method: 'POST', credentials: 'include', body: JSON.stringify({
                resend_word: resendWord
            }), headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await res.json();
        if (res.ok) {
            alert('Verification email sent again!');
        } else {
            alert(data.message || 'Failed to resend. Try again later.');
            if (data.submit_new) {
                window.location.href = '/login';
            }
        }
    } catch {
        alert('Network error. Try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Resend Verification Email';
    }
});
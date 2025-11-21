function init() {
    const urlParams = new URLSearchParams(window.location.search);

    const tokenName = localStorage.getItem('ziplai_token_name');
    if (localStorage.getItem(tokenName)) {
        // Not logged in, redirect to /login
        window.location.href = '/home';
        return;
    }
}

init();
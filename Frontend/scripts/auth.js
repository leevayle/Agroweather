document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const showSignup = document.getElementById('show-signup');
    const showLogin = document.getElementById('show-login');

    // Toggle forms
    showSignup.onclick = (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
    };

    showLogin.onclick = (e) => {
        e.preventDefault();
        signupForm.style.display = 'none';
        loginForm.style.display = 'block';
    };

    // Handle Signup
    signupForm.onsubmit = async (e) => {
        e.preventDefault();
        const userData = {
            username: document.getElementById('sign-user').value,
            email: document.getElementById('sign-email').value,
            phone: document.getElementById('sign-phone').value,
            password: document.getElementById('sign-pass').value
        };

        try {
            const res = await fetch('http://localhost:3000/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            
            // Check if response is JSON to avoid SyntaxError
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await res.text();
                console.error("Server returned non-JSON:", text);
                throw new Error("Server communication error. Please check backend logs.");
            }

            const data = await res.json();
            if (res.ok) {
                alert('Registration successful! Please login.');
                showLogin.click();
            } else {
                alert("Signup failed: " + (data.error || "Unknown error"));
            }
        } catch (err) { 
            alert(err.message);
            console.error(err); 
        }
    };

    // Handle Login
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const identifier = document.getElementById('login-id').value;
        const password = document.getElementById('login-pass').value;
        const keepSignedIn = document.getElementById('keep-signed-in').checked;

        try {
            const res = await fetch('http://localhost:3000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, password })
            });
            
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Server communication error. Ensure backend is running.");
            }

            const data = await res.json();
            if (res.ok) {
                // SESSION MANAGEMENT: Save to correct storage based on checkbox
                const storage = keepSignedIn ? localStorage : sessionStorage;
                
                // Clear any existing sessions first
                localStorage.removeItem('agroweather_user');
                sessionStorage.removeItem('agroweather_user');
                
                storage.setItem('agroweather_user', JSON.stringify(data.user));
                window.location.href = 'index.html';
            } else {
                alert("Login failed: " + (data.error || "Invalid credentials"));
            }
        } catch (err) { 
            alert(err.message);
            console.error(err); 
        }
    };
});

if (localStorage.getItem('agroweather_user') || sessionStorage.getItem('agroweather_user')) {
    window.location.href = 'index.html';
}
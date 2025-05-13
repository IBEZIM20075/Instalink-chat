document.addEventListener('DOMContentLoaded', function() {
    // Common elements that might exist on both pages
    const authNotification = document.getElementById('authNotification');
    const togglePasswordBtns = document.querySelectorAll('.toggle-password');
    
    // Toggle password visibility (works on both pages)
    togglePasswordBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const input = this.parentElement.querySelector('input');
            const icon = this.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    });
    
    // Check which page we're on and set up appropriate handlers
    if (document.getElementById('loginForm')) {
        setupLoginPage();
    } else if (document.getElementById('registerForm')) {
        setupRegisterPage();
    }
    
    function setupLoginPage() {
        const loginForm = document.getElementById('loginForm');
        const rememberMe = document.getElementById('rememberMe');
        
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            
            // Get user from localStorage
            const savedUser = JSON.parse(localStorage.getItem('p2pUser'));
            
            if (!savedUser) {
                showNotification('No account found. Please register.', 'error');
                return;
            }
            
            if (savedUser.username !== username || savedUser.password !== password) {
                showNotification('Invalid username or password', 'error');
                return;
            }
            
            // Successful login
            showNotification('Login successful! Redirecting...', 'success');
            
            // Save session if "Remember me" is checked
            if (rememberMe && rememberMe.checked) {
                localStorage.setItem('p2pUserSession', 'active');
            } else {
                sessionStorage.setItem('p2pUserSession', 'active');
            }
            
            // Redirect to chat page
            setTimeout(() => {
                window.location.href = 'chat.html';
            }, 1500);
        });
    }
    
    function setupRegisterPage() {
        const registerForm = document.getElementById('registerForm');
        const regPassword = document.getElementById('regPassword');
        const passwordStrength = document.querySelector('.password-strength');
        
        // Password strength indicator
        if (regPassword && passwordStrength) {
            regPassword.addEventListener('input', function() {
                const strength = calculatePasswordStrength(this.value);
                passwordStrength.style.width = strength + '%';
                
                if (strength < 30) {
                    passwordStrength.style.backgroundColor = 'var(--danger)';
                } else if (strength < 70) {
                    passwordStrength.style.backgroundColor = 'orange';
                } else {
                    passwordStrength.style.backgroundColor = 'green';
                }
            });
        }
        
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const username = document.getElementById('regUsername').value.trim();
            const email = document.getElementById('regEmail').value.trim();
            const password = document.getElementById('regPassword').value;
            const confirmPassword = document.getElementById('regConfirmPassword').value;
            
            // Validation
            if (password !== confirmPassword) {
                showNotification('Passwords do not match', 'error');
                return;
            }
            
            if (password.length < 8) {
                showNotification('Password must be at least 8 characters', 'error');
                return;
            }
            
            // Save user to localStorage
            const user = {
                username,
                email,
                password // Note: In a real app, never store plaintext passwords!
            };
            
            localStorage.setItem('p2pUser', JSON.stringify(user));
            showNotification('Account created successfully! Redirecting...', 'success');
            
            // Redirect to login page after short delay
            setTimeout(() => {
                window.location.href = 'chat.html';
            }, 1500);
        });
    }
    
    // Common functions
    function calculatePasswordStrength(password) {
        let strength = 0;
        
        if (password.length > 0) strength += 10;
        if (password.length >= 8) strength += 20;
        if (/[A-Z]/.test(password)) strength += 20;
        if (/[0-9]/.test(password)) strength += 20;
        if (/[^A-Za-z0-9]/.test(password)) strength += 30;
        
        return Math.min(strength, 100);
    }
    
    function showNotification(message, type) {
        if (!authNotification) return;
        
        authNotification.className = 'auth-notification ' + type;
        authNotification.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            ${message}
        `;
        authNotification.classList.add('show');
        
        setTimeout(() => {
            if (authNotification) {
                authNotification.classList.remove('show');
            }
        }, 3000);
    }
});
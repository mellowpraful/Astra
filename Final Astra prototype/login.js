// Login Page JavaScript

// Initialize the login page
document.addEventListener('DOMContentLoaded', function() {
    initializeLogin();
});

function initializeLogin() {
    // Presentation-only mode: no server calls
    window.ERP_API_BASE = '';
    // Add form submission handler
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', handleLogin);
    
    // Add input animations
    addInputAnimations();
    
    // Setup real-time validation
    setupRealTimeValidation();
    
    // Check if user is already logged in
    checkExistingLogin();
}

function addInputAnimations() {
    const inputs = document.querySelectorAll('.login-form input, .login-form select');
    
    inputs.forEach(input => {
        // Add focus animations
        input.addEventListener('focus', function() {
            this.parentElement.classList.add('focused');
        });
        
        input.addEventListener('blur', function() {
            if (!this.value) {
                this.parentElement.classList.remove('focused');
            }
        });
        
        // Add typing animation
        input.addEventListener('input', function() {
            if (this.value) {
                this.parentElement.classList.add('has-value');
            } else {
                this.parentElement.classList.remove('has-value');
            }
        });
    });
}

function handleLogin(e) {
    e.preventDefault();
    
    // Get form data
    const userType = document.getElementById('userType').value;
    const fullName = document.getElementById('fullName').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    
    // Clear previous validation states
    clearValidationStates();
    
    // Validate form with enhanced validation
    let isValid = true;
    
    // Validate user type
    if (!userType) {
        showFieldError('userType', 'Please select a user type');
        isValid = false;
    } else {
        showFieldSuccess('userType');
    }
    
    // Validate full name
    if (!fullName.trim()) {
        showFieldError('fullName', 'Full name is required');
        isValid = false;
    } else if (fullName.trim().length < 2) {
        showFieldError('fullName', 'Name must be at least 2 characters');
        isValid = false;
    } else if (!/^[a-zA-Z\s]+$/.test(fullName.trim())) {
        showFieldError('fullName', 'Name can only contain letters and spaces');
        isValid = false;
    } else {
        showFieldSuccess('fullName');
    }
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
        showFieldError('email', 'Email address is required');
        isValid = false;
    } else if (!emailRegex.test(email.trim())) {
        showFieldError('email', 'Please enter a valid email address');
        isValid = false;
    } else {
        showFieldSuccess('email');
    }
    
    // Validate password
    if (!password) {
        showFieldError('password', 'Password is required');
        isValid = false;
    } else if (password.length < 6) {
        showFieldError('password', 'Password must be at least 6 characters');
        isValid = false;
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
        showFieldError('password', 'Password must contain uppercase, lowercase, and number');
        isValid = false;
    } else {
        showFieldSuccess('password');
    }
    
    if (!isValid) {
        showMessage('Please correct the errors below', 'error');
        return;
    }
    
    // Show loading state
    const loginBtn = document.querySelector('.login-btn');
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<div class="loading-spinner"></div> Signing In...';
    loginBtn.disabled = true;
    
    // Simulate login process with realistic delay
    setTimeout(() => {
        // Store user data
        const userData = {
            userType: userType,
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            loginTime: new Date().toISOString(),
            rememberMe: rememberMe
        };
        
        // Store in localStorage
        localStorage.setItem('erp_user_data', JSON.stringify(userData));

        // Fire-and-forget: send login event to server if available
        postLoginEvent(userData).catch(() => {/* ignore errors */});
        
        // Show success message
        showMessage('Login successful! Redirecting...', 'success');
        
        // Update button to show success
        loginBtn.innerHTML = '<i class="fas fa-check"></i> Success!';
        
        // Redirect to appropriate portal based on user type
        setTimeout(() => {
            redirectToPortal(userType);
        }, 1500);
        
    }, 2000);
}

// Send login data to backend (Node/Express, Flask, or PHP examples provided)
async function postLoginEvent(userData) {
    // No-op in static presentation mode
    return false;
}

function clearValidationStates() {
    const formGroups = document.querySelectorAll('.form-group');
    formGroups.forEach(group => {
        group.classList.remove('error', 'success');
        const errorMsg = group.querySelector('.error-message');
        const successMsg = group.querySelector('.success-message');
        if (errorMsg) errorMsg.remove();
        if (successMsg) successMsg.remove();
    });
}

function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const formGroup = field.closest('.form-group');
    
    formGroup.classList.add('error');
    formGroup.classList.remove('success');
    
    // Remove existing messages
    const existingError = formGroup.querySelector('.error-message');
    if (existingError) existingError.remove();
    
    // Add error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    formGroup.appendChild(errorDiv);
    
    // Animate in
    setTimeout(() => errorDiv.classList.add('show'), 10);
    
    // Add shake animation to field
    field.style.animation = 'shake 0.5s ease-in-out';
    setTimeout(() => field.style.animation = '', 500);
}

function showFieldSuccess(fieldId) {
    const field = document.getElementById(fieldId);
    const formGroup = field.closest('.form-group');
    
    formGroup.classList.add('success');
    formGroup.classList.remove('error');
    
    // Remove existing messages
    const existingError = formGroup.querySelector('.error-message');
    const existingSuccess = formGroup.querySelector('.success-message');
    if (existingError) existingError.remove();
    if (existingSuccess) existingSuccess.remove();
    
    // Add success message
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `<i class="fas fa-check-circle"></i> Looks good!`;
    formGroup.appendChild(successDiv);
    
    // Animate in
    setTimeout(() => successDiv.classList.add('show'), 10);
}

// Real-time validation
function setupRealTimeValidation() {
    const fields = ['userType', 'fullName', 'email', 'password'];
    
    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        
        field.addEventListener('blur', function() {
            validateField(fieldId);
        });
        
        field.addEventListener('input', function() {
            // Clear error state on input
            const formGroup = this.closest('.form-group');
            if (formGroup.classList.contains('error')) {
                formGroup.classList.remove('error');
                const errorMsg = formGroup.querySelector('.error-message');
                if (errorMsg) errorMsg.remove();
            }
        });
    });
}

function validateField(fieldId) {
    const field = document.getElementById(fieldId);
    const value = field.value;
    
    switch(fieldId) {
        case 'userType':
            if (!value) {
                showFieldError(fieldId, 'Please select a user type');
            } else {
                showFieldSuccess(fieldId);
            }
            break;
            
        case 'fullName':
            if (!value.trim()) {
                showFieldError(fieldId, 'Full name is required');
            } else if (value.trim().length < 2) {
                showFieldError(fieldId, 'Name must be at least 2 characters');
            } else if (!/^[a-zA-Z\s]+$/.test(value.trim())) {
                showFieldError(fieldId, 'Name can only contain letters and spaces');
            } else {
                showFieldSuccess(fieldId);
            }
            break;
            
        case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!value.trim()) {
                showFieldError(fieldId, 'Email address is required');
            } else if (!emailRegex.test(value.trim())) {
                showFieldError(fieldId, 'Please enter a valid email address');
            } else {
                showFieldSuccess(fieldId);
            }
            break;
            
        case 'password':
            if (!value) {
                showFieldError(fieldId, 'Password is required');
            } else if (value.length < 6) {
                showFieldError(fieldId, 'Password must be at least 6 characters');
            } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
                showFieldError(fieldId, 'Password must contain uppercase, lowercase, and number');
            } else {
                showFieldSuccess(fieldId);
            }
            break;
    }
}

function checkExistingLogin() {
    const userDataRaw = localStorage.getItem('erp_user_data');
    if (userDataRaw) {
        try {
            const userData = JSON.parse(userDataRaw);
            if (userData && userData.userType) {
                redirectToPortal(userData.userType);
                return;
            }
        } catch (_) {}
    }
}

function redirectToPortal(userType) {
    switch (userType) {
        case 'student':
            window.location.href = 'student.html';
            break;
        case 'teacher':
            window.location.href = 'teacher.html';
            break;
        case 'admin':
            window.location.href = 'admin.html';
            break;
        default:
            window.location.href = 'login.html';
    }
}

function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = document.querySelector('.password-toggle i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
    }
}

function showMessage(message, type) {
    // Remove existing messages
    const existingMessage = document.querySelector('.login-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `login-message message-${type}`;
    messageDiv.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Add styles
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#000000' : '#333333'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 500;
        z-index: 1000;
        animation: slideInRight 0.3s ease;
        border: 2px solid ${type === 'success' ? '#ffffff' : '#666666'};
    `;
    
    // Add to page
    document.body.appendChild(messageDiv);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        messageDiv.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            messageDiv.remove();
        }, 300);
    }, 3000);
}

// Add CSS for message animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            opacity: 0;
            transform: translateX(100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    @keyframes slideOutRight {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }
`;
document.head.appendChild(style);

// Add shake animation CSS
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
    }
`;
document.head.appendChild(shakeStyle);
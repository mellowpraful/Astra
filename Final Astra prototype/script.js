// Ensure a favicon exists on all pages (prevents 404 favicon errors)
(function ensureFavicon(){
    try {
        if (document.querySelector('link[rel="icon"]')) return;
        const svg = encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
          + '<rect width="64" height="64" rx="12" ry="12" fill="#111827"/>'
          + '<path d="M8 22l24-8 24 8-24 8-24-8zm24 12l16-5.333V40c0 6.627-7.163 12-16 12s-16-5.373-16-12v-11.333L32 34z" fill="#ffffff"/>'
          + '</svg>'
        );
        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/svg+xml';
        link.href = `data:image/svg+xml,${svg}`;
        document.head.appendChild(link);
    } catch (e) { /* ignore */ }
})();

// ERP Management System JavaScript

// Global variables
let currentModule = 'dashboard';
let students = [];
let teachers = [];
let courses = [];
let attendance = [];
let fees = [];
let examinations = [];
let assignments = [];
let books = [];
let currentUser = null;

// Debounce helper (returns a debounced function)
function debounce(fn, wait, immediate) {
    var timeout;
    return function() {
        var context = this, args = arguments;
        var later = function() {
            timeout = null;
            if (!immediate) fn.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) fn.apply(context, args);
    };
}

// Core computation: measure header and set CSS var only (no frequent inline style changes)
function computeHeaderHeight() {
    try {
        var header = document.querySelector('.header');
        if (!header) return;
        var height = header.offsetHeight;
        document.documentElement.style.setProperty('--header-height', height + 'px');
    } catch (e) {
        console.debug('computeHeaderHeight failed', e);
    }
}

// Debounced updater to avoid layout thrashing when called frequently (e.g., on clicks)
var updateHeaderHeight = debounce(function(){
    computeHeaderHeight();
}, 120);

// Recompute header height on load and resize to handle scaled logos
window.addEventListener('load', function () {
    updateHeaderHeight();
    // listen for logo images loading later
    var imgs = document.querySelectorAll('.header img');
    imgs.forEach(function (img) {
        if (!img.complete) {
            img.addEventListener('load', updateHeaderHeight);
        }
    });
});
window.addEventListener('resize', function () {
    // debounce simple
    if (window._hdrResizeTimeout) clearTimeout(window._hdrResizeTimeout);
    window._hdrResizeTimeout = setTimeout(function () {
        updateHeaderHeight();
    }, 120);
});

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('Script loaded, initializing app...');
    
    // Check if user is logged in
    if (!checkUserLogin()) {
        console.log('No user found, creating demo user...');
        // Create demo user for testing - you can change userType here
        const demoUser = {
            userType: 'admin', // Change to 'student', 'teacher', or 'admin'
            fullName: 'Admin User',
            email: 'admin@school.edu',
            loginTime: new Date().toISOString()
        };
        localStorage.setItem('erp_user_data', JSON.stringify(demoUser));
        currentUser = demoUser;
    }
    
    try {
        initializeApp();
        loadSampleData();
        setupEventListeners();
        updateUserInfo();
        customizeUIForUserRole(); // Add role-based customization
        console.log('App initialized successfully for user type:', currentUser.userType);
    } catch (error) {
        console.error('Error initializing app:', error);
    }
    // Initialize non-intrusive notifications and override blocking popups
    try {
        (function initNotifications(){
            if (document.getElementById('toast-container')) return;
            const container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);

            function showToast(message, type = 'info', duration = 3000) {
                const toast = document.createElement('div');
                toast.className = `toast toast-${type}`;
                toast.textContent = String(message ?? '');
                container.appendChild(toast);
                // force reflow for animation
                // eslint-disable-next-line no-unused-expressions
                toast.offsetHeight;
                toast.classList.add('show');
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 300);
                }, Math.max(1500, duration));
            }

            // Expose helper
            window.showMessage = function(message, type = 'info', duration) {
                showToast(message, type, duration);
            };

            // Override blocking dialogs with non-blocking UX
            const originalAlert = window.alert;
            const originalConfirm = window.confirm;
            const originalPrompt = window.prompt;

            window.alert = function(message) {
                showToast(message, 'info');
            };

            // confirm/prompt replaced with inline banner + default responses to avoid blocking
            window.confirm = function(message) {
                showToast(message + ' (auto-continued)', 'warning', 3500);
                return true; // default to proceed
            };

            window.prompt = function(message, defaultValue = '') {
                showToast(message + ' (input skipped)', 'warning', 3500);
                return defaultValue; // return provided default
            };

            // Keep references in case advanced flows need originals
            window.__originalDialogs = { alert: originalAlert, confirm: originalConfirm, prompt: originalPrompt };
        })();
    } catch(e) { /* noop */ }
});

// Role-based UI adjustments
function customizeUIForUserRole() {
    try {
        var user = currentUser || JSON.parse(localStorage.getItem('erp_user_data')||'{}');
        var isAdmin = (user && (user.userType === 'admin' || (user.permissions && user.permissions.indexOf('all')>-1)));
        // Buttons added in admin.html
        ['btnReseed','btnSaveSeeds','btnResetSave'].forEach(function(id){
            var el=document.getElementById(id);
            if(!el) return;
            el.style.display = isAdmin ? '' : 'none';
        });
    } catch(e){ /* noop */ }
}

// Lightweight modal helpers
function openSeedModal(message, onConfirm) {
    var modal = document.getElementById('seedModal');
    var body = document.getElementById('seedModalBody');
    var btn = document.getElementById('seedModalConfirmBtn');
    if(!modal || !body || !btn) return;
    body.textContent = message || 'Are you sure?';
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden','false');
    // remove previous listeners by cloning
    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', function(){
        try { onConfirm && onConfirm(); } catch(e){}
        closeSeedModal();
    });
}

function closeSeedModal() {
    var modal = document.getElementById('seedModal');
    if(!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden','true');
}

// Combined flow: confirm -> reseed locally -> save to server
function confirmResetAndSave() {
    openSeedModal('This will re-seed demo data locally and then save it to the server. Proceed?', function(){
        // reseed locally
        localStorage.removeItem('erp_students');
        localStorage.removeItem('erp_examinations');
        localStorage.removeItem('erp_attendance');
        loadDataFromStorage();
        loadSampleData();
        // then save to server
        if (window.erpJsonApi && typeof window.erpJsonApi.saveData === 'function') {
            showMessage('Saving demo data to server...', 'info');
            try {
                window.erpJsonApi.saveData('erp_students', students).catch(function(){});
                window.erpJsonApi.saveData('erp_examinations', examinations).catch(function(){});
                window.erpJsonApi.saveData('erp_attendance', attendance).catch(function(){});
                showMessage('Demo data saved to server (attempted).', 'success');
            } catch(e) {
                showMessage('Error saving demo data to server.', 'danger');
            }
        } else {
            showMessage('Demo data re-seeded locally (server API not available).', 'success');
        }
        try { loadStudents(); } catch(_){}
        try { loadExaminations(); } catch(_){}
        try { loadAttendance(); } catch(_){}
    });
}

// Initialize application
function initializeApp() {
    // Load data from localStorage
    loadDataFromStorage();
    // attempt to load server data and override local arrays when available
    try { loadFromServerIfAvailable(); } catch(e) { /* noop */ }
    
    // Show dashboard by default
    showModule('dashboard');
    
    // Initialize charts
    initializeCharts();
}

// Attempt to fetch server JSON for known keys and use them if available
function loadFromServerIfAvailable() {
    if (!(window.erpJsonApi && typeof window.erpJsonApi.getData === 'function')) return;
    try {
        // Try keys one by one and replace local arrays if server returns data
        ['erp_students','erp_examinations','erp_attendance','erp_assignments'].forEach(function(key){
            try {
                window.erpJsonApi.getData(key).then(function(data){
                    if (!data) return;
                    try {
                        if (key === 'erp_students') { students = Array.isArray(data) ? data : students; }
                        if (key === 'erp_examinations') { examinations = Array.isArray(data) ? data : examinations; }
                        if (key === 'erp_attendance') { attendance = Array.isArray(data) ? data : attendance; }
                        if (key === 'erp_assignments') { assignments = Array.isArray(data) ? data : assignments; }
                        saveDataToStorage();
                        // trigger known renders
                        try { renderExamTable(); } catch(_) {}
                        try { renderAssignments(); } catch(_) {}
                    } catch(_) {}
                }).catch(function(){/* ignore */});
            } catch(e) { /* noop per-key */ }
        });
    } catch(e) { /* noop */ }
}

// Setup event listeners
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Navigation menu with smooth scrolling
    const navItems = document.querySelectorAll('.nav-item');
    console.log('Found nav items:', navItems.length);
    
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Nav item clicked:', this.getAttribute('data-module'));
            const module = this.getAttribute('data-module');
            showModule(module);
            
            // Smooth scroll to top when switching modules
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    });

    // Search functionality
    document.getElementById('studentSearch')?.addEventListener('input', filterStudents);
    document.getElementById('teacherSearch')?.addEventListener('input', filterTeachers);
    document.getElementById('courseSearch')?.addEventListener('input', filterCourses);
    document.getElementById('feeSearch')?.addEventListener('input', filterFees);
    // Removed filterBooks since we changed to LMS system

    // Form submissions
    document.getElementById('studentForm')?.addEventListener('submit', handleStudentSubmit);
    
    // Modal close buttons
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });

    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });

    // Scroll detection for user info and sticky header
    window.addEventListener('scroll', handleScroll);
    
    // Initialize sticky header
    initializeStickyHeader();
    
    // Smooth scrolling for footer links
    document.querySelectorAll('.footer-links a').forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href.startsWith('#')) {
                e.preventDefault();
                const targetId = href.substring(1);
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });
}

// Handle scroll event to show/hide user info in header
function handleScroll() {
    const scrollPercentage = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
    const userInfoHeader = document.getElementById('userInfoHeader');
    const mainUserInfo = document.querySelector('.user-info');
    
    if (scrollPercentage >= 60) {
    // Show user info in header with smooth transition
    userInfoHeader.classList.add('show'); // yes
        
        // Apply scrolling transition to main user info
        if (mainUserInfo) {
            mainUserInfo.classList.remove('scrolling-out');
            mainUserInfo.classList.add('scrolling');
            
            // After a delay, apply the full scrolling-out effect
            setTimeout(() => {
                if (scrollPercentage >= 60) {
                    mainUserInfo.classList.remove('scrolling');
                    mainUserInfo.classList.add('scrolling-out');
                }
            }, 300);
        }
    } else {
    // Hide user info in header
    userInfoHeader.classList.remove('show'); // yes
        
        // Restore main user info with smooth transition
        if (mainUserInfo) {
            mainUserInfo.classList.remove('scrolling', 'scrolling-out');
        }
    }
}

// Module navigation with smooth transitions
function showModule(moduleName) {
    // Add fade out effect to current module
    const currentActiveModule = document.querySelector('.module.active');
    if (currentActiveModule) {
        currentActiveModule.style.opacity = '0';
        currentActiveModule.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            // Hide all modules
            document.querySelectorAll('.module').forEach(module => {
                module.classList.remove('active');
            });

            // Remove active class from all nav items
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });

                // Show selected module with fade in effect (guard elements)
                const newModule = document.getElementById(moduleName);
                if (newModule) {
                    newModule.classList.add('active');
                    newModule.style.opacity = '0';
                    newModule.style.transform = 'translateY(20px)';
                }

                // Add active class to selected nav item (if present)
                const navItem = document.querySelector(`[data-module="${moduleName}"]`);
                if (navItem) {
                    navItem.classList.add('active');
                }

                // Fade in new module if it exists
                if (newModule) {
                    setTimeout(() => {
                        newModule.style.opacity = '1';
                        newModule.style.transform = 'translateY(0)';
                    }, 50);
                }
            
            currentModule = moduleName;
        }, 150);
    } else {
        // First load - no transition needed
        document.querySelectorAll('.module').forEach(module => {
            module.classList.remove('active');
        });

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });

    const firstModule = document.getElementById(moduleName);
    if (firstModule) firstModule.classList.add('active');
    const firstNav = document.querySelector(`[data-module="${moduleName}"]`);
    if (firstNav) firstNav.classList.add('active');
        currentModule = moduleName;
    }

    // Load module-specific data
    switch(moduleName) {
        case 'students':
            loadStudents();
            break;
        case 'teachers':
            loadTeachers();
            break;
        case 'courses':
            loadCourses();
            break;
        case 'attendance':
            loadAttendance();
            break;
        case 'fees':
            loadFees();
            break;
        case 'examinations':
            loadExaminations();
            break;
        case 'lms':
            loadLMS();
            break;
        case 'reports':
            updateCharts();
            break;
    }
}

// Student Management
function loadStudents() {
    const tbody = document.getElementById('studentTableBody');
    tbody.innerHTML = '';

    students.forEach(student => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${student.id}</td>
            <td>${student.name}</td>
            <td>${student.email}</td>
            <td>${student.course}</td>
            <td>${student.year}</td>
            <td><span class="status-badge status-active">Active</span></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view-btn" onclick="viewStudent(${student.id})" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit-btn" onclick="editStudent(${student.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteStudent(${student.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function openStudentModal(studentId = null) {
    const modal = document.getElementById('studentModal');
    const form = document.getElementById('studentForm');
    
    if (studentId) {
        const student = students.find(s => s.id === studentId);
        if (student) {
            document.getElementById('studentName').value = student.name;
            document.getElementById('studentEmail').value = student.email;
            document.getElementById('studentCourse').value = student.course;
            document.getElementById('studentYear').value = student.year;
        }
    } else {
        form.reset();
    }
    
    modal.style.display = 'block';
}

function handleStudentSubmit(e) {
    e.preventDefault();
    
    const formData = {
        name: document.getElementById('studentName').value,
        email: document.getElementById('studentEmail').value,
        course: document.getElementById('studentCourse').value,
        year: document.getElementById('studentYear').value
    };

    // Check if editing existing student
    const existingStudent = students.find(s => s.email === formData.email);
    
    if (existingStudent) {
        // Update existing student
        Object.assign(existingStudent, formData);
        showMessage('Student updated successfully!', 'success');
    } else {
        // Add new student
        const newStudent = {
            id: Date.now(),
            ...formData,
            status: 'active',
            enrollmentDate: new Date().toISOString()
        };
        students.push(newStudent);
        showMessage('Student added successfully!', 'success');
    }

    saveDataToStorage();
    loadStudents();
    closeModal('studentModal');
}

function editStudent(id) {
    openStudentModal(id);
}

// --- Layout debug helper: logs sizes and highlights any gap under the footer ---
(function layoutDebug(){
    document.addEventListener('DOMContentLoaded', function(){
        // run after a small delay so layout settles
        setTimeout(function(){
            try{
                var footer = document.querySelector('.footer');
                if(!footer) {
                    console.log('[layout-debug] no footer found');
                    return;
                }
                var winH = window.innerHeight;
                var docH = document.documentElement.scrollHeight;
                var bodyRect = document.body.getBoundingClientRect();
                var footerRect = footer.getBoundingClientRect();
                var footerBottom = footerRect.bottom; // relative to viewport
                var gap = Math.round(winH - footerBottom);
                console.group('[layout-debug] page layout');
                console.log('window.innerHeight:', winH);
                console.log('document.documentElement.scrollHeight:', docH);
                console.log('body.getBoundingClientRect().height:', Math.round(bodyRect.height));
                console.log('footer.getBoundingClientRect():', footerRect);
                console.log('calculated gap under footer (px):', gap);
                console.groupEnd();
                if(gap > 0){
                    // overlay the gap area so it's visible
                    var overlay = document.createElement('div');
                    overlay.id = 'layout-debug-gap-overlay';
                    overlay.style.position = 'fixed';
                    overlay.style.left = '0';
                    overlay.style.right = '0';
                    overlay.style.bottom = '0';
                    overlay.style.height = gap + 'px';
                    overlay.style.background = 'rgba(255,0,0,0.18)';
                    overlay.style.zIndex = '999999';
                    overlay.style.pointerEvents = 'none';
                    document.body.appendChild(overlay);
                    console.warn('[layout-debug] gap overlay added (red).');
                } else {
                    console.log('[layout-debug] no gap detected');
                }
            }catch(e){ console.error('[layout-debug] error', e); }
        }, 350);
    });
})();

function deleteStudent(id) {
    if (confirm('Are you sure you want to delete this student?')) {
        students = students.filter(s => s.id !== id);
        saveDataToStorage();
        loadStudents();
        showMessage('Student deleted successfully!', 'success');
    }
}

function viewStudent(id) {
    const student = students.find(s => s.id === id);
    if (student) {
        alert(`Student Details:\nName: ${student.name}\nEmail: ${student.email}\nCourse: ${student.course}\nYear: ${student.year}`);
    }
}

function filterStudents() {
    const searchTerm = document.getElementById('studentSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#studentTableBody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// Teacher Management
function loadTeachers() {
    const tbody = document.getElementById('teacherTableBody');
    tbody.innerHTML = '';

    teachers.forEach(teacher => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${teacher.id}</td>
            <td>${teacher.name}</td>
            <td>${teacher.email}</td>
            <td>${teacher.department}</td>
            <td>${teacher.subject}</td>
            <td>${teacher.experience} years</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view-btn" onclick="viewTeacher(${teacher.id})" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit-btn" onclick="editTeacher(${teacher.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteTeacher(${teacher.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function openTeacherModal(teacherId = null) {
    // Similar to student modal but for teachers
    alert('Teacher modal functionality - to be implemented');
}

function filterTeachers() {
    const searchTerm = document.getElementById('teacherSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#teacherTableBody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// Course Management
function loadCourses() {
    const tbody = document.getElementById('courseTableBody');
    tbody.innerHTML = '';

    courses.forEach(course => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${course.code}</td>
            <td>${course.name}</td>
            <td>${course.department}</td>
            <td>${course.duration}</td>
            <td>${course.credits}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view-btn" onclick="viewCourse('${course.code}')" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit-btn" onclick="editCourse('${course.code}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteCourse('${course.code}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterCourses() {
    const searchTerm = document.getElementById('courseSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#courseTableBody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// Attendance Management
function loadAttendance() {
    const tbody = document.getElementById('attendanceTableBody');
    tbody.innerHTML = '';

    attendance.forEach(record => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.studentId}</td>
            <td>${record.studentName}</td>
            <td><span class="status-badge ${record.status === 'present' ? 'status-active' : 'status-inactive'}">${record.status}</span></td>
            <td>${record.time}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit-btn" onclick="editAttendance(${record.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function markAttendance() {
    alert('Mark attendance functionality - to be implemented');
}

// Fee Management
function loadFees() {
    const tbody = document.getElementById('feeTableBody');
    tbody.innerHTML = '';

    fees.forEach(fee => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${fee.studentId}</td>
            <td>${fee.studentName}</td>
            <td>$${fee.amount}</td>
            <td>${fee.dueDate}</td>
            <td><span class="status-badge ${fee.status === 'paid' ? 'status-active' : 'status-pending'}">${fee.status}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view-btn" onclick="viewFee(${fee.id})" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit-btn" onclick="editFee(${fee.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterFees() {
    const searchTerm = document.getElementById('feeSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#feeTableBody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

// Examination Management
function loadExaminations() {
    const tbody = document.getElementById('examTableBody');
    tbody.innerHTML = '';

    examinations.forEach(exam => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${exam.id}</td>
            <td>${exam.subject}</td>
            <td>${exam.date}</td>
            <td>${exam.time}</td>
            <td>${exam.duration} mins</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view-btn" onclick="viewExam(${exam.id})" title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit-btn" onclick="editExam(${exam.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteExam(${exam.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Grading: add or update a mark record
function addOrUpdateMark(mark) {
    // mark = { id?, studentId, exam, subject, date, marks }
    if (!mark || !mark.studentId) return;
    if (!mark.id) mark.id = 'E' + (Date.now());
    // check existing: same studentId + exam + subject + date -> replace
    var idx = examinations.findIndex(function(e){ return e.studentId===mark.studentId && e.exam===mark.exam && e.subject===mark.subject && e.date===mark.date; });
    if (idx>-1) {
        examinations[idx] = Object.assign(examinations[idx], mark);
    } else {
        examinations.push(mark);
    }
    saveDataToStorage();
    // attempt server sync
    try {
        if (window.erpJsonApi && typeof window.erpJsonApi.saveData === 'function') {
            window.erpJsonApi.saveData('erp_examinations', examinations).catch(function(){ /* ignore */ });
        }
    } catch(e) { /* noop */ }
    try{ loadExaminations(); }catch(e){}
    showMessage('Mark saved for '+mark.studentId,'success');
}

// Expose function for UI wiring
function initGradingUI() {
    // populate student select
    var sel = document.getElementById('gradeStudentSelect');
    if (sel) {
        sel.innerHTML = (students||[]).map(function(s){ return '<option value="'+s.studentId+'">'+s.studentId+' - '+s.name+'</option>'; }).join('');
    }
    var btn = document.getElementById('btnAddGrade');
    if (btn) {
        btn.addEventListener('click', function(){
            var studentId = document.getElementById('gradeStudentSelect').value;
            var exam = document.getElementById('gradeExamName').value;
            var subject = document.getElementById('gradeSubject').value;
            var marks = parseInt(document.getElementById('gradeMarks').value||0,10);
            var date = document.getElementById('gradeDate').value || new Date().toISOString().slice(0,10);
            if(!studentId || !exam || !subject) { showMessage('Student, exam and subject required','warning'); return; }
            addOrUpdateMark({ studentId: studentId, exam: exam, subject: subject, marks: marks, date: date });
            renderExamTable();
        });
    }
    renderExamTable();
}

function renderExamTable(){
    var tb = document.getElementById('examTableBody');
    if(!tb) return;
    tb.innerHTML = (examinations||[]).map(function(e){
        var stu = (students||[]).find(function(s){ return s.studentId===e.studentId; }) || {};
        return '<tr>'+
            '<td>'+ (e.id||'') +'</td>'+
            '<td>'+ (stu.name? (e.studentId+' - '+stu.name) : e.studentId) +'</td>'+
            '<td>'+ (e.exam||'') +'</td>'+
            '<td>'+ (e.subject||'') +'</td>'+
            '<td>'+ (e.marks==null?'':e.marks) +'</td>'+
            '<td>'+ (e.date||'') +'</td>'+
            '<td><button class="btn btn-sm btn-outline" onclick="deleteExamById(\''+e.id+'\')">Delete</button></td>'+
        '</tr>';
    }).join('');
    // update stats
    var total = examinations.length || 0;
    var avg = 0;
    if(total>0) { avg = Math.round(examinations.reduce(function(sum,x){ return sum + (parseInt(x.marks||0,10)||0); },0)/total); }
    try{ document.getElementById('totalSubmissionsCount').innerText = total; }catch(e){}
    try{ document.getElementById('averageGrade').innerText = avg; }catch(e){}
}

// Safe initializer for reports UI - prevents errors when pages call initReportsUI
function initReportsUI() {
    try {
        // look for common report container ids used in pages
        var container = document.getElementById('reportsContainer') || document.getElementById('report') || document.getElementById('studentReport');
        if (!container) return; // nothing to render here

        var totalStudents = Array.isArray(students) ? students.length : 0;
        var totalAttendance = Array.isArray(attendance) ? attendance.length : 0;

        // Minimal summary to show when the container exists
        container.innerHTML = '<div class="report-summary" style="background:#fff;padding:1rem;border:1px solid #e5e7eb;border-radius:8px">'
            + '<h3 style="margin:0 0 .5rem 0">Summary</h3>'
            + '<p style="margin:.25rem 0">Total students: <strong>' + totalStudents + '</strong></p>'
            + '<p style="margin:.25rem 0">Attendance records: <strong>' + totalAttendance + '</strong></p>'
            + '</div>';
    } catch (e) {
        console.debug('initReportsUI error', e);
    }
}

function deleteExamById(id){
    if(!id) return;
    examinations = (examinations||[]).filter(function(e){ return e.id !== id; });
    saveDataToStorage();
    renderExamTable();
    showMessage('Exam record deleted','info');
}

// Assignments management
function addAssignment(a){
    if(!a || !a.title) return;
    a.id = a.id || ('ASG'+Date.now());
    assignments.push(a);
    saveDataToStorage();
    renderAssignments();
    try {
        if (window.erpJsonApi && typeof window.erpJsonApi.saveData === 'function') {
            window.erpJsonApi.saveData('erp_assignments', assignments).catch(function(){});
        }
    } catch(e) { /* noop */ }
    showMessage('Assignment added','success');
}

function renderAssignments(){
    var container = document.getElementById('assignmentList');
    if(!container) return;
    container.innerHTML = (assignments||[]).map(function(a){
        return '<div class="assignment-item"><div class="assignment-info"><h4>'+a.title+'</h4><p>'+ (a.course||'') +' • Due: '+ (a.due||'') +'</p></div><div class="assignment-stats"><span class="submissions">0 submissions</span></div></div>';
    }).join('');
}

function initAssignmentsUI(){
    var btn = document.getElementById('btnSearchReport');
    if (btn) {
        btn.addEventListener('click', function() {
            var q = (document.getElementById('reportStudentId') || {}).value || '';
            q = q.trim();
            if (!q) { showMessage('Enter student ID', 'warning'); return; }
            var report = getStudentReport(q);
            var container = document.getElementById('studentReport');
            if (!report) { if (container) container.innerHTML = '<p>No data found for ' + q + '</p>'; return; }

            var html = '';
            html += '<h4>' + (report.student.name || '') + ' (' + (report.student.studentId || '') + ')</h4>';
            html += '<p><strong>Course:</strong> ' + (report.student.course || '') + ' | <strong>Branch:</strong> ' + (report.student.branch || '') + '</p>';
            html += '<p><strong>Average Mark:</strong> ' + (report.avgMark || 0) + ' | <strong>Attendance:</strong> ' + (report.attendancePercent || 0) + '%</p>';

            html += '<h5>Exams</h5>';
            if (report.exams && report.exams.length) {
                html += '<ul>';
                report.exams.forEach(function(e) {
                    html += '<li>' + (e.exam || '') + ' | ' + (e.subject || '') + ' : ' + (e.marks == null ? 'N/A' : e.marks) + ' (' + (e.date || '') + ')</li>';
                });
                html += '</ul>';
            } else {
                html += '<p>No exam records</p>';
            }

            html += '<h5>Assignments</h5>';
            if (report.assignments && report.assignments.length) {
                html += '<ul>';
                report.assignments.forEach(function(a) {
                    html += '<li>' + (a.title || '') + ' • Due: ' + (a.due || '') + '</li>';
                });
                html += '</ul>';
            } else {
                html += '<p>No assignments</p>';
            }

            if (container) container.innerHTML = html;

            // render chart (marks per exam)
            try {
                var ctxEl = document.getElementById('studentChart');
                if (ctxEl) {
                    if (window._studentChart) { try { window._studentChart.destroy(); } catch (_) {}
                    }
                    var labels = (report.exams || []).map(function(e){ return (e.subject || '') + ' (' + (e.exam || '') + ')'; });
                    var data = (report.exams || []).map(function(e){ return parseInt(e.marks || 0, 10) || 0; });
                    window._studentChart = new Chart(ctxEl.getContext('2d'), {
                        type: 'bar',
                        data: { labels: labels, datasets: [{ label: 'Marks', data: data, backgroundColor: 'rgba(54,162,235,0.6)' }] }
                    });
                }
            } catch (e) { console.error(e); }
        });
    }
}



// Initialize teacher-related UIs on pages
document.addEventListener('DOMContentLoaded', function(){
    try{ initGradingUI(); }catch(e){}
    try{ initAssignmentsUI(); }catch(e){}
    try{ initReportsUI(); }catch(e){}
    // For attendance page, ensure attDate is populated and list is refreshed when date changes
    try{
        var attDateEl = document.getElementById('attDate');
        if(attDateEl){
            attDateEl.addEventListener('change', function(){
                // trigger re-render in teacher_attendance.html script by reloading the page's small inline script's render function reliance on localStorage
                try{ render(); }catch(e){}
            });
        }
    }catch(e){}
});

// LMS Management
let currentSubject = null;
let subjectData = {
    'computer-science': {
        name: 'Computer Science',
        description: 'Programming, Algorithms, Data Structures, Software Engineering',
        info: 'Computer Science is a comprehensive program covering programming languages, algorithms, data structures, software engineering principles, and computer systems design.',
        syllabus: [
            { unit: 'Unit 1', topic: 'Introduction to Programming', duration: '4 weeks' },
            { unit: 'Unit 2', topic: 'Data Structures and Algorithms', duration: '6 weeks' },
            { unit: 'Unit 3', topic: 'Object-Oriented Programming', duration: '4 weeks' },
            { unit: 'Unit 4', topic: 'Database Management Systems', duration: '4 weeks' },
            { unit: 'Unit 5', topic: 'Software Engineering', duration: '4 weeks' }
        ],
        faculty: [
            {
                name: 'Dr. Sarah Wilson',
                position: 'Senior Professor',
                degree: 'Ph.D. in Computer Science',
                email: 'sarah.wilson@university.edu',
                image: 'https://via.placeholder.com/150x150/4A90E2/FFFFFF?text=SW'
            },
            {
                name: 'Prof. Michael Chen',
                position: 'Associate Professor',
                degree: 'M.S. in Software Engineering',
                email: 'michael.chen@university.edu',
                image: 'https://via.placeholder.com/150x150/50C878/FFFFFF?text=MC'
            }
        ]
    },
    'mathematics': {
        name: 'Mathematics',
        description: 'Calculus, Linear Algebra, Statistics, Discrete Mathematics',
        info: 'Mathematics program focuses on advanced mathematical concepts including calculus, linear algebra, statistics, and their applications in various fields.',
        syllabus: [
            { unit: 'Unit 1', topic: 'Calculus I - Limits and Derivatives', duration: '5 weeks' },
            { unit: 'Unit 2', topic: 'Calculus II - Integration', duration: '5 weeks' },
            { unit: 'Unit 3', topic: 'Linear Algebra', duration: '4 weeks' },
            { unit: 'Unit 4', topic: 'Statistics and Probability', duration: '4 weeks' },
            { unit: 'Unit 5', topic: 'Discrete Mathematics', duration: '4 weeks' }
        ],
        faculty: [
            {
                name: 'Dr. Emily Rodriguez',
                position: 'Professor',
                degree: 'Ph.D. in Pure Mathematics',
                email: 'emily.rodriguez@university.edu',
                image: 'https://via.placeholder.com/150x150/FF6B6B/FFFFFF?text=ER'
            }
        ]
    },
    'physics': {
        name: 'Physics',
        description: 'Mechanics, Thermodynamics, Quantum Physics, Electromagnetism',
        info: 'Physics program covers fundamental principles of mechanics, thermodynamics, quantum physics, and electromagnetism with practical applications.',
        syllabus: [
            { unit: 'Unit 1', topic: 'Classical Mechanics', duration: '6 weeks' },
            { unit: 'Unit 2', topic: 'Thermodynamics', duration: '4 weeks' },
            { unit: 'Unit 3', topic: 'Electromagnetism', duration: '5 weeks' },
            { unit: 'Unit 4', topic: 'Quantum Physics', duration: '5 weeks' },
            { unit: 'Unit 5', topic: 'Modern Physics', duration: '2 weeks' }
        ],
        faculty: [
            {
                name: 'Dr. James Thompson',
                position: 'Senior Professor',
                degree: 'Ph.D. in Theoretical Physics',
                email: 'james.thompson@university.edu',
                image: 'https://via.placeholder.com/150x150/9B59B6/FFFFFF?text=JT'
            }
        ]
    },
    'chemistry': {
        name: 'Chemistry',
        description: 'Organic, Inorganic, Physical Chemistry, Analytical Chemistry',
        info: 'Chemistry program provides comprehensive understanding of organic, inorganic, physical, and analytical chemistry with laboratory experience.',
        syllabus: [
            { unit: 'Unit 1', topic: 'General Chemistry', duration: '4 weeks' },
            { unit: 'Unit 2', topic: 'Organic Chemistry', duration: '6 weeks' },
            { unit: 'Unit 3', topic: 'Inorganic Chemistry', duration: '5 weeks' },
            { unit: 'Unit 4', topic: 'Physical Chemistry', duration: '4 weeks' },
            { unit: 'Unit 5', topic: 'Analytical Chemistry', duration: '3 weeks' }
        ],
        faculty: [
            {
                name: 'Dr. Lisa Anderson',
                position: 'Associate Professor',
                degree: 'Ph.D. in Organic Chemistry',
                email: 'lisa.anderson@university.edu',
                image: 'https://via.placeholder.com/150x150/F39C12/FFFFFF?text=LA'
            }
        ]
    },
    'biology': {
        name: 'Biology',
        description: 'Genetics, Molecular Biology, Ecology, Cell Biology',
        info: 'Biology program explores life sciences including genetics, molecular biology, ecology, and cell biology with hands-on research opportunities.',
        syllabus: [
            { unit: 'Unit 1', topic: 'Cell Biology', duration: '5 weeks' },
            { unit: 'Unit 2', topic: 'Genetics', duration: '5 weeks' },
            { unit: 'Unit 3', topic: 'Molecular Biology', duration: '4 weeks' },
            { unit: 'Unit 4', topic: 'Ecology', duration: '4 weeks' },
            { unit: 'Unit 5', topic: 'Evolution', duration: '4 weeks' }
        ],
        faculty: [
            {
                name: 'Dr. Robert Kim',
                position: 'Professor',
                degree: 'Ph.D. in Molecular Biology',
                email: 'robert.kim@university.edu',
                image: 'https://via.placeholder.com/150x150/27AE60/FFFFFF?text=RK'
            }
        ]
    },
    'english': {
        name: 'English Literature',
        description: 'Poetry, Prose, Drama, Linguistics, Literary Criticism',
        info: 'English Literature program covers classical and contemporary literature, poetry, drama, and linguistic analysis with critical thinking development.',
        syllabus: [
            { unit: 'Unit 1', topic: 'Classical Literature', duration: '5 weeks' },
            { unit: 'Unit 2', topic: 'Modern Poetry', duration: '4 weeks' },
            { unit: 'Unit 3', topic: 'Drama and Theatre', duration: '4 weeks' },
            { unit: 'Unit 4', topic: 'Linguistics', duration: '4 weeks' },
            { unit: 'Unit 5', topic: 'Literary Criticism', duration: '5 weeks' }
        ],
        faculty: [
            {
                name: 'Prof. Margaret Davis',
                position: 'Senior Professor',
                degree: 'Ph.D. in English Literature',
                email: 'margaret.davis@university.edu',
                image: 'https://via.placeholder.com/150x150/E74C3C/FFFFFF?text=MD'
            }
        ]
    }
};

function loadLMS() {
    // Show subject list by default
    document.getElementById('subjectList').style.display = 'grid';
    document.getElementById('subjectDetail').style.display = 'none';
}

function openSubject(subjectId) {
    currentSubject = subjectId;
    const subject = subjectData[subjectId];
    
    if (!subject) return;
    
    // Hide subject list and show detail view
    document.getElementById('subjectList').style.display = 'none';
    document.getElementById('subjectDetail').style.display = 'block';
    
    // Update subject title
    document.getElementById('subjectTitle').textContent = subject.name;
    
    // Show introduction by default
    showSubmenu('introduction');
}

function backToSubjects() {
    document.getElementById('subjectList').style.display = 'grid';
    document.getElementById('subjectDetail').style.display = 'none';
    currentSubject = null;
}

function showSubmenu(submenuName) {
    // Remove active class from all submenu buttons
    document.querySelectorAll('.submenu-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Hide all submenu content
    document.querySelectorAll('.submenu-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Show selected submenu (guard element existence)
    const submenuBtn = document.querySelector(`[onclick="showSubmenu('${submenuName}')"]`);
    if (submenuBtn) submenuBtn.classList.add('active');
    const submenuContent = document.getElementById(submenuName);
    if (submenuContent) submenuContent.classList.add('active');
    
    // Load content based on submenu
    switch(submenuName) {
        case 'introduction':
            loadIntroduction();
            break;
        case 'syllabus':
            loadSyllabus();
            break;
        case 'faculty':
            loadFaculty();
            break;
        case 'viva-submission':
            loadVivaSubmission();
            break;
    }
}

function loadIntroduction() {
    if (!currentSubject) return;
    
    const subject = subjectData[currentSubject];
    const infoContainer = document.getElementById('subjectInfo');
    
    infoContainer.innerHTML = `
        <div class="subject-intro">
            <div class="subject-overview">
                <h4>Course Overview</h4>
                <p>${subject.info}</p>
            </div>
            <div class="subject-details">
                <h4>Course Details</h4>
                <ul>
                    <li><strong>Subject:</strong> ${subject.name}</li>
                    <li><strong>Description:</strong> ${subject.description}</li>
                    <li><strong>Duration:</strong> 22 weeks (1 semester)</li>
                    <li><strong>Credits:</strong> 4</li>
                </ul>
            </div>
        </div>
    `;
}

function loadSyllabus() {
    if (!currentSubject) return;
    
    const subject = subjectData[currentSubject];
    const syllabusContainer = document.getElementById('syllabusContent');
    
    let syllabusHTML = '<div class="syllabus-list">';
    subject.syllabus.forEach((unit, index) => {
        syllabusHTML += `
            <div class="syllabus-unit">
                <div class="unit-header">
                    <h4>${unit.unit}</h4>
                    <span class="unit-duration">${unit.duration}</span>
                </div>
                <p>${unit.topic}</p>
            </div>
        `;
    });
    syllabusHTML += '</div>';
    
    syllabusContainer.innerHTML = syllabusHTML;
}

function loadFaculty() {
    if (!currentSubject) return;
    
    const subject = subjectData[currentSubject];
    const facultyContainer = document.getElementById('facultyList');
    
    let facultyHTML = '';
    subject.faculty.forEach(faculty => {
        facultyHTML += `
            <div class="faculty-card">
                <div class="faculty-image">
                    <img src="${faculty.image}" alt="${faculty.name}" onerror="this.src='https://via.placeholder.com/150x150/666666/FFFFFF?text=${faculty.name.split(' ').map(n => n[0]).join('')}'">
                </div>
                <div class="faculty-info">
                    <h4>${faculty.name}</h4>
                    <p class="faculty-position">${faculty.position}</p>
                    <p class="faculty-degree">${faculty.degree}</p>
                    <p class="faculty-email">
                        <i class="fas fa-envelope"></i>
                        <a href="mailto:${faculty.email}">${faculty.email}</a>
                    </p>
                </div>
            </div>
        `;
    });
    
    facultyContainer.innerHTML = facultyHTML;
}

function loadVivaSubmission() {
    // Show assignments tab by default
    showVivaTab('assignments');
}

function showVivaTab(tabName) {
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add active class to selected tab (guard existence)
    const vivaBtn = document.querySelector(`[onclick="showVivaTab('${tabName}')"]`);
    if (vivaBtn) vivaBtn.classList.add('active');
    const tabContent = document.getElementById('vivaTabContent');
    if (!tabContent) return;

    switch(tabName) {
        case 'assignments':
            tabContent.innerHTML = `
                <div class="assignments-list">
                    <div class="assignment-item">
                        <h4>Assignment 1: Basic Concepts</h4>
                        <p>Due Date: March 15, 2024</p>
                        <p>Status: <span class="status-badge status-pending">Pending</span></p>
                        <button class="btn btn-primary btn-sm">Submit</button>
                    </div>
                    <div class="assignment-item">
                        <h4>Assignment 2: Advanced Topics</h4>
                        <p>Due Date: April 10, 2024</p>
                        <p>Status: <span class="status-badge status-active">Submitted</span></p>
                        <button class="btn btn-secondary btn-sm">View Submission</button>
                    </div>
                </div>
            `;
            break;
        case 'viva-schedule':
            tabContent.innerHTML = `
                <div class="viva-schedule">
                    <div class="viva-item">
                        <h4>Mid-term Viva</h4>
                        <p>Date: March 20, 2024</p>
                        <p>Time: 10:00 AM - 12:00 PM</p>
                        <p>Room: 201A</p>
                    </div>
                    <div class="viva-item">
                        <h4>Final Viva</h4>
                        <p>Date: May 15, 2024</p>
                        <p>Time: 2:00 PM - 4:00 PM</p>
                        <p>Room: 301B</p>
                    </div>
                </div>
            `;
            break;
        case 'submissions':
            tabContent.innerHTML = `
                <div class="submissions-list">
                    <div class="submission-item">
                        <h4>Project Report</h4>
                        <p>Submitted: March 12, 2024</p>
                        <p>Grade: <span class="grade-badge">A</span></p>
                        <button class="btn btn-secondary btn-sm">Download</button>
                    </div>
                    <div class="submission-item">
                        <h4>Research Paper</h4>
                        <p>Submitted: April 8, 2024</p>
                        <p>Grade: <span class="grade-badge">B+</span></p>
                        <button class="btn btn-secondary btn-sm">Download</button>
                    </div>
                </div>
            `;
            break;
        default:
            tabContent.innerHTML = '';
    }
}

// Charts and Reports
function initializeCharts() {
    // Initialize Chart.js if available
    if (typeof Chart !== 'undefined') {
        updateCharts();
    }
}

function updateCharts() {
    // Performance Chart
    const performanceCtx = document.getElementById('performanceChart');
    if (performanceCtx) {
        new Chart(performanceCtx, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                    label: 'Average Grade',
                    data: [85, 87, 89, 88, 90, 92],
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    // Attendance Chart
    const attendanceCtx = document.getElementById('attendanceChart');
    if (attendanceCtx) {
        new Chart(attendanceCtx, {
            type: 'line',
            data: {
                labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                datasets: [{
                    label: 'Attendance %',
                    data: [95, 92, 98, 94],
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    // Fee Chart
    const feeCtx = document.getElementById('feeChart');
    if (feeCtx) {
        new Chart(feeCtx, {
            type: 'doughnut',
            data: {
                labels: ['Paid', 'Pending', 'Overdue'],
                datasets: [{
                    data: [70, 20, 10],
                    backgroundColor: [
                        'rgba(40, 167, 69, 0.8)',
                        'rgba(255, 193, 7, 0.8)',
                        'rgba(220, 53, 69, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true
            }
        });
    }
}

// Utility Functions
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showMessage(message, type = 'success') {
    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    
    // Insert at the top of main content
    const mainContent = document.querySelector('.main-content');
    mainContent.insertBefore(messageDiv, mainContent.firstChild);
    
    // Remove message after 3 seconds
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

function loadDataFromStorage() {
    // Load data from localStorage
    students = JSON.parse(localStorage.getItem('erp_students') || '[]');
    teachers = JSON.parse(localStorage.getItem('erp_teachers') || '[]');
    courses = JSON.parse(localStorage.getItem('erp_courses') || '[]');
    attendance = JSON.parse(localStorage.getItem('erp_attendance') || '[]');
    fees = JSON.parse(localStorage.getItem('erp_fees') || '[]');
    examinations = JSON.parse(localStorage.getItem('erp_examinations') || '[]');
    assignments = JSON.parse(localStorage.getItem('erp_assignments') || '[]');
    books = JSON.parse(localStorage.getItem('erp_books') || '[]');
}

function saveDataToStorage() {
    // Save data to localStorage
    localStorage.setItem('erp_students', JSON.stringify(students));
    localStorage.setItem('erp_teachers', JSON.stringify(teachers));
    localStorage.setItem('erp_courses', JSON.stringify(courses));
    localStorage.setItem('erp_attendance', JSON.stringify(attendance));
    localStorage.setItem('erp_fees', JSON.stringify(fees));
    localStorage.setItem('erp_examinations', JSON.stringify(examinations));
    localStorage.setItem('erp_assignments', JSON.stringify(assignments));
    localStorage.setItem('erp_books', JSON.stringify(books));
}

function loadSampleData() {
    // Load sample data if no data exists
    if (students.length === 0) {
        // Seed 10 example students used across admin/teacher/student pages
        students = [
            { id: 1, studentId: 'ST001', name: 'John Doe', email: 'john.doe@student.edu', course: 'Computer Science', branch: 'CSE', semester: 5, year: '3', status: 'active', enrollmentDate: '2022-09-01', rollNo: 'STU-2025-001', attendancePct: 82, subjects: ['CS101','CS201','CS205'] },
            { id: 2, studentId: 'ST002', name: 'Jane Smith', email: 'jane.smith@student.edu', course: 'Mathematics', branch: 'MTH', semester: 3, year: '2', status: 'active', enrollmentDate: '2023-09-01', rollNo: 'STU-2025-002', attendancePct: 68, subjects: ['MTH201','MTH210'] },
            { id: 3, studentId: 'ST003', name: 'Mike Johnson', email: 'mike.johnson@student.edu', course: 'Physics', branch: 'PHY', semester: 7, year: '4', status: 'active', enrollmentDate: '2021-09-01', rollNo: 'STU-2025-003', attendancePct: 46, subjects: ['PHY150','PHY310'] },
            { id: 4, studentId: 'ST004', name: 'Emily Davis', email: 'emily.davis@student.edu', course: 'Chemistry', branch: 'CHE', semester: 1, year: '1', status: 'active', enrollmentDate: '2025-07-15', rollNo: 'STU-2025-004', attendancePct: 91, subjects: ['CH101','CH105'] },
            { id: 5, studentId: 'ST005', name: 'Robert Brown', email: 'robert.brown@student.edu', course: 'Biology', branch: 'BIO', semester: 2, year: '1', status: 'active', enrollmentDate: '2025-01-10', rollNo: 'STU-2025-005', attendancePct: 77, subjects: ['BI101','BI110'] },
            { id: 6, studentId: 'ST006', name: 'Sophia Wilson', email: 'sophia.wilson@student.edu', course: 'English', branch: 'ENG', semester: 4, year: '2', status: 'active', enrollmentDate: '2023-06-05', rollNo: 'STU-2025-006', attendancePct: 88, subjects: ['EN201','EN210'] },
            { id: 7, studentId: 'ST007', name: 'David Lee', email: 'david.lee@student.edu', course: 'Computer Science', branch: 'CSE', semester: 5, year: '3', status: 'active', enrollmentDate: '2022-09-01', rollNo: 'STU-2025-007', attendancePct: 69, subjects: ['CS101','CS205'] },
            { id: 8, studentId: 'ST008', name: 'Olivia Martinez', email: 'olivia.martinez@student.edu', course: 'Mathematics', branch: 'MTH', semester: 3, year: '2', status: 'active', enrollmentDate: '2023-09-01', rollNo: 'STU-2025-008', attendancePct: 95, subjects: ['MTH201','MTH220'] },
            { id: 9, studentId: 'ST009', name: 'Chris Anderson', email: 'chris.anderson@student.edu', course: 'Physics', branch: 'PHY', semester: 7, year: '4', status: 'active', enrollmentDate: '2021-09-01', rollNo: 'STU-2025-009', attendancePct: 54, subjects: ['PHY150','PHY320'] },
            { id: 10, studentId: 'ST010', name: 'Grace Taylor', email: 'grace.taylor@student.edu', course: 'Computer Science', branch: 'CSE', semester: 2, year: '1', status: 'active', enrollmentDate: '2025-02-20', rollNo: 'STU-2025-010', attendancePct: 86, subjects: ['CS101','CS102'] }
        ];
    }

    if (teachers.length === 0) {
        teachers = [
            {
                id: 1,
                name: 'Dr. Sarah Wilson',
                email: 'sarah.wilson@school.edu',
                department: 'Computer Science',
                subject: 'Data Structures',
                experience: 10,
                branches: ['CSE'],
                courses: ['CS101','CS201'],
                semesters: [3,5]
            },
            {
                id: 2,
                name: 'Prof. David Brown',
                email: 'david.brown@school.edu',
                department: 'Mathematics',
                subject: 'Calculus',
                experience: 15,
                branches: ['MTH'],
                courses: ['MTH201'],
                semesters: [3]
            }
        ];
    }

    if (courses.length === 0) {
        courses = [
            {
                code: 'CS101',
                name: 'Introduction to Programming',
                department: 'Computer Science',
                duration: '1 year',
                credits: 4
            },
            {
                code: 'MATH201',
                name: 'Calculus I',
                department: 'Mathematics',
                duration: '1 semester',
                credits: 3
            }
        ];
    }

    if (fees.length === 0) {
        fees = [
            { id: 'F-12231', studentId: 'ST001', amount: 25000, date: '2025-07-05', status: 'paid' },
            { id: 'F-12612', studentId: 'ST001', amount: 25000, date: '2025-08-05', status: 'paid' },
            { id: 'F-12987', studentId: 'ST001', amount: 25000, date: '2025-09-05', status: 'due' },
            { id: 'F-14555', studentId: 'ST002', amount: 22000, date: '2025-08-01', status: 'paid' }
        ];
    }

    if (books.length === 0) {
        books = [
            {
                id: 1,
                title: 'Introduction to Algorithms',
                author: 'Thomas H. Cormen',
                isbn: '978-0262033848',
                status: 'available'
            },
            {
                id: 2,
                title: 'Calculus: Early Transcendentals',
                author: 'James Stewart',
                isbn: '978-1285741550',
                status: 'borrowed'
            }
        ];
    }

    // Seed examinations (subjectwise marks) if empty - create entries for all students
    if ((examinations || []).length === 0) {
        examinations = [
            { id: 'E1', studentId: 'ST001', exam: 'Midterm', subject: 'CS101', date: '2025-10-15', marks: 85 },
            { id: 'E2', studentId: 'ST001', exam: 'Quiz 2', subject: 'CS201', date: '2025-09-22', marks: 74 },
            { id: 'E3', studentId: 'ST002', exam: 'Midterm', subject: 'MTH201', date: '2025-10-15', marks: 78 },
            { id: 'E4', studentId: 'ST003', exam: 'Midterm', subject: 'PHY150', date: '2025-10-15', marks: 66 },
            { id: 'E5', studentId: 'ST004', exam: 'Midterm', subject: 'CH101', date: '2025-10-15', marks: 92 },
            { id: 'E6', studentId: 'ST005', exam: 'Midterm', subject: 'BI101', date: '2025-10-15', marks: 74 },
            { id: 'E7', studentId: 'ST006', exam: 'Midterm', subject: 'EN201', date: '2025-10-15', marks: 81 },
            { id: 'E8', studentId: 'ST007', exam: 'Midterm', subject: 'CS101', date: '2025-10-15', marks: 70 },
            { id: 'E9', studentId: 'ST008', exam: 'Midterm', subject: 'MTH201', date: '2025-10-15', marks: 96 },
            { id: 'E10', studentId: 'ST009', exam: 'Midterm', subject: 'PHY150', date: '2025-10-15', marks: 58 },
            { id: 'E11', studentId: 'ST010', exam: 'Midterm', subject: 'CS101', date: '2025-10-15', marks: 88 }
        ];
    }

    // Seed attendance records for all students (demo)
    try {
        if ((attendance || []).length === 0) {
            attendance = [
                { id: 'A1', studentId: 'ST001', studentName: 'John Doe', status: 'present', date: '2025-09-25', time: '09:05' },
                { id: 'A2', studentId: 'ST002', studentName: 'Jane Smith', status: 'absent', date: '2025-09-25', time: '09:05' },
                { id: 'A3', studentId: 'ST003', studentName: 'Mike Johnson', status: 'present', date: '2025-09-25', time: '09:03' },
                { id: 'A4', studentId: 'ST004', studentName: 'Emily Davis', status: 'present', date: '2025-09-25', time: '08:59' },
                { id: 'A5', studentId: 'ST005', studentName: 'Robert Brown', status: 'present', date: '2025-09-25', time: '09:10' },
                { id: 'A6', studentId: 'ST006', studentName: 'Sophia Wilson', status: 'present', date: '2025-09-25', time: '09:00' },
                { id: 'A7', studentId: 'ST007', studentName: 'David Lee', status: 'late', date: '2025-09-25', time: '09:12' },
                { id: 'A8', studentId: 'ST008', studentName: 'Olivia Martinez', status: 'present', date: '2025-09-25', time: '08:58' },
                { id: 'A9', studentId: 'ST009', studentName: 'Chris Anderson', status: 'absent', date: '2025-09-25', time: '09:05' },
                { id: 'A10', studentId: 'ST010', studentName: 'Grace Taylor', status: 'present', date: '2025-09-25', time: '09:02' }
            ];
        }
    } catch(e) { /* noop */ }

    // Seed hostel allocation store
    try {
        let hostelData = JSON.parse(localStorage.getItem('erp_hostel_data') || '{}');
        hostelData.allocations = hostelData.allocations || [
            { studentId: 'ST001', hostel: 'Ganga Boys Hostel', room: 'B-204', warden: 'Mr. Sharma', allottedOn: '2025-07-01' },
            { studentId: 'ST002', hostel: 'Yamuna Girls Hostel', room: 'A-102', warden: 'Mrs. Gupta', allottedOn: '2025-07-01' }
        ];
        localStorage.setItem('erp_hostel_data', JSON.stringify(hostelData));
    } catch(_) { /* noop */ }

    // Auto-seed persistence: if the localStorage key for attendance is empty, write the seeded attendance now
    try {
        var existingAtt = JSON.parse(localStorage.getItem('erp_attendance') || '[]');
        if (!Array.isArray(existingAtt) || existingAtt.length === 0) {
            // Write seeded attendance to localStorage only (no server save during auto-seed)
            localStorage.setItem('erp_attendance', JSON.stringify(attendance));
        }
    } catch(_) { /* ignore */ }

    saveDataToStorage();

    // Server-sync seeded data once (non-blocking). This will attempt to persist
    // the demo data to the PHP JSON files if `erpJsonApi.saveData` is available.
    try {
        if (window.erpJsonApi && typeof window.erpJsonApi.saveData === 'function') {
            // Use small timeout to avoid blocking initial render
            setTimeout(function() {
                try { window.erpJsonApi.saveData('erp_students', students).catch(function(){/*ignore*/}); } catch(_){}
                try { window.erpJsonApi.saveData('erp_examinations', examinations).catch(function(){/*ignore*/}); } catch(_){}
                try { window.erpJsonApi.saveData('erp_attendance', attendance).catch(function(){/*ignore*/}); } catch(_){}
            }, 500);
        }
    } catch(e) { /* noop */ }

    // Ensure header height CSS var is updated after seeding in case header content changed
    try { updateHeaderHeight(); } catch(e) { /* noop */ }
}

// Placeholder functions for future implementation
function openTeacherModal() { alert('Teacher modal - to be implemented'); }

// Admin helper: re-seed attendance only (localStorage)
function reseedAttendance() {
    try {
        if (!confirm || !confirm('Re-seed attendance demo data? This will overwrite local attendance in localStorage.')) return;
    } catch(e) { /* fallback */ }
    try {
        // Ensure loadSampleData has run and attendance array is populated
        if (!Array.isArray(attendance) || attendance.length === 0) {
            try { loadSampleData(); } catch(e) { /* noop */ }
        }
        localStorage.setItem('erp_attendance', JSON.stringify(attendance || []));
        // Refresh UI where relevant
        try { renderStudentPortalSections(); } catch(e) {}
        try { renderTeacherStudents(); } catch(e) {}
        showMessage('Attendance re-seeded locally.', 'success');
    } catch (e) {
        console.error('Error re-seeding attendance', e);
        showMessage('Failed to re-seed attendance. See console.', 'danger');
    }
}

// Admin helper: export attendance as JSON file (downloads localStorage key)
function exportAttendance() {
    try {
        const data = JSON.parse(localStorage.getItem('erp_attendance') || '[]');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const filename = 'erp_attendance_' + now.toISOString().slice(0,10).replace(/-/g,'') + '.json';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showMessage('Attendance exported as '+filename, 'success');
    } catch (e) {
        console.error('Export attendance failed', e);
        showMessage('Failed to export attendance. See console.', 'danger');
    }
}
function openCourseModal() { alert('Course modal - to be implemented'); }
function openFeeModal() { alert('Fee modal - to be implemented'); }
function openExamModal() { alert('Exam modal - to be implemented'); }
function openBookModal() { alert('Book modal - to be implemented'); }

// Additional placeholder functions
function viewTeacher(id) { alert(`View teacher ${id}`); }
function editTeacher(id) { alert(`Edit teacher ${id}`); }
function deleteTeacher(id) { alert(`Delete teacher ${id}`); }
function viewCourse(code) { alert(`View course ${code}`); }
function editCourse(code) { alert(`Edit course ${code}`); }
function deleteCourse(code) { alert(`Delete course ${code}`); }
function editAttendance(id) { alert(`Edit attendance ${id}`); }
function viewFee(id) { alert(`View fee ${id}`); }
function editFee(id) { alert(`Edit fee ${id}`); }
function viewExam(id) { alert(`View exam ${id}`); }
function editExam(id) { alert(`Edit exam ${id}`); }
function deleteExam(id) { alert(`Delete exam ${id}`); }
function viewBook(id) { alert(`View book ${id}`); }
function editBook(id) { alert(`Edit book ${id}`); }
function deleteBook(id) { alert(`Delete book ${id}`); }

// User Authentication Functions
function checkUserLogin() {
    const userData = localStorage.getItem('erp_user_data');
    if (userData) {
        try {
            currentUser = JSON.parse(userData);
            return true;
        } catch (error) {
            console.error('Error parsing user data:', error);
            localStorage.removeItem('erp_user_data');
            return false;
        }
    }
    return false;
}

// Admin utility: reseed demo data locally
function reseedDemoData() {
    if (!confirm || confirm('Re-seed demo data? This will overwrite local demo data.')) {
        // Clear client-side demo keys
        localStorage.removeItem('erp_students');
        localStorage.removeItem('erp_examinations');
        localStorage.removeItem('erp_attendance');
        // Refresh in-memory and re-seed
        loadDataFromStorage();
        loadSampleData();
        showMessage('Demo data re-seeded locally.', 'success');
        // If on admin pages, refresh lists if present
        try { loadStudents(); } catch(_){}
        try { loadExaminations(); } catch(_){}
        try { loadAttendance(); } catch(_){}
    }
}

// Admin utility: explicitly save current seeds to server
async function saveSeedsToServer() {
    if (!(window.erpJsonApi && typeof window.erpJsonApi.saveData === 'function')) {
        showMessage('Server API helper not available.', 'warning');
        return;
    }
    showMessage('Saving demo data to server...', 'info', 4000);
    try {
        await window.erpJsonApi.saveData('erp_students', students);
        await window.erpJsonApi.saveData('erp_examinations', examinations);
        await window.erpJsonApi.saveData('erp_attendance', attendance);
        showMessage('Demo data saved to server.', 'success');
    } catch (e) {
        console.error('Error saving seeds to server', e);
        showMessage('Failed to save seeds to server. See console.', 'danger');
    }
}

function updateUserInfo() {
    if (!currentUser) return;
    
    const userInfoElements = document.querySelectorAll('.user-info span, .user-info-header span');
    const userIconElements = document.querySelectorAll('.user-info i, .user-info-header i');
    
    let displayText = '';
    let iconClass = '';
    
    // Safely access user properties
    const userName = currentUser.fullName || currentUser.name || 'User';
    const userType = currentUser.userType || 'admin';
    
    switch (userType) {
        case 'student':
            displayText = `Hello, ${userName}`;
            iconClass = 'fas fa-user-graduate';
            break;
        case 'teacher':
            displayText = `Hello, ${userName}`;
            iconClass = 'fas fa-chalkboard-teacher';
            break;
        case 'admin':
        default:
            displayText = 'Hello, Admin';
            iconClass = 'fas fa-user-circle';
            break;
    }
    
    // Update all user info elements safely
    userInfoElements.forEach(element => {
        if (element) {
            element.textContent = displayText;
        }
    });
    
    // Update all user icon elements safely
    userIconElements.forEach(element => {
        if (element) {
            element.className = iconClass;
        }
    });
}

// First logout function (removed - using enhanced version below)

// Add logout functionality to user info elements
document.addEventListener('DOMContentLoaded', function() {
    // Add click event to user info for logout (optional)
    const userInfoElements = document.querySelectorAll('.user-info, .user-info-header');
    userInfoElements.forEach(element => {
        element.addEventListener('dblclick', function() {
            if (confirm('Are you sure you want to logout?')) {
                logout();
            }
        });
    });
});

// Enhanced Sticky Header Functionality
function initializeStickyHeader() {
    const header = document.querySelector('.header');
    let lastScrollTop = 0;
    let ticking = false;
    
    function updateHeader() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Add scrolled class for styling
        if (scrollTop > 20) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        
        // Smart hide/show header on scroll
        if (scrollTop > lastScrollTop && scrollTop > 80) {
            // Scrolling down - hide header
            header.classList.add('hidden');
            header.classList.remove('visible');
        } else if (scrollTop < lastScrollTop || scrollTop <= 80) {
            // Scrolling up or near top - show header
            header.classList.remove('hidden');
            header.classList.add('visible');
        }
        
        lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
        ticking = false;
    }
    
    function requestTick() {
        if (!ticking) {
            requestAnimationFrame(updateHeader);
            ticking = true;
        }
    }
    
    // Use throttled scroll event for better performance
    window.addEventListener('scroll', requestTick, { passive: true });
    
    // Ensure header is visible on page load
    header.classList.add('visible');
    
    // Handle window resize
    window.addEventListener('resize', function() {
        header.classList.remove('hidden');
        header.classList.add('visible');
    });
}

// Logout functionality (removed - using enhanced version below)

// Enhanced message function with better styling
function showMessage(message, type = 'success') {
    // Remove existing messages
    const existingMessage = document.querySelector('.message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    
    // Add icon based on type
    let icon = 'fa-check-circle';
    switch(type) {
        case 'error':
            icon = 'fa-exclamation-circle';
            break;
        case 'warning':
            icon = 'fa-exclamation-triangle';
            break;
        case 'info':
            icon = 'fa-info-circle';
            break;
    }
    
    messageDiv.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    
    // Insert at the top of main content
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.insertBefore(messageDiv, mainContent.firstChild);
    } else {
        document.body.appendChild(messageDiv);
    }
    
    // Remove message after 4 seconds
    setTimeout(() => {
        messageDiv.style.animation = 'slideOutUp 0.3s ease';
        setTimeout(() => {
            messageDiv.remove();
        }, 300);
    }, 4000);
}

// Add slide out animation
const messageStyle = document.createElement('style');
messageStyle.textContent = `
    @keyframes slideOutUp {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-20px);
        }
    }
`;
document.head.appendChild(messageStyle);// ==
// === COMPREHENSIVE ADMIN CONTROLS =====

// Admin Dashboard Data
let adminData = {
    systemSettings: {
    schoolName: 'Astra School',
        academicYear: '2024-2025',
        semester: 'Spring',
        timezone: 'UTC+0',
        language: 'English',
        currency: 'USD'
    },
    userManagement: {
        totalUsers: 0,
        activeUsers: 0,
        pendingApprovals: 0
    },
    systemStats: {
        totalStorage: '100GB',
        usedStorage: '45GB',
        serverUptime: '99.9%',
        lastBackup: new Date().toISOString()
    }
};

// Admin User Management
function loadAdminUserManagement() {
    const allUsers = [...students, ...teachers];
    adminData.userManagement.totalUsers = allUsers.length;
    adminData.userManagement.activeUsers = allUsers.filter(u => u.status === 'active').length;
    
    const userManagementHTML = `
        <div class="admin-section">
            <div class="admin-header">
                <h3><i class="fas fa-users-cog"></i> User Management</h3>
                <div class="admin-actions">
                    <button class="btn btn-primary" onclick="openBulkUserModal()">
                        <i class="fas fa-upload"></i> Bulk Import
                    </button>
                    <button class="btn btn-success" onclick="exportUsers()">
                        <i class="fas fa-download"></i> Export Users
                    </button>
                </div>
            </div>
            
            <div class="admin-stats-grid">
                <div class="admin-stat-card">
                    <div class="stat-icon bg-primary">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="stat-info">
                        <h4>${adminData.userManagement.totalUsers}</h4>
                        <p>Total Users</p>
                    </div>
                </div>
                <div class="admin-stat-card">
                    <div class="stat-icon bg-success">
                        <i class="fas fa-user-check"></i>
                    </div>
                    <div class="stat-info">
                        <h4>${adminData.userManagement.activeUsers}</h4>
                        <p>Active Users</p>
                    </div>
                </div>
                <div class="admin-stat-card">
                    <div class="stat-icon bg-warning">
                        <i class="fas fa-user-clock"></i>
                    </div>
                    <div class="stat-info">
                        <h4>${adminData.userManagement.pendingApprovals}</h4>
                        <p>Pending Approvals</p>
                    </div>
                </div>
            </div>
            
            <div class="admin-user-controls">
                <div class="control-group">
                    <h4>User Actions</h4>
                    <div class="control-buttons">
                        <button class="btn btn-outline" onclick="resetAllPasswords()">
                            <i class="fas fa-key"></i> Reset All Passwords
                        </button>
                        <button class="btn btn-outline" onclick="sendBulkNotifications()">
                            <i class="fas fa-bell"></i> Send Notifications
                        </button>
                        <button class="btn btn-outline" onclick="generateUserReports()">
                            <i class="fas fa-chart-line"></i> Generate Reports
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    return userManagementHTML;
}

// System Settings Management
function loadSystemSettings() {
    const settingsHTML = `
        <div class="admin-section">
            <div class="admin-header">
                <h3><i class="fas fa-cogs"></i> System Settings</h3>
                <button class="btn btn-primary" onclick="saveSystemSettings()">
                    <i class="fas fa-save"></i> Save Settings
                </button>
            </div>
            
            <div class="settings-grid">
                <div class="settings-card">
                    <h4>General Settings</h4>
                    <div class="form-group">
                        <label>School Name</label>
                        <input type="text" id="schoolName" value="${adminData.systemSettings.schoolName}">
                    </div>
                    <div class="form-group">
                        <label>Academic Year</label>
                        <input type="text" id="academicYear" value="${adminData.systemSettings.academicYear}">
                    </div>
                    <div class="form-group">
                        <label>Current Semester</label>
                        <select id="semester">
                            <option value="Spring" ${adminData.systemSettings.semester === 'Spring' ? 'selected' : ''}>Spring</option>
                            <option value="Summer" ${adminData.systemSettings.semester === 'Summer' ? 'selected' : ''}>Summer</option>
                            <option value="Fall" ${adminData.systemSettings.semester === 'Fall' ? 'selected' : ''}>Fall</option>
                            <option value="Winter" ${adminData.systemSettings.semester === 'Winter' ? 'selected' : ''}>Winter</option>
                        </select>
                    </div>
                </div>
                
                <div class="settings-card">
                    <h4>System Configuration</h4>
                    <div class="form-group">
                        <label>Timezone</label>
                        <select id="timezone">
                            <option value="UTC+0">UTC+0 (GMT)</option>
                            <option value="UTC-5">UTC-5 (EST)</option>
                            <option value="UTC-8">UTC-8 (PST)</option>
                            <option value="UTC+1">UTC+1 (CET)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Default Language</label>
                        <select id="language">
                            <option value="English">English</option>
                            <option value="Spanish">Spanish</option>
                            <option value="French">French</option>
                            <option value="German">German</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Currency</label>
                        <select id="currency">
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                            <option value="GBP">GBP (£)</option>
                            <option value="JPY">JPY (¥)</option>
                        </select>
                    </div>
                </div>
                
                <div class="settings-card">
                    <h4>Security Settings</h4>
                    <div class="form-group">
                        <label class="checkbox-container">
                            <input type="checkbox" id="twoFactorAuth" checked>
                            <span class="checkmark"></span>
                            Enable Two-Factor Authentication
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-container">
                            <input type="checkbox" id="passwordExpiry" checked>
                            <span class="checkmark"></span>
                            Password Expiry (90 days)
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-container">
                            <input type="checkbox" id="loginLogging" checked>
                            <span class="checkmark"></span>
                            Log All Login Attempts
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    return settingsHTML;
}

// Database Management
function loadDatabaseManagement() {
    const dbHTML = `
        <div class="admin-section">
            <div class="admin-header">
                <h3><i class="fas fa-database"></i> Database Management</h3>
                <div class="admin-actions">
                    <button class="btn btn-success" onclick="createBackup()">
                        <i class="fas fa-download"></i> Create Backup
                    </button>
                    <button class="btn btn-warning" onclick="restoreBackup()">
                        <i class="fas fa-upload"></i> Restore Backup
                    </button>
                </div>
            </div>
            
            <div class="db-stats-grid">
                <div class="db-stat-card">
                    <h4>Storage Usage</h4>
                    <div class="storage-bar">
                        <div class="storage-used" style="width: 45%"></div>
                    </div>
                    <p>45GB of 100GB used</p>
                </div>
                <div class="db-stat-card">
                    <h4>Last Backup</h4>
                    <p>${new Date(adminData.systemStats.lastBackup).toLocaleDateString()}</p>
                    <small>Automatic backup enabled</small>
                </div>
                <div class="db-stat-card">
                    <h4>Server Uptime</h4>
                    <p>${adminData.systemStats.serverUptime}</p>
                    <small>Last 30 days</small>
                </div>
            </div>
            
            <div class="db-actions">
                <div class="action-group">
                    <h4>Data Management</h4>
                    <div class="action-buttons">
                        <button class="btn btn-outline" onclick="cleanupOldData()">
                            <i class="fas fa-broom"></i> Cleanup Old Data
                        </button>
                        <button class="btn btn-outline" onclick="optimizeDatabase()">
                            <i class="fas fa-tachometer-alt"></i> Optimize Database
                        </button>
                        <button class="btn btn-outline" onclick="exportAllData()">
                            <i class="fas fa-file-export"></i> Export All Data
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    return dbHTML;
}

// System Monitoring
function loadSystemMonitoring() {
    const monitoringHTML = `
        <div class="admin-section">
            <div class="admin-header">
                <h3><i class="fas fa-chart-line"></i> System Monitoring</h3>
                <button class="btn btn-primary" onclick="refreshMonitoring()">
                    <i class="fas fa-sync"></i> Refresh
                </button>
            </div>
            
            <div class="monitoring-grid">
                <div class="monitor-card">
                    <h4>Active Sessions</h4>
                    <div class="monitor-value">24</div>
                    <div class="monitor-trend up">+12% from yesterday</div>
                </div>
                <div class="monitor-card">
                    <h4>System Load</h4>
                    <div class="monitor-value">67%</div>
                    <div class="monitor-trend normal">Normal range</div>
                </div>
                <div class="monitor-card">
                    <h4>Error Rate</h4>
                    <div class="monitor-value">0.02%</div>
                    <div class="monitor-trend down">-0.01% from yesterday</div>
                </div>
                <div class="monitor-card">
                    <h4>Response Time</h4>
                    <div class="monitor-value">245ms</div>
                    <div class="monitor-trend normal">Average</div>
                </div>
            </div>
            
            <div class="activity-log">
                <h4>Recent System Activity</h4>
                <div class="log-entries">
                    <div class="log-entry">
                        <span class="log-time">10:30 AM</span>
                        <span class="log-action">User login</span>
                        <span class="log-user">john.doe@school.edu</span>
                        <span class="log-status success">Success</span>
                    </div>
                    <div class="log-entry">
                        <span class="log-time">10:25 AM</span>
                        <span class="log-action">Database backup</span>
                        <span class="log-user">System</span>
                        <span class="log-status success">Completed</span>
                    </div>
                    <div class="log-entry">
                        <span class="log-time">10:20 AM</span>
                        <span class="log-action">Failed login attempt</span>
                        <span class="log-user">unknown@email.com</span>
                        <span class="log-status error">Failed</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    return monitoringHTML;
}

// Enhanced Dashboard for Admin
function loadAdminDashboard() {
    if (currentUser && currentUser.userType === 'admin') {
        const dashboardContainer = document.getElementById('dashboard');
        if (!dashboardContainer) {
            return; // container not ready yet
        }

        const adminDashboardHTML = `
            <div class="module-header">
                <h2>Admin Dashboard</h2>
                <div class="admin-quick-actions">
                    <button class="btn btn-sm btn-primary" onclick="showQuickStats()">
                        <i class="fas fa-chart-bar"></i> Quick Stats
                    </button>
                    <button class="btn btn-sm btn-success" onclick="systemHealthCheck()">
                        <i class="fas fa-heartbeat"></i> Health Check
                    </button>
                </div>
            </div>
            
            <div class="admin-tabs">
                <button class="admin-tab active" onclick="showAdminTab('overview')">Overview</button>
                <button class="admin-tab" onclick="showAdminTab('users')">User Management</button>
                <button class="admin-tab" onclick="showAdminTab('settings')">System Settings</button>
                <button class="admin-tab" onclick="showAdminTab('database')">Database</button>
                <button class="admin-tab" onclick="showAdminTab('monitoring')">Monitoring</button>
            </div>
            
            <div id="adminTabContent">
                <div id="overview" class="admin-tab-content active">
                    ${loadSystemOverview()}
                </div>
                <div id="users" class="admin-tab-content">
                    ${loadAdminUserManagement()}
                </div>
                <div id="settings" class="admin-tab-content">
                    ${loadSystemSettings()}
                </div>
                <div id="database" class="admin-tab-content">
                    ${loadDatabaseManagement()}
                </div>
                <div id="monitoring" class="admin-tab-content">
                    ${loadSystemMonitoring()}
                </div>
            </div>
        `;
        
        try {
            dashboardContainer.innerHTML = adminDashboardHTML;
        } catch (_) { /* noop */ }
    }
}

function loadSystemOverview() {
    return `
        <div class="admin-overview">
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon bg-primary">
                        <i class="fas fa-user-graduate"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${students.length}</h3>
                        <p>Total Students</p>
                        <small>+5 this week</small>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-success">
                        <i class="fas fa-chalkboard-teacher"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${teachers.length}</h3>
                        <p>Teachers</p>
                        <small>All active</small>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-warning">
                        <i class="fas fa-book"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${courses.length}</h3>
                        <p>Courses</p>
                        <small>2 new this semester</small>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-danger">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <div class="stat-info">
                        <h3>3</h3>
                        <p>Pending Issues</p>
                        <small>Requires attention</small>
                    </div>
                </div>
            </div>
            
            <div class="admin-quick-actions-grid">
                <div class="quick-action-card" onclick="bulkStudentOperations()">
                    <i class="fas fa-users"></i>
                    <h4>Bulk Student Operations</h4>
                    <p>Import, export, or modify multiple students</p>
                </div>
                <div class="quick-action-card" onclick="generateReports()">
                    <i class="fas fa-file-alt"></i>
                    <h4>Generate Reports</h4>
                    <p>Create comprehensive system reports</p>
                </div>
                <div class="quick-action-card" onclick="systemMaintenance()">
                    <i class="fas fa-tools"></i>
                    <h4>System Maintenance</h4>
                    <p>Perform system cleanup and optimization</p>
                </div>
                <div class="quick-action-card" onclick="securityAudit()">
                    <i class="fas fa-shield-alt"></i>
                    <h4>Security Audit</h4>
                    <p>Review security logs and permissions</p>
                </div>
            </div>
        </div>
    `;
}

// Admin Tab Management
function showAdminTab(tabName) {
    // Remove active class from all tabs and content
    document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab and content
    document.querySelector(`[onclick="showAdminTab('${tabName}')"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
}

// Admin Action Functions
function saveSystemSettings() {
    const settings = {
        schoolName: document.getElementById('schoolName')?.value,
        academicYear: document.getElementById('academicYear')?.value,
        semester: document.getElementById('semester')?.value,
        timezone: document.getElementById('timezone')?.value,
        language: document.getElementById('language')?.value,
        currency: document.getElementById('currency')?.value
    };
    
    adminData.systemSettings = { ...adminData.systemSettings, ...settings };
    localStorage.setItem('erp_admin_settings', JSON.stringify(adminData.systemSettings));
    showMessage('System settings saved successfully!', 'success');
}

function createBackup() {
    showMessage('Creating system backup...', 'info');
    
    setTimeout(() => {
        const backupData = {
            students,
            teachers,
            courses,
            attendance,
            fees,
            examinations,
            adminData,
            timestamp: new Date().toISOString()
        };
        
        const dataStr = JSON.stringify(backupData, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `erp_backup_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        adminData.systemStats.lastBackup = new Date().toISOString();
        showMessage('Backup created successfully!', 'success');
    }, 2000);
}

function restoreBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const backupData = JSON.parse(e.target.result);
                    
                    if (confirm('This will replace all current data. Are you sure?')) {
                        students = backupData.students || [];
                        teachers = backupData.teachers || [];
                        courses = backupData.courses || [];
                        attendance = backupData.attendance || [];
                        fees = backupData.fees || [];
                        examinations = backupData.examinations || [];
                        adminData = backupData.adminData || adminData;
                        
                        saveDataToStorage();
                        showMessage('Backup restored successfully!', 'success');
                        location.reload();
                    }
                } catch (error) {
                    showMessage('Invalid backup file format!', 'error');
                }
            };
            reader.readAsText(file);
        }
    };
    
    input.click();
}

function exportUsers() {
    const allUsers = [
        ...students.map(s => ({...s, type: 'student'})),
        ...teachers.map(t => ({...t, type: 'teacher'}))
    ];
    
    const csvContent = convertToCSV(allUsers);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showMessage('Users exported successfully!', 'success');
}

function convertToCSV(data) {
    if (!data.length) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            return typeof value === 'string' ? `"${value}"` : value;
        });
        csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
}

function resetAllPasswords() {
    if (confirm('This will reset passwords for all users. Continue?')) {
        showMessage('Password reset emails sent to all users!', 'success');
    }
}

function sendBulkNotifications() {
    const message = prompt('Enter notification message:');
    if (message) {
        showMessage(`Notification sent to all users: "${message}"`, 'success');
    }
}

function generateUserReports() {
    showMessage('Generating comprehensive user reports...', 'info');
    setTimeout(() => {
        showMessage('User reports generated and saved!', 'success');
    }, 2000);
}

function systemHealthCheck() {
    showMessage('Running system health check...', 'info');
    setTimeout(() => {
        showMessage('System health: All systems operational!', 'success');
    }, 3000);
}

function bulkStudentOperations() {
    showMessage('Opening bulk student operations panel...', 'info');
}

function generateReports() {
    showMessage('Opening report generation wizard...', 'info');
}

function systemMaintenance() {
    showMessage('Opening system maintenance panel...', 'info');
}

function securityAudit() {
    showMessage('Opening security audit dashboard...', 'info');
}

function refreshMonitoring() {
    showMessage('Refreshing monitoring data...', 'info');
    setTimeout(() => {
        showMessage('Monitoring data updated!', 'success');
    }, 1500);
}

function cleanupOldData() {
    if (confirm('This will remove data older than 2 years. Continue?')) {
        showMessage('Old data cleanup completed!', 'success');
    }
}

function optimizeDatabase() {
    showMessage('Optimizing database...', 'info');
    setTimeout(() => {
        showMessage('Database optimization completed!', 'success');
    }, 3000);
}

function exportAllData() {
    showMessage('Exporting all system data...', 'info');
    setTimeout(() => {
        createBackup();
    }, 1000);
}

// Enhanced showModule function to handle admin dashboard
function showModuleEnhanced(moduleName) {
    // Call original showModule function
    showModuleOriginal(moduleName);
    
    // Add admin dashboard enhancement
    if (moduleName === 'dashboard' && currentUser && currentUser.userType === 'admin') {
        // Retry until container exists
        let attempts = 0;
        const tryLoad = function() {
            attempts++;
            const container = document.getElementById('dashboard');
            if (container) {
                loadAdminDashboard();
                return;
            }
            if (attempts < 10) {
                setTimeout(tryLoad, 100);
            }
        };
        setTimeout(tryLoad, 50);
    }
}

// Store reference to original function and replace
const showModuleOriginal = showModule;
showModule = showModuleEnhanced;// =
// === ADDITIONAL ADMIN MODAL FUNCTIONS =====

// Teacher Modal Functions
function openTeacherModal(teacherId = null) {
    const modal = document.getElementById('teacherModal');
    const form = document.getElementById('teacherForm');
    
    if (teacherId) {
        const teacher = teachers.find(t => t.id === teacherId);
        if (teacher) {
            document.getElementById('teacherName').value = teacher.name;
            document.getElementById('teacherEmail').value = teacher.email;
            document.getElementById('teacherDepartment').value = teacher.department;
            document.getElementById('teacherSubject').value = teacher.subject;
            document.getElementById('teacherExperience').value = teacher.experience;
        }
    } else {
        form.reset();
    }
    
    modal.style.display = 'block';
}

// Course Modal Functions
function openCourseModal(courseCode = null) {
    const modal = document.getElementById('courseModal');
    const form = document.getElementById('courseForm');
    
    if (courseCode) {
        const course = courses.find(c => c.code === courseCode);
        if (course) {
            document.getElementById('courseCode').value = course.code;
            document.getElementById('courseName').value = course.name;
            document.getElementById('courseDepartment').value = course.department;
            document.getElementById('courseDuration').value = course.duration;
            document.getElementById('courseCredits').value = course.credits;
        }
    } else {
        form.reset();
    }
    
    modal.style.display = 'block';
}

// Fee Modal Functions
function openFeeModal(feeId = null) {
    const modal = document.getElementById('feeModal');
    const form = document.getElementById('feeForm');
    const studentSelect = document.getElementById('feeStudentId');
    
    // Populate student dropdown
    studentSelect.innerHTML = '<option value="">Select Student</option>';
    students.forEach(student => {
        const option = document.createElement('option');
        option.value = student.id;
        option.textContent = `${student.name} (${student.email})`;
        studentSelect.appendChild(option);
    });
    
    if (feeId) {
        const fee = fees.find(f => f.id === feeId);
        if (fee) {
            document.getElementById('feeStudentId').value = fee.studentId;
            document.getElementById('feeAmount').value = fee.amount;
            document.getElementById('feeDueDate').value = fee.dueDate;
            document.getElementById('feeType').value = fee.type || 'tuition';
        }
    } else {
        form.reset();
    }
    
    modal.style.display = 'block';
}

// Exam Modal Functions
function openExamModal(examId = null) {
    const modal = document.getElementById('examModal');
    const form = document.getElementById('examForm');
    
    if (examId) {
        const exam = examinations.find(e => e.id === examId);
        if (exam) {
            document.getElementById('examSubject').value = exam.subject;
            document.getElementById('examDate').value = exam.date;
            document.getElementById('examTime').value = exam.time;
            document.getElementById('examDuration').value = exam.duration;
            document.getElementById('examRoom').value = exam.room || '';
        }
    } else {
        form.reset();
    }
    
    modal.style.display = 'block';
}

// Bulk User Import Modal
function openBulkUserModal() {
    const modal = document.getElementById('bulkUserModal');
    modal.style.display = 'block';
}

// Form Submission Handlers
document.addEventListener('DOMContentLoaded', function() {
    // Teacher Form Handler
    document.getElementById('teacherForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('teacherName').value,
            email: document.getElementById('teacherEmail').value,
            department: document.getElementById('teacherDepartment').value,
            subject: document.getElementById('teacherSubject').value,
            experience: parseInt(document.getElementById('teacherExperience').value)
        };

        const existingTeacher = teachers.find(t => t.email === formData.email);
        
        if (existingTeacher) {
            Object.assign(existingTeacher, formData);
            showMessage('Teacher updated successfully!', 'success');
        } else {
            const newTeacher = {
                id: Date.now(),
                ...formData,
                status: 'active',
                joinDate: new Date().toISOString()
            };
            teachers.push(newTeacher);
            showMessage('Teacher added successfully!', 'success');
        }

        saveDataToStorage();
        loadTeachers();
        closeModal('teacherModal');
    });

    // Course Form Handler
    document.getElementById('courseForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = {
            code: document.getElementById('courseCode').value,
            name: document.getElementById('courseName').value,
            department: document.getElementById('courseDepartment').value,
            duration: document.getElementById('courseDuration').value,
            credits: parseInt(document.getElementById('courseCredits').value)
        };

        const existingCourse = courses.find(c => c.code === formData.code);
        
        if (existingCourse) {
            Object.assign(existingCourse, formData);
            showMessage('Course updated successfully!', 'success');
        } else {
            courses.push(formData);
            showMessage('Course added successfully!', 'success');
        }

        saveDataToStorage();
        loadCourses();
        closeModal('courseModal');
    });

    // Fee Form Handler
    document.getElementById('feeForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const studentId = parseInt(document.getElementById('feeStudentId').value);
        const student = students.find(s => s.id === studentId);
        
        const formData = {
            studentId: studentId,
            studentName: student ? student.name : 'Unknown',
            amount: parseFloat(document.getElementById('feeAmount').value),
            dueDate: document.getElementById('feeDueDate').value,
            type: document.getElementById('feeType').value,
            status: 'pending'
        };

        const newFee = {
            id: Date.now(),
            ...formData,
            createdDate: new Date().toISOString()
        };
        
        fees.push(newFee);
        showMessage('Fee record added successfully!', 'success');

        saveDataToStorage();
        loadFees();
        closeModal('feeModal');
    });

    // Exam Form Handler
    document.getElementById('examForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = {
            subject: document.getElementById('examSubject').value,
            date: document.getElementById('examDate').value,
            time: document.getElementById('examTime').value,
            duration: parseInt(document.getElementById('examDuration').value),
            room: document.getElementById('examRoom').value
        };

        const newExam = {
            id: Date.now(),
            ...formData,
            createdDate: new Date().toISOString()
        };
        
        examinations.push(newExam);
        showMessage('Exam scheduled successfully!', 'success');

        saveDataToStorage();
        loadExaminations();
        closeModal('examModal');
    });
});

// Bulk Import Processing
function processBulkImport() {
    const fileInput = document.getElementById('bulkUserFile');
    const sendEmails = document.getElementById('sendWelcomeEmails').checked;
    
    if (!fileInput.files[0]) {
        showMessage('Please select a CSV file', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const csv = e.target.result;
            const lines = csv.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            
            let importedCount = 0;
            let errorCount = 0;
            
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === '') continue;
                
                const values = lines[i].split(',').map(v => v.trim());
                const userData = {};
                
                headers.forEach((header, index) => {
                    userData[header] = values[index] || '';
                });
                
                if (userData.name && userData.email && userData.type) {
                    if (userData.type.toLowerCase() === 'student') {
                        const newStudent = {
                            id: Date.now() + i,
                            name: userData.name,
                            email: userData.email,
                            course: userData.course || 'General',
                            year: userData.year || '1',
                            status: 'active',
                            enrollmentDate: new Date().toISOString()
                        };
                        students.push(newStudent);
                        importedCount++;
                    } else if (userData.type.toLowerCase() === 'teacher') {
                        const newTeacher = {
                            id: Date.now() + i,
                            name: userData.name,
                            email: userData.email,
                            department: userData.department || 'General',
                            subject: userData.subject || 'General',
                            experience: parseInt(userData.experience) || 0,
                            status: 'active',
                            joinDate: new Date().toISOString()
                        };
                        teachers.push(newTeacher);
                        importedCount++;
                    }
                } else {
                    errorCount++;
                }
            }
            
            saveDataToStorage();
            
            if (importedCount > 0) {
                showMessage(`Successfully imported ${importedCount} users${errorCount > 0 ? ` (${errorCount} errors)` : ''}`, 'success');
                if (sendEmails) {
                    showMessage('Welcome emails sent to new users', 'info');
                }
            } else {
                showMessage('No valid users found in the file', 'error');
            }
            
            closeModal('bulkUserModal');
            
        } catch (error) {
            showMessage('Error processing CSV file', 'error');
        }
    };
    
    reader.readAsText(file);
}

// Enhanced placeholder functions with actual functionality
function viewTeacher(id) {
    const teacher = teachers.find(t => t.id === id);
    if (teacher) {
        const details = `
Teacher Details:
Name: ${teacher.name}
Email: ${teacher.email}
Department: ${teacher.department}
Subject: ${teacher.subject}
Experience: ${teacher.experience} years
Status: ${teacher.status}
        `;
        alert(details);
    }
}

function editTeacher(id) {
    openTeacherModal(id);
}

function deleteTeacher(id) {
    if (confirm('Are you sure you want to delete this teacher?')) {
        teachers = teachers.filter(t => t.id !== id);
        saveDataToStorage();
        loadTeachers();
        showMessage('Teacher deleted successfully!', 'success');
    }
}

function viewCourse(code) {
    const course = courses.find(c => c.code === code);
    if (course) {
        const details = `
Course Details:
Code: ${course.code}
Name: ${course.name}
Department: ${course.department}
Duration: ${course.duration}
Credits: ${course.credits}
        `;
        alert(details);
    }
}

function editCourse(code) {
    openCourseModal(code);
}

function deleteCourse(code) {
    if (confirm('Are you sure you want to delete this course?')) {
        courses = courses.filter(c => c.code !== code);
        saveDataToStorage();
        loadCourses();
        showMessage('Course deleted successfully!', 'success');
    }
}

function editAttendance(id) {
    const record = attendance.find(a => a.id === id);
    if (record) {
        const newStatus = record.status === 'present' ? 'absent' : 'present';
        record.status = newStatus;
        saveDataToStorage();
        loadAttendance();
        showMessage(`Attendance updated to ${newStatus}`, 'success');
    }
}

function viewFee(id) {
    const fee = fees.find(f => f.id === id);
    if (fee) {
        const details = `
Fee Details:
Student: ${fee.studentName}
Amount: $${fee.amount}
Due Date: ${fee.dueDate}
Status: ${fee.status}
Type: ${fee.type || 'Tuition'}
        `;
        alert(details);
    }
}

function editFee(id) {
    openFeeModal(id);
}

function viewExam(id) {
    const exam = examinations.find(e => e.id === id);
    if (exam) {
        const details = `
Exam Details:
Subject: ${exam.subject}
Date: ${exam.date}
Time: ${exam.time}
Duration: ${exam.duration} minutes
Room: ${exam.room || 'TBA'}
        `;
        alert(details);
    }
}

function editExam(id) {
    openExamModal(id);
}

function deleteExam(id) {
    if (confirm('Are you sure you want to delete this exam?')) {
        examinations = examinations.filter(e => e.id !== id);
        saveDataToStorage();
        loadExaminations();
        showMessage('Exam deleted successfully!', 'success');
    }
}

// Load admin settings on startup
function loadAdminSettings() {
    const savedSettings = localStorage.getItem('erp_admin_settings');
    if (savedSettings) {
        adminData.systemSettings = { ...adminData.systemSettings, ...JSON.parse(savedSettings) };
    }
}// ==
// === HEADER USER CONTROLS =====

// Profile Menu Functionality
function openProfileMenu() {
    // Create profile dropdown if it doesn't exist
    let dropdown = document.querySelector('.profile-dropdown');
    
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'profile-dropdown';
        dropdown.innerHTML = `
            <a href="#" class="profile-dropdown-item" onclick="openProfileSettings()">
                <i class="fas fa-user-cog"></i>
                <span>Profile Settings</span>
            </a>
            <a href="#" class="profile-dropdown-item" onclick="openAccountSettings()">
                <i class="fas fa-cog"></i>
                <span>Account Settings</span>
            </a>
            <a href="#" class="profile-dropdown-item" onclick="viewNotifications()">
                <i class="fas fa-bell"></i>
                <span>Notifications</span>
            </a>
            <a href="#" class="profile-dropdown-item" onclick="openHelpCenter()">
                <i class="fas fa-question-circle"></i>
                <span>Help Center</span>
            </a>
            <div class="profile-dropdown-item" style="border-top: 1px solid var(--border-light); margin-top: 0.5rem; padding-top: 0.75rem;">
                <i class="fas fa-info-circle"></i>
                <span>Version 1.0.0</span>
            </div>
        `;
        
        // Position dropdown relative to profile button
        const profileBtn = document.querySelector('.profile-btn');
        profileBtn.style.position = 'relative';
        profileBtn.appendChild(dropdown);
    }
    
    // Toggle dropdown visibility
    dropdown.classList.toggle('show');
    
    // Close dropdown when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeDropdown(e) {
            if (!e.target.closest('.profile-btn')) {
                dropdown.classList.remove('show');
                document.removeEventListener('click', closeDropdown);
            }
        });
    }, 100);
}

// Profile Menu Functions
function openProfileSettings() {
    showMessage('Opening profile settings...', 'info');
    // Here you would typically open a profile settings modal
    closeProfileDropdown();
}

function openAccountSettings() {
    showMessage('Opening account settings...', 'info');
    // Here you would typically open account settings modal
    closeProfileDropdown();
}

function viewNotifications() {
    showMessage('Opening notifications...', 'info');
    // Here you would typically open notifications panel
    closeProfileDropdown();
}

function openHelpCenter() {
    showMessage('Opening help center...', 'info');
    // Here you would typically open help documentation
    closeProfileDropdown();
}

function closeProfileDropdown() {
    const dropdown = document.querySelector('.profile-dropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
}

// Enhanced Logout Function
function logout() {
    console.log('Logout function called');
    
    try {
        // Show confirmation dialog
        const confirmLogout = confirm('Are you sure you want to logout?\n\nThis will end your current session.');
        
        if (confirmLogout) {
            console.log('User confirmed logout');
            
            // Clear all user data
            localStorage.removeItem('erp_user_data');
            localStorage.removeItem('erp_students');
            localStorage.removeItem('erp_teachers');
            localStorage.removeItem('erp_courses');
            localStorage.removeItem('erp_attendance');
            localStorage.removeItem('erp_fees');
            localStorage.removeItem('erp_examinations');
            localStorage.removeItem('erp_books');
            localStorage.removeItem('erp_admin_settings');
            
            // Show success message
            
            // Redirect to login page
            window.location.href = 'login.html';
        } else {
            console.log('User cancelled logout');
        }
    } catch (error) {
        console.error('Error during logout:', error);
        alert('Error during logout. Please try again.');
    }
}

// Make logout function globally accessible
window.logout = logout;

// Notification Badge Update
function updateNotificationBadge(count = 0) {
    const badge = document.querySelector('.notification-badge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count.toString();
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Initialize notification count
document.addEventListener('DOMContentLoaded', function() {
    // Set initial notification count (you can make this dynamic)
    updateNotificationBadge(3);
    
    // Update user info in header based on current user
    updateHeaderUserInfo();
});

// Update header user info
function updateHeaderUserInfo() {
    if (!currentUser) return;
    
    const userInfoElements = document.querySelectorAll('.user-info-header span');
    let displayText = '';
    
    switch (currentUser.userType) {
        case 'student':
            displayText = `Hello, ${currentUser.fullName}`;
            break;
        case 'teacher':
            displayText = `Hello, ${currentUser.fullName}`;
            break;
        case 'admin':
        default:
            displayText = 'Hello, Admin';
            break;
    }
    
    userInfoElements.forEach(element => {
        element.textContent = displayText;
    });
}

// Add keyboard shortcuts for logout
document.addEventListener('keydown', function(e) {
    // Ctrl+Shift+L for logout
    if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        logout();
    }
    
    // Escape key to close profile dropdown
    if (e.key === 'Escape') {
        closeProfileDropdown();
    }
});

// Removed beforeunload event listener to prevent navigation popups
// The beforeunload popup was causing issues with normal page navigation

// Enhanced logout with session flag
function enhancedLogout() {
    sessionStorage.setItem('logging_out', 'true');
    logout();
}// ===== 
// MISSING FUNCTION DEFINITIONS =====

// Quick Stats Function
function showQuickStats() {
    const stats = {
        totalUsers: students.length + teachers.length,
        activeStudents: students.filter(s => s.status === 'active').length,
        activeTeachers: teachers.filter(t => t.status === 'active').length,
        totalCourses: courses.length,
        pendingFees: fees.filter(f => f.status === 'pending').length,
        upcomingExams: examinations.filter(e => new Date(e.date) > new Date()).length
    };
    
    const statsHTML = `
        <div class="quick-stats-modal">
            <h3>System Quick Stats</h3>
            <div class="stats-grid">
                <div class="stat-item">
                    <strong>${stats.totalUsers}</strong>
                    <span>Total Users</span>
                </div>
                <div class="stat-item">
                    <strong>${stats.activeStudents}</strong>
                    <span>Active Students</span>
                </div>
                <div class="stat-item">
                    <strong>${stats.activeTeachers}</strong>
                    <span>Active Teachers</span>
                </div>
                <div class="stat-item">
                    <strong>${stats.totalCourses}</strong>
                    <span>Total Courses</span>
                </div>
                <div class="stat-item">
                    <strong>${stats.pendingFees}</strong>
                    <span>Pending Fees</span>
                </div>
                <div class="stat-item">
                    <strong>${stats.upcomingExams}</strong>
                    <span>Upcoming Exams</span>
                </div>
            </div>
        </div>
    `;
    
    // Create and show modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
            ${statsHTML}
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Load Admin Settings on Startup
document.addEventListener('DOMContentLoaded', function() {
    loadAdminSettings();
});

// Fix any remaining undefined function calls
function loadAdminSettings() {
    const savedSettings = localStorage.getItem('erp_admin_settings');
    if (savedSettings) {
        try {
            adminData.systemSettings = { ...adminData.systemSettings, ...JSON.parse(savedSettings) };
        } catch (error) {
            console.warn('Error loading admin settings:', error);
        }
    }
}

// Ensure adminData is defined
if (typeof adminData === 'undefined') {
    let adminData = {
        systemSettings: {
            schoolName: 'Astra School',
            academicYear: '2024-2025',
            semester: 'Spring',
            timezone: 'UTC+0',
            language: 'English',
            currency: 'USD'
        },
        userManagement: {
            totalUsers: 0,
            activeUsers: 0,
            pendingApprovals: 0
        },
        systemStats: {
            totalStorage: '100GB',
            usedStorage: '45GB',
            serverUptime: '99.9%',
            lastBackup: new Date().toISOString()
        }
    };
}// ===
// == QUICK FIX FOR MISSING FUNCTIONS =====

// Modal functions
function closeModal(modalId) {
    console.log('Closing modal:', modalId);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Placeholder functions for buttons
function openStudentModal() {
    console.log('Opening student modal');
    const modal = document.getElementById('studentModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function openTeacherModal() {
    console.log('Opening teacher modal');
    const modal = document.getElementById('teacherModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function openCourseModal() {
    console.log('Opening course modal');
    const modal = document.getElementById('courseModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function openFeeModal() {
    console.log('Opening fee modal');
    const modal = document.getElementById('feeModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function openExamModal() {
    console.log('Opening exam modal');
    const modal = document.getElementById('examModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function markAttendance() {
    console.log('Mark attendance clicked');
    alert('Mark attendance functionality');
}

// Make sure showMessage function exists
function showMessage(message, type = 'info') {
    console.log('Message:', message, 'Type:', type);
    alert(message);
}

// Ensure showModule function works
function showModule(moduleName) {
    console.log('Showing module:', moduleName);
    
    // Hide all modules
    document.querySelectorAll('.module').forEach(module => {
        module.classList.remove('active');
    });
    
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected module
    const targetModule = document.getElementById(moduleName);
    if (targetModule) {
        targetModule.classList.add('active');
    }
    
    // Add active class to selected nav item
    const navItem = document.querySelector(`[data-module="${moduleName}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }
    
    currentModule = moduleName;
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM ready, setting up click handlers...');
    
    // Add click handlers to all buttons
    document.addEventListener('click', function(e) {
        console.log('Click detected on:', e.target);
        
        // Handle logout button clicks
        if (e.target.closest('.logout-btn')) {
            e.preventDefault();
            logout();
        }
        
        // Handle modal close buttons
        if (e.target.classList.contains('close')) {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
            }
        }
    });
});

console.log('Script loaded successfully'); // ===== LOGOUT BUTTON FIX =====

// Ensure logout button works when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Setting up logout button...');
    
    // Find all logout buttons and add event listeners
    const logoutButtons = document.querySelectorAll('.logout-btn');
    console.log('Found logout buttons:', logoutButtons.length);
    
    logoutButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Logout button clicked via event listener');
            logout();
        });
    });
    
    // Also add to header buttons
    const headerBtns = document.querySelectorAll('.header-btn');
    headerBtns.forEach(btn => {
        if (btn.classList.contains('logout-btn')) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Header logout button clicked');
                logout();
            });
        }
    });
});

// Alternative logout function for testing
function testLogout() {
    console.log('Test logout called');
    if (confirm('Test logout - are you sure?')) {
        alert('Test logout successful!');
        window.location.href = 'login.html';
    }
}

// Make functions globally available
window.testLogout = testLogout;
window.logout = logout;

console.log('Logout functions loaded and ready'); // ===
// == ROLE-BASED UI CUSTOMIZATION =====

function customizeUIForUserRole() {
    if (!currentUser) return;
    
    const userType = currentUser.userType;
    console.log('Customizing UI for user type:', userType);
    
    // Apply role-specific styling
    document.body.className = `user-${userType}`;
    
    // Customize navigation based on role
    customizeNavigation(userType);
    
    // Customize dashboard content
    customizeDashboard(userType);
    
    // Hide/show modules based on permissions
    setModulePermissions(userType);
    
    // Update header styling
    updateHeaderForRole(userType);
}

function customizeNavigation(userType) {
    const navItems = document.querySelectorAll('.nav-item');
    
    // Define permissions for each role - updated to match actual navigation structure
    const permissions = {
        student: ['dashboard', 'courses', 'grades', 'attendance', 'assignments', 'schedule', 'lms'],
        teacher: ['dashboard', 'classes', 'students', 'grading', 'attendance', 'assignments', 'reports'],
        admin: ['dashboard', 'users', 'students', 'teachers', 'courses', 'hostel', 'system', 'reports']
    };
    
    const allowedModules = permissions[userType] || [];
    
    navItems.forEach(item => {
        const module = item.getAttribute('data-module');
        // If no data-module, don't filter this item (keep visible)
        if (!module) return;
        // Show all navigation items for now to ensure consistent display
        item.style.display = 'flex';
    });
}

function customizeDashboard(userType) {
    const dashboardModule = document.getElementById('dashboard');
    if (!dashboardModule) return;
    
    // Clear existing dashboard content
    dashboardModule.innerHTML = '';
    
    // Create role-specific dashboard
    switch(userType) {
        case 'student':
            createStudentDashboard(dashboardModule);
            break;
        case 'teacher':
            createTeacherDashboard(dashboardModule);
            break;
        case 'admin':
            createAdminDashboard(dashboardModule);
            break;
    }
}

function createStudentDashboard(container) {
    container.innerHTML = `
        <div class="module-header">
            <h2>Student Dashboard</h2>
            <div class="student-actions">
                <button class="btn btn-primary" onclick="viewMyGrades()">
                    <i class="fas fa-chart-line"></i> My Grades
                </button>
                <button class="btn btn-success" onclick="viewSchedule()">
                    <i class="fas fa-calendar"></i> My Schedule
                </button>
            </div>
        </div>
        
        <div class="student-stats-grid">
            <div class="stat-card student-card">
                <div class="stat-icon bg-primary">
                    <i class="fas fa-book-open"></i>
                </div>
                <div class="stat-info">
                    <h3>6</h3>
                    <p>Enrolled Courses</p>
                    <small>This semester</small>
                </div>
            </div>
            <div class="stat-card student-card">
                <div class="stat-icon bg-success">
                    <i class="fas fa-percentage"></i>
                </div>
                <div class="stat-info">
                    <h3>92%</h3>
                    <p>Average Grade</p>
                    <small>Current GPA: 9.2</small>
                </div>
            </div>
            <div class="stat-card student-card">
                <div class="stat-icon bg-warning">
                    <i class="fas fa-calendar-check"></i>
                </div>
                <div class="stat-info">
                    <h3>95%</h3>
                    <p>Attendance Rate</p>
                    <small>This month</small>
                </div>
            </div>
            <div class="stat-card student-card">
                <div class="stat-icon bg-danger">
                    <i class="fas fa-clipboard-list"></i>
                </div>
                <div class="stat-info">
                    <h3>3</h3>
                    <p>Pending Assignments</p>
                    <small>Due this week</small>
                </div>
            </div>
        </div>
        
        <div class="student-content-grid">
            <div class="student-section">
                <h3>My Courses</h3>
                <div class="course-list">
                    <div class="course-item">
                        <div class="course-info">
                            <h4>Computer Science 101</h4>
                            <p>Prof. Sarah Wilson</p>
                        </div>
                        <div class="course-grade">A-</div>
                    </div>
                    <div class="course-item">
                        <div class="course-info">
                            <h4>Mathematics 201</h4>
                            <p>Prof. David Brown</p>
                        </div>
                        <div class="course-grade">B+</div>
                    </div>
                    <div class="course-item">
                        <div class="course-info">
                            <h4>Physics 150</h4>
                            <p>Dr. James Thompson</p>
                        </div>
                        <div class="course-grade">A</div>
                    </div>
                </div>
            </div>
            
            <div class="student-section">
                <h3>Upcoming Deadlines</h3>
                <div class="deadline-list">
                    <div class="deadline-item urgent">
                        <div class="deadline-info">
                            <h4>Physics Lab Report</h4>
                            <p>Due: Tomorrow</p>
                        </div>
                        <div class="deadline-status">Urgent</div>
                    </div>
                    <div class="deadline-item">
                        <div class="deadline-info">
                            <h4>Math Assignment 5</h4>
                            <p>Due: Friday</p>
                        </div>
                        <div class="deadline-status">Pending</div>
                    </div>
                    <div class="deadline-item">
                        <div class="deadline-info">
                            <h4>CS Project Presentation</h4>
                            <p>Due: Next Week</p>
                        </div>
                        <div class="deadline-status">In Progress</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function createTeacherDashboard(container) {
    container.innerHTML = `
        <div class="module-header">
            <h2>Teacher Dashboard</h2>
            <div class="teacher-actions">
                <button class="btn btn-primary" onclick="gradeAssignments()">
                    <i class="fas fa-edit"></i> Grade Assignments
                </button>
                <button class="btn btn-success" onclick="createAssignment()">
                    <i class="fas fa-plus"></i> Create Assignment
                </button>
            </div>
        </div>
        
        <div class="teacher-stats-grid">
            <div class="stat-card teacher-card">
                <div class="stat-icon bg-primary">
                    <i class="fas fa-chalkboard"></i>
                </div>
                <div class="stat-info">
                    <h3>4</h3>
                    <p>Classes Teaching</p>
                    <small>This semester</small>
                </div>
            </div>
            <div class="stat-card teacher-card">
                <div class="stat-icon bg-success">
                    <i class="fas fa-users"></i>
                </div>
                <div class="stat-info">
                    <h3>156</h3>
                    <p>Total Students</p>
                    <small>Across all classes</small>
                </div>
            </div>
            <div class="stat-card teacher-card">
                <div class="stat-icon bg-warning">
                    <i class="fas fa-clipboard-check"></i>
                </div>
                <div class="stat-info">
                    <h3>23</h3>
                    <p>Assignments to Grade</p>
                    <small>Pending review</small>
                </div>
            </div>
            <div class="stat-card teacher-card">
                <div class="stat-icon bg-danger">
                    <i class="fas fa-calendar-alt"></i>
                </div>
                <div class="stat-info">
                    <h3>2</h3>
                    <p>Classes Today</p>
                    <small>Next: 2:00 PM</small>
                </div>
            </div>
        </div>
        
        <div class="teacher-content-grid">
            <div class="teacher-section">
                <h3>My Classes</h3>
                <div class="class-list">
                    <div class="class-item">
                        <div class="class-info">
                            <h4>Computer Science 101</h4>
                            <p>45 students • Room 201A</p>
                        </div>
                        <div class="class-time">Mon, Wed, Fri 10:00 AM</div>
                    </div>
                    <div class="class-item">
                        <div class="class-info">
                            <h4>Advanced Programming</h4>
                            <p>32 students • Room 301B</p>
                        </div>
                        <div class="class-time">Tue, Thu 2:00 PM</div>
                    </div>
                    <div class="class-item">
                        <div class="class-info">
                            <h4>Data Structures</h4>
                            <p>38 students • Room 205</p>
                        </div>
                        <div class="class-time">Mon, Wed 3:00 PM</div>
                    </div>
                </div>
            </div>
            
            <div class="teacher-section">
                <h3>Recent Student Activity</h3>
                <div class="activity-list">
                    <div class="activity-item">
                        <i class="fas fa-file-upload"></i>
                        <span>John Doe submitted Assignment 3</span>
                        <small>2 hours ago</small>
                    </div>
                    <div class="activity-item">
                        <i class="fas fa-question-circle"></i>
                        <span>Sarah Wilson asked a question in forum</span>
                        <small>4 hours ago</small>
                    </div>
                    <div class="activity-item">
                        <i class="fas fa-check-circle"></i>
                        <span>Mike Johnson completed quiz</span>
                        <small>1 day ago</small>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function createAdminDashboard(container) {
    // Keep the existing admin dashboard or enhance it
    if (currentUser && currentUser.userType === 'admin') {
        loadAdminDashboard();
    }
}

function setModulePermissions(userType) {
    const modules = document.querySelectorAll('.module');
    
    // Define which modules each role can access
    const modulePermissions = {
        student: {
            students: false,
            teachers: false,
            fees: 'readonly', // Can view their own fees only
            reports: false
        },
        teacher: {
            fees: false, // Teachers can't manage fees
            reports: 'limited' // Limited reporting access
        },
        admin: {} // Admin has access to everything
    };
    
    const permissions = modulePermissions[userType] || {};
    
    modules.forEach(module => {
        const moduleId = module.id;
        const permission = permissions[moduleId];
        
        if (permission === false) {
            module.style.display = 'none';
        } else if (permission === 'readonly') {
            // Add readonly styling or functionality
            module.classList.add('readonly-module');
        }
    });
}

function updateHeaderForRole(userType) {
    const header = document.querySelector('.header');
    const userInfo = document.querySelector('.user-info');
    
    // Add role-specific classes
    header.classList.add(`header-${userType}`);
    if (userInfo) {
        userInfo.classList.add(`user-info-${userType}`);
    }
}

// Role-specific action functions
function viewMyGrades() {
    showMessage('Opening grade report...', 'info');
}

function viewSchedule() {
    showMessage('Opening class schedule...', 'info');
}

function gradeAssignments() {
    showMessage('Opening grading interface...', 'info');
}

function createAssignment() {
    showMessage('Opening assignment creator...', 'info');
}

// Quick role switcher for testing (remove in production)
function switchUserRole(newRole) {
    const userData = {
        userType: newRole,
        fullName: `${newRole.charAt(0).toUpperCase() + newRole.slice(1)} User`,
        email: `${newRole}@school.edu`,
        loginTime: new Date().toISOString()
    };
    
    localStorage.setItem('erp_user_data', JSON.stringify(userData));
    currentUser = userData;
    
    // Refresh the page to apply new role
    location.reload();
}

// Add role switcher to console for testing
console.log('Role switcher available: switchUserRole("student"), switchUserRole("teacher"), switchUserRole("admin")');
window.switchUserRole = switchUserRole;

// Create and manage notification dropdown anchored to the notification button
(function(){
    function buildNotificationDropdown() {
        let dropdown = document.querySelector('.notification-dropdown');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.className = 'notification-dropdown';
            dropdown.innerHTML = `
                <div class="notification-header">
                    <span>Notifications</span>
                    <button class="clear-notifications" title="Clear all"><i class="fas fa-trash"></i></button>
                </div>
                <div class="notification-list">
                    <div class="notification-item unread">
                        <i class="fas fa-bullhorn"></i>
                        <div class="notification-content">
                            <div class="notification-title">System maintenance this weekend</div>
                            <div class="notification-time">2h ago</div>
                        </div>
                    </div>
                    <div class="notification-item">
                        <i class="fas fa-envelope"></i>
                        <div class="notification-content">
                            <div class="notification-title">New message from Admin</div>
                            <div class="notification-time">Yesterday</div>
                        </div>
                    </div>
                </div>
                <div class="notification-footer">
                    <a href="#" class="view-all">View all</a>
                </div>
            `;
            // Ensure a known width to calculate position before showing
            dropdown.style.width = '320px';
            document.body.appendChild(dropdown);
        }
        return dropdown;
    }

    function positionDropdown(dropdown, anchor) {
        const rect = anchor.getBoundingClientRect();
        const dropdownWidth = dropdown.offsetWidth || 320; // fallback if not measured yet
        const desiredLeft = rect.right - dropdownWidth;
        const clampedLeft = Math.min(
            Math.max(8, desiredLeft),
            window.innerWidth - dropdownWidth - 8
        );
        dropdown.style.position = 'fixed';
        dropdown.style.top = (rect.bottom + 8) + 'px';
        dropdown.style.left = clampedLeft + 'px';
        dropdown.style.right = 'auto';
        dropdown.classList.add('show');
    }

    function hideDropdown(dropdown) {
        dropdown.classList.remove('show');
    }

    function initNotificationHover() {
        const btn = document.querySelector('.notification-btn');
        if (!btn) return;
        const dropdown = buildNotificationDropdown();

        let hoverWithin = false;

        function onEnter() {
            hoverWithin = true;
            positionDropdown(dropdown, btn);
        }
        function onLeave() {
            hoverWithin = false;
            setTimeout(() => { if (!hoverWithin) hideDropdown(dropdown); }, 150);
        }

        // Hover (desktop)
        btn.addEventListener('mouseenter', onEnter);
        btn.addEventListener('mouseleave', onLeave);
        dropdown.addEventListener('mouseenter', () => { hoverWithin = true; });
        dropdown.addEventListener('mouseleave', () => { hoverWithin = false; hideDropdown(dropdown); });

        // Click toggle (mobile and fallback)
        btn.addEventListener('click', function(e){
            e.preventDefault();
            if (dropdown.classList.contains('show')) {
                hideDropdown(dropdown);
            } else {
                positionDropdown(dropdown, btn);
            }
        });

        // Clear notifications demo
        dropdown.querySelector('.clear-notifications').addEventListener('click', function(e){
            e.preventDefault();
            const list = dropdown.querySelector('.notification-list');
            list.innerHTML = '<div class="notification-empty">No notifications</div>';
            updateNotificationBadge(0);
        });
    }

    document.addEventListener('DOMContentLoaded', initNotificationHover);
})();

// ===== HOSTEL MANAGEMENT (Static, localStorage) =====
// Data models and storage
const hostelStore = {
    hostels: [], // {id, name, gender, address}
    rooms: [],   // {id, hostelId, roomNo, capacity}
    allocations: [] // {id, studentId, studentName, hostelId, roomId, bedNo}
};

function loadHostelData() {
    try {
        const data = JSON.parse(localStorage.getItem('erp_hostel_data'));
        if (data) {
            hostelStore.hostels = data.hostels || [];
            hostelStore.rooms = data.rooms || [];
            hostelStore.allocations = data.allocations || [];
            return;
        }
    } catch (_) {}
    seedHostelSampleData();
}

function saveHostelData() {
    localStorage.setItem('erp_hostel_data', JSON.stringify(hostelStore));
}

function seedHostelSampleData() {
    hostelStore.hostels = [
        { id: 'H1', name: 'A Block', gender: 'Male', address: 'North Campus' },
        { id: 'H2', name: 'B Block', gender: 'Female', address: 'East Campus' }
    ];
    hostelStore.rooms = [
        { id: 'R1', hostelId: 'H1', roomNo: '101', capacity: 3 },
        { id: 'R2', hostelId: 'H1', roomNo: '102', capacity: 2 },
        { id: 'R3', hostelId: 'H2', roomNo: '201', capacity: 2 }
    ];
    hostelStore.allocations = [];
    saveHostelData();
}

function getRoomOccupancy(roomId) {
    return hostelStore.allocations.filter(a => a.roomId === roomId).length;
}

function canAllocate(roomId) {
    const room = hostelStore.rooms.find(r => r.id === roomId);
    if (!room) return false;
    return getRoomOccupancy(roomId) < Number(room.capacity || 0);
}

function allocateBed(studentId, studentName, hostelId, roomId) {
    if (!canAllocate(roomId)) return false;
    const takenBeds = hostelStore.allocations
        .filter(a => a.roomId === roomId)
        .map(a => a.bedNo);
    let bedNo = 1;
    while (takenBeds.includes(bedNo)) bedNo += 1;
    const id = 'A' + Date.now();
    hostelStore.allocations.push({ id, studentId, studentName, hostelId, roomId, bedNo });
    saveHostelData();
    return true;
}

function releaseAllocation(allocationId) {
    hostelStore.allocations = hostelStore.allocations.filter(a => a.id !== allocationId);
    saveHostelData();
}

// Page UI bindings for admin_hostel.html
function renderHostelLists() {
    const hostelList = document.getElementById('hostelList');
    const roomList = document.getElementById('roomList');
    const tableBody = document.getElementById('allocationTableBody');
    if (!hostelList || !roomList || !tableBody) return;

    // Populate filter hostels
    const filterHostel = document.getElementById('filterHostel');
    if (filterHostel && !filterHostel.dataset.bound) {
        filterHostel.innerHTML = '<option value="">All</option>' + hostelStore.hostels.map(h => `<option value="${h.id}">${h.name} (${h.gender})</option>`).join('');
        filterHostel.dataset.bound = '1';
        ['filterHostel','filterGender','filterAvailability','filterQuery'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', renderHostelLists);
            if (el && el.tagName === 'SELECT') el.addEventListener('change', renderHostelLists);
        });
    }

    // Hostels with occupancy bars
    hostelList.innerHTML = hostelStore.hostels.map(h => {
        const rooms = hostelStore.rooms.filter(r => r.hostelId === h.id);
        const cap = rooms.reduce((s,r) => s + Number(r.capacity||0), 0);
        const occ = hostelStore.allocations.filter(a => a.hostelId === h.id).length;
        const pct = cap ? Math.round((occ/cap)*100) : 0;
        const color = pct >= 80 ? 'danger' : pct >= 50 ? 'warning' : 'success';
        return `
        <div class="course-card">
            <div class="course-header"><h3>${h.name}</h3><div class="course-grade-badge">${h.gender}</div></div>
            <p class="course-schedule"><i class="fas fa-location-dot"></i> ${h.address}</p>
            <div class="progress-bar" style="height:8px; background:#f3f4f6; border-radius:6px; overflow:hidden; margin-top:6px;">
                <div style="width:${pct}%; height:8px; background:${color==='danger'?'#ef4444':color==='warning'?'#f59e0b':'#10b981'}"></div>
            </div>
            <small>Occupied ${occ}/${cap} (${pct}%)</small>
        </div>`;
    }).join('');

    // Filters
    const fHostel = (document.getElementById('filterHostel')||{}).value || '';
    const fGender = (document.getElementById('filterGender')||{}).value || '';
    const fAvail = (document.getElementById('filterAvailability')||{}).value || '';
    const fQuery = ((document.getElementById('filterQuery')||{}).value || '').toLowerCase();

    roomList.innerHTML = hostelStore.rooms.filter(r => {
        if (fHostel && r.hostelId !== fHostel) return false;
        const hostel = hostelStore.hostels.find(h => h.id === r.hostelId);
        if (fGender && hostel && hostel.gender !== fGender) return false;
        const occ = getRoomOccupancy(r.id), full = occ >= Number(r.capacity||0);
        if (fAvail === 'available' && full) return false;
        if (fAvail === 'full' && !full) return false;
        if (fQuery && !(String(r.roomNo).toLowerCase().includes(fQuery))) return false;
        return true;
    }).map(r => {
        const occ = getRoomOccupancy(r.id);
        const ratio = Number(r.capacity||0) ? occ/Number(r.capacity||0) : 0;
        const color = ratio >= 0.8 ? '#ef4444' : ratio >= 0.5 ? '#f59e0b' : '#10b981';
        return `
        <div class="course-card">
            <div class="course-header"><h3>Room ${r.roomNo}</h3><div class="course-grade-badge">${occ}/${r.capacity}</div></div>
            <p class="course-schedule">Hostel: ${r.hostelId}</p>
            <div class="progress-bar" style="height:8px; background:#f3f4f6; border-radius:6px; overflow:hidden; margin-top:6px;">
                <div style="width:${Math.round(ratio*100)}%; height:8px; background:${color}"></div>
            </div>
        </div>`;
    }).join('');

    tableBody.innerHTML = hostelStore.allocations.map(a => {
        const hostel = hostelStore.hostels.find(h => h.id === a.hostelId);
        const room = hostelStore.rooms.find(r => r.id === a.roomId);
        return `
        <tr>
            <td>${a.studentName} <small>(${a.studentId || ''})</small></td>
            <td>${hostel ? hostel.name : a.hostelId}</td>
            <td>${room ? room.roomNo : a.roomId}</td>
            <td>Bed ${a.bedNo}</td>
            <td><button class="btn btn-sm btn-outline" data-release="${a.id}"><i class="fas fa-user-minus"></i> Release</button></td>
        </tr>`;
    }).join('');

    tableBody.querySelectorAll('[data-release]').forEach(btn => {
        btn.addEventListener('click', function(){
            releaseAllocation(this.getAttribute('data-release'));
            renderHostelLists();
            showMessage('Allocation released', 'success');
        });
    });

    // KPIs
    const totalBeds = hostelStore.rooms.reduce((s,r) => s + Number(r.capacity||0), 0);
    const occupied = hostelStore.allocations.length;
    const pct = totalBeds ? Math.round((occupied/totalBeds)*100) : 0;
    const male = hostelStore.allocations.filter(a => (a.gender||'Male') === 'Male').length;
    const female = occupied - male;
    const kpi = id => document.getElementById(id);
    if (kpi('kpiTotalBeds')) kpi('kpiTotalBeds').textContent = totalBeds;
    if (kpi('kpiOccupied')) kpi('kpiOccupied').textContent = occupied;
    if (kpi('kpiOccupancy')) kpi('kpiOccupancy').textContent = pct + '%';
    if (kpi('kpiGender')) kpi('kpiGender').textContent = male + ':' + female;
}

function initHostelPage() {
    loadHostelData();
    renderHostelLists();

    const btnAddHostel = document.getElementById('btnAddHostel');
    const btnAddRoom = document.getElementById('btnAddRoom');
    const btnAllocate = document.getElementById('btnAllocate');
    const btnRelease = document.getElementById('btnRelease');

    if (btnAddHostel) btnAddHostel.addEventListener('click', function(){
        const name = prompt('Hostel name:');
        if (!name) return;
        const gender = prompt('Gender (Male/Female):', 'Male') || 'Male';
        const address = prompt('Address:', 'Main Campus') || 'Main Campus';
        const id = 'H' + (Date.now());
        hostelStore.hostels.push({ id, name, gender, address });
        saveHostelData();
        renderHostelLists();
    });

    if (btnAddRoom) btnAddRoom.addEventListener('click', function(){
        const hostelId = prompt('Hostel ID (e.g., H1):', hostelStore.hostels[0] && hostelStore.hostels[0].id || 'H1') || '';
        if (!hostelId) return;
        const roomNo = prompt('Room number:', '101') || '101';
        const capacity = Number(prompt('Capacity:', '2') || '2');
        const id = 'R' + (Date.now());
        hostelStore.rooms.push({ id, hostelId, roomNo, capacity });
        saveHostelData();
        renderHostelLists();
    });

    if (btnAllocate) btnAllocate.addEventListener('click', function(){
        const studentName = prompt('Student name:');
        if (!studentName) return;
        const studentId = prompt('Student ID (optional):', '') || '';
        const studentGender = (prompt('Gender (Male/Female):','Male')||'Male');
        // Smart suggestion
        const best = suggestRoom(studentGender);
        let hostelId = best ? best.hostelId : (hostelStore.hostels[0] && hostelStore.hostels[0].id || 'H1');
        let roomId = best ? best.roomId : ((hostelStore.rooms.find(r => r.hostelId === hostelId) || {}).id || '');
        const override = confirm(best ? `Suggested: ${best.hostelName} / Room ${best.roomNo}. Use it?` : 'No suggestion available. Pick manually?') === false;
        if (override) {
            hostelId = prompt('Hostel ID (e.g., H1):', hostelId) || '';
            roomId = prompt('Room ID (e.g., R1):', roomId) || '';
        }
        if (!roomId) { alert('Invalid room'); return; }
        if (!allocateBed(studentId, studentName, hostelId, roomId)) {
            alert('Room is full or invalid');
            return;
        }
        // persist gender for analytics
        const last = hostelStore.allocations[hostelStore.allocations.length-1];
        last.gender = studentGender;
        saveHostelData();
        renderHostelLists();
        showMessage('Allocated successfully', 'success');
    });

    if (btnRelease) btnRelease.addEventListener('click', function(){
        const allocId = prompt('Allocation ID to release:');
        if (!allocId) return;
        releaseAllocation(allocId);
        renderHostelLists();
        showMessage('Allocation released', 'success');
    });
}

// Smart suggestion: by gender and capacity (least occupied first)
function suggestRoom(studentGender) {
    const allowedHostels = hostelStore.hostels.filter(h => !studentGender || h.gender === studentGender);
    const allowedRooms = hostelStore.rooms.filter(r => allowedHostels.find(h => h.id === r.hostelId));
    const available = allowedRooms.map(r => ({
        roomId: r.id,
        roomNo: r.roomNo,
        hostelId: r.hostelId,
        hostelName: (hostelStore.hostels.find(h => h.id === r.hostelId) || {}).name || r.hostelId,
        capacity: Number(r.capacity||0),
        occ: getRoomOccupancy(r.id)
    })).filter(x => x.occ < x.capacity);
    if (!available.length) return null;
    available.sort((a,b) => (a.occ/a.capacity) - (b.occ/b.capacity));
    return available[0];
}

// CSV export (allocations)
function exportAllocationsCSV() {
    const header = ['AllocationID','StudentID','StudentName','Gender','Hostel','Room','Bed'];
    const rows = hostelStore.allocations.map(a => {
        const hostel = hostelStore.hostels.find(h => h.id === a.hostelId);
        const room = hostelStore.rooms.find(r => r.id === a.roomId);
        return [a.id, a.studentId||'', a.studentName||'', a.gender||'', hostel ? hostel.name : a.hostelId, room ? room.roomNo : a.roomId, a.bedNo];
    });
    const csv = [header, ...rows].map(r => r.map(x => '"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'hostel_allocations.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Helper to get attendance badge html
function getAttendanceBadge(pct) {
    if (pct == null || isNaN(pct)) return '<span class="badge badge-gray">N/A</span>';
    if (pct < 50) return `<span class="badge badge-red">${pct}%</span>`;
    if (pct < 75) return `<span class="badge badge-yellow">${pct}%</span>`;
    return `<span class="badge badge-green">${pct}%</span>`;
}

// Render admin lists (essential fields only)
function renderAdminLists() {
    try {
        const sTbody = document.getElementById('adminStudentList');
        if (sTbody) {
            sTbody.innerHTML = students.map(s => `
                <tr>
                    <td>${s.name}</td>
                    <td>${s.studentId || s.rollNo || '-'}</td>
                    <td>${s.branch || '-'}</td>
                    <td>${s.semester ?? '-'}</td>
                    <td>${s.course || '-'}</td>
                    <td>${s.email || '-'}</td>
                    <td>${getAttendanceBadge(Number(s.attendancePct))}</td>
                </tr>
            `).join('');
        }
        const tTbody = document.getElementById('adminTeacherList');
        if (tTbody) {
            tTbody.innerHTML = teachers.map(t => `
                <tr>
                    <td>${t.name}</td>
                    <td>${t.department || '-'}</td>
                    <td>${t.subject || '-'}</td>
                    <td>${t.email || '-'}</td>
                </tr>
            `).join('');
        }
    } catch(e) { /* noop */ }
}

// Render teacher page: my students
function renderTeacherStudents() {
    try {
        // Support both dashboard table id and standalone page table id
        const tBody = document.getElementById('teacherStudentList') || document.getElementById('teacherStudentsTable');
        if (!tBody) return;
        // Demo: show all students; in real, filter by teacher's classes
        tBody.innerHTML = students.map(s => `
            <tr>
                <td>${s.name}</td>
                <td>${s.rollNo || '-'} / ${s.year || '-'}</td>
                <td>${s.course || '-'}</td>
                <td>${getAttendanceBadge(Number(s.attendancePct))}</td>
            </tr>
        `).join('');
    } catch(e) { /* noop */ }
}

// Call renders after data is loaded and DOM ready
(function hookCrossPageRenders(){
    document.addEventListener('DOMContentLoaded', function(){
        // Ensure storage is loaded
        try { loadDataFromStorage(); } catch(_) {}
        renderAdminLists();
        renderTeacherStudents();

        // Render student portal sections if present
        try {
            if (document.body.classList.contains('user-student')) {
                renderStudentPortalSections();
            }
        } catch(_) {}
    });
})();

function renderStudentPortalSections() {
    try {
        const rawUser = JSON.parse(localStorage.getItem('erp_user_data')||'null');
        let user = rawUser;
        // If we're on a student page but no student user is logged in, fallback to first seeded student (non-persistent)
        if ((!user || user.userType !== 'student') && document.body.classList.contains('user-student')) {
            if (Array.isArray(students) && students.length > 0) {
                const s = students[0];
                user = user && user.userType === 'student' ? user : { userType: 'student', fullName: s.name || '', studentId: s.studentId || s.rollNo || '', rollNo: s.rollNo || '', email: s.email || '' };
                try { console.debug('renderStudentPortalSections: using fallback student user for rendering', user); } catch(e){}
            }
        }
        if (!user) return;
        const sid = (user.studentId || user.rollNo || 'ST001');
        // Debug: log that student portal rendering is running
        try { console.debug('renderStudentPortalSections: user=', user, 'resolvedSid=', sid); } catch(e){}
        // Profile
        const kv = document.getElementById('studentProfileKV');
        const st = students.find(s => (s.studentId||s.rollNo) === sid) || students[0];
        if (kv && st) {
            kv.innerHTML = ''+
            '<div class="key">First Name</div><div class="val">'+(String(st.name||'').split(' ')[0]||'-')+'</div>'+
            '<div class="key">Last Name</div><div class="val">'+(String(st.name||'').split(' ')[1]||'-')+'</div>'+
            '<div class="key">Roll No</div><div class="val">'+(st.rollNo||'-')+'</div>'+
            '<div class="key">Student ID</div><div class="val">'+(st.studentId||'-')+'</div>'+
            '<div class="key">Branch</div><div class="val">'+(st.branch||'-')+'</div>'+
            '<div class="key">Semester</div><div class="val">'+(st.semester||'-')+'</div>'+
            '<div class="key">Email</div><div class="val">'+(st.email||'-')+'</div>'+
            '<div class="key">Phone</div><div class="val">+91 98765 43210</div>'+
            '<div class="key">Address</div><div class="val">221B Baker Street, Delhi</div>';
        }
        // Fees
        const ft = document.getElementById('feesTbody');
        if (ft) {
            const list = fees.filter(f => String(f.studentId) === String(st?.studentId || sid));
            ft.innerHTML = list.map(f => {
                const status = (f.status==='paid') ? '<span class="badge badge-green">Paid</span>' : '<span class="badge badge-yellow">Due</span>';
                return '<tr><td>'+(f.date||'-')+'</td><td>#'+(f.id||'-')+'</td><td>₹ '+(f.amount||0).toLocaleString()+'</td><td>'+status+'</td></tr>';
            }).join('');
        }
        // Hostel
        const hk = document.getElementById('hostelKV');
        if (hk) {
            const hostelData = JSON.parse(localStorage.getItem('erp_hostel_data') || '{}');
            const alloc = (hostelData.allocations||[]).find(a => String(a.studentId) === String(st?.studentId || sid));
            if (alloc) {
                hk.innerHTML = ''+
                '<div class="key">Hostel</div><div class="val">'+alloc.hostel+'</div>'+
                '<div class="key">Room</div><div class="val">'+alloc.room+' (2 Seater)</div>'+
                '<div class="key">Warden</div><div class="val">'+alloc.warden+'</div>'+
                '<div class="key">Allotted On</div><div class="val">'+alloc.allottedOn+'</div>';
            }
        }
        // Exams / Results
        const et = document.getElementById('examTbody');
        if (et) {
            const rows = (examinations||[]).filter(e => String(e.studentId) === String(st?.studentId || sid));
            et.innerHTML = rows.map(r => {
                const badge = (r.marks>=75) ? 'badge-green' : (r.marks>=50 ? 'badge-yellow' : 'badge-red');
                return '<tr><td>'+(r.exam||'-')+'</td><td>'+(r.subject||r.course||'-')+'</td><td>'+(r.date||'-')+'</td><td><span class="badge '+badge+'">'+(r.marks||0)+'</span></td></tr>';
            }).join('');
        }

        // Student Attendance - render personal attendance records if the page has the table
        try {
            const attBody = document.getElementById('stAttBody');
            const semSel = document.getElementById('stSem');
            if (attBody) {
                function renderStudentAttendance() {
                    // Defensive: ensure we have a student object to reference
                    const stLocal = st || {};
                    // Resolve student identifier possibilities
                    const sidVal = String(stLocal.studentId || stLocal.rollNo || sid || '');

                    // Always read the latest attendance from storage so UI reflects current data
                    let rawAtt = localStorage.getItem('erp_attendance');
                    let allAttendance = [];
                    try {
                        allAttendance = JSON.parse(rawAtt || '[]');
                    } catch (e) { allAttendance = []; }

                    // Diagnostic: if attendance is empty in localStorage, attempt a best-effort fetch
                    // from the project's data/erp_attendance.json (works if files are served by a static server).
                    if ((!Array.isArray(allAttendance) || allAttendance.length === 0)) {
                        try { console.debug('renderStudentAttendance: erp_attendance is empty in localStorage'); } catch(e){}
                        try {
                            // non-blocking fetch; if it succeeds we populate localStorage and re-render
                            fetch('/data/erp_attendance.json', { cache: 'no-store' }).then(function(resp){
                                if (!resp || !resp.ok) throw new Error('no static data file');
                                return resp.json();
                            }).then(function(data){
                                if (Array.isArray(data) && data.length > 0) {
                                    try { localStorage.setItem('erp_attendance', JSON.stringify(data)); } catch(e){}
                                    try { console.debug('renderStudentAttendance: populated localStorage from /data/erp_attendance.json (fallback)'); } catch(e){}
                                    // update local variable then re-render
                                    allAttendance = data;
                                    renderStudentAttendance();
                                }
                            }).catch(function(){ /* ignore network/fetch errors — local-only mode */ });
                        } catch (e) { /* ignore */ }
                    }

                    // Filter by common matching keys: studentId, rollNo, alternate keys like rollNo/studentId stored differently, or email
                    let records = (Array.isArray(allAttendance) ? allAttendance : []).filter(function(a){
                        try {
                            const aSid = String(a.studentId || a.rollNo || a.roll || a.sid || '');
                            const aEmail = String(a.email || a.studentEmail || '');
                            if (aSid && aSid === sidVal) return true;
                            if (String(stLocal.rollNo || '') && aSid === String(stLocal.rollNo)) return true;
                            if (aEmail && stLocal.email && String(aEmail).toLowerCase() === String(stLocal.email).toLowerCase()) return true;
                            return false;
                        } catch (e) { return false; }
                    });

                    try { console.debug('renderStudentAttendance: found attendance array length=', (allAttendance||[]).length, 'filteredRecords=', records.length); } catch(e){}

                    // If semester filter present, further filter by attendance record semester or student's semester
                    if (semSel && semSel.value) {
                        records = records.filter(r => String(r.semester || stLocal.semester || '') === String(semSel.value));
                    }

                    if (!records || records.length === 0) {
                        try { console.debug('renderStudentAttendance: no records to show for sid=', sidVal); } catch(e){}
                        attBody.innerHTML = '<tr><td colspan="4" class="muted">No attendance records found.</td></tr>';
                        return;
                    }

                    attBody.innerHTML = records.map(function(a){
                        const courseName = a.course || stLocal.course || '-';
                        const statusClass = (a.status === 'present') ? 'badge badge-green' : (a.status === 'late' ? 'badge badge-yellow' : 'badge badge-red');
                        const statusText = String(a.status || '').charAt(0).toUpperCase() + String(a.status || '').slice(1) || '-';
                        return '<tr>'+
                            '<td>'+(a.date||'-')+'</td>'+
                            '<td>'+(courseName)+'</td>'+
                            '<td>'+'<span class="'+statusClass+'">'+statusText+'</span>'+'</td>'+
                            '<td>'+(a.time||'-')+'</td>'+
                        '</tr>';
                    }).join('');
                }
                // Initial render and wire filter
                try { console.debug('renderStudentPortalSections: rendering attendance into #stAttBody'); } catch(e){}
                renderStudentAttendance();
                if (semSel) {
                    semSel.addEventListener('change', renderStudentAttendance);
                }
            }
        } catch(e) { /* noop */ }
    } catch(e) { /* noop */ }
}
// Active/Inactive helper (placeholder no-op to avoid runtime error)
function getStatusElementById(elementId) {
    if (!elementId) return null;
    return document.getElementById(String(elementId));
}

function getStudentsByFilter({ branch, course, semester }) {
    return students.filter(s => (
        (branch ? s.branch === branch : true) &&
        (course ? (s.course === course || s.subjects?.includes(course)) : true) &&
        (semester ? Number(s.semester) === Number(semester) : true)
    ));
}

function getStudentByIdOrRoll(query) {
    if (!query) return null;
    const q = String(query).trim().toLowerCase();
    return students.find(s => String(s.studentId).toLowerCase() === q || String(s.rollNo).toLowerCase() === q);
}

// Debug marker to confirm script.js loaded on each page
try { console.debug('script.js loaded'); } catch(e) {}
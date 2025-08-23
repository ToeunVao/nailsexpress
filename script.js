import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, getDoc, deleteDoc, serverTimestamp, where, getDocs, orderBy, Timestamp, updateDoc, writeBatch, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyAGZBJFVi_o1HeGDmjcSsmCcWxWOkuLc_4",
    authDomain: "nailexpress-10f2f.firebaseapp.com",
    projectId: "nailexpress-10f2f",
    storageBucket: "nailexpress-10f2f.appspot.com",
    messagingSenderId: "1015991996673",
    appId: "1:1015991996673:web:b6e8888abae83906d34b00"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// --- Global State ---
const loadingScreen = document.getElementById('loading-screen');
const landingPageContent = document.getElementById('landing-page-content');
const appContent = document.getElementById('app-content');
const policyModal = document.getElementById('policy-modal');
let mainAppInitialized = false;
let landingPageInitialized = false;
let anonymousUserId = null;
let bookingSettings = { minBookingHours: 2 };
let bookingsChart, servicesChart, earningsChart;
let notifications = [];

// --- Global Modal Logic ---
const openPolicyModal = () => { policyModal.classList.add('flex'); policyModal.classList.remove('hidden'); };
const closePolicyModal = () => { policyModal.classList.add('hidden'); policyModal.classList.remove('flex'); };
document.addEventListener('click', (e) => { if (e.target.closest('.view-policy-btn')) { openPolicyModal(); } });
document.getElementById('policy-close-btn').addEventListener('click', closePolicyModal);
document.querySelector('#policy-modal .policy-modal-overlay').addEventListener('click', closePolicyModal);


// --- Primary Authentication Router ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (user.isAnonymous) {
            anonymousUserId = user.uid;
            loadingScreen.style.display = 'none';
            appContent.style.display = 'none';
            landingPageContent.style.display = 'block';
            if (!landingPageInitialized) {
                initLandingPage();
                landingPageInitialized = true;
            }
        } else {
            const userDocRef = doc(db, "users", user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                const userRole = userDoc.data().role;
                loadingScreen.style.display = 'none';
                landingPageContent.style.display = 'none';
                appContent.style.display = 'block';
                if (!mainAppInitialized) {
                    initMainApp(userRole);
                    mainAppInitialized = true;
                }
            } else {
                console.error("User authenticated but no user document found. Logging out.");
                await signOut(auth);
                alert("Login error: User data not found.");
            }
        }
    } else {
        signInAnonymously(auth).catch((error) => {
            console.error("Anonymous sign-in failed:", error);
            loadingScreen.innerHTML = '<h2 class="text-3xl font-bold text-red-700">Could not connect. Please refresh.</h2>';
        });
    }
});


// --- LANDING PAGE SCRIPT ---
function initLandingPage() {
    const bookingForm = document.getElementById('add-appointment-form-landing');
    const servicesContainerBooking = document.getElementById('services-container-landing');
    const hiddenCheckboxContainerBooking = document.getElementById('hidden-checkbox-container-landing');
    const bookingServiceModal = document.getElementById('landing-booking-service-modal');
    const bookingServiceModalTitle = document.getElementById('landing-booking-modal-title');
    const bookingServiceModalContent = document.getElementById('landing-booking-service-modal-content');
    const bookingServiceModalDoneBtn = document.getElementById('landing-booking-service-modal-done-btn');
    const bookingStep1 = document.getElementById('booking-step-1');
    const bookingStep2 = document.getElementById('booking-step-2');
    const bookingNextBtn = document.getElementById('booking-next-btn');
    const bookingPrevBtn = document.getElementById('booking-prev-btn');
    let landingServicesData = {};

    const openModal = (modal) => { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    const closeModal = (modal) => { modal.classList.add('hidden'); modal.classList.remove('flex'); }

    const loadLandingServices = async () => {
        try {
            const servicesSnapshot = await getDocs(collection(db, "services"));
            landingServicesData = {};
            servicesSnapshot.forEach(doc => { landingServicesData[doc.id] = doc.data().items; });
            renderLandingCategoryButtons();
        } catch (error) {
            console.error("Landing Page Service Load Error:", error);
            servicesContainerBooking.innerHTML = '<p class="text-red-500 text-center">Could not load services.</p>';
        }
    };

    const renderLandingCategoryButtons = () => {
        servicesContainerBooking.innerHTML = '';
        hiddenCheckboxContainerBooking.innerHTML = '';
        Object.keys(landingServicesData).forEach(category => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'category-button p-4 border border-gray-200 rounded-lg text-left bg-white hover:border-pink-300 hover:bg-pink-50 transition-all duration-200 shadow-sm';
            btn.dataset.category = category;
            btn.innerHTML = `<h3 class="text-lg font-bold text-pink-700">${category}</h3><span class="text-sm text-gray-500 mt-1 block">Click to select</span><span class="selection-count hidden mt-2 bg-pink-600 text-white text-xs font-bold px-2 py-1 rounded-full"></span>`;
            servicesContainerBooking.appendChild(btn);
            landingServicesData[category].forEach(service => {
                const val = `${service.p || ''}${service.name}${service.price ? ' ' + service.price : ''}`;
                const cb = document.createElement('input');
                cb.type = 'checkbox'; cb.name = 'service-landing'; cb.value = val; cb.dataset.category = category;
                hiddenCheckboxContainerBooking.appendChild(cb);
            });
        });
    };

    const updateLandingSelectionCounts = () => {
        document.querySelectorAll('#services-container-landing .category-button').forEach(button => {
            const cat = button.dataset.category;
            const count = hiddenCheckboxContainerBooking.querySelectorAll(`input[data-category="${cat}"]:checked`).length;
            const badge = button.querySelector('.selection-count');
            if (count > 0) { badge.textContent = `${count} selected`; badge.classList.remove('hidden'); }
            else { badge.classList.add('hidden'); }
        });
    };

    const openLandingBookingServiceModal = (category) => {
        bookingServiceModalTitle.textContent = category;
        bookingServiceModalContent.innerHTML = '';
        bookingServiceModal.dataset.currentCategory = category;
        landingServicesData[category].forEach(service => {
            const val = `${service.p || ''}${service.name}${service.price ? ' ' + service.price : ''}`;
            const sourceCb = hiddenCheckboxContainerBooking.querySelector(`input[value="${val}"]`);
            const label = document.createElement('label');
            label.className = 'flex items-center p-3 hover:bg-pink-50 cursor-pointer rounded-lg';
            label.innerHTML = `<input type="checkbox" class="form-checkbox modal-checkbox" value="${val}" ${sourceCb && sourceCb.checked ? 'checked' : ''}><span class="ml-3 text-gray-700 flex-grow">${service.name}</span>${service.price ? `<span class="font-semibold">${service.price}</span>` : ''}`;
            bookingServiceModalContent.appendChild(label);
        });
        openModal(bookingServiceModal);
    };

    bookingServiceModalDoneBtn.addEventListener('click', () => {
        bookingServiceModalContent.querySelectorAll('.modal-checkbox').forEach(modalCb => {
            const sourceCb = hiddenCheckboxContainerBooking.querySelector(`input[value="${modalCb.value}"]`);
            if (sourceCb) sourceCb.checked = modalCb.checked;
        });
        closeModal(bookingServiceModal);
        updateLandingSelectionCounts();
    });

    servicesContainerBooking.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-button');
        if (btn) openLandingBookingServiceModal(btn.dataset.category);
    });

    const loadBookingTechnicians = async () => {
        const techSelect = document.getElementById('appointment-technician-select-landing');
        techSelect.innerHTML = '<option>Any Technician</option>';
        try {
            const usersSnapshot = await getDocs(collection(db, "users"));
            usersSnapshot.docs.map(doc => doc.data()).filter(user => user.role === 'technician').forEach(tech => techSelect.appendChild(new Option(tech.name, tech.name)));
        } catch (error) { console.error("Error loading technicians for booking: ", error); }
    };

    const loadBookingSettings = async () => {
        const docSnap = await getDoc(doc(db, "settings", "booking"));
        if (docSnap.exists()) { bookingSettings = docSnap.data(); }
    };

    loadLandingServices();
    loadBookingTechnicians();
    loadBookingSettings();

    const peopleCountSelect = document.getElementById('appointment-people-landing');
    for (let i = 1; i <= 20; i++) peopleCountSelect.appendChild(new Option(i, i));

    const datetimeInput = document.getElementById('appointment-datetime-landing');
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    datetimeInput.value = now.toISOString().slice(0, 16);

    document.getElementById('user-icon').addEventListener('click', () => openModal(document.getElementById('login-modal')));
    document.getElementById('close-login-modal-btn').addEventListener('click', () => closeModal(document.getElementById('login-modal')));
    document.querySelector('#login-modal .modal-overlay').addEventListener('click', () => closeModal(document.getElementById('login-modal')));
    document.getElementById('close-landing-service-modal-btn').addEventListener('click', () => closeModal(document.getElementById('landing-service-modal')));
    document.querySelector('#landing-service-modal .landing-service-modal-overlay').addEventListener('click', () => closeModal(document.getElementById('landing-service-modal')));
    document.querySelector('#landing-booking-service-modal .modal-overlay').addEventListener('click', () => closeModal(bookingServiceModal));

    bookingNextBtn.addEventListener('click', () => {
        const name = document.getElementById('appointment-client-name-landing').value;
        const datetimeString = document.getElementById('appointment-datetime-landing').value;
        if (!name || !datetimeString) { return alert('Please fill in your name and the desired date/time.'); }
        const selectedTime = new Date(datetimeString).getTime();
        const now = new Date().getTime();
        const minNoticeMillis = bookingSettings.minBookingHours * 60 * 60 * 1000;
        if (selectedTime < (now + minNoticeMillis)) { return alert(`Booking must be made at least ${bookingSettings.minBookingHours} hours in advance.`); }
        bookingStep1.classList.add('hidden');
        bookingStep2.classList.remove('hidden');
    });

    bookingPrevBtn.addEventListener('click', () => { bookingStep2.classList.add('hidden'); bookingStep1.classList.remove('hidden'); });

    const loginForm = document.getElementById('landing-login-form');
    const loginBtn = document.getElementById('landing-login-btn');
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const btnText = loginBtn.querySelector('.btn-text');
        const spinner = loginBtn.querySelector('.fa-spinner');
        btnText.textContent = 'Logging In...';
        spinner.classList.remove('hidden');
        loginBtn.disabled = true;
        try {
            await signInWithEmailAndPassword(auth, document.getElementById('landing-email').value, document.getElementById('landing-password').value);
        } catch (error) {
            alert("Login failed: " + error.message);
        } finally {
            btnText.textContent = 'Log In';
            spinner.classList.add('hidden');
            loginBtn.disabled = false;
        }
    });

    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const services = Array.from(document.querySelectorAll('#hidden-checkbox-container-landing input:checked')).map(el => el.value);
        if (services.length === 0) { return alert('Please select at least one service.'); }
        try {
            await addDoc(collection(db, "appointments"), {
                name: document.getElementById('appointment-client-name-landing').value,
                phone: document.getElementById('appointment-phone-landing').value,
                people: document.getElementById('appointment-people-landing').value,
                bookingType: 'Online',
                services: services,
                technician: document.getElementById('appointment-technician-select-landing').value,
                notes: document.getElementById('appointment-notes-landing').value,
                appointmentTimestamp: Timestamp.fromDate(new Date(document.getElementById('appointment-datetime-landing').value)),
                anonymousUserId: anonymousUserId,
                isNew: true // Flag for notifications
            });
            bookingForm.reset();
            hiddenCheckboxContainerBooking.querySelectorAll('input').forEach(cb => cb.checked = false);
            updateLandingSelectionCounts();
            bookingStep2.classList.add('hidden');
            bookingStep1.classList.remove('hidden');
            alert('Thank you! Your appointment has been successfully booked.');
        } catch (err) {
            console.error("Booking failed:", err);
            alert("Could not save appointment. Please try again.");
        }
    });

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({ behavior: 'smooth' });
        });
    });
}

// --- MAIN CHECK-IN APP SCRIPT ---
function initMainApp(userRole) {
    // ... (rest of the existing initMainApp code)
    const dashboardContent = document.getElementById('dashboard-content');
    const mainAppContainer = document.getElementById('main-app-container');
    const logoLink = document.getElementById('logo-link');
    const headerTitle = document.getElementById('header-title');
    const notificationBell = document.getElementById('notification-bell');
    const notificationCount = document.getElementById('notification-count');
    const notificationDropdown = document.getElementById('notification-dropdown');

    // Show dashboard by default
    dashboardContent.classList.remove('hidden');
    mainAppContainer.classList.add('hidden');
    // --- headerTitle.textContent = 'Dashboard';

    logoLink.addEventListener('click', () => {
        const isDashboardVisible = !dashboardContent.classList.contains('hidden');
        if (isDashboardVisible) {
            dashboardContent.classList.add('hidden');
            mainAppContainer.classList.remove('hidden');
            headerTitle.textContent = 'Welcome!';
        } else {
            dashboardContent.classList.remove('hidden');
            mainAppContainer.classList.add('hidden');
        // ---    headerTitle.textContent = 'Dashboard';
        }
    });

    notificationBell.addEventListener('click', () => {
        notificationDropdown.classList.toggle('hidden');
        if (!notificationDropdown.classList.contains('hidden')) {
            // Mark notifications as read
            notifications = notifications.map(n => ({ ...n, read: true }));
            updateNotificationDisplay();
        }
    });


    if (userRole === 'technician' || userRole === 'staff') {
        document.getElementById('reports-tab').style.display = 'none';
        document.getElementById('admin-tab').style.display = 'none';
        document.getElementById('clients-list-tab').style.display = 'none';
    } else {
        document.getElementById('reports-tab').style.display = 'inline-block';
        document.getElementById('admin-tab').style.display = 'inline-block';
        document.getElementById('clients-list-tab').style.display = 'inline-block';
    }

    const checkInForm = document.getElementById('check-in-form');
    const peopleCountSelect = document.getElementById('people-count');
    const servicesContainer = document.getElementById('services-container');
    const hiddenCheckboxContainer = document.getElementById('hidden-checkbox-container');
    const serviceModal = document.getElementById('service-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const modalDoneBtn = document.getElementById('modal-done-btn');
    const modalOverlay = document.querySelector('#service-modal .modal-overlay');

    const checkoutModal = document.getElementById('checkout-modal');
    const checkoutForm = document.getElementById('checkout-form');
    const viewDetailModal = document.getElementById('view-detail-modal');
    const addAppointmentModal = document.getElementById('add-appointment-modal');
    const addAppointmentForm = document.getElementById('add-appointment-form');
    const editEarningModal = document.getElementById('edit-earning-modal');
    const editEarningForm = document.getElementById('edit-earning-form');
    const editSalonEarningModal = document.getElementById('edit-salon-earning-modal');
    const editSalonEarningForm = document.getElementById('edit-salon-earning-form');
    const editClientModal = document.getElementById('edit-client-modal');
    const editClientForm = document.getElementById('edit-client-form');
    const geminiSmsModal = document.getElementById('gemini-sms-modal');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalMessage = document.getElementById('confirm-modal-message');
    const confirmConfirmBtn = document.getElementById('confirm-confirm-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

    const rebookOtherInput = document.getElementById('rebook-other-input');
    const rebookSelect = document.getElementById('rebook-select');

    const activeCountSpan = document.getElementById('active-count');
    const finishedCountSpan = document.getElementById('finished-count');
    const todayCountSpan = document.getElementById('today-count');
    const calendarCountSpan = document.getElementById('calendar-count');
    const processingCountSpan = document.getElementById('processing-count');
    const clientsListCountSpan = document.getElementById('clients-list-count');
    const filteredEarningTotalMainSpan = document.getElementById('filtered-earning-total-main');
    const filteredEarningTotalTipSpan = document.getElementById('filtered-earning-total-tip');

    const calendarGrid = document.getElementById('calendar');
    const monthYearDisplay = document.getElementById('month-year-display');
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();

    let currentTechFilterCalendar = 'All', currentTechFilterActive = 'All', currentTechFilterProcessing = 'All', currentTechFilterFinished = 'All';
    let currentFinishedDateFilter = '', currentEarningTechFilter = 'All', currentEarningDateFilter = '', currentEarningRangeFilter = 'daily';
    let currentSalonEarningDateFilter = '', currentSalonEarningRangeFilter = String(new Date().getMonth()), currentExpenseMonthFilter = '';

    let allActiveClients = [], allFinishedClients = [], allAppointments = [], aggregatedClients = [], allEarnings = [], allSalonEarnings = [], allExpenses = [], allInventory = [];
    let servicesData = {}, techniciansAndStaff = [], technicians = [];
    let allExpenseCategories = [], allPaymentAccounts = [], allSuppliers = [];

    const getLocalDateString = (date = new Date()) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    let confirmCallback = null;
    const showConfirmModal = (message, onConfirm) => { confirmModalMessage.textContent = message; confirmCallback = onConfirm; confirmModal.classList.remove('hidden'); confirmModal.classList.add('flex'); };
    const closeConfirmModal = () => { confirmModal.classList.add('hidden'); confirmModal.classList.remove('flex'); confirmCallback = null; };
    confirmConfirmBtn.addEventListener('click', () => { if (confirmCallback) { confirmCallback(); } closeConfirmModal(); });
    confirmCancelBtn.addEventListener('click', closeConfirmModal);
    document.querySelector('.confirm-modal-overlay').addEventListener('click', closeConfirmModal);
    
    initDashboard();
    
    // ... (rest of the existing initMainApp code from line 273 to 1475)
    // --- Dashboard and Notification Logic ---
    function initDashboard() {
        const dateFilter = document.getElementById('dashboard-date-filter');
        
        const bookingsCtx = document.getElementById('bookings-chart').getContext('2d');
        const servicesCtx = document.getElementById('services-chart').getContext('2d');
        const earningsCtx = document.getElementById('earnings-chart').getContext('2d');

        bookingsChart = new Chart(bookingsCtx, { type: 'line', data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false } });
        servicesChart = new Chart(servicesCtx, { type: 'pie', data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false } });
        earningsChart = new Chart(earningsCtx, { type: 'bar', data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false } });
        
        dateFilter.addEventListener('change', updateDashboard);
        
        updateDashboard();
    }

    async function updateDashboard() {
        const filter = document.getElementById('dashboard-date-filter').value;
        const { start, end } = getDateRange(filter);

        // Filter data
        const filteredAppointments = allAppointments.filter(a => a.appointmentTimestamp.toDate() >= start && a.appointmentTimestamp.toDate() <= end);
        const filteredFinished = allFinishedClients.filter(f => f.checkOutTimestamp && f.checkOutTimestamp.toDate() >= start && f.checkOutTimestamp.toDate() <= end);
        const filteredEarnings = allEarnings.filter(e => e.date.toDate() >= start && e.date.toDate() <= end);
        const filteredSalonEarnings = allSalonEarnings.filter(e => e.date.toDate() >= start && e.date.toDate() <= end);

        // Update Summary Cards
        document.getElementById('total-bookings-card').textContent = filteredAppointments.length + filteredFinished.length;
        const totalRevenue = filteredSalonEarnings.reduce((sum, earning) => {
            let techTotal = 0;
            techniciansAndStaff.forEach(tech => {
                techTotal += earning[tech.name.toLowerCase()] || 0;
            });
            return sum + techTotal + (earning.sellGiftCard || 0);
        }, 0);
        document.getElementById('total-revenue-card').textContent = `$${totalRevenue.toFixed(2)}`;
        document.getElementById('low-stock-card').textContent = allInventory.filter(i => i.quantity <= 10).length;
        
        // Update Charts
        updateBookingsChart(filteredAppointments, filteredFinished, filter);
        updateServicesChart(filteredFinished);
        updateEarningsChart(filteredEarnings);
    }

    function getDateRange(filter) {
        const now = new Date();
        let start = new Date();
        let end = new Date();

        switch (filter) {
            case 'today':
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'this_week':
                start.setDate(now.getDate() - now.getDay());
                start.setHours(0, 0, 0, 0);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
                break;
            case 'this_month':
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
                break;
            case 'this_year':
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
                break;
        }
        return { start, end };
    }

    function updateBookingsChart(appointments, finished, filter) {
        const data = {};
        const allBookings = [...appointments, ...finished];

        if (filter === 'today') {
             for(let i = 0; i < 24; i++) {
                const hour = i.toString().padStart(2, '0') + ":00";
                data[hour] = 0;
            }
            allBookings.forEach(b => {
                const date = b.appointmentTimestamp?.toDate() || b.checkOutTimestamp?.toDate();
                if(date) {
                    const hour = date.getHours().toString().padStart(2, '0') + ":00";
                    if(data[hour] !== undefined) data[hour]++;
                }
            });
        } else {
            const { start, end } = getDateRange(filter);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                 data[d.toLocaleDateString()] = 0;
            }
             allBookings.forEach(b => {
                const date = b.appointmentTimestamp?.toDate() || b.checkOutTimestamp?.toDate();
                if(date) {
                    const key = date.toLocaleDateString();
                    if(data[key] !== undefined) data[key]++;
                }
            });
        }
        
        bookingsChart.data.labels = Object.keys(data);
        bookingsChart.data.datasets = [{
            label: 'Bookings',
            data: Object.values(data),
            borderColor: '#d63384',
            tension: 0.1
        }];
        bookingsChart.update();
    }

    function updateServicesChart(finished) {
        const serviceCounts = {};
        finished.forEach(client => {
            const services = client.services.split(', ');
            services.forEach(service => {
                const cleanService = service.replace(/\s\$?\d+$/, '').trim();
                serviceCounts[cleanService] = (serviceCounts[cleanService] || 0) + 1;
            });
        });

        const sortedServices = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1]).slice(0, 7);
        
        servicesChart.data.labels = sortedServices.map(s => s[0]);
        servicesChart.data.datasets = [{
            label: 'Top Services',
            data: sortedServices.map(s => s[1]),
            backgroundColor: ['#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#db2777', '#9d174d', '#831843'],
        }];
        servicesChart.update();
    }

    function updateEarningsChart(earnings) {
        const techEarnings = {};
         techniciansAndStaff.forEach(t => techEarnings[t.name] = 0);

        earnings.forEach(e => {
            if (techEarnings[e.staffName] !== undefined) {
                techEarnings[e.staffName] += e.earning;
            }
        });
        
        const topTechnician = Object.entries(techEarnings).sort((a, b) => b[1] - a[1])[0];
        document.getElementById('top-technician-card').textContent = topTechnician ? `${topTechnician[0]} ($${topTechnician[1].toFixed(2)})` : '-';


        earningsChart.data.labels = Object.keys(techEarnings);
        earningsChart.data.datasets = [{
            label: 'Total Earnings',
            data: Object.values(techEarnings),
            backgroundColor: '#3b82f6',
        }];
        earningsChart.update();
    }

    function checkForNotifications() {
        // Low Stock
        allInventory.forEach(item => {
            if (item.quantity <= 10) {
                const exists = notifications.some(n => n.type === 'stock' && n.id === item.id);
                if (!exists) {
                    notifications.push({
                        id: item.id,
                        type: 'stock',
                        message: `Low stock alert: ${item.name} has only ${item.quantity} left.`,
                        read: false
                    });
                }
            }
        });
        updateNotificationDisplay();
    }
    
    function updateNotificationDisplay() {
        const unreadCount = notifications.filter(n => !n.read).length;
        notificationCount.textContent = unreadCount;
        notificationCount.style.display = unreadCount > 0 ? 'block' : 'none';

        notificationDropdown.innerHTML = '';
        if (notifications.length === 0) {
            notificationDropdown.innerHTML = '<div class="notification-item text-gray-500">No notifications</div>';
            return;
        }

        notifications.slice(0, 10).forEach(n => {
            const item = document.createElement('div');
            item.className = 'notification-item';
            item.textContent = n.message;
            notificationDropdown.appendChild(item);
        });
    }

    // Modify existing listeners to trigger updates
    onSnapshot(query(collection(db, "inventory"), orderBy("name")), (snapshot) => {
        allInventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInventory();
        checkForNotifications();
        if (mainAppInitialized) updateDashboard();
    });

    onSnapshot(query(collection(db, "appointments"), where("isNew", "==", true)), (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
                const booking = change.doc.data();
                notifications.push({
                    id: change.doc.id,
                    type: 'booking',
                    message: `New online booking from ${booking.name}.`,
                    read: false
                });
                updateNotificationDisplay();
                // Remove the 'isNew' flag
                await updateDoc(doc(db, "appointments", change.doc.id), { isNew: false });
            }
        });
    });
    
    // Existing onSnapshot listeners need to call updateDashboard
     onSnapshot(query(collection(db, "finished_clients"), orderBy("checkOutTimestamp", "desc")), (snapshot) => {
        allFinishedClients = snapshot.docs.map(doc => ({ id: doc.id, checkInTime: doc.data().checkInTimestamp ? new Date(doc.data().checkInTimestamp.seconds * 1000).toLocaleString() : 'N/A', checkOutTimestamp: doc.data().checkOutTimestamp, services: (doc.data().services || []).join(', '), ...doc.data() }));
        // ... (rest of the existing logic)
        if(mainAppInitialized) updateDashboard();
    });
     onSnapshot(query(collection(db, "earnings"), orderBy("date", "desc")), (snapshot) => {
        allEarnings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // ... (rest of existing logic)
        if(mainAppInitialized) updateDashboard();
    });
     onSnapshot(query(collection(db, "salon_earnings"), orderBy("date", "desc")), (snapshot) => {
        allSalonEarnings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // ... (rest of existing logic)
        if(mainAppInitialized) updateDashboard();
    });

    // ... (the rest of your script.js file)
}

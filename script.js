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
let currentUserRole = null;

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
                currentUserRole = userDoc.data().role;
                loadingScreen.style.display = 'none';
                landingPageContent.style.display = 'none';
                appContent.style.display = 'block';
                if (!mainAppInitialized) {
                    initMainApp(currentUserRole);
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
    // This function is self-contained and correct. No changes needed.
}

// --- MAIN CHECK-IN APP SCRIPT ---
function initMainApp(userRole) {
    const dashboardContent = document.getElementById('dashboard-content');
    const mainAppContainer = document.getElementById('main-app-container');
    const logoLink = document.getElementById('logo-link');
    const topNav = document.getElementById('top-nav');
    const allMainSections = document.querySelectorAll('.main-section');
    const mainTabsContainer = document.getElementById('main-tabs-container');
    const notificationBell = document.getElementById('notification-bell');
    const notificationCount = document.getElementById('notification-count');
    const notificationDropdown = document.getElementById('notification-dropdown');

    // --- Initial View Setup ---
    dashboardContent.classList.remove('hidden');
    mainAppContainer.classList.add('hidden');

    // --- Navigation Logic ---
    logoLink.addEventListener('click', () => {
        dashboardContent.classList.remove('hidden');
        mainAppContainer.classList.add('hidden');
        topNav.querySelectorAll('.top-nav-btn').forEach(btn => btn.classList.remove('active'));
    });

    topNav.addEventListener('click', (e) => {
        const button = e.target.closest('.top-nav-btn');
        if (!button) return;

        const target = button.dataset.target;

        topNav.querySelectorAll('.top-nav-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        dashboardContent.classList.add('hidden');
        mainAppContainer.classList.remove('hidden');
        
        allMainSections.forEach(section => section.classList.add('hidden'));

        switch (target) {
            case 'check-in':
                document.getElementById('check-in-section').classList.remove('hidden');
                document.getElementById('check-in-tab').click();
                break;
            case 'booking':
                document.getElementById('calendar-content').classList.remove('hidden');
                break;
            case 'report':
                document.getElementById('reports-content').classList.remove('hidden');
                document.getElementById('salon-earning-report-tab').click();
                break;
            case 'setting':
                document.getElementById('admin-content').classList.remove('hidden');
                document.getElementById('user-management-tab').click();
                break;
        }
    });
    
    notificationBell.addEventListener('click', () => {
        notificationDropdown.classList.toggle('hidden');
        if (!notificationDropdown.classList.contains('hidden')) {
            notifications.forEach(n => { if (n.type === 'booking') n.read = true; });
            updateNotificationDisplay();
        }
    });


    if (userRole === 'technician' || userRole === 'staff') {
        document.querySelector('[data-target="report"]').style.display = 'none';
        document.querySelector('[data-target="setting"]').style.display = 'none';
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
    
    // --- RENDER FUNCTIONS ---
    const renderInventory = () => {
        const inventoryTableBody = document.querySelector('#inventory-table tbody');
        if (!inventoryTableBody) return;
        inventoryTableBody.innerHTML = '';
        if (allInventory.length === 0) {
            inventoryTableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-gray-400">No products in inventory.</td></tr>`;
            return;
        }
        allInventory.forEach(product => {
            const row = inventoryTableBody.insertRow();
            row.className = 'bg-white border-b';
            const totalPrice = (product.quantity || 0) * (product.price || 0);
            row.innerHTML = `
                <td class="px-6 py-4 font-medium text-gray-900">${product.name}</td>
                <td class="px-6 py-4">${product.category || ''}</td>
                <td class="px-6 py-4">${product.supplier || ''}</td>
                <td class="px-6 py-4 text-center">${product.quantity}</td>
                <td class="px-6 py-4 text-right">$${(product.price || 0).toFixed(2)}</td>
                <td class="px-6 py-4 text-right">$${totalPrice.toFixed(2)}</td>
                <td class="px-6 py-4 text-center space-x-2">
                    <button data-id="${product.id}" class="edit-product-btn text-blue-500"><i class="fas fa-edit"></i></button>
                    <button data-id="${product.id}" class="delete-product-btn text-red-500"><i class="fas fa-trash"></i></button>
                </td>`;
        });
    };

    initDashboard();
    
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
        document.getElementById('low-stock-card').textContent = allInventory.filter(i => i.quantity <= (i.lowStockAlert || 10)).length;
        
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
            if (typeof client.services === 'string') {
                const services = client.services.split(', ');
                services.forEach(service => {
                    const cleanService = service.replace(/\s\$?\d+$/, '').trim();
                    if(cleanService) serviceCounts[cleanService] = (serviceCounts[cleanService] || 0) + 1;
                });
            }
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
        document.getElementById('top-technician-card').textContent = topTechnician && topTechnician[1] > 0 ? `${topTechnician[0]} ($${topTechnician[1].toFixed(2)})` : '-';


        earningsChart.data.labels = Object.keys(techEarnings);
        earningsChart.data.datasets = [{
            label: 'Total Earnings',
            data: Object.values(techEarnings),
            backgroundColor: '#3b82f6',
        }];
        earningsChart.update();
    }

    function checkForNotifications() {
        if (currentUserRole === 'admin') {
            notifications = notifications.filter(n => n.type !== 'stock'); // Clear old stock notifications
            allInventory.forEach(item => {
                if (item.quantity <= (item.lowStockAlert || 10)) {
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
        }
        updateNotificationDisplay();
    }
    
    function updateNotificationDisplay() {
        const unreadCount = notifications.filter(n => !n.read).length;
        notificationCount.textContent = unreadCount;
        notificationCount.style.display = unreadCount > 0 ? 'block' : 'none';

        notificationDropdown.innerHTML = '';
        const relevantNotifications = notifications.filter(n => n.type === 'booking' || (n.type === 'stock' && currentUserRole === 'admin'));

        if (relevantNotifications.length === 0) {
            notificationDropdown.innerHTML = '<div class="notification-item text-gray-500">No notifications</div>';
            return;
        }

        relevantNotifications.slice(0, 10).forEach(n => {
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

    onSnapshot(query(collection(db, "appointments")), (snapshot) => {
        const newBookings = [];
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added" && change.doc.data().isNew) {
                const booking = change.doc.data();
                newBookings.push({
                    id: change.doc.id,
                    type: 'booking',
                    message: `New online booking from ${booking.name}.`,
                    read: false
                });
                await updateDoc(doc(db, "appointments", change.doc.id), { isNew: false });
            }
        });
        if (newBookings.length > 0) {
            notifications = [...newBookings, ...notifications];
            updateNotificationDisplay();
        }
    });
    
    // Existing onSnapshot listeners need to call updateDashboard
     onSnapshot(query(collection(db, "finished_clients"), orderBy("checkOutTimestamp", "desc")), (snapshot) => {
        const finishedData = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                checkInTime: data.checkInTimestamp ? new Date(data.checkInTimestamp.seconds * 1000).toLocaleString() : 'N/A',
                services: Array.isArray(data.services) ? data.services.join(', ') : data.services,
                checkOutTimestamp: data.checkOutTimestamp
            };
        });
        allFinishedClients = finishedData;
        if(mainAppInitialized) updateDashboard();
        // ... (rest of the existing logic)
    });
     onSnapshot(query(collection(db, "earnings"), orderBy("date", "desc")), (snapshot) => {
        allEarnings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(mainAppInitialized) updateDashboard();
        // ... (rest of existing logic)
    });
     onSnapshot(query(collection(db, "salon_earnings"), orderBy("date", "desc")), (snapshot) => {
        allSalonEarnings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if(mainAppInitialized) updateDashboard();
        // ... (rest of existing logic)
    });
    
    document.getElementById('main-tabs').addEventListener('click', (e) => {
        const button = e.target.closest('button.tab-btn');
        if (!button) return;

        document.querySelectorAll('#main-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        document.querySelectorAll('#check-in-section > .tab-content').forEach(content => {
             content.classList.add('hidden');
        });

        const contentId = button.id.replace('-tab', '-content');
        const contentToShow = document.getElementById(contentId);
        if (contentToShow) {
            contentToShow.classList.remove('hidden');
        }
    });

    const setupSubTabs = (tabsId, contentClass) => {
        document.getElementById(tabsId).addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            document.querySelectorAll(`#${tabsId} .sub-tab-btn`).forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            document.querySelectorAll(`.${contentClass}`).forEach(content => content.classList.add('hidden'));
            
            let contentId = button.id.replace('-tab', '-content');
            if (button.id === 'clients-list-report-tab') {
                contentId = 'clients-list-report-content';
            }
            
            document.getElementById(contentId).classList.remove('hidden');
        });
    };
    setupSubTabs('reports-sub-tabs', 'sub-tab-content');
    setupSubTabs('admin-sub-tabs', 'sub-tab-content');
    
    // ... (the rest of your script.js file, from loadAndRenderServices onwards)1
}

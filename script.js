import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, doc, getDoc, deleteDoc, serverTimestamp, where, getDocs, orderBy, Timestamp, updateDoc, writeBatch, setDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

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
const clientDashboardContent = document.getElementById('client-dashboard-content');
const policyModal = document.getElementById('policy-modal');
const addAppointmentModal = document.getElementById('add-appointment-modal');
const addAppointmentForm = document.getElementById('add-appointment-form');
let mainAppInitialized = false;
let clientDashboardInitialized = false;
let landingPageInitialized = false;
let anonymousUserId = null;
let bookingSettings = { minBookingHours: 2 };
let loginSecuritySettings = { maxAttempts: 5, lockoutMinutes: 15 };
let salonHours = {}; // To store salon operating hours
let bookingsChart, servicesChart, earningsChart;
let notifications = [];
let currentUserRole = null;
let currentUserId = null;
let initialAppointmentsLoaded = false;
let initialInventoryLoaded = false;
let allFinishedClients = [], allAppointments = [], allClients = [], allActiveClients = [], servicesData = {};

const giftCardBackgrounds = {
    'General': [
        'https://images.unsplash.com/photo-1596048135132-911961bd4350?q=80&w=1887&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1519638831568-d9897f54ed69?q=80&w=2070&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1558081236-5415b3c5a7a5?q=80&w=1887&auto=format&fit=crop'
    ],
    'Holidays': [
        'https://images.unsplash.com/photo-1513297887119-d46091b24bfa?q=80&w=2070&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1541142762-9f70343a4b08?q=80&w=1964&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1577991395684-245a6a5839a8?q=80&w=1887&auto=format&fit=crop'
    ],
    'Birthday': [
        'https://images.unsplash.com/photo-1509281373149-e957c6296406?q=80&w=1928&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1513151233558-d860c5398176?q=80&w=2070&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1560240643-6d27e85c251e?q=80&w=1887&auto=format&fit=crop'
    ]
};


// --- Global Helper Functions ---
const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- Email Notification Logic ---
async function sendBookingNotificationEmail(appointmentData) {
    try {
        const adminsQuery = query(collection(db, "users"), where("role", "==", "admin"));
        const adminSnapshot = await getDocs(adminsQuery);
        const adminEmails = adminSnapshot.docs.map(doc => doc.data().email).filter(Boolean);

        let technicianEmail = null;
        if (appointmentData.technician && appointmentData.technician !== 'Any Technician') {
            const techQuery = query(collection(db, "users"), where("name", "==", appointmentData.technician));
            const techSnapshot = await getDocs(techQuery);
            if (!techSnapshot.empty) {
                const techData = techSnapshot.docs[0].data();
                if (techData.email) {
                    technicianEmail = techData.email;
                }
            }
        }

        const recipients = [...new Set([...adminEmails, technicianEmail].filter(Boolean))];

        if (recipients.length === 0) {
            console.log("No recipients found for booking notification email.");
            return;
        }

        const appointmentTime = appointmentData.appointmentTimestamp.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
        const subject = `New Booking: ${appointmentData.name} @ ${appointmentTime}`;
        const servicesList = Array.isArray(appointmentData.services) ? appointmentData.services.join(', ') : appointmentData.services;
        
        const html = `<div style="font-family: Arial, sans-serif; color: #333;"><h2 style="color: #d63384;">New Appointment Booked</h2><p>A new appointment has been scheduled for <strong>${appointmentData.name}</strong>.</p><table style="width: 100%; border-collapse: collapse; margin-top: 15px;"><tr style="border-bottom: 1px solid #ddd;"><td style="padding: 8px; width: 120px;"><strong>Client:</strong></td><td style="padding: 8px;">${appointmentData.name}</td></tr><tr style="border-bottom: 1px solid #ddd;"><td style="padding: 8px;"><strong>Phone:</strong></td><td style="padding: 8px;">${appointmentData.phone || 'N/A'}</td></tr><tr style="border-bottom: 1px solid #ddd;"><td style="padding: 8px;"><strong>Time:</strong></td><td style="padding: 8px;">${appointmentTime}</td></tr><tr style="border-bottom: 1px solid #ddd;"><td style="padding: 8px;"><strong>Technician:</strong></td><td style="padding: 8px;">${appointmentData.technician}</td></tr><tr style="border-bottom: 1px solid #ddd;"><td style="padding: 8px;"><strong>Services:</strong></td><td style="padding: 8px;">${servicesList}</td></tr><tr style="border-bottom: 1px solid #ddd;"><td style="padding: 8px;"><strong>Notes:</strong></td><td style="padding: 8px;">${appointmentData.notes || 'None'}</td></tr></table></div>`;

        const mailPromises = recipients.map(email => {
            return addDoc(collection(db, "mail"), {
                to: email,
                message: { subject: subject, html: html },
            });
        });

        await Promise.all(mailPromises);
        console.log("Booking notification emails queued for:", recipients.join(', '));

    } catch (error) {
        console.error("Error queuing booking notification email:", error);
    }
}

// --- Booking Validation Logic ---
function isBookingTimeValid(bookingDate) {
    const dayOfWeek = bookingDate.getDay(); 
    const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];

    const dayHours = salonHours[dayName];

    if (!dayHours || !dayHours.isOpen) {
        return { valid: false, message: `Sorry, the salon is closed on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s.` };
    }

    const bookingTime = bookingDate.getHours() * 60 + bookingDate.getMinutes();
    
    const [openHour, openMinute] = dayHours.open.split(':').map(Number);
    const openTime = openHour * 60 + openMinute;
    
    const [closeHour, closeMinute] = dayHours.close.split(':').map(Number);
    const closeTime = closeHour * 60 + closeMinute;

    if (bookingTime < openTime || bookingTime > closeTime) {
         const formatTime = (timeStr) => new Date(`1970-01-01T${timeStr}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        return { valid: false, message: `Sorry, our hours on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s are from ${formatTime(dayHours.open)} to ${formatTime(dayHours.close)}.` };
    }

    return { valid: true };
}


// --- Global Modal Logic ---
const openPolicyModal = () => { policyModal.classList.add('flex'); policyModal.classList.remove('hidden'); };
const closePolicyModal = () => { policyModal.classList.add('hidden'); policyModal.classList.remove('flex'); };
document.addEventListener('click', (e) => { if (e.target.closest('.view-policy-btn')) { openPolicyModal(); } });
document.getElementById('policy-close-btn').addEventListener('click', closePolicyModal);
document.querySelector('#policy-modal .policy-modal-overlay').addEventListener('click', closePolicyModal);

// --- Shared Appointment Modal Logic ---
const openAddAppointmentModal = (date, clientData = null) => {
    addAppointmentForm.reset();
    const now = new Date();
    const defaultDateTime = `${date}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    document.getElementById('appointment-datetime').value = defaultDateTime;

    if (clientData) {
        document.getElementById('appointment-client-name').value = clientData.name || '';
        document.getElementById('appointment-phone').value = clientData.phone || '';
    }

    const clientList = document.getElementById('client-names-list');
    const appointmentPhoneList = document.getElementById('appointment-client-phones');
    const uniqueNames = [...new Set(allFinishedClients.map(c => c.name))];
    const uniquePhones = [...new Set(allFinishedClients.filter(c => c.phone && c.phone !== 'N/A').map(c => c.phone))];
    clientList.innerHTML = uniqueNames.map(name => `<option value="${name}"></option>`).join('');
    appointmentPhoneList.innerHTML = uniquePhones.map(phone => `<option value="${phone}"></option>`).join('');
    
    const mainServicesList = document.getElementById('main-services-list');
    mainServicesList.innerHTML = Object.keys(servicesData).flatMap(category => 
        servicesData[category].map(service => `<option value="${service.p || ''}${service.name}${service.price ? ' ' + service.price : ''}"></option>`)
    ).join('');

    addAppointmentModal.classList.remove('hidden'); 
    addAppointmentModal.classList.add('flex');
};

const closeAddAppointmentModal = () => { 
    addAppointmentModal.classList.add('hidden'); 
    addAppointmentModal.classList.remove('flex'); 
};

document.getElementById('add-appointment-cancel-btn').addEventListener('click', closeAddAppointmentModal);
document.querySelector('.add-appointment-modal-overlay').addEventListener('click', closeAddAppointmentModal);
document.getElementById('appointment-client-name').addEventListener('input', (e) => { 
    const client = allFinishedClients.find(c => c.name === e.target.value); 
    if (client) { document.getElementById('appointment-phone').value = client.phone; } 
});
document.getElementById('appointment-phone').addEventListener('input', (e) => { 
    const client = allFinishedClients.find(c => c.phone === e.target.value); 
    if (client) { document.getElementById('appointment-client-name').value = client.name; } 
});

addAppointmentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datetimeString = document.getElementById('appointment-datetime').value;
    if (!datetimeString) { return alert('Please select a date and time.'); }
    
    const bookingDate = new Date(datetimeString);
    const validation = isBookingTimeValid(bookingDate);
    if (!validation.valid) {
        alert(validation.message);
        return;
    }
    
    const appointmentData = {
        name: document.getElementById('appointment-client-name').value,
        phone: document.getElementById('appointment-phone').value,
        people: document.getElementById('appointment-people').value,
        bookingType: document.getElementById('appointment-booking-type').value,
        services: [document.getElementById('appointment-services').value],
        technician: document.getElementById('appointment-technician-select').value,
        notes: document.getElementById('appointment-notes').value,
        appointmentTimestamp: Timestamp.fromDate(bookingDate)
    };
    
    try {
        await addDoc(collection(db, "appointments"), appointmentData);
        await sendBookingNotificationEmail(appointmentData);
        closeAddAppointmentModal();
    } catch (err) {
        console.error("Error adding appointment:", err);
        alert("Could not save appointment.");
    }
});



// --- Primary Authentication Router ---
onAuthStateChanged(auth, async (user) => {
    const hoursDoc = await getDoc(doc(db, "settings", "salonHours"));
    if (hoursDoc.exists()) {
        salonHours = hoursDoc.data();
    }

    if (user) {
        currentUserId = user.uid;
        if (user.isAnonymous) {
            anonymousUserId = user.uid;
            loadingScreen.style.display = 'none';
            appContent.style.display = 'none';
            clientDashboardContent.style.display = 'none';
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
                clientDashboardContent.style.display = 'none';
                appContent.style.display = 'block';
                if (!mainAppInitialized) {
                    initMainApp(currentUserRole);
                    mainAppInitialized = true;
                }
            } else { 
                const clientDocRef = doc(db, "clients", user.uid);
                const clientDoc = await getDoc(clientDocRef);
                if (clientDoc.exists()) {
                    currentUserRole = clientDoc.data().role; 
                    loadingScreen.style.display = 'none';
                    landingPageContent.style.display = 'none';
                    appContent.style.display = 'none';
                    clientDashboardContent.style.display = 'block';
                     if (!clientDashboardInitialized) {
                        initClientDashboard(user.uid, clientDoc.data());
                        clientDashboardInitialized = true;
                    }
                } else {
                     console.error("User authenticated but no user/client document found. Logging out.");
                     await signOut(auth);
                     alert("Login error: User data not found.");
                }
            }
        }
    } else {
        currentUserId = null;
        currentUserRole = null;
        signInAnonymously(auth).catch((error) => {
            console.error("Anonymous sign-in failed:", error);
            loadingScreen.innerHTML = '<h2 class="text-3xl font-bold text-red-700">Could not connect. Please refresh.</h2>';
        });
    }
});


// --- LANDING PAGE SCRIPT ---
function initLandingPage() {
    const signupLoginModal = document.getElementById('signup-login-modal');
    const userIcon = document.getElementById('user-icon');
    const closeSignupLoginModalBtn = document.getElementById('close-signup-login-modal-btn');
    const landingLoginForm = document.getElementById('landing-login-form');
    const landingSignupForm = document.getElementById('landing-signup-form');
    const addAppointmentFormLanding = document.getElementById('add-appointment-form-landing');
    const giftCardModal = document.getElementById('gift-card-modal');
    const buyGiftCardBtn = document.getElementById('buy-gift-card-btn');
    const closeGiftCardModalBtn = document.getElementById('close-gift-card-modal-btn');
    const giftCardForm = document.getElementById('gift-card-form');
    const lockoutMessageDiv = document.getElementById('login-lockout-message');

    getDoc(doc(db, "settings", "security")).then(docSnap => {
        if (docSnap.exists()) {
            loginSecuritySettings = docSnap.data();
        }
    });

    const openAuthModal = () => { signupLoginModal.classList.remove('hidden'); signupLoginModal.classList.add('flex'); };
    const closeAuthModal = () => { signupLoginModal.classList.add('hidden'); signupLoginModal.classList.remove('flex'); };
    userIcon.addEventListener('click', openAuthModal);
    closeSignupLoginModalBtn.addEventListener('click', closeAuthModal);
    signupLoginModal.querySelector('.modal-overlay').addEventListener('click', closeAuthModal);

    const loginTabBtn = document.getElementById('login-tab-btn');
    const signupTabBtn = document.getElementById('signup-tab-btn');
    const loginFormContainer = document.getElementById('login-form-container');
    const signupFormContainer = document.getElementById('signup-form-container');

    loginTabBtn.addEventListener('click', () => {
        loginTabBtn.classList.add('active');
        signupTabBtn.classList.remove('active');
        loginFormContainer.classList.remove('hidden');
        signupFormContainer.classList.add('hidden');
    });

    signupTabBtn.addEventListener('click', () => {
        signupTabBtn.classList.add('active');
        loginTabBtn.classList.remove('active');
        signupFormContainer.classList.remove('hidden');
        loginFormContainer.classList.add('hidden');
    });

    const openGiftCardModal = () => { giftCardModal.classList.remove('hidden'); giftCardModal.classList.add('flex'); };
    const closeGiftCardModal = () => { giftCardModal.classList.add('hidden'); giftCardModal.classList.remove('flex'); };
    buyGiftCardBtn.addEventListener('click', openGiftCardModal);
    closeGiftCardModalBtn.addEventListener('click', closeGiftCardModal);
    giftCardModal.querySelector('.modal-overlay').addEventListener('click', closeGiftCardModal);
    
    const giftCardAmountSelect = document.getElementById('gift-card-amount');
    const customAmountInput = document.getElementById('gift-card-custom-amount');
    giftCardAmountSelect.addEventListener('change', () => {
        if (giftCardAmountSelect.value === 'custom') {
            customAmountInput.classList.remove('hidden');
            customAmountInput.required = true;
        } else {
            customAmountInput.classList.add('hidden');
            customAmountInput.required = false;
        }
    });

    giftCardForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = giftCardAmountSelect.value === 'custom' 
            ? parseFloat(customAmountInput.value) 
            : parseInt(giftCardAmountSelect.value, 10);

        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid amount.');
            return;
        }

        const giftCardData = { amount: amount, balance: amount, history: [], recipientName: document.getElementById('gift-card-recipient-name').value, recipientEmail: document.getElementById('gift-card-recipient-email').value, senderName: document.getElementById('gift-card-sender-name').value, message: document.getElementById('gift-card-message').value, code: `GC-${Date.now()}${[...Array(4)].map(() => Math.floor(Math.random() * 10)).join('')}`, status: 'Active', createdAt: serverTimestamp() };

        try {
            alert('Redirecting to a secure payment page...');
            await addDoc(collection(db, "gift_cards"), giftCardData);
            alert(`Success! Gift card for $${amount} has been sent to ${giftCardData.recipientEmail}.`);
            giftCardForm.reset();
            closeGiftCardModal();

        } catch (error) {
            console.error("Error purchasing gift card:", error);
            alert("Could not process the gift card purchase. Please try again.");
        }
    });

    landingLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('landing-email').value;
        const password = document.getElementById('landing-password').value;
        const loginBtn = document.getElementById('landing-login-btn');
        const btnText = loginBtn.querySelector('.btn-text');
        const spinner = loginBtn.querySelector('i');
        const emailKey = 'loginAttempts_' + email.toLowerCase();
        const lockoutKey = 'lockoutUntil_' + email.toLowerCase();

        const lockoutUntil = localStorage.getItem(lockoutKey);
        if (lockoutUntil && Date.now() < parseInt(lockoutUntil)) {
            const remainingTime = Math.ceil((parseInt(lockoutUntil) - Date.now()) / (1000 * 60));
            lockoutMessageDiv.textContent = `Too many failed attempts. Please try again in ${remainingTime} minutes.`;
            lockoutMessageDiv.classList.remove('hidden');
            return;
        } else if (lockoutUntil) {
            localStorage.removeItem(lockoutKey);
        }
        lockoutMessageDiv.classList.add('hidden');

        btnText.textContent = 'Logging In...';
        spinner.classList.remove('hidden');
        loginBtn.disabled = true;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            localStorage.removeItem(emailKey); 
            localStorage.removeItem(lockoutKey);
        } catch (error) {
            let attempts = (parseInt(localStorage.getItem(emailKey)) || 0) + 1;
            if (attempts >= loginSecuritySettings.maxAttempts) {
                const lockoutTime = Date.now() + loginSecuritySettings.lockoutMinutes * 60 * 1000;
                localStorage.setItem(lockoutKey, lockoutTime);
                localStorage.removeItem(emailKey);
                lockoutMessageDiv.textContent = `Login disabled for ${loginSecuritySettings.lockoutMinutes} minutes due to too many failed attempts.`;
                lockoutMessageDiv.classList.remove('hidden');
            } else {
                localStorage.setItem(emailKey, attempts);
                alert(`Login Failed: ${error.message}. You have ${loginSecuritySettings.maxAttempts - attempts} attempts remaining.`);
            }
        } finally {
            btnText.textContent = 'Log In';
            spinner.classList.add('hidden');
            loginBtn.disabled = false;
        }
    });

    landingSignupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const signupBtn = document.getElementById('landing-signup-btn');
        const btnText = signupBtn.querySelector('.btn-text');
        const spinner = signupBtn.querySelector('i');

        btnText.textContent = 'Signing Up...';
        spinner.classList.remove('hidden');

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await setDoc(doc(db, "clients", user.uid), { name: name, email: email, role: 'client', createdAt: serverTimestamp() });
        } catch (error) {
            alert(`Sign Up Failed: ${error.message}`);
        } finally {
            btnText.textContent = 'Sign Up';
            spinner.classList.add('hidden');
        }
    });

    const peopleSelect = document.getElementById('appointment-people-landing');
    for (let i = 1; i <= 20; i++) {
        peopleSelect.appendChild(new Option(i, i));
    }

    const technicianSelect = document.getElementById('appointment-technician-select-landing');
    onSnapshot(collection(db, "users"), (snapshot) => {
        const users = snapshot.docs.map(doc => doc.data());
        const technicians = users.filter(user => user.role === 'technician');
        technicianSelect.innerHTML = '<option>Any Technician</option>';
        technicians.forEach(tech => {
            technicianSelect.appendChild(new Option(tech.name, tech.name));
        });
    });
    
    const step1 = document.getElementById('booking-step-1');
    const step2 = document.getElementById('booking-step-2');
    document.getElementById('booking-next-btn').addEventListener('click', () => {
        step1.classList.add('hidden');
        step2.classList.remove('hidden');
    });
    document.getElementById('booking-prev-btn').addEventListener('click', () => {
        step2.classList.add('hidden');
        step1.classList.remove('hidden');
    });

    const servicesContainerLanding = document.getElementById('services-container-landing');
    const hiddenCheckboxContainerLanding = document.getElementById('hidden-checkbox-container-landing');
    let landingServicesData = {};
    
    getDocs(collection(db, "services")).then(servicesSnapshot => {
        servicesData = {}; 
        landingServicesData = {};
        servicesSnapshot.forEach(doc => { 
            servicesData[doc.id] = doc.data().items;
            landingServicesData[doc.id] = doc.data().items; 
        });
        
        servicesContainerLanding.innerHTML = '';
        hiddenCheckboxContainerLanding.innerHTML = '';
        Object.keys(landingServicesData).forEach(category => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'category-button p-4 border border-gray-200 rounded-lg text-left bg-white hover:border-pink-300 hover:bg-pink-50 transition-all duration-200 shadow-sm';
            btn.dataset.category = category;
            btn.innerHTML = `<h3 class="text-lg font-bold text-pink-700">${category}</h3><span class="text-sm text-gray-500 mt-1 block">Click to select</span><span class="selection-count hidden mt-2 bg-pink-600 text-white text-xs font-bold px-2 py-1 rounded-full"></span>`;
            servicesContainerLanding.appendChild(btn);
            landingServicesData[category].forEach(service => {
                const val = `${service.p || ''}${service.name}${service.price ? ' ' + service.price : ''}`;
                const cb = document.createElement('input');
                cb.type = 'checkbox'; cb.name = 'service-landing'; cb.value = val; cb.dataset.category = category;
                hiddenCheckboxContainerLanding.appendChild(cb);
            });
        });
    });

    const serviceModalLanding = document.getElementById('landing-booking-service-modal');
    const serviceModalContentLanding = document.getElementById('landing-booking-service-modal-content');
    
    servicesContainerLanding.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-button');
        if (btn) {
            const category = btn.dataset.category;
            document.getElementById('landing-booking-modal-title').textContent = category;
            serviceModalContentLanding.innerHTML = '';
            landingServicesData[category].forEach(service => {
                const val = `${service.p || ''}${service.name}${service.price ? ' ' + service.price : ''}`;
                const sourceCb = hiddenCheckboxContainerLanding.querySelector(`input[value="${val}"]`);
                const label = document.createElement('label');
                label.className = 'flex items-center p-3 hover:bg-pink-50 cursor-pointer rounded-lg';
                label.innerHTML = `<input type="checkbox" class="form-checkbox modal-checkbox-landing" value="${val}" ${sourceCb && sourceCb.checked ? 'checked' : ''}><span class="ml-3 text-gray-700 flex-grow">${service.name}</span>${service.price ? `<span class="font-semibold">${service.price}</span>` : ''}`;
                serviceModalContentLanding.appendChild(label);
            });
            serviceModalLanding.classList.remove('hidden');
            serviceModalLanding.classList.add('flex');
        }
    });

    document.getElementById('landing-booking-service-modal-done-btn').addEventListener('click', () => {
        serviceModalContentLanding.querySelectorAll('.modal-checkbox-landing').forEach(modalCb => {
            const sourceCb = hiddenCheckboxContainerLanding.querySelector(`input[value="${modalCb.value}"]`);
            if (sourceCb) sourceCb.checked = modalCb.checked;
        });
        serviceModalLanding.classList.add('hidden');
        serviceModalLanding.classList.remove('flex');
        
        document.querySelectorAll('#services-container-landing .category-button').forEach(button => {
            const cat = button.dataset.category;
            const count = hiddenCheckboxContainerLanding.querySelectorAll(`input[data-category="${cat}"]:checked`).length;
            const badge = button.querySelector('.selection-count');
            if (count > 0) {
                badge.textContent = `${count} selected`;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        });
    });

    addAppointmentFormLanding.addEventListener('submit', async (e) => {
        e.preventDefault();
        const services = Array.from(document.querySelectorAll('input[name="service-landing"]:checked')).map(el => el.value);
        if (services.length === 0) {
            alert('Please select at least one service.');
            return;
        }
        
        const bookingDate = new Date(document.getElementById('appointment-datetime-landing').value);
        const validation = isBookingTimeValid(bookingDate);
        if (!validation.valid) {
            alert(validation.message);
            return;
        }

        const appointmentData = {
            name: document.getElementById('appointment-client-name-landing').value,
            phone: document.getElementById('appointment-phone-landing').value,
            people: document.getElementById('appointment-people-landing').value,
            technician: document.getElementById('appointment-technician-select-landing').value,
            appointmentTimestamp: Timestamp.fromDate(bookingDate),
            notes: document.getElementById('appointment-notes-landing').value,
            services: services,
            bookingType: 'Online'
        };

        try {
            await addDoc(collection(db, "appointments"), appointmentData);
            await sendBookingNotificationEmail(appointmentData);

            alert('Appointment booked successfully!');
            addAppointmentFormLanding.reset();
            step2.classList.add('hidden');
            step1.classList.remove('hidden');

            document.querySelectorAll('#services-container-landing .selection-count').forEach(badge => badge.classList.add('hidden'));
            hiddenCheckboxContainerLanding.querySelectorAll('input').forEach(cb => cb.checked = false);

        } catch (error) {
            console.error("Error booking appointment:", error);
            alert("Could not book appointment. Please try again.");
        }
    });

    const updateFeatureVisibility = (settings) => {
        const showClientRegistration = settings.showClientLogin !== false;
        const showPromos = settings.showPromotions !== false;
        const showGiftCards = settings.showGiftCards !== false;
        const showNailArt = settings.showNailArt !== false;
        
        const signupTab = document.getElementById('signup-tab-btn').parentElement;
        if (signupTab) {
             signupTab.style.display = showClientRegistration ? 'block' : 'none';
        }
        
        document.getElementById('promotions-landing').style.display = showPromos ? '' : 'none';
        document.querySelector('.nav-item-promotions').style.display = showPromos ? '' : 'none';
        
        document.getElementById('gift-card-landing').style.display = showGiftCards ? '' : 'none';
        document.querySelector('.nav-item-gift-card').style.display = showGiftCards ? '' : 'none';

        document.getElementById('nails-idea-landing').style.display = showNailArt ? '' : 'none';
        document.querySelector('.nav-item-nails-idea').style.display = showNailArt ? '' : 'none';
    };

    onSnapshot(doc(db, "settings", "features"), (docSnap) => {
        if (docSnap.exists()) {
            updateFeatureVisibility(docSnap.data());
        } else {
            updateFeatureVisibility({ showClientLogin: true, showPromotions: true, showGiftCards: true, showNailArt: true });
        }
    });
}

// --- CLIENT DASHBOARD SCRIPT ---
function initClientDashboard(clientId, clientData) {
    document.getElementById('client-welcome-name').textContent = `Welcome back, ${clientData.name}!`;
    document.getElementById('client-sign-out-btn').addEventListener('click', () => signOut(auth));

    const setupClientTabs = () => {
        const tabs = document.getElementById('client-dashboard-tabs');
        tabs.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            document.querySelectorAll('#client-dashboard-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            document.querySelectorAll('.client-tab-content').forEach(content => content.classList.add('hidden'));
            document.getElementById(button.id.replace('-tab', '-content')).classList.remove('hidden');
        });
    };

    const renderClientAppointments = (appointments) => {
        const container = document.getElementById('client-upcoming-appointments');
        container.innerHTML = '';
        const upcoming = appointments.filter(a => a.appointmentTimestamp.toDate() > new Date());
        if (upcoming.length === 0) {
            container.innerHTML = '<p class="text-gray-500">You have no upcoming appointments.</p>';
            return;
        }
        upcoming.forEach(appt => {
            const el = document.createElement('div');
            el.className = 'bg-white p-4 rounded-lg shadow';
            el.innerHTML = `<p class="font-bold">${new Date(appt.appointmentTimestamp.seconds * 1000).toLocaleString()}</p><p>${appt.services.join(', ')}</p><p class="text-sm text-gray-600">With: ${appt.technician}</p>`;
            container.appendChild(el);
        });
    };

    const renderClientHistory = (history) => {
         const container = document.getElementById('client-appointment-history');
        container.innerHTML = '';
        if (history.length === 0) {
            container.innerHTML = '<p class="text-gray-500">You have no past appointments.</p>';
            return;
        }
        history.forEach(visit => {
            const el = document.createElement('div');
            el.className = 'bg-white p-4 rounded-lg shadow';
            el.innerHTML = `<p class="font-bold">${new Date(visit.checkOutTimestamp.seconds * 1000).toLocaleDateString()}</p><p>${visit.services}</p><p class="text-sm text-gray-600">With: ${visit.technician}</p>${visit.colorCode ? `<p class="text-sm text-gray-600">Color: ${visit.colorCode}</p>` : ''}`;
            container.appendChild(el);
        });
    };

    const calculateAndRenderFavorites = (history) => {
        if (history.length === 0) return;
        const techCounts = history.reduce((acc, visit) => {
            if (visit.technician) acc[visit.technician] = (acc[visit.technician] || 0) + 1;
            return acc;
        }, {});
        const colorCounts = history.reduce((acc, visit) => {
            if(visit.colorCode) acc[visit.colorCode] = (acc[visit.colorCode] || 0) + 1;
            return acc;
        }, {});

        const favTech = Object.keys(techCounts).length > 0 ? Object.keys(techCounts).reduce((a, b) => techCounts[a] > techCounts[b] ? a : b) : 'N/A';
        const favColor = Object.keys(colorCounts).length > 0 ? Object.keys(colorCounts).reduce((a, b) => colorCounts[a] > colorCounts[b] ? a : b) : 'N/A';

        document.getElementById('favorite-technician').textContent = favTech;
        document.getElementById('favorite-color').textContent = favColor;
    };

    const renderClientGallery = (photos) => {
        const container = document.getElementById('client-photo-gallery');
        container.innerHTML = '';
        if (!photos || photos.length === 0) {
            container.innerHTML = '<p class="text-gray-500 col-span-full">You haven\'t uploaded any photos yet.</p>';
            return;
        }
        photos.forEach(photoURL => {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'relative';
            imgContainer.innerHTML = `<img src="${photoURL}" class="w-full h-48 object-cover rounded-lg shadow">`;
            container.appendChild(imgContainer);
        });
    };

    onSnapshot(doc(db, "clients", clientId), (docSnap) => {
        if (docSnap.exists()) {
            renderClientGallery(docSnap.data().photoGallery);
        }
    });

    onSnapshot(query(collection(db, "appointments"), where("name", "==", clientData.name)), (snapshot) => {
        const appointments = snapshot.docs.map(doc => ({...doc.data(), id: doc.id}));
        renderClientAppointments(appointments);
    });
     onSnapshot(query(collection(db, "finished_clients"), where("name", "==", clientData.name), orderBy("checkOutTimestamp", "desc")), (snapshot) => {
        const history = snapshot.docs.map(doc => ({...doc.data(), id: doc.id}));
        allFinishedClients = history; 
        renderClientHistory(history);
        calculateAndRenderFavorites(history);
    });

    document.getElementById('client-photo-upload').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const storageRef = ref(storage, `client_galleries/${clientId}/${Date.now()}_${file.name}`);
        try {
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);
            await updateDoc(doc(db, "clients", clientId), {
                photoGallery: arrayUnion(downloadURL)
            });
            alert('Photo uploaded successfully!');
        } catch (error) {
            console.error("Error uploading photo:", error);
            alert("Could not upload photo.");
        }
        e.target.value = '';
    });

    document.getElementById('client-book-new-btn').addEventListener('click', () => {
        openAddAppointmentModal(getLocalDateString(), clientData);
    });

    setupClientTabs();
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
    const checkInNavCount = document.getElementById('check-in-nav-count');
    const bookingNavCount = document.getElementById('booking-nav-count');
    const appLoadTimestamp = Timestamp.now();

    const updateNavCounts = () => {
        const checkInCount = allActiveClients.length;
        if (checkInCount > 0) {
            checkInNavCount.textContent = checkInCount;
            checkInNavCount.classList.remove('hidden');
        } else {
            checkInNavCount.classList.add('hidden');
        }

        const bookingCount = allAppointments.length;
        if (bookingCount > 0) {
            bookingNavCount.textContent = bookingCount;
            bookingNavCount.classList.remove('hidden');
        } else {
            bookingNavCount.classList.add('hidden');
        }
    };
    
    const updateNotificationDisplay = () => {
        const unreadCount = notifications.filter(n => !n.read).length;
        notificationCount.textContent = unreadCount;
        notificationCount.style.display = unreadCount > 0 ? 'block' : 'none';

        notificationDropdown.innerHTML = notifications.length === 0 
            ? '<div class="p-4 text-center text-sm text-gray-500">No new notifications</div>' 
            : '';
        
        notifications.forEach(n => {
            const item = document.createElement('div');
            item.className = `notification-item ${!n.read ? 'font-bold bg-pink-50' : ''}`;
            item.innerHTML = `<p class="text-gray-800">${n.message}</p><p class="text-xs text-gray-400 mt-1">${n.timestamp.toLocaleString()}</p>`;
            notificationDropdown.appendChild(item);
        });
    };

    const addNotification = (type, message, itemId = null) => {
        const newNotification = { id: Date.now() + Math.random(), type: type, message: message, timestamp: new Date(), read: false, itemId: itemId };
        notifications.unshift(newNotification);
        updateNotificationDisplay();

        const bellIcon = notificationBell.querySelector('i');
        bellIcon.classList.remove('ring-animation');
        void bellIcon.offsetWidth;
        bellIcon.classList.add('ring-animation');
    };
    
    dashboardContent.classList.remove('hidden');
    mainAppContainer.classList.add('hidden');

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
            case 'check-in': document.getElementById('check-in-section').classList.remove('hidden'); document.getElementById('check-in-tab').click(); break;
            case 'booking': document.getElementById('calendar-content').classList.remove('hidden'); break;
            case 'nails-idea': document.getElementById('nails-idea-content').classList.remove('hidden'); break;
            case 'report': document.getElementById('reports-content').classList.remove('hidden'); document.getElementById('salon-earning-report-tab').click(); break;
            case 'setting': document.getElementById('admin-content').classList.remove('hidden'); document.getElementById('user-management-tab').click(); break;
        }
    });
    
    notificationBell.addEventListener('click', () => {
        notificationDropdown.classList.toggle('hidden');
        if (!notificationDropdown.classList.contains('hidden')) {
            notifications.forEach(n => n.read = true);
            setTimeout(updateNotificationDisplay, 300);
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
    
    const editEarningModal = document.getElementById('edit-earning-modal');
    const editEarningForm = document.getElementById('edit-earning-form');
    const editSalonEarningModal = document.getElementById('edit-salon-earning-modal');
    const editSalonEarningForm = document.getElementById('edit-salon-earning-form');
    const clientFormModal = document.getElementById('client-form-modal');
    const clientForm = document.getElementById('client-form');
    const geminiSmsModal = document.getElementById('gemini-sms-modal');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalMessage = document.getElementById('confirm-modal-message');
    const confirmConfirmBtn = document.getElementById('confirm-confirm-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const logUsageModal = document.getElementById('log-usage-modal');
    const logUsageForm = document.getElementById('log-usage-form');
    const shareModal = document.getElementById('share-modal');
    const giftCardDesignerModal = document.getElementById('gift-card-designer-modal');
    const editGiftCardModal = document.getElementById('edit-gift-card-modal');

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

    let aggregatedClients = [], allEarnings = [], allSalonEarnings = [], allExpenses = [], allInventory = [], allNailIdeas = [], allInventoryUsage = [], allGiftCards = [], allPromotions = [];
    let techniciansAndStaff = [], technicians = [];
    let allExpenseCategories = [], allPaymentAccounts = [], allSuppliers = [];

    
    let confirmCallback = null;
    const showConfirmModal = (message, onConfirm) => { confirmModalMessage.textContent = message; confirmCallback = onConfirm; confirmModal.classList.remove('hidden'); confirmModal.classList.add('flex'); };
    const closeConfirmModal = () => { confirmModal.classList.add('hidden'); confirmModal.classList.remove('flex'); confirmCallback = null; };
    confirmConfirmBtn.addEventListener('click', () => { if (confirmCallback) { confirmCallback(); } closeConfirmModal(); });
    confirmCancelBtn.addEventListener('click', closeConfirmModal);
    document.querySelector('.confirm-modal-overlay').addEventListener('click', closeConfirmModal);

    const dashboardDateFilter = document.getElementById('dashboard-date-filter');

    const updateDashboard = () => {
        const filter = dashboardDateFilter.value;
        const now = new Date();
        let startDate, endDate;
        switch (filter) {
            case 'today': startDate = new Date(now.setHours(0, 0, 0, 0)); endDate = new Date(now.setHours(23, 59, 59, 999)); break;
            case 'this_week': const firstDayOfWeek = now.getDate() - now.getDay(); startDate = new Date(now.setDate(firstDayOfWeek)); startDate.setHours(0, 0, 0, 0); endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6); endDate.setHours(23, 59, 59, 999); break;
            case 'this_month': startDate = new Date(now.getFullYear(), now.getMonth(), 1); endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); break;
            case 'this_year': startDate = new Date(now.getFullYear(), 0, 1); endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999); break;
        }
        const filteredBookings = allAppointments.filter(a => { const apptDate = a.appointmentTimestamp.toDate(); return apptDate >= startDate && apptDate <= endDate; });
        const filteredFinished = allFinishedClients.filter(f => { const finDate = f.checkOutTimestamp.toDate(); return finDate >= startDate && finDate <= endDate; });
        const filteredEarnings = allEarnings.filter(e => { const earnDate = e.date.toDate(); return earnDate >= startDate && earnDate <= endDate; });
        document.getElementById('total-bookings-card').textContent = filteredBookings.length + filteredFinished.length;
        const totalRevenue = filteredEarnings.reduce((sum, e) => sum + e.earning, 0);
        document.getElementById('total-revenue-card').textContent = `$${totalRevenue.toFixed(2)}`;
        const lowStockItems = allInventory.filter(item => item.quantity <= item.lowStockAlert).length;
        document.getElementById('low-stock-card').textContent = lowStockItems;
        const techEarnings = filteredEarnings.reduce((acc, curr) => { acc[curr.staffName] = (acc[curr.staffName] || 0) + curr.earning; return acc; }, {});
        const topTechnician = Object.keys(techEarnings).reduce((a, b) => techEarnings[a] > techEarnings[b] ? a : b, '-');
        document.getElementById('top-technician-card').textContent = topTechnician;
        updateBookingsChart(filteredBookings.concat(filteredFinished), filter);
        updateServicesChart(filteredFinished);
        updateEarningsChart(techEarnings);
    };

    const initializeChart = (chartInstance, ctx, type, data, options) => {
        if (chartInstance) { chartInstance.data = data; chartInstance.options = options; chartInstance.update(); } 
        else { chartInstance = new Chart(ctx, { type, data, options }); }
        return chartInstance;
    };
    
    const updateBookingsChart = (data, filter) => {
        const ctx = document.getElementById('bookings-chart').getContext('2d');
        let labels = [], chartData = [], counts = {};
        if (filter === 'today') {
            labels = Array.from({ length: 12 }, (_, i) => `${i * 2}:00`);
            chartData = Array(12).fill(0);
            data.forEach(item => { const date = item.appointmentTimestamp?.toDate() || item.checkOutTimestamp?.toDate(); if (date) { const hour = Math.floor(date.getHours() / 2); chartData[hour]++; } });
        } else if (filter === 'this_week') {
            labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            chartData = Array(7).fill(0);
            data.forEach(item => { const date = item.appointmentTimestamp?.toDate() || item.checkOutTimestamp?.toDate(); if (date) { chartData[date.getDay()]++; } });
        } else {
            const format = filter === 'this_month' ? 'numeric' : 'short';
            data.forEach(item => { const date = item.appointmentTimestamp?.toDate() || item.checkOutTimestamp?.toDate(); if (date) { const key = filter === 'this_month' ? date.getDate() : date.toLocaleString('default', { month: format }); counts[key] = (counts[key] || 0) + 1; } });
            labels = Object.keys(counts).sort((a,b) => (filter === 'this_month' ? a-b : new Date(a + ' 1, 2000') - new Date(b + ' 1, 2000')) );
            chartData = labels.map(label => counts[label]);
        }
        const chartConfig = { labels: labels, datasets: [{ label: 'Bookings', data: chartData, backgroundColor: 'rgba(219, 39, 119, 0.5)', borderColor: 'rgba(219, 39, 119, 1)', borderWidth: 1, tension: 0.1 }] };
        bookingsChart = initializeChart(bookingsChart, ctx, 'line', chartConfig, { responsive: true, maintainAspectRatio: false });
    };

    const updateServicesChart = (data) => {
        const ctx = document.getElementById('services-chart').getContext('2d');
        const serviceCounts = data.reduce((acc, client) => { const services = typeof client.services === 'string' ? client.services.split(', ') : (client.services || []); services.forEach(service => { const serviceName = service.split(' $')[0].replace(/Gel Polish - /g, '').trim(); acc[serviceName] = (acc[serviceName] || 0) + 1; }); return acc; }, {});
        const sortedServices = Object.entries(serviceCounts).sort(([, a], [, b]) => b - a).slice(0, 5);
        const labels = sortedServices.map(item => item[0]);
        const chartData = sortedServices.map(item => item[1]);
        const chartConfig = { labels: labels, datasets: [{ label: 'Top Services', data: chartData, backgroundColor: ['rgba(255, 99, 132, 0.5)', 'rgba(54, 162, 235, 0.5)', 'rgba(255, 206, 86, 0.5)', 'rgba(75, 192, 192, 0.5)', 'rgba(153, 102, 255, 0.5)'], borderColor: ['rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)', 'rgba(255, 206, 86, 1)', 'rgba(75, 192, 192, 1)', 'rgba(153, 102, 255, 1)'], borderWidth: 1 }] };
        servicesChart = initializeChart(servicesChart, ctx, 'doughnut', chartConfig, { responsive: true, maintainAspectRatio: false });
    };

    const updateEarningsChart = (techEarnings) => {
        const ctx = document.getElementById('earnings-chart').getContext('2d');
        const labels = Object.keys(techEarnings);
        const chartData = Object.values(techEarnings);
        const chartConfig = { labels: labels, datasets: [{ label: 'Technician Earnings', data: chartData, backgroundColor: 'rgba(54, 162, 235, 0.5)', borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 1 }] };
        earningsChart = initializeChart(earningsChart, ctx, 'bar', chartConfig, { responsive: true, maintainAspectRatio: false, indexAxis: 'y' });
    };

    dashboardDateFilter.addEventListener('change', updateDashboard);
    const dailyNotesForm = document.getElementById('daily-notes-form');
    const dailyNoteInput = document.getElementById('daily-note-input');
    const dailyNotesContainer = document.getElementById('daily-notes-container');

    const renderDailyNotes = (notes) => {
        dailyNotesContainer.innerHTML = '';
        if (!notes || notes.length === 0) {
            dailyNotesContainer.innerHTML = '<p class="text-gray-500">No notes for today.</p>';
            return;
        }
        notes.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        notes.forEach(note => { const noteEl = document.createElement('div'); noteEl.className = 'bg-pink-50 p-3 rounded-lg flex justify-between items-center'; noteEl.innerHTML = `<p class="text-gray-800">${note.text}</p><button data-id="${note.id}" class="delete-note-btn text-red-400 hover:text-red-600"><i class="fas fa-times-circle"></i></button>`; dailyNotesContainer.appendChild(noteEl); });
    };

    const todayStringForNotes = getLocalDateString();
    const noteDocRef = doc(db, "daily_notes", todayStringForNotes);

    onSnapshot(noteDocRef, (docSnap) => {
        if (docSnap.exists()) { renderDailyNotes(docSnap.data().notes); } 
        else { renderDailyNotes([]); }
    });

    dailyNotesForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const noteText = dailyNoteInput.value.trim();
        if (!noteText) return;
        const newNote = { text: noteText, createdAt: Timestamp.now(), id: crypto.randomUUID() };
        try { await setDoc(noteDocRef, { notes: arrayUnion(newNote) }, { merge: true }); dailyNoteInput.value = ''; } 
        catch (error) { console.error("Error adding note: ", error); alert("Could not save the note."); }
    });

    dailyNotesContainer.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-note-btn');
        if (deleteBtn) {
            const noteIdToDelete = deleteBtn.dataset.id;
            try {
                const docSnap = await getDoc(noteDocRef);
                if (docSnap.exists()) {
                    const existingNotes = docSnap.data().notes || [];
                    const noteToRemove = existingNotes.find(note => note.id === noteIdToDelete);
                    if (noteToRemove) { await updateDoc(noteDocRef, { notes: arrayRemove(noteToRemove) }); }
                }
            } catch (error) { console.error("Error deleting note: ", error); alert("Could not delete the note."); }
        }
    });

    const loadAndRenderServices = async () => {
        const servicesSnapshot = await getDocs(collection(db, "services"));
        servicesData = {};
        servicesSnapshot.forEach(doc => { servicesData[doc.id] = doc.data().items; });
        renderCheckInServices();
    };

    const renderCheckInServices = () => {
        servicesContainer.innerHTML = '';
        hiddenCheckboxContainer.innerHTML = '';
        Object.keys(servicesData).forEach(category => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'category-button p-4 border border-gray-200 rounded-lg text-left bg-white hover:border-pink-300 hover:bg-pink-50 transition-all duration-200 shadow-sm';
            btn.dataset.category = category;
            btn.innerHTML = `<h3 class="text-lg font-bold text-pink-700">${category}</h3><span class="text-sm text-gray-500 mt-1 block">Click to select</span><span class="selection-count hidden mt-2 bg-pink-600 text-white text-xs font-bold px-2 py-1 rounded-full"></span>`;
            servicesContainer.appendChild(btn);
            servicesData[category].forEach(service => {
                const val = `${service.p || ''}${service.name}${service.price ? ' ' + service.price : ''}`;
                const cb = document.createElement('input');
                cb.type = 'checkbox'; cb.name = 'service'; cb.value = val; cb.dataset.category = category;
                hiddenCheckboxContainer.appendChild(cb);
            });
        });
    };

    const applyClientFilters = (clients, searchTerm, techFilter, dateFilter) => {
        let filtered = clients;
        if (searchTerm) { filtered = filtered.filter(c => c.name.toLowerCase().includes(searchTerm)); }
        if (techFilter !== 'All' && techFilter !== 'Any Technician') { filtered = filtered.filter(c => c.technician === techFilter); } 
        else if (techFilter === 'Any Technician') { filtered = filtered.filter(c => c.technician === 'Any Technician'); }
        if (dateFilter) {
            filtered = filtered.filter(c => {
                if (!c.checkOutTimestamp) return false;
                return getLocalDateString(new Date(c.checkOutTimestamp.seconds * 1000)) === dateFilter;
            });
        }
        return filtered;
    };

    const renderActiveClients = (clients) => {
        const tbody = document.querySelector('#clients-table tbody');
        if (!tbody) return;
        tbody.innerHTML = clients.length === 0 ? `<tr><td colspan="4" class="py-6 text-center text-gray-400">No clients in the queue.</td></tr>` : '';
        clients.forEach((client, index) => {
            const row = tbody.insertRow();
            row.className = 'bg-white border-b';
            row.innerHTML = `<td class="px-6 py-4 text-center font-medium text-gray-900">${index + 1}</td><td class="px-6 py-4">${client.name}</td><td class="px-6 py-4">${client.services}</td><td class="px-6 py-4 text-center space-x-4"><button data-id="${client.id}" class="move-to-processing-btn" title="Move to Processing"><i class="fas fa-arrow-right text-lg text-blue-500 hover:text-blue-700"></i></button><button data-id="${client.id}" class="detail-btn-active" title="View Details"><i class="fas fa-info-circle text-lg text-gray-500 hover:text-gray-700"></i></button></td>`;
        });
    };

    const renderProcessingClients = (clients) => {
        const tbody = document.querySelector('#processing-table tbody');
        if (!tbody) return;
        tbody.innerHTML = clients.length === 0 ? `<tr><td colspan="6" class="py-6 text-center text-gray-400">No clients are being processed.</td></tr>` : '';
        clients.forEach((client, index) => {
            const row = tbody.insertRow();
            row.className = 'bg-white border-b';
            row.innerHTML = `<td class="px-6 py-4 text-center font-medium text-gray-900">${index + 1}</td><td class="px-6 py-4">${client.name}</td><td class="px-6 py-4">${client.services}</td><td class="px-6 py-4">${client.technician}</td><td class="px-6 py-4">${client.checkInTime}</td><td class="px-6 py-4 text-center"><button data-id="${client.id}" class="check-out-btn-processing" title="Check Out"><i class="fas fa-check-circle text-lg text-green-500 hover:text-green-700"></i></button></td>`;
        });
    };

    const renderFinishedClients = (clients) => {
        const tbody = document.querySelector('#finished-clients-table tbody');
        if (!tbody) return;
        tbody.innerHTML = clients.length === 0 ? `<tr><td colspan="6" class="py-6 text-center text-gray-400">No finished clients found.</td></tr>` : '';
        clients.forEach((client, index) => {
            const row = tbody.insertRow();
            row.className = 'bg-white border-b';
            row.innerHTML = `<td class="px-6 py-4 text-center font-medium text-gray-900">${index + 1}</td><td class="px-6 py-4">${client.name}</td><td class="px-6 py-4 text-center">${client.people}</td><td class="px-6 py-4">${client.services}</td><td class="px-6 py-4">${client.checkInTime}</td><td class="px-6 py-4 text-center space-x-2"><button data-id="${client.id}" class="view-feedback-btn" title="View Feedback"><i class="fas fa-comment text-lg text-green-500 hover:text-green-700"></i></button><button data-id="${client.id}" class="draft-sms-btn" title="Draft SMS with Gemini"><i class="fas fa-sms text-lg text-purple-500 hover:text-purple-700"></i></button><button data-id="${client.id}" class="delete-btn-finished" title="Delete"><i class="fas fa-trash-alt text-lg text-red-500 hover:text-red-700"></i></button></td>`;
        });
    };

    const renderClientsList = () => {
        if (!allFinishedClients || !allClients) {
            const tbody = document.querySelector('#clients-list-table tbody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-gray-400">Loading client data...</td></tr>`;
            return;
        }
    
        const clientsMap = new Map();
        allFinishedClients.forEach(visit => {
            if (!visit.name) return;
            const clientKey = visit.name.toLowerCase();
            if (!clientsMap.has(clientKey)) {
                clientsMap.set(clientKey, { name: visit.name, phone: visit.phone || '', lastVisit: visit.checkOutTimestamp.toMillis(), techCounts: {}, colorCounts: {} });
            }
            const clientData = clientsMap.get(clientKey);
            if (visit.checkOutTimestamp.toMillis() > clientData.lastVisit) {
                clientData.lastVisit = visit.checkOutTimestamp.toMillis();
                clientData.phone = visit.phone || clientData.phone;
            }
            if (visit.technician) { clientData.techCounts[visit.technician] = (clientData.techCounts[visit.technician] || 0) + 1; }
            if (visit.colorCode) { clientData.colorCounts[visit.colorCode] = (clientData.colorCounts[visit.colorCode] || 0) + 1; }
        });
    
        let processedClients = Array.from(clientsMap.values()).map(client => {
            const findFavorite = (counts) => Object.keys(counts).length > 0 ? Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b) : 'N/A';
            return { ...client, favoriteTech: findFavorite(client.techCounts), favoriteColor: findFavorite(client.colorCounts) };
        });
    
        const clientInfoMap = new Map(allClients.map(c => [c.name.toLowerCase(), { dob: c.dob, id: c.id, phone: c.phone }]));
        let finalClientList = processedClients.map(aggClient => {
            const key = aggClient.name.toLowerCase();
            const masterInfo = clientInfoMap.get(key);
            return { ...aggClient, id: masterInfo ? masterInfo.id : null, dob: masterInfo ? masterInfo.dob : '', phone: masterInfo && masterInfo.phone ? masterInfo.phone : aggClient.phone };
        });
    
        allClients.forEach(masterClient => {
            if (!clientsMap.has(masterClient.name.toLowerCase())) {
                finalClientList.push({ ...masterClient, lastVisit: null, favoriteTech: 'N/A', favoriteColor: 'N/A' });
            }
        });
        
        aggregatedClients = finalClientList;
    
        const searchTerm = document.getElementById('search-clients-list').value.toLowerCase();
        const filteredClients = aggregatedClients.filter(c => c.name.toLowerCase().includes(searchTerm));
    
        const tbody = document.querySelector('#clients-list-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (filteredClients.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-gray-400">No clients found.</td></tr>`;
            return;
        }
    
        filteredClients.forEach(client => {
            const row = tbody.insertRow();
            row.className = 'bg-white border-b';
            row.innerHTML = `<td class="px-6 py-4 font-medium text-gray-900">${client.name}</td><td class="px-6 py-4">${client.phone || 'N/A'}</td><td class="px-6 py-4">${client.lastVisit ? new Date(client.lastVisit).toLocaleDateString() : 'N/A'}</td><td class="px-6 py-4 text-center space-x-2"><button data-id="${client.id}" class="text-indigo-500 hover:text-indigo-700 view-client-profile-btn" title="View Profile"><i class="fas fa-user-circle text-lg"></i></button><button data-id="${client.id}" class="text-blue-500 hover:text-blue-700 edit-client-btn" title="Edit Client"><i class="fas fa-edit text-lg"></i></button><button data-id="${client.id}" class="text-red-500 hover:text-red-700 delete-client-btn" title="Delete Client"><i class="fas fa-trash-alt text-lg"></i></button></td>`;
        });
    };

    const applyEarningFilters = (earnings, techFilter, dateFilter, rangeFilter) => {
        let filtered = earnings;
        if (techFilter !== 'All') { filtered = filtered.filter(e => e.staffName === techFilter); }
        const now = new Date();
        const currentYear = now.getFullYear();
        const lastYear = currentYear - 1;
        let startDate, endDate;
        if (rangeFilter === 'this-year') { startDate = new Date(currentYear, 0, 1); endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999); } 
        else if (rangeFilter === 'last-year') { startDate = new Date(lastYear, 0, 1); endDate = new Date(lastYear, 11, 31, 23, 59, 59, 999); } 
        else if (!isNaN(parseInt(rangeFilter))) { const month = parseInt(rangeFilter, 10); startDate = new Date(currentYear, month, 1); endDate = new Date(currentYear, month + 1, 0, 23, 59, 59, 999); } 
        else if (rangeFilter === 'daily' && dateFilter) { startDate = new Date(dateFilter + 'T00:00:00'); endDate = new Date(dateFilter + 'T23:59:59'); }
        if (startDate && endDate) { filtered = filtered.filter(e => { const earningDate = new Date(e.date.seconds * 1000); return earningDate >= startDate && earningDate <= endDate; }); }
        return filtered;
    };

     const renderStaffEarnings = (earnings) => {
        const tbody = document.querySelector('#staff-earning-table tbody');
        if (!tbody) return;
        tbody.innerHTML = earnings.length === 0 ? `<tr><td colspan="5" class="py-6 text-center text-gray-400">No earnings found.</td></tr>` : '';
        earnings.sort((a, b) => b.date.seconds - a.date.seconds).forEach(earning => {
            const row = tbody.insertRow();
            row.className = 'bg-white border-b';
            row.innerHTML = `<td class="px-6 py-4">${new Date(earning.date.seconds * 1000).toLocaleDateString()}</td><td class="px-6 py-4 font-medium text-gray-900">${earning.staffName}</td><td class="px-6 py-4">$${earning.earning.toFixed(2)}</td><td class="px-6 py-4">$${earning.tip.toFixed(2)}</td><td class="px-6 py-4 text-center space-x-2"><button data-id="${earning.id}" class="edit-earning-btn text-blue-500 hover:text-blue-700" title="Edit Earning"><i class="fas fa-edit text-lg"></i></button><button data-id="${earning.id}" class="delete-earning-btn text-red-500 hover:text-red-700" title="Delete Earning"><i class="fas fa-trash-alt text-lg"></i></button></td>`;
        });
        const totalEarning = earnings.reduce((sum, e) => sum + e.earning, 0);
        const totalTip = earnings.reduce((sum, e) => sum + e.tip, 0);
        document.getElementById('total-earning').textContent = `$${totalEarning.toFixed(2)}`;
        document.getElementById('total-tip').textContent = `$${totalTip.toFixed(2)}`;
        filteredEarningTotalMainSpan.textContent = `Total ($${totalEarning.toFixed(2)})`;
        filteredEarningTotalTipSpan.textContent = `Tip ($${totalTip.toFixed(2)})`;
    };

    const applySalonEarningFilters = (earnings, dateFilter, rangeFilter) => {
        let filtered = [...earnings];
        const now = new Date();
        const currentYear = now.getFullYear();
        const lastYear = currentYear - 1;
        let startDate, endDate;
        if (rangeFilter === 'this-year') { startDate = new Date(currentYear, 0, 1); endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999); } 
        else if (rangeFilter === 'last-year') { startDate = new Date(lastYear, 0, 1); endDate = new Date(lastYear, 11, 31, 23, 59, 59, 999); } 
        else if (!isNaN(parseInt(rangeFilter))) { const month = parseInt(rangeFilter, 10); startDate = new Date(currentYear, month, 1); endDate = new Date(currentYear, month + 1, 0, 23, 59, 59, 999); } 
        else if (rangeFilter === 'daily' && dateFilter) { startDate = new Date(dateFilter + 'T00:00:00'); endDate = new Date(dateFilter + 'T23:59:59'); }
        if (startDate && endDate) { filtered = filtered.filter(e => { const earningDate = new Date(e.date.seconds * 1000); return earningDate >= startDate && earningDate <= endDate; }); }
        return filtered;
    };

    const renderSalonEarnings = (earnings) => {
        const tbody = document.querySelector('#salon-earning-table tbody');
        const tfoot = document.querySelector('#salon-earning-table-foot');
        if (!tbody || !tfoot) return;
        tbody.innerHTML = '';
        const footerIds = ['sell-gc', 'return-gc', 'check', 'no-credit', 'total-credit', 'venmo', 'square', 'total', 'cash'];
        const staffAndTechNames = techniciansAndStaff.map(t => t.name.toLowerCase());
        const allFooterIds = [...staffAndTechNames, ...footerIds];
        if (earnings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${staffAndTechNames.length + 10}" class="py-6 text-center text-gray-400">No salon earnings found.</td></tr>`;
            allFooterIds.forEach(id => { const el = document.getElementById(`total-${id}`); if (el) el.textContent = id === 'no-credit' ? '0' : '$0.00'; });
            staffAndTechNames.forEach(name => {
                const commissionEl = document.getElementById(`commission-${name}`);
                const check70El = document.getElementById(`check70-${name}`);
                const cash30El = document.getElementById(`cash30-${name}`);
                if(commissionEl) commissionEl.textContent = '$0.00'; if(check70El) check70El.textContent = '$0.00'; if(cash30El) cash30El.textContent = '$0.00';
            });
            return;
        }
        let grandTotals = {};
        allFooterIds.forEach(id => grandTotals[id.replace(/-/g, '')] = 0);
        earnings.sort((a, b) => b.date.seconds - a.date.seconds).forEach(earning => {
            const row = tbody.insertRow();
            row.className = 'bg-white border-b';
            let rowHTML = `<td class="px-6 py-4">${new Date(earning.date.seconds * 1000).toLocaleDateString()}</td>`;
            let rowStaffTotal = 0;
            staffAndTechNames.forEach(name => { const techEarning = earning[name] || 0; rowHTML += `<td class="px-6 py-4">$${techEarning.toFixed(2)}</td>`; rowStaffTotal += techEarning; });
            const rowTotal = rowStaffTotal + (earning.sellGiftCard || 0);
            const cash = rowTotal - ((earning.totalCredit || 0) + (earning.check || 0) + (earning.returnGiftCard || 0) + (earning.venmo || 0) + (earning.square || 0));
            rowHTML += `<td class="px-6 py-4">$${(earning.sellGiftCard || 0).toFixed(2)}</td><td class="px-6 py-4">$${(earning.returnGiftCard || 0).toFixed(2)}</td><td class="px-6 py-4">$${(earning.check || 0).toFixed(2)}</td><td class="px-6 py-4">${earning.noOfCredit || 0}</td><td class="px-6 py-4">$${(earning.totalCredit || 0).toFixed(2)}</td><td class="px-6 py-4">$${(earning.venmo || 0).toFixed(2)}</td><td class="px-6 py-4">$${(earning.square || 0).toFixed(2)}</td><td class="px-6 py-4 font-bold">$${rowTotal.toFixed(2)}</td><td class="px-6 py-4 font-bold">$${cash.toFixed(2)}</td><td class="px-6 py-4 text-center space-x-2"><button data-id="${earning.id}" class="edit-salon-earning-btn text-blue-500 hover:text-blue-700" title="Edit Salon Earning"><i class="fas fa-edit text-lg"></i></button><button data-id="${earning.id}" class="delete-salon-earning-btn text-red-500 hover:text-red-700" title="Delete Salon Earning"><i class="fas fa-trash-alt text-lg"></i></button></td>`;
            row.innerHTML = rowHTML;
        });
        earnings.forEach(earning => {
            let rowStaffTotal = 0;
            staffAndTechNames.forEach(name => { const techEarning = earning[name] || 0; grandTotals[name] = (grandTotals[name] || 0) + techEarning; rowStaffTotal += techEarning; });
            const rowTotal = rowStaffTotal + (earning.sellGiftCard || 0);
            const cash = rowTotal - ((earning.totalCredit || 0) + (earning.check || 0) + (earning.returnGiftCard || 0) + (earning.venmo || 0) + (earning.square || 0));
            grandTotals.sellgc += earning.sellGiftCard || 0;
            grandTotals.returngc += earning.returnGiftCard || 0;
            grandTotals.check += earning.check || 0;
            grandTotals.noofcredit += earning.noOfCredit || 0;
            grandTotals.totalcredit += earning.totalCredit || 0;
            grandTotals.venmo += earning.venmo || 0;
            grandTotals.square += earning.square || 0;
            grandTotals.total += rowTotal;
            grandTotals.cash += cash;
        });
        allFooterIds.forEach(id => {
            const el = document.getElementById(`total-${id.replace(/gc/g, '-gc').replace(/of/g, '-of-')}`);
            if (el) { const key = id.replace(/-/g, ''); const value = grandTotals[key] || 0; el.textContent = id === 'noofcredit' ? value : `$${value.toFixed(2)}`; }
        });
        staffAndTechNames.forEach(name => {
            const commission70 = (grandTotals[name] || 0) * 0.70;
            const check70 = commission70 * 0.70;
            const cash30 = commission70 - check70;
            const commissionEl = document.getElementById(`commission-${name}`);
            const check70El = document.getElementById(`check70-${name}`);
            const cash30El = document.getElementById(`cash30-${name}`);
            if(commissionEl) commissionEl.textContent = `$${commission70.toFixed(2)}`;
            if(check70El) check70El.textContent = `$${check70.toFixed(2)}`;
            if(cash30El) cash30El.textContent = `$${cash30.toFixed(2)}`;
        });
    };

    for (let i = 1; i <= 20; i++) peopleCountSelect.appendChild(new Option(i, i));
    for (let i = 1; i <= 20; i++) document.getElementById('appointment-people').appendChild(new Option(i, i));

    const updateSelectionCounts = () => {
        document.querySelectorAll('.category-button').forEach(button => {
            const cat = button.dataset.category;
            const count = hiddenCheckboxContainer.querySelectorAll(`input[data-category="${cat}"]:checked`).length;
            const badge = button.querySelector('.selection-count');
            count > 0 ? (badge.textContent = `${count} selected`, badge.classList.remove('hidden')) : badge.classList.add('hidden');
        });
    };

    const openServiceModal = (category) => {
        modalTitle.textContent = category;
        modalContent.innerHTML = '';
        servicesData[category].forEach(service => {
            const val = `${service.p || ''}${service.name}${service.price ? ' ' + service.price : ''}`;
            const sourceCb = hiddenCheckboxContainer.querySelector(`input[value="${val}"]`);
            const label = document.createElement('label');
            label.className = 'flex items-center p-3 hover:bg-pink-50 cursor-pointer rounded-lg';
            label.innerHTML = `<input type="checkbox" class="form-checkbox modal-checkbox" value="${val}" ${sourceCb && sourceCb.checked ? 'checked' : ''}><span class="ml-3 text-gray-700 flex-grow">${service.name}</span>${service.price ? `<span class="font-semibold">${service.price}</span>` : ''}`;
            modalContent.appendChild(label);
        });
        serviceModal.classList.add('flex'); serviceModal.classList.remove('hidden');
    };

    const closeServiceModal = () => {
        modalContent.querySelectorAll('.modal-checkbox').forEach(modalCb => {
            const sourceCb = hiddenCheckboxContainer.querySelector(`input[value="${modalCb.value}"]`);
            if (sourceCb) sourceCb.checked = modalCb.checked;
        });
        serviceModal.classList.add('hidden'); serviceModal.classList.remove('flex');
        updateSelectionCounts();
    };

    servicesContainer.addEventListener('click', (e) => { const btn = e.target.closest('.category-button'); if (btn) openServiceModal(btn.dataset.category); });
    modalDoneBtn.addEventListener('click', closeServiceModal);
    modalOverlay.addEventListener('click', closeServiceModal);

    checkInForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const services = Array.from(document.querySelectorAll('input[name="service"]:checked')).map(el => el.value);
        if (!document.getElementById('full-name').value || services.length === 0) { return alert('Please enter a name and select at least one service.'); }
        try {
            await addDoc(collection(db, "active_queue"), {
                name: document.getElementById('full-name').value, phone: document.getElementById('phone-number').value || 'N/A', people: document.getElementById('people-count').value,
                bookingType: document.getElementById('booking-type').value, services, checkInTimestamp: serverTimestamp(), status: 'waiting', technician: document.getElementById('checkin-technician-select').value
            });
            checkInForm.reset();
            hiddenCheckboxContainer.querySelectorAll('input').forEach(cb => cb.checked = false);
            updateSelectionCounts();
        } catch (err) { console.error("Error adding document: ", err); alert("Could not add client to the queue."); }
    });

    document.getElementById('queue-content').addEventListener('click', async (e) => {
        const moveBtn = e.target.closest('.move-to-processing-btn');
        const detailBtn = e.target.closest('.detail-btn-active');
        if (moveBtn) { await updateDoc(doc(db, "active_queue", moveBtn.dataset.id), { status: 'processing' }); } 
        else if (detailBtn) { const client = allActiveClients.find(c => c.id === detailBtn.dataset.id); openViewDetailModal(client, `Booking Detail`); }
    });

     document.getElementById('processing-content').addEventListener('click', async (e) => {
        const checkOutBtn = e.target.closest('.check-out-btn-processing');
        if (checkOutBtn) {
            const clientId = checkOutBtn.dataset.id;
            const client = allActiveClients.find(c => c.id === clientId);
            if(client) { document.getElementById('technician-name-select').value = client.technician; }
            document.getElementById('checkout-client-id').value = clientId;
            checkoutModal.classList.remove('hidden'); checkoutModal.classList.add('flex');
        }
    });

    const openViewDetailModal = (client, title = "Client Details") => {
        if (!client) return;
        document.getElementById('view-detail-title').textContent = title;
        const content = document.getElementById('view-detail-content');
        const actions = document.getElementById('view-detail-actions');
        let appointmentDetailsHTML = '<div class="space-y-2"><h4 class="text-lg font-semibold text-gray-800 border-b pb-1">Appointment Details</h4>';
        let appointmentTime = 'N/A';
        if (client.appointmentTimestamp) { appointmentTime = new Date(client.appointmentTimestamp.seconds * 1000).toLocaleString(); } 
        else if (client.checkInTimestamp) { appointmentTime = new Date(client.checkInTimestamp.seconds * 1000).toLocaleString(); }
        appointmentDetailsHTML += `<div><strong class="font-semibold text-gray-700">Date:</strong> ${appointmentTime}</div>`;
        appointmentDetailsHTML += `<div><strong class="font-semibold text-gray-700">Services:</strong> ${Array.isArray(client.services) ? client.services.join(', ') : client.services || 'N/A'}</div>`;
        appointmentDetailsHTML += `<div><strong class="font-semibold text-gray-700">Technician:</strong> ${client.technician || 'N/A'}</div>`;
        appointmentDetailsHTML += `<div><strong class="font-semibold text-gray-700">Booking Type:</strong> ${client.bookingType || 'N/A'}</div>`;
        if (client.colorCode) { appointmentDetailsHTML += `<div><strong class="font-semibold text-gray-700">Color Code:</strong> ${client.colorCode}</div>`; }
        if (client.notes) { appointmentDetailsHTML += `<div><strong class="font-semibold text-gray-700">Notes:</strong> ${client.notes}</div>`; }
        appointmentDetailsHTML += '</div>';
        const lastFinished = allFinishedClients.filter(c => c.name === client.name && c.id !== client.id).sort((a,b) => b.checkOutTimestamp.toMillis() - a.checkOutTimestamp.toMillis())[0];
        let lastVisitHTML = '';
        if (lastFinished) { lastVisitHTML = `<div class="space-y-2"><h4 class="text-lg font-semibold text-gray-800 border-b pb-1">Previous Visit</h4><div><strong class="font-semibold text-gray-700">Date:</strong> ${new Date(lastFinished.checkOutTimestamp.seconds * 1000).toLocaleString()}</div><div><strong class="font-semibold text-gray-700">Services:</strong> ${lastFinished.services || 'N/A'}</div><div><strong class="font-semibold text-gray-700">Color Code:</strong> ${lastFinished.colorCode || 'N/A'}</div><div><strong class="font-semibold text-gray-700">Technician:</strong> ${lastFinished.technician || 'N/A'}</div>${lastFinished.notes ? `<div><strong class="font-semibold text-gray-700">Notes:</strong> ${lastFinished.notes}</div>` : ''}</div>`; }
        const nextAppointment = allAppointments.filter(appt => appt.name === client.name && appt.appointmentTimestamp.toMillis() > Date.now()).sort((a, b) => a.appointmentTimestamp.toMillis() - b.appointmentTimestamp.toMillis())[0];
        let nextAppointmentHTML = `<div class="space-y-2"><h4 class="text-lg font-semibold text-gray-800 border-b pb-1">Next Appointment</h4><div class="font-bold text-pink-600">${nextAppointment ? new Date(nextAppointment.appointmentTimestamp.seconds * 1000).toLocaleString() : 'Not scheduled'}</div></div>`;
        content.innerHTML = `<div class="space-y-2"><h4 class="text-lg font-semibold text-gray-800 border-b pb-1">Client Details</h4><div><strong class="font-semibold text-gray-700">Name:</strong> ${client.name || 'N/A'}</div><div><strong class="font-semibold text-gray-700">Phone:</strong> ${client.phone || 'N/A'}</div><div><strong class="font-semibold text-gray-700">Group Size:</strong> ${client.people || '1'}</div></div>${appointmentDetailsHTML}${lastVisitHTML}${nextAppointmentHTML}`;
        actions.innerHTML = '<button type="button" id="view-detail-close-btn" class="bg-gray-200 text-gray-800 font-semibold py-2 px-6 rounded-lg">Close</button>';
        if(client.appointmentTimestamp && client.status !== 'waiting' && client.status !== 'processing') { actions.insertAdjacentHTML('afterbegin', `<button type="button" data-id="${client.id}" class="bg-blue-500 text-white font-semibold py-2 px-6 rounded-lg booking-action-btn" data-action="checkin">Check In</button><button type="button" data-id="${client.id}" class="bg-red-500 text-white font-semibold py-2 px-6 rounded-lg booking-action-btn" data-action="cancel">Cancel</button>`); }
        document.getElementById('view-detail-close-btn').addEventListener('click', closeViewDetailModal);
        viewDetailModal.classList.remove('hidden'); viewDetailModal.classList.add('flex');
    };

    const closeViewDetailModal = () => { viewDetailModal.classList.add('hidden'); viewDetailModal.classList.remove('flex'); };
    document.getElementById('view-detail-close-btn').addEventListener('click', closeViewDetailModal);
    document.querySelector('.view-detail-modal-overlay').addEventListener('click', closeViewDetailModal);

    document.getElementById('view-detail-actions').addEventListener('click', async (e) => {
         if (e.target.classList.contains('booking-action-btn')) {
            const action = e.target.dataset.action;
            const bookingId = e.target.dataset.id;
            const appointment = allAppointments.find(a => a.id === bookingId);
            if (!appointment) return;
            if (action === 'cancel') { showConfirmModal("Are you sure you want to cancel this booking?", async () => { await deleteDoc(doc(db, "appointments", bookingId)); }); } 
            else if (action === 'checkin') {
                 await addDoc(collection(db, "active_queue"), { name: appointment.name, phone: appointment.phone, people: appointment.people || 1, bookingType: 'Booked - Calendar', services: Array.isArray(appointment.services) ? appointment.services : [appointment.services], technician: appointment.technician, notes: appointment.notes || '', checkInTimestamp: serverTimestamp(), status: 'waiting' });
                await deleteDoc(doc(db, "appointments", bookingId));
            }
            closeViewDetailModal();
        }
    });

     document.getElementById('finished-content').addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-btn-finished');
        const feedbackBtn = e.target.closest('.view-feedback-btn');
        const draftSmsBtn = e.target.closest('.draft-sms-btn');
        if(deleteBtn) { showConfirmModal("Are you sure you want to delete this client record?", async () => { try { await deleteDoc(doc(db, "finished_clients", deleteBtn.dataset.id)); } catch (err) { console.error("Error deleting finished client: ", err); alert("Could not delete finished client."); } }); } 
        else if (feedbackBtn) { const client = allFinishedClients.find(c => c.id === feedbackBtn.dataset.id); if (client) openViewDetailModal(client, `Booking Detail`); } 
        else if (draftSmsBtn) { const client = allFinishedClients.find(c => c.id === draftSmsBtn.dataset.id); if (client) generateSmsMessage(client); }
    });

    const closeCheckoutModal = () => { checkoutForm.reset(); rebookOtherInput.classList.add('hidden'); checkoutModal.classList.add('hidden'); checkoutModal.classList.remove('flex'); };
    rebookSelect.addEventListener('change', (e) => { if(e.target.value === 'other') { rebookOtherInput.classList.remove('hidden'); } else { rebookOtherInput.classList.add('hidden'); } });
    const technicianNameSelect = document.getElementById('technician-name-select');
    const technicianNameOther = document.getElementById('technician-name-other');
    technicianNameSelect.addEventListener('change', (e) => { if (e.target.value === 'other') { technicianNameOther.classList.remove('hidden'); } else { technicianNameOther.classList.add('hidden'); } });

    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const clientId = document.getElementById('checkout-client-id').value;
        const client = allActiveClients.find(c => c.id === clientId);
        if (client) {
             try {
                const clientNameLower = client.name.toLowerCase();
                const existingClient = allClients.find(c => c.name.toLowerCase() === clientNameLower);
                if (!existingClient) {
                    await addDoc(collection(db, "clients"), { name: client.name, phone: client.phone || '', dob: '' });
                }
                const finishedClientData = { ...client };
                delete finishedClientData.id;
                finishedClientData.checkOutTimestamp = serverTimestamp();
                finishedClientData.colorCode = document.getElementById('color-code').value || '';
                let technicianValue = technicianNameSelect.value;
                if(technicianValue === 'other') { technicianValue = technicianNameOther.value; }
                finishedClientData.technician = technicianValue;
                let rebookInfo = rebookSelect.value;
                if (rebookInfo === '2w' || rebookInfo === '3w') {
                    const interval = (rebookInfo === '2w' ? 14 : 21);
                     let nextAppointmentDate = new Date();
                     nextAppointmentDate.setDate(nextAppointmentDate.getDate() + interval);
                     finishedClientData.rebook = nextAppointmentDate.toLocaleString();
                     await addDoc(collection(db, "appointments"), { name: client.name, phone: client.phone, people: client.people, bookingType: client.bookingType, services: client.services, technician: finishedClientData.technician, appointmentTimestamp: Timestamp.fromDate(nextAppointmentDate) });
                } else if (rebookInfo === 'other') {
                   const otherDateValue = document.getElementById('rebook-other-input').value;
                   finishedClientData.rebook = otherDateValue ? new Date(otherDateValue).toLocaleString() : 'Other';
                   if(otherDateValue){ await addDoc(collection(db, "appointments"), { name: client.name, phone: client.phone, people: client.people, bookingType: client.bookingType, services: client.services, technician: finishedClientData.technician, appointmentTimestamp: Timestamp.fromDate(new Date(otherDateValue)) }); }
                } else { finishedClientData.rebook = 'No'; }
                await addDoc(collection(db, "finished_clients"), finishedClientData);
                await deleteDoc(doc(db, "active_queue", clientId));
                closeCheckoutModal();
            } catch(err) { console.error("Error checking out client: ", err); alert("Could not check out client."); }
        }
    });
    document.getElementById('checkout-cancel-btn').addEventListener('click', closeCheckoutModal);
    document.querySelector('.checkout-modal-overlay').addEventListener('click', closeCheckoutModal);

    onSnapshot(query(collection(db, "active_queue"), orderBy("checkInTimestamp", "asc")), (snapshot) => {
         allActiveClients = snapshot.docs.map(doc => ({ id: doc.id, checkInTime: doc.data().checkInTimestamp ? new Date(doc.data().checkInTimestamp.seconds * 1000).toLocaleString() : 'Pending...', services: (doc.data().services || []).join(', '), ...doc.data() }));
        const waitingClients = allActiveClients.filter(c => c.status === 'waiting');
        const processingClients = allActiveClients.filter(c => c.status === 'processing');
        activeCountSpan.textContent = waitingClients.length;
        processingCountSpan.textContent = processingClients.length;
        renderActiveClients(applyClientFilters(waitingClients, document.getElementById('search-active').value.toLowerCase(), currentTechFilterActive, null));
        renderProcessingClients(applyClientFilters(processingClients, document.getElementById('search-processing').value.toLowerCase(), currentTechFilterProcessing, null));
        updateNavCounts();
    });

    onSnapshot(query(collection(db, "finished_clients"), orderBy("checkOutTimestamp", "desc")), (snapshot) => {
        allFinishedClients = snapshot.docs.map(doc => ({ id: doc.id, checkInTime: doc.data().checkInTimestamp ? new Date(doc.data().checkInTimestamp.seconds * 1000).toLocaleString() : 'N/A', checkOutTimestamp: doc.data().checkOutTimestamp, services: (doc.data().services || []).join(', '), ...doc.data() }));
        finishedCountSpan.textContent = allFinishedClients.length;
        renderFinishedClients(applyClientFilters(allFinishedClients, document.getElementById('search-finished').value.toLowerCase(), currentTechFilterFinished, currentFinishedDateFilter));
        renderClientsList();
        const clientList = document.getElementById('client-names-list'), checkinClientList = document.getElementById('checkin-client-names');
        const appointmentPhoneList = document.getElementById('appointment-client-phones'), checkinPhoneList = document.getElementById('checkin-client-phones');
        const uniqueNames = [...new Set(allFinishedClients.map(c => c.name))];
        const uniquePhones = [...new Set(allFinishedClients.filter(c => c.phone && c.phone !== 'N/A').map(c => c.phone))];
        const nameOptionsHtml = uniqueNames.map(name => `<option value="${name}"></option>`).join('');
        const phoneOptionsHtml = uniquePhones.map(phone => `<option value="${phone}"></option>`).join('');
        if(clientList) clientList.innerHTML = nameOptionsHtml;
        if(checkinClientList) checkinClientList.innerHTML = nameOptionsHtml;
        if(appointmentPhoneList) appointmentPhoneList.innerHTML = phoneOptionsHtml;
        if(checkinPhoneList) checkinPhoneList.innerHTML = phoneOptionsHtml;
        updateDashboard();
    });

     onSnapshot(query(collection(db, "appointments"), orderBy("appointmentTimestamp", "asc")), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" && initialAppointmentsLoaded) {
                 const data = change.doc.data();
                 if (data.appointmentTimestamp.seconds > appLoadTimestamp.seconds) {
                    const apptTime = new Date(data.appointmentTimestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    addNotification('booking', `New booking for ${data.name} at ${apptTime}`);
                 }
            }
        });
        
        allAppointments = snapshot.docs.map(doc => ({ id: doc.id, appointmentTime: doc.data().appointmentTimestamp ? new Date(doc.data().appointmentTimestamp.seconds * 1000).toLocaleString() : 'N/A', ...doc.data() }));
        renderCalendar(currentYear, currentMonth, currentTechFilterCalendar);
        renderAllBookingsList();
        updateDashboard();
        updateNavCounts();

        if (!initialAppointmentsLoaded) {
            initialAppointmentsLoaded = true;
        }
    });

    onSnapshot(query(collection(db, "earnings"), orderBy("date", "desc")), (snapshot) => {
        allEarnings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderStaffEarnings(applyEarningFilters(allEarnings, currentEarningTechFilter, currentEarningDateFilter, currentEarningRangeFilter));
        updateDashboard();
    });

    onSnapshot(query(collection(db, "salon_earnings"), orderBy("date", "desc")), (snapshot) => {
        allSalonEarnings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderSalonEarnings(applySalonEarningFilters(allSalonEarnings, currentSalonEarningDateFilter, currentSalonEarningRangeFilter));
    });

    onSnapshot(query(collection(db, "expenses"), orderBy("date", "desc")), (snapshot) => {
        allExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateExpenseMonthFilter();
        renderExpenses();
    });

    onSnapshot(query(collection(db, "clients"), orderBy("name")), (snapshot) => {
        allClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderClientsList();
    });

    document.getElementById('search-active').addEventListener('input', (e) => { renderActiveClients(applyClientFilters(allActiveClients.filter(c => c.status === 'waiting'), e.target.value.toLowerCase(), currentTechFilterActive, null)); });
    document.getElementById('search-processing').addEventListener('input', (e) => { renderProcessingClients(applyClientFilters(allActiveClients.filter(c => c.status === 'processing'), e.target.value.toLowerCase(), currentTechFilterProcessing, null)); });
    document.getElementById('search-finished').addEventListener('input', (e) => { renderFinishedClients(applyClientFilters(allFinishedClients, e.target.value.toLowerCase(), currentTechFilterFinished, currentFinishedDateFilter)); });
    document.getElementById('finished-date-filter').addEventListener('input', (e) => { currentFinishedDateFilter = e.target.value; renderFinishedClients(applyClientFilters(allFinishedClients, document.getElementById('search-finished').value.toLowerCase(), currentTechFilterFinished, currentFinishedDateFilter)); });
    document.getElementById('search-clients-list').addEventListener('input', () => renderClientsList());
    
    document.getElementById('export-clients-btn').addEventListener('click', () => {
        const dataToExport = aggregatedClients.map(c => ({ Name: c.name, Phone: c.phone || '', DOB: c.dob || '', 'Favorite Tech': c.favoriteTech || '', 'Favorite Color': c.favoriteColor || '', 'Last Visit': c.lastVisit ? new Date(c.lastVisit).toLocaleDateString() : '' }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Clients");
        XLSX.writeFile(workbook, "clients_list.xlsx");
    });

    document.getElementById('full-name').addEventListener('input', (e) => { const client = allFinishedClients.find(c => c.name === e.target.value); if (client) { document.getElementById('phone-number').value = client.phone; } });
    document.getElementById('phone-number').addEventListener('input', (e) => { const client = allFinishedClients.find(c => c.phone === e.target.value); if (client) { document.getElementById('full-name').value = client.name; } });

    document.getElementById('main-tabs').addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        document.querySelectorAll('#main-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
        document.getElementById(button.id.replace('-tab', '-content')).classList.remove('hidden');
    });

    const setupSubTabs = (tabsId, contentClass) => {
        document.getElementById(tabsId).addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            document.querySelectorAll(`#${tabsId} .sub-tab-btn`).forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            document.querySelectorAll(`.${contentClass}`).forEach(content => content.classList.add('hidden'));
            const targetContent = document.getElementById(button.id.replace('-tab', '-content'));
            if (targetContent) {
                targetContent.classList.remove('hidden');
            }
        });
    };
    setupSubTabs('reports-sub-tabs', 'sub-tab-content');
    setupSubTabs('admin-sub-tabs', 'sub-tab-content');


    function renderCalendar(year, month, technicianFilter = 'All') {
        monthYearDisplay.textContent = `${new Date(year, month).toLocaleString('default', { month: 'long' })} ${year}`;
        calendarGrid.innerHTML = '';
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 0; i < firstDay; i++) { calendarGrid.insertAdjacentHTML('beforeend', '<div></div>'); }
        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'calendar-day border p-2';
            dayCell.dataset.date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            dayCell.innerHTML = `<div class="font-bold">${day}</div><div id="day-${day}" class="appointments"></div>`;
            calendarGrid.appendChild(dayCell);
        }
        let filteredAppointments = allAppointments;
        if (technicianFilter !== 'All' && technicianFilter !== 'Any Technician') { filteredAppointments = allAppointments.filter(appt => appt.technician === technicianFilter); } 
        else if (technicianFilter === 'Any Technician') { filteredAppointments = allAppointments.filter(appt => appt.technician === 'Any Technician'); }
        filteredAppointments.forEach(appt => {
            const apptDate = new Date(appt.appointmentTimestamp.seconds * 1000);
             if (apptDate.getFullYear() === year && apptDate.getMonth() === month) {
                const dayCell = document.getElementById(`day-${apptDate.getDate()}`);
                if (dayCell) { dayCell.insertAdjacentHTML('beforeend', `<div class="appointment-entry bg-blue-100 text-blue-700" data-id="${appt.id}" data-type="appointment">${appt.name}</div>`); }
            }
        });
        calendarCountSpan.textContent = calendarGrid.querySelectorAll('.appointment-entry').length;
    }
    document.getElementById('prev-month-btn').addEventListener('click', () => { currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; } renderCalendar(currentYear, currentMonth, currentTechFilterCalendar); });
    document.getElementById('next-month-btn').addEventListener('click', () => { currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; } renderCalendar(currentYear, currentMonth, currentTechFilterCalendar); });
    calendarGrid.addEventListener('click', (e) => {
        const dayCell = e.target.closest('.calendar-day');
        if (!dayCell) return;
        if (e.target.classList.contains('appointment-entry')) { const client = allAppointments.find(a => a.id === e.target.dataset.id); openViewDetailModal(client, "Booking Detail"); } 
        else { openAddAppointmentModal(dayCell.dataset.date); }
    });

    const setupTechFilter = (containerId, callback) => {
         document.getElementById(containerId).addEventListener('click', (e) => {
            if (e.target.classList.contains('tech-filter-btn')) {
                document.querySelectorAll(`#${containerId} .tech-filter-btn`).forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                callback(e.target.dataset.tech);
            }
        });
    };

    setupTechFilter('tech-filter-container-active', (tech) => { currentTechFilterActive = tech; renderActiveClients(applyClientFilters(allActiveClients.filter(c => c.status === 'waiting'), document.getElementById('search-active').value.toLowerCase(), currentTechFilterActive, null)); });
    setupTechFilter('tech-filter-container-processing', (tech) => { currentTechFilterProcessing = tech; renderProcessingClients(applyClientFilters(allActiveClients.filter(c => c.status === 'processing'), document.getElementById('search-processing').value.toLowerCase(), currentTechFilterProcessing, null)); });
    setupTechFilter('tech-filter-container-finished', (tech) => { currentTechFilterFinished = tech; renderFinishedClients(applyClientFilters(allFinishedClients, document.getElementById('search-finished').value.toLowerCase(), currentTechFilterFinished, currentFinishedDateFilter)); });
    setupTechFilter('tech-filter-container-calendar', (tech) => { currentTechFilterCalendar = tech; if (!document.getElementById('list-view').classList.contains('hidden')) { renderAllBookingsList(); } else { renderCalendar(currentYear, currentMonth, currentTechFilterCalendar); } });
    setupTechFilter('tech-filter-container-earning', (tech) => { currentEarningTechFilter = tech; renderStaffEarnings(applyEarningFilters(allEarnings, currentEarningTechFilter, currentEarningDateFilter, currentEarningRangeFilter)); });
    
    const setupReportDateFilters = (selectId, dateInputId, callback) => {
        const select = document.getElementById(selectId);
        const dateInput = document.getElementById(dateInputId);
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        select.innerHTML = `<option value="daily">Daily</option>`;
        months.forEach((month, index) => { select.innerHTML += `<option value="${index}">${month}</option>`; });
        select.innerHTML += `<option value="this-year">This Year</option><option value="last-year">Last Year</option>`;
        select.addEventListener('change', (e) => { const range = e.target.value; dateInput.style.display = range === 'daily' ? 'block' : 'none'; callback(dateInput.value, range); });
        dateInput.addEventListener('input', (e) => { callback(e.target.value, select.value); });
    };

    setupReportDateFilters('earning-range-filter', 'earning-date-filter', (date, range) => { currentEarningDateFilter = date; currentEarningRangeFilter = range; renderStaffEarnings(applyEarningFilters(allEarnings, currentEarningTechFilter, date, range)); });
    setupReportDateFilters('salon-earning-range-filter', 'salon-earning-date-filter', (date, range) => { currentSalonEarningDateFilter = date; currentSalonEarningRangeFilter = range; renderSalonEarnings(applySalonEarningFilters(allSalonEarnings, date, range)); });

    
    document.getElementById('staff-earning-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const staffName = document.getElementById('staff-name').value;
        const earning = parseFloat(document.getElementById('staff-earning').value);
        const tip = parseFloat(document.getElementById('staff-tip').value);
        const date = document.getElementById('staff-earning-date').value;
        if (isNaN(earning) || isNaN(tip) || !date) { return alert('Please fill out all fields correctly.'); }
        try {
            await addDoc(collection(db, "earnings"), { staffName, earning, tip, date: Timestamp.fromDate(new Date(date + 'T12:00:00')) });
            e.target.reset();
            document.getElementById('staff-earning-date').value = getLocalDateString();
        } catch (err) { console.error("Error adding earning: ", err); alert("Could not add earning."); }
    });

    document.getElementById('staff-earning-table').addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-earning-btn');
        const editBtn = e.target.closest('.edit-earning-btn');
        if(deleteBtn) { showConfirmModal("Delete this earning entry?", async () => { await deleteDoc(doc(db, "earnings", deleteBtn.dataset.id)); }); } 
        else if (editBtn) { const earning = allEarnings.find(e => e.id === editBtn.dataset.id); if (earning) { openEditEarningModal(earning); } }
    });

    document.getElementById('salon-earning-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = document.getElementById('salon-earning-date').value;
        if (!date) { return alert('Please select a date.'); }
        const salonEarningData = { date: Timestamp.fromDate(new Date(date + 'T12:00:00')), sellGiftCard: parseFloat(document.getElementById('sell-gift-card').value) || 0, returnGiftCard: parseFloat(document.getElementById('return-gift-card').value) || 0, check: parseFloat(document.getElementById('check-payment').value) || 0, noOfCredit: parseInt(document.getElementById('no-of-credit').value) || 0, totalCredit: parseFloat(document.getElementById('total-credit').value) || 0, venmo: parseFloat(document.getElementById('venmo-payment').value) || 0, square: parseFloat(document.getElementById('square-payment').value) || 0 };
        techniciansAndStaff.forEach(tech => { const input = document.getElementById(`salon-earning-${tech.name.toLowerCase()}`); if(input) { salonEarningData[tech.name.toLowerCase()] = parseFloat(input.value) || 0; } });
        try {
            await addDoc(collection(db, "salon_earnings"), salonEarningData);
            e.target.reset();
            document.getElementById('salon-earning-date').value = getLocalDateString();
        } catch (err) { console.error("Error adding salon earning: ", err); alert("Could not add salon earning."); }
    });

    document.getElementById('salon-earning-table').addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-salon-earning-btn');
        const editBtn = e.target.closest('.edit-salon-earning-btn');
        if(deleteBtn) { showConfirmModal("Delete this salon earning entry?", async () => { await deleteDoc(doc(db, "salon_earnings", deleteBtn.dataset.id)); }); } 
        else if (editBtn) { const earning = allSalonEarnings.find(e => e.id === editBtn.dataset.id); if (earning) { openEditSalonEarningModal(earning); } }
    });
    
    document.getElementById('export-salon-earnings-btn').addEventListener('click', () => {
        const filteredData = applySalonEarningFilters(allSalonEarnings, currentSalonEarningDateFilter, currentSalonEarningRangeFilter);
        const dataForExport = filteredData.map(earning => {
            let rowData = { Date: new Date(earning.date.seconds * 1000).toLocaleDateString() };
            let total = 0;
            techniciansAndStaff.forEach(tech => { const techEarning = earning[tech.name.toLowerCase()] || 0; rowData[tech.name] = techEarning; total += techEarning; });
            total += (earning.sellGiftCard || 0);
            const cash = total - ((earning.totalCredit || 0) + (earning.check || 0) + (earning.returnGiftCard || 0) + (earning.venmo || 0) + (earning.square || 0));
            rowData["Sell GC"] = earning.sellGiftCard || 0; rowData["Return GC"] = earning.returnGiftCard || 0; rowData["Check"] = earning.check || 0; rowData["# Credit"] = earning.noOfCredit || 0;
            rowData["Total Credit"] = earning.totalCredit || 0; rowData["Venmo"] = earning.venmo || 0; rowData["Square"] = earning.square || 0; rowData["Total"] = total; rowData["Cash"] = cash;
            return rowData;
        });
        if (filteredData.length > 0) {
            let totals = { Date: "Total:" };
            let grandTotal = 0;
            techniciansAndStaff.forEach(tech => { const techTotal = filteredData.reduce((sum, e) => sum + (e[tech.name.toLowerCase()] || 0), 0); totals[tech.name] = techTotal; grandTotal += techTotal; });
            const otherFields = ["sellGiftCard", "returnGiftCard", "check", "noOfCredit", "totalCredit", "venmo", "square"];
            otherFields.forEach(field => { totals[field] = filteredData.reduce((sum, e) => sum + (e[field] || 0), 0); });
            grandTotal += totals.sellGiftCard;
            totals.total = grandTotal;
            totals.cash = grandTotal - (totals.totalCredit + totals.check + totals.returnGiftCard + totals.venmo + totals.square);
            dataForExport.push({}, totals);
            const commissionRow = { Date: "Commission 70%:" }, check70Row = { Date: "70% of Check:" }, cash30Row = { Date: "30% of Cash:" };
            techniciansAndStaff.forEach(tech => {
                const techTotal = totals[tech.name] || 0;
                const commission70 = techTotal * 0.70, check70 = commission70 * 0.70, cash30 = commission70 - check70;
                commissionRow[tech.name] = commission70; check70Row[tech.name] = check70; cash30Row[tech.name] = cash30;
            });
            dataForExport.push(commissionRow, check70Row, cash30Row);
        }
        const worksheet = XLSX.utils.json_to_sheet(dataForExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Salon Earnings");
        XLSX.writeFile(workbook, "Salon_Earning_Report.xlsx");
    });
    
    document.getElementById('print-salon-earnings-btn').addEventListener('click', () => {
        const printWindow = window.open('', '_blank', 'height=600,width=800');
        printWindow.document.write('<html><head><title>Salon Earning Report</title><script src="https://cdn.tailwindcss.com"><\/script><style>body{padding:20px;font-family:"Poppins",sans-serif}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#f2f2f2}</style></head><body><h1>Salon Earning Report</h1>');
        printWindow.document.write(document.getElementById('salon-earning-table').outerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus(); 
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
    });

    const openEditEarningModal = (earning) => {
        editEarningForm.reset();
        document.getElementById('edit-earning-id').value = earning.id;
        document.getElementById('edit-staff-earning-date').value = new Date(earning.date.seconds * 1000).toISOString().split('T')[0];
        document.getElementById('edit-staff-name').value = earning.staffName;
        document.getElementById('edit-staff-earning').value = earning.earning;
        document.getElementById('edit-staff-tip').value = earning.tip;
        editEarningModal.classList.remove('hidden'); editEarningModal.classList.add('flex');
    };
    const closeEditEarningModal = () => { editEarningModal.classList.add('hidden'); editEarningModal.classList.remove('flex'); };
    document.getElementById('edit-earning-cancel-btn').addEventListener('click', closeEditEarningModal);
    document.querySelector('.edit-earning-modal-overlay').addEventListener('click', closeEditEarningModal);

    editEarningForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const earningId = document.getElementById('edit-earning-id').value;
        if (!earningId) return;
        try {
            await updateDoc(doc(db, "earnings", earningId), {
                staffName: document.getElementById('edit-staff-name').value, earning: parseFloat(document.getElementById('edit-staff-earning').value),
                tip: parseFloat(document.getElementById('edit-staff-tip').value), date: Timestamp.fromDate(new Date(document.getElementById('edit-staff-earning-date').value + 'T12:00:00'))
            });
            closeEditEarningModal();
        } catch(err) { console.error("Error updating earning:", err); alert("Could not update earning."); }
    });

    const openEditSalonEarningModal = (earning) => {
        editSalonEarningForm.reset();
        document.getElementById('edit-salon-earning-id').value = earning.id;
        document.getElementById('edit-salon-earning-date').value = new Date(earning.date.seconds * 1000).toISOString().split('T')[0];
        const inputsContainer = document.getElementById('edit-salon-earning-inputs');
        inputsContainer.innerHTML = '';
        techniciansAndStaff.forEach(tech => {
            const techNameLower = tech.name.toLowerCase();
            inputsContainer.innerHTML += `<div><label for="edit-${techNameLower}-earning" class="block text-sm font-medium text-gray-600">${tech.name}</label><input type="number" step="0.01" id="edit-${techNameLower}-earning" value="${earning[techNameLower] || 0}" class="form-input mt-1 w-full p-2 border border-gray-300 rounded-lg" placeholder="Amount"></div>`;
        });
        document.getElementById('edit-sell-gift-card').value = earning.sellGiftCard || 0;
        document.getElementById('edit-return-gift-card').value = earning.returnGiftCard || 0;
        document.getElementById('edit-check-payment').value = earning.check || 0;
        document.getElementById('edit-no-of-credit').value = earning.noOfCredit || 0;
        document.getElementById('edit-total-credit').value = earning.totalCredit || 0;
        document.getElementById('edit-venmo-payment').value = earning.venmo || 0;
        document.getElementById('edit-square-payment').value = earning.square || 0;
        editSalonEarningModal.classList.remove('hidden'); editSalonEarningModal.classList.add('flex');
    };
    const closeEditSalonEarningModal = () => { editSalonEarningModal.classList.add('hidden'); editSalonEarningModal.classList.remove('flex'); };
    document.getElementById('edit-salon-earning-cancel-btn').addEventListener('click', closeEditSalonEarningModal);
    document.querySelector('.edit-salon-earning-modal-overlay').addEventListener('click', closeEditSalonEarningModal);

    editSalonEarningForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const earningId = document.getElementById('edit-salon-earning-id').value;
        if (!earningId) return;
        const updatedData = { date: Timestamp.fromDate(new Date(document.getElementById('edit-salon-earning-date').value + 'T12:00:00')), sellGiftCard: parseFloat(document.getElementById('edit-sell-gift-card').value) || 0, returnGiftCard: parseFloat(document.getElementById('edit-return-gift-card').value) || 0, check: parseFloat(document.getElementById('check-payment').value) || 0, noOfCredit: parseInt(document.getElementById('edit-no-of-credit').value) || 0, totalCredit: parseFloat(document.getElementById('edit-total-credit').value) || 0, venmo: parseFloat(document.getElementById('edit-venmo-payment').value) || 0, square: parseFloat(document.getElementById('edit-square-payment').value) || 0 };
        techniciansAndStaff.forEach(tech => { const input = document.getElementById(`edit-${tech.name.toLowerCase()}-earning`); if(input) { updatedData[tech.name.toLowerCase()] = parseFloat(input.value) || 0; } });
        try {
            await updateDoc(doc(db, "salon_earnings", earningId), updatedData);
            closeEditSalonEarningModal();
        } catch(err) { console.error("Error updating salon earning:", err); alert("Could not update salon earning."); }
    });

    const renderAllBookingsList = () => {
        let filteredAppointments = [...allAppointments];
        if (currentTechFilterCalendar !== 'All' && currentTechFilterCalendar !== 'Any Technician') { filteredAppointments = filteredAppointments.filter(appt => appt.technician === currentTechFilterCalendar); } 
        else if (currentTechFilterCalendar === 'Any Technician') { filteredAppointments = allAppointments.filter(appt => appt.technician === 'Any Technician'); }
        filteredAppointments.sort((a, b) => b.appointmentTimestamp.seconds - a.appointmentTimestamp.seconds);
        todayCountSpan.textContent = filteredAppointments.length;
        const tbody = document.querySelector('#today-bookings-table tbody');
        tbody.innerHTML = filteredAppointments.length === 0 ? `<tr><td colspan="6" class="py-6 text-center text-gray-400">No bookings found.</td></tr>` : '';
        filteredAppointments.forEach(appt => {
            const row = tbody.insertRow();
            row.className = 'bg-white border-b';
            row.innerHTML = `<td class="px-6 py-3">${appt.name}</td><td class="px-6 py-3">${Array.isArray(appt.services) ? appt.services.join(', ') : appt.services}</td><td class="px-6 py-3">${appt.technician}</td><td class="px-6 py-3 text-center">${appt.people || 1}</td><td class="px-6 py-3">${new Date(appt.appointmentTimestamp.seconds * 1000).toLocaleString([], {dateStyle: 'short', timeStyle: 'short'})}</td><td class="px-6 py-3 text-center"><button data-id="${appt.id}" class="checkin-today-btn text-blue-500 hover:underline">Check In</button></td>`;
        });
    };

    document.getElementById('today-btn').addEventListener('click', () => { document.getElementById('month-view').classList.add('hidden'); document.getElementById('month-nav').classList.add('hidden'); document.getElementById('list-view').classList.remove('hidden'); document.getElementById('today-btn').classList.add('hidden'); document.getElementById('month-view-btn').classList.remove('hidden'); renderAllBookingsList(); });
    document.getElementById('month-view-btn').addEventListener('click', () => { document.getElementById('list-view').classList.add('hidden'); document.getElementById('month-view-btn').classList.add('hidden'); document.getElementById('month-view').classList.remove('hidden'); document.getElementById('month-nav').classList.remove('hidden'); document.getElementById('today-btn').classList.remove('hidden'); });

    document.getElementById('today-bookings-table').addEventListener('click', async (e) => {
        if (e.target.classList.contains('checkin-today-btn')) {
            const appointment = allAppointments.find(a => a.id === e.target.dataset.id);
            if (!appointment) return;
            try {
                await addDoc(collection(db, "active_queue"), { name: appointment.name, phone: appointment.phone, people: appointment.people || 1, bookingType: 'Booked - Calendar', services: Array.isArray(appointment.services) ? appointment.services : [appointment.services], technician: appointment.technician, notes: appointment.notes || '', checkInTimestamp: serverTimestamp(), status: 'waiting' });
                await deleteDoc(doc(db, "appointments", e.target.dataset.id));
            } catch (err) { console.error("Error checking in from today's view:", err); alert("Could not check in this client."); }
        }
    });

    const clockEl = document.getElementById('live-clock'), dateEl = document.getElementById('live-date'), copyrightYear = document.getElementById('copyright-year');
    const updateTime = () => { const now = new Date(); clockEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }); dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); copyrightYear.textContent = now.getFullYear(); };
    updateTime(); setInterval(updateTime, 60000);

    async function generateSmsMessage(client) {
        const smsTextarea = document.getElementById('gemini-sms-textarea');
        const sendLink = document.getElementById('gemini-sms-send-link');
        smsTextarea.value = ''; smsTextarea.placeholder = 'Generating message...';
        sendLink.classList.add('pointer-events-none', 'opacity-50');
        geminiSmsModal.classList.remove('hidden'); geminiSmsModal.classList.add('flex');
        const prompt = `Write a single, friendly, and short SMS message to a nail salon client named ${client.name}. Thank them for their recent visit where they received the following services: ${client.services}. Mention that their technician was ${client.technician}. Ask them to come back soon. Keep it concise and professional.`;
        try {
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            let text = "Sorry, could not generate a message.";
            if (result.candidates?.[0]?.content?.parts?.[0]) { text = result.candidates[0].content.parts[0].text; }
            smsTextarea.value = text;
            if (client.phone && client.phone !== 'N/A') { sendLink.href = `sms:${client.phone}?body=${encodeURIComponent(text)}`; sendLink.classList.remove('pointer-events-none', 'opacity-50'); } 
            else { sendLink.href = '#'; sendLink.onclick = () => alert('Client phone number is not available.'); sendLink.classList.remove('pointer-events-none', 'opacity-50'); }
        } catch (error) { console.error("Error generating SMS:", error); smsTextarea.value = "Error connecting to the AI service."; sendLink.classList.remove('pointer-events-none', 'opacity-50'); }
    }

    document.getElementById('clients-list-report-content').addEventListener('click', (e) => {
        const viewProfileBtn = e.target.closest('.view-client-profile-btn');
        const editBtn = e.target.closest('.edit-client-btn');
        const deleteBtn = e.target.closest('.delete-client-btn');
        if (viewProfileBtn) { const client = aggregatedClients.find(c => c.id === viewProfileBtn.dataset.id); if(client) { alert(`Viewing profile for ${client.name}. (Admin view to be implemented)`); } } 
        else if (editBtn) { const client = aggregatedClients.find(c => c.id === editBtn.dataset.id); if(client) { openClientModal(client); } } 
        else if (deleteBtn) { const clientId = deleteBtn.dataset.id; const client = aggregatedClients.find(c => c.id === clientId); if (client) { showConfirmModal(`Delete all records for ${client.name}? This cannot be undone.`, async () => { await deleteDoc(doc(db, "clients", clientId)); }); } }
    });

    document.getElementById('gemini-sms-close-btn').addEventListener('click', () => { geminiSmsModal.classList.add('hidden'); geminiSmsModal.classList.remove('flex'); });
    document.querySelector('.gemini-sms-modal-overlay').addEventListener('click', () => { geminiSmsModal.classList.add('hidden'); geminiSmsModal.classList.remove('flex'); });
    
    document.getElementById('floating-booking-btn').addEventListener('click', () => { openAddAppointmentModal(getLocalDateString()); });

    const addUserForm = document.getElementById('add-user-form');
    const usersTableBody = document.querySelector('#users-table tbody');
    const renderUsers = (users) => {
        usersTableBody.innerHTML = '';
        users.forEach(user => {
            const row = usersTableBody.insertRow();
            row.innerHTML = `<td class="px-6 py-4">${user.name}</td><td class="px-6 py-4">${user.email}</td><td class="px-6 py-4">${user.phone}</td><td class="px-6 py-4">${user.role}</td><td class="px-6 py-4 text-center space-x-2"><button data-id="${user.id}" class="edit-user-btn text-blue-500"><i class="fas fa-edit"></i></button><button data-id="${user.id}" class="delete-user-btn text-red-500"><i class="fas fa-trash"></i></button></td>`;
        });
    };
    
    const populateTechnicianFilters = () => {
        const techContainers = document.querySelectorAll('.tech-filter-container');
        const techSelects = document.querySelectorAll('#appointment-technician-select, #technician-name-select, #staff-name, #edit-staff-name, #checkin-technician-select');
        techContainers.forEach(container => {
            const userList = container.id.includes('earning') ? techniciansAndStaff : technicians;
            container.querySelectorAll('.dynamic-tech-btn').forEach(btn => btn.remove());
            userList.forEach(tech => { const btn = document.createElement('button'); btn.className = 'tech-filter-btn dynamic-tech-btn px-3 py-1 rounded-full text-sm'; btn.dataset.tech = tech.name; btn.textContent = tech.name; container.appendChild(btn); });
        });
        techSelects.forEach(select => {
            const userList = (select.id === 'staff-name' || select.id === 'edit-staff-name') ? techniciansAndStaff : technicians;
            const firstOption = select.options[0];
            select.innerHTML = '';
            if(firstOption && (firstOption.value === 'Any Technician' || firstOption.value === '')) { select.appendChild(firstOption); }
            userList.forEach(tech => { select.appendChild(new Option(tech.name, tech.name)); });
             if(select.id === 'technician-name-select') { select.appendChild(new Option("Other", "other")); }
        });
        const salonEarningInputs = document.getElementById('salon-earning-inputs');
        const salonEarningTableHead = document.getElementById('salon-earning-table-head');
        const salonEarningTableFoot = document.getElementById('salon-earning-table-foot');
        salonEarningInputs.innerHTML = '';
        let headHTML = '<tr><th scope="col" class="px-6 py-3">Date</th>';
        let footHTML = `<tr><td class="px-6 py-3 text-right font-bold">Total:</td>`;
        techniciansAndStaff.forEach(tech => {
            const techNameLower = tech.name.toLowerCase();
            salonEarningInputs.innerHTML += `<div><label for="salon-earning-${techNameLower}" class="block text-sm font-medium text-gray-600">${tech.name}</label><input type="number" step="0.01" id="salon-earning-${techNameLower}" class="form-input mt-1 w-full p-2 border border-gray-300 rounded-lg" placeholder="Amount"></div>`;
            headHTML += `<th scope="col" class="px-6 py-3">${tech.name}</th>`;
            footHTML += `<td id="total-${techNameLower}" class="px-6 py-3"></td>`;
        });
        headHTML += `<th scope="col" class="px-6 py-3">Sell GC</th><th scope="col" class="px-6 py-3">Return GC</th><th scope="col" class="px-6 py-3">Check</th><th scope="col" class="px-6 py-3">No of Credit</th><th scope="col" class="px-6 py-3">Total Credit</th><th scope="col" class="px-6 py-3">Venmo</th><th scope="col" class="px-6 py-3">Square</th><th scope="col" class="px-6 py-3 font-bold">Total</th><th scope="col" class="px-6 py-3 font-bold">Cash</th><th scope="col" class="px-6 py-3 text-center">Action</th></tr>`;
        footHTML += `<td id="total-sell-gc" class="px-6 py-3"></td><td id="total-return-gc" class="px-6 py-3"></td><td id="total-check" class="px-6 py-3"></td><td id="total-no-credit" class="px-6 py-3"></td><td id="total-total-credit" class="px-6 py-3"></td><td id="total-venmo" class="px-6 py-3"></td><td id="total-square" class="px-6 py-3"></td><td id="total-total" class="px-6 py-3 font-bold"></td><td id="total-cash" class="px-6 py-3 font-bold"></td><td class="px-6 py-3"></td></tr>`;
        let commissionHTML = `<tr class="text-center"><td class="px-6 py-3 text-right font-bold border-t-2 border-gray-300">Commission 70%:</td>`, check70HTML = `<tr class="text-center"><td class="px-6 py-3 text-right font-bold">70% of Check:</td>`, cash30HTML = `<tr class="text-center"><td class="px-6 py-3 text-right font-bold">30% of Cash:</td>`;
        techniciansAndStaff.forEach(tech => {
            const techNameLower = tech.name.toLowerCase();
            commissionHTML += `<td id="commission-${techNameLower}" class="px-6 py-3 border-t-2 border-gray-300"></td>`;
            check70HTML += `<td id="check70-${techNameLower}" class="px-6 py-3"></td>`;
            cash30HTML += `<td id="cash30-${techNameLower}" class="px-6 py-3"></td>`;
        });
        commissionHTML += `<td class="border-t-2 border-gray-300" colspan="10"></td></tr>`;
        check70HTML += `<td colspan="10"></td></tr>`;
        cash30HTML += `<td colspan="10"></td></tr>`;
        salonEarningTableHead.innerHTML = headHTML;
        salonEarningTableFoot.innerHTML = footHTML + commissionHTML + check70HTML + cash30HTML;
    };

    onSnapshot(collection(db, "users"), (snapshot) => {
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        techniciansAndStaff = users.filter(user => user.role === 'technician' || user.role === 'staff');
        technicians = users.filter(user => user.role === 'technician');
        renderUsers(users);
        populateTechnicianFilters();
    });

    addUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('edit-user-id').value;
        const name = document.getElementById('new-user-name').value, phone = document.getElementById('new-user-phone').value, email = document.getElementById('new-user-email').value, password = document.getElementById('new-user-password').value, role = document.getElementById('user-role').value;
        if (userId) { await setDoc(doc(db, "users", userId), { name, phone, email, role }); alert("User updated."); } 
        else {
            if (!password || password.length < 6) { return alert("Password must be at least 6 characters."); }
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, "users", userCredential.user.uid), { name, phone, email, role });
                alert("User created!");
            } catch (error) { console.error("Error creating user:", error); alert("Error creating user: " + error.message); }
        }
        addUserForm.reset();
        document.getElementById('edit-user-id').value = '';
        document.getElementById('new-user-email').disabled = false;
        document.getElementById('new-user-password').required = true;
    });

    usersTableBody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-user-btn');
        const deleteBtn = e.target.closest('.delete-user-btn');
        if (editBtn) {
            const userDoc = await getDoc(doc(db, "users", editBtn.dataset.id));
            if (userDoc.exists()) {
                const user = userDoc.data();
                document.getElementById('edit-user-id').value = editBtn.dataset.id;
                document.getElementById('new-user-name').value = user.name;
                document.getElementById('new-user-phone').value = user.phone;
                document.getElementById('new-user-email').value = user.email;
                document.getElementById('new-user-email').disabled = true;
                document.getElementById('new-user-password').required = false;
                document.getElementById('new-user-password').placeholder = "Leave blank to keep same password";
                document.getElementById('user-role').value = user.role;
            }
        }
        if (deleteBtn) { showConfirmModal("Delete this user?", async () => { await deleteDoc(doc(db, "users", deleteBtn.dataset.id)); alert("User role deleted. Login must be deleted from Firebase console."); }); }
    });

    const addProductForm = document.getElementById('add-product-form');
    const inventoryTableBody = document.querySelector('#inventory-table tbody');
    const productSupplierSelect = document.getElementById('product-supplier');
    const inventoryReportTableBody = document.querySelector('#inventory-report-table tbody');

    onSnapshot(query(collection(db, "inventory_usage"), orderBy("timestamp", "desc")), (snapshot) => {
        allInventoryUsage = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    });


    const renderInventoryReport = () => {
        const lowStockItems = allInventory.filter(item => item.quantity <= item.lowStockAlert);
        inventoryReportTableBody.innerHTML = '';

        if(lowStockItems.length === 0) {
            inventoryReportTableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-gray-400">No items are currently low on stock.</td></tr>`;
            return;
        }

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoTimestamp = Timestamp.fromDate(thirtyDaysAgo);

        const recentUsage = allInventoryUsage.filter(usage => usage.timestamp >= thirtyDaysAgoTimestamp);

        lowStockItems.forEach(item => {
            const usageLast30d = recentUsage
                .filter(usage => usage.productId === item.id)
                .reduce((sum, usage) => sum + usage.quantityUsed, 0);
            
            const suggestedReorder = Math.max(0, usageLast30d - item.quantity);

            const row = inventoryReportTableBody.insertRow();
            row.className = 'bg-white border-b hover:bg-yellow-50';
            row.innerHTML = `<td class="px-6 py-4 font-medium text-gray-900">${item.name}</td><td class="px-6 py-4 text-center text-red-600 font-bold">${item.quantity}</td><td class="px-6 py-4 text-center">${item.lowStockAlert}</td><td class="px-6 py-4 text-center">${usageLast30d}</td><td class="px-6 py-4 text-center font-bold text-blue-600">${suggestedReorder}</td>`;
        });
    };

    document.getElementById('inventory-report-tab').addEventListener('click', renderInventoryReport);


    const populateProductSupplierDropdown = () => {
        const first = productSupplierSelect.options[0];
        productSupplierSelect.innerHTML = '';
        productSupplierSelect.appendChild(first);
        allSuppliers.forEach(supplier => {
            productSupplierSelect.appendChild(new Option(supplier.name, supplier.name));
        });
    };
    
    const renderInventory = () => {
        inventoryTableBody.innerHTML = '';
        allInventory.forEach(product => {
            const row = inventoryTableBody.insertRow();
            const isLowStock = product.quantity <= product.lowStockAlert;
            row.className = isLowStock ? 'bg-yellow-100' : 'bg-white';
            row.innerHTML = `<td class="px-6 py-4">${product.name} ${isLowStock ? '<span class="text-xs font-bold text-yellow-700 ml-2">LOW</span>' : ''}</td><td class="px-6 py-4">${product.category || ''}</td><td class="px-6 py-4">${product.supplier || ''}</td><td class="px-6 py-4 text-center">${product.quantity}</td><td class="px-6 py-4 text-right">$${product.price.toFixed(2)}</td><td class="px-6 py-4 text-right">$${(product.quantity * product.price).toFixed(2)}</td><td class="px-6 py-4 text-center space-x-2"><button data-id="${product.id}" class="edit-product-btn text-blue-500"><i class="fas fa-edit"></i></button><button data-id="${product.id}" class="delete-product-btn text-red-500"><i class="fas fa-trash"></i></button></td>`;
        });
        updateDashboard();
    };


    onSnapshot(query(collection(db, "inventory"), orderBy("name")), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if ((change.type === "added" || change.type === "modified") && initialInventoryLoaded) {
                const product = { id: change.doc.id, ...change.doc.data() };
                if (currentUserRole === 'admin' && product.quantity <= product.lowStockAlert) {
                     if (!notifications.some(n => n.itemId === product.id)) {
                        addNotification('stock', `${product.name} is low in stock (${product.quantity} left).`, product.id);
                    }
                } else {
                    const existingNotifIndex = notifications.findIndex(n => n.itemId === product.id);
                    if (existingNotifIndex > -1) {
                        notifications.splice(existingNotifIndex, 1);
                        updateNotificationDisplay();
                    }
                }
            }
        });
        initialInventoryLoaded = true;

        allInventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderInventory();
    });

    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('edit-product-id').value;
        const productData = { name: document.getElementById('product-name').value, category: document.getElementById('product-category').value, supplier: document.getElementById('product-supplier').value, quantity: parseInt(document.getElementById('product-quantity').value, 10), price: parseFloat(document.getElementById('product-price').value), lowStockAlert: parseInt(document.getElementById('low-stock-alert').value, 10) };
        try {
            if (productId) { await updateDoc(doc(db, "inventory", productId), productData); } 
            else { await addDoc(collection(db, "inventory"), productData); }
            resetProductForm();
        } catch (error) { console.error("Error saving product:", error); alert("Could not save product."); }
    });

    const resetProductForm = () => {
        addProductForm.reset();
        document.getElementById('edit-product-id').value = '';
        document.getElementById('add-product-btn').textContent = 'Add Product';
        document.getElementById('cancel-edit-product-btn').classList.add('hidden');
    };
    document.getElementById('cancel-edit-product-btn').addEventListener('click', resetProductForm);

    inventoryTableBody.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-product-btn');
        const deleteBtn = e.target.closest('.delete-product-btn');
        if (editBtn) {
            const product = allInventory.find(p => p.id === editBtn.dataset.id);
            if (product) {
                document.getElementById('edit-product-id').value = product.id;
                document.getElementById('product-name').value = product.name;
                document.getElementById('product-category').value = product.category || '';
                document.getElementById('product-supplier').value = product.supplier || '';
                document.getElementById('product-quantity').value = product.quantity;
                document.getElementById('product-price').value = product.price;
                document.getElementById('low-stock-alert').value = product.lowStockAlert || 10;
                document.getElementById('add-product-btn').textContent = 'Update Product';
                document.getElementById('cancel-edit-product-btn').classList.remove('hidden');
            }
        } else if (deleteBtn) {
            showConfirmModal("Delete this product from inventory?", async () => {
                await deleteDoc(doc(db, "inventory", deleteBtn.dataset.id));
            });
        }
    });

    const openLogUsageModal = () => {
        const select = document.getElementById('log-usage-product-select');
        select.innerHTML = '<option value="">Select a product...</option>';
        allInventory.forEach(item => { select.appendChild(new Option(item.name, item.id)); });
        logUsageModal.classList.remove('hidden'); logUsageModal.classList.add('flex');
    };
    const closeLogUsageModal = () => { logUsageForm.reset(); logUsageModal.classList.add('hidden'); logUsageModal.classList.remove('flex'); };
    document.getElementById('log-usage-btn').addEventListener('click', openLogUsageModal);
    document.getElementById('log-usage-cancel-btn').addEventListener('click', closeLogUsageModal);
    document.querySelector('.log-usage-modal-overlay').addEventListener('click', closeLogUsageModal);

    logUsageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const productId = document.getElementById('log-usage-product-select').value;
        const quantityUsed = parseInt(document.getElementById('log-usage-quantity').value, 10);
        if (!productId || isNaN(quantityUsed) || quantityUsed <= 0) { alert('Please select a product and enter a valid quantity.'); return; }
        const product = allInventory.find(p => p.id === productId);
        if (!product) { alert('Product not found.'); return; }
        if (product.quantity < quantityUsed) { alert(`Not enough stock. Only ${product.quantity} units available.`); return; }
        try {
            await addDoc(collection(db, "inventory_usage"), { productId: productId, productName: product.name, quantityUsed: quantityUsed, timestamp: serverTimestamp() });
            const newQuantity = product.quantity - quantityUsed;
            await updateDoc(doc(db, "inventory", productId), { quantity: newQuantity });
            alert('Usage logged successfully.');
            closeLogUsageModal();
        } catch (error) { console.error("Error logging usage:", error); alert("Could not log usage."); }
    });


    const settingsForm = document.getElementById('settings-form');
    const minBookingHoursInput = document.getElementById('min-booking-hours');
    const maxLoginAttemptsInput = document.getElementById('max-login-attempts');
    const loginLockoutMinutesInput = document.getElementById('login-lockout-minutes');
    const featureTogglesForm = document.getElementById('feature-toggles-form');
    const salonHoursForm = document.getElementById('salon-hours-form');

    const loadAndRenderSalonHours = async () => {
        const hoursContainer = document.getElementById('salon-hours-inputs');
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        let hoursData = {};
        const docSnap = await getDoc(doc(db, "settings", "salonHours"));
        if (docSnap.exists()) { hoursData = docSnap.data(); } 
        else { days.forEach(day => { hoursData[day.toLowerCase()] = { isOpen: day !== 'Sunday', open: '09:00', close: '20:00' }; }); }
        salonHours = hoursData;
        hoursContainer.innerHTML = days.map(day => {
            const dayLower = day.toLowerCase();
            const dayData = hoursData[dayLower] || { isOpen: true, open: '09:00', close: '20:00' };
            return `<div class="grid grid-cols-4 gap-2 items-center"><label class="font-semibold text-gray-700 col-span-1">${day}</label><div class="flex items-center gap-2"><input type="checkbox" id="is-open-${dayLower}" class="form-checkbox" ${dayData.isOpen ? 'checked' : ''}><label for="is-open-${dayLower}">Open</label></div><input type="time" value="${dayData.open}" class="form-input p-1 border rounded" ${!dayData.isOpen ? 'disabled' : ''}><input type="time" value="${dayData.close}" class="form-input p-1 border rounded" ${!dayData.isOpen ? 'disabled' : ''}></div>`;
        }).join('');
        days.forEach(day => {
            const dayLower = day.toLowerCase();
            const checkbox = document.getElementById(`is-open-${dayLower}`);
            const timeInputs = checkbox.closest('.grid').querySelectorAll('input[type="time"]');
            checkbox.addEventListener('change', () => { timeInputs.forEach(input => input.disabled = !checkbox.checked); });
        });
    };

    salonHoursForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const newHours = {};
        days.forEach(day => {
            const container = document.getElementById(`is-open-${day}`).closest('.grid');
            const timeInputs = container.querySelectorAll('input[type="time"]');
            newHours[day] = { isOpen: container.querySelector('input[type="checkbox"]').checked, open: timeInputs[0].value, close: timeInputs[1].value };
        });
        try { await setDoc(doc(db, "settings", "salonHours"), newHours); salonHours = newHours; alert("Salon hours saved!"); } 
        catch (error) { console.error("Error saving salon hours:", error); alert("Could not save salon hours."); }
    });


    const loadFeatureToggles = async () => {
        const settingsDoc = await getDoc(doc(db, "settings", "features"));
        if (settingsDoc.exists()) {
            const settings = settingsDoc.data();
            document.getElementById('toggle-client-login').checked = settings.showClientLogin !== false;
            document.getElementById('toggle-promotions').checked = settings.showPromotions !== false;
            document.getElementById('toggle-gift-card').checked = settings.showGiftCards !== false;
            document.getElementById('toggle-nails-idea').checked = settings.showNailArt !== false;
        } else {
            document.getElementById('toggle-client-login').checked = true;
            document.getElementById('toggle-promotions').checked = true;
            document.getElementById('toggle-gift-card').checked = true;
            document.getElementById('toggle-nails-idea').checked = true;
        }
    };
    
    featureTogglesForm.addEventListener('change', async (e) => {
        if (e.target.type === 'checkbox') {
            const settings = { showClientLogin: document.getElementById('toggle-client-login').checked, showPromotions: document.getElementById('toggle-promotions').checked, showGiftCards: document.getElementById('toggle-gift-card').checked, showNailArt: document.getElementById('toggle-nails-idea').checked };
            await setDoc(doc(db, "settings", "features"), settings, { merge: true });
        }
    });

    const loadSettings = async () => { 
        const bookingSnap = await getDoc(doc(db, "settings", "booking")); 
        if (bookingSnap.exists()) { const data = bookingSnap.data(); minBookingHoursInput.value = data.minBookingHours || 2; } 
        const securitySnap = await getDoc(doc(db, "settings", "security"));
        if (securitySnap.exists()) { const data = securitySnap.data(); loginSecuritySettings = data; maxLoginAttemptsInput.value = data.maxAttempts || 5; loginLockoutMinutesInput.value = data.lockoutMinutes || 15; }
    };
    loadSettings();
    loadFeatureToggles();
    loadAndRenderSalonHours();

    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const hours = parseInt(minBookingHoursInput.value, 10);
        const maxAttempts = parseInt(maxLoginAttemptsInput.value, 10);
        const lockoutMinutes = parseInt(loginLockoutMinutesInput.value, 10);
        if (isNaN(hours) || hours < 0 || isNaN(maxAttempts) || maxAttempts < 1 || isNaN(lockoutMinutes) || lockoutMinutes < 1) { return alert("Please enter valid, positive numbers for all settings."); }
        try { await setDoc(doc(db, "settings", "booking"), { minBookingHours: hours }); await setDoc(doc(db, "settings", "security"), { maxAttempts: maxAttempts, lockoutMinutes: lockoutMinutes }); loginSecuritySettings = { maxAttempts, lockoutMinutes }; alert("Settings saved!"); } 
        catch (error) { console.error("Error saving settings: ", error); alert("Could not save settings."); }
    });

    const setupSimpleCrud = (collectionName, formId, inputId, listId) => {
        const form = document.getElementById(formId);
        const input = document.getElementById(inputId);
        const listContainer = document.getElementById(listId);
        onSnapshot(collection(db, collectionName), (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (collectionName === 'expense_categories') allExpenseCategories = items;
            else if (collectionName === 'payment_accounts') allPaymentAccounts = items;
            else if (collectionName === 'suppliers') allSuppliers = items;
            listContainer.innerHTML = items.map(item => `<div class="flex justify-between items-center p-1 hover:bg-gray-100"><span>${item.name}</span><button data-id="${item.id}" class="delete-item-btn text-red-400 hover:text-red-600"><i class="fas fa-times-circle"></i></button></div>`).join('');
            populateExpenseDropdowns();
        });
        form.addEventListener('submit', async (e) => { e.preventDefault(); const name = input.value.trim(); if (name) { await addDoc(collection(db, collectionName), { name }); input.value = ''; } });
        listContainer.addEventListener('click', (e) => { const deleteBtn = e.target.closest('.delete-item-btn'); if (deleteBtn) { showConfirmModal("Delete this item?", async () => { await deleteDoc(doc(db, collectionName, deleteBtn.dataset.id)); }); } });
    };

    setupSimpleCrud('expense_categories', 'add-expense-category-form', 'new-expense-category-name', 'expense-categories-list');
    setupSimpleCrud('payment_accounts', 'add-payment-account-form', 'new-payment-account-name', 'payment-accounts-list');

    const addSupplierForm = document.getElementById('add-supplier-form');
    const suppliersTableBody = document.querySelector('#suppliers-table tbody');
    onSnapshot(collection(db, "suppliers"), (snapshot) => {
        allSuppliers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        suppliersTableBody.innerHTML = '';
        allSuppliers.forEach(s => { const row = suppliersTableBody.insertRow(); row.innerHTML = `<td class="px-6 py-4">${s.name}</td><td class="px-6 py-4">${s.phone || ''}</td><td class="px-6 py-4">${s.email || ''}</td><td class="px-6 py-4">${s.website ? `<a href="${s.website}" target="_blank" class="text-blue-500">Link</a>` : ''}</td><td class="px-6 py-4 text-center space-x-2"><button data-id="${s.id}" class="edit-supplier-btn text-blue-500"><i class="fas fa-edit"></i></button><button data-id="${s.id}" class="delete-supplier-btn text-red-500"><i class="fas fa-trash"></i></button></td>`; });
        populateExpenseDropdowns();
        populateProductSupplierDropdown();
    });

    addSupplierForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const supplierId = document.getElementById('edit-supplier-id').value;
        const data = { name: document.getElementById('supplier-name').value, phone: document.getElementById('supplier-phone').value, email: document.getElementById('supplier-email').value, website: document.getElementById('supplier-website').value };
        if (supplierId) { await updateDoc(doc(db, "suppliers", supplierId), data); } 
        else { await addDoc(collection(db, "suppliers"), data); }
        resetSupplierForm();
    });

    const resetSupplierForm = () => { addSupplierForm.reset(); document.getElementById('edit-supplier-id').value = ''; document.getElementById('add-supplier-btn').textContent = 'Add Supplier'; document.getElementById('cancel-edit-supplier-btn').classList.add('hidden'); };
    document.getElementById('cancel-edit-supplier-btn').addEventListener('click', resetSupplierForm);

    suppliersTableBody.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-supplier-btn');
        const deleteBtn = e.target.closest('.delete-supplier-btn');
        if (editBtn) {
            const supplier = allSuppliers.find(s => s.id === editBtn.dataset.id);
            if (supplier) { document.getElementById('edit-supplier-id').value = supplier.id; document.getElementById('supplier-name').value = supplier.name; document.getElementById('supplier-phone').value = supplier.phone || ''; document.getElementById('supplier-email').value = supplier.email || ''; document.getElementById('supplier-website').value = supplier.website || ''; document.getElementById('add-supplier-btn').textContent = 'Update'; document.getElementById('cancel-edit-supplier-btn').classList.remove('hidden'); }
        } else if (deleteBtn) { showConfirmModal("Delete this supplier?", async () => { await deleteDoc(doc(db, "suppliers", deleteBtn.dataset.id)); }); }
    });

    const addExpenseForm = document.getElementById('add-expense-form');
    const expenseMonthFilter = document.getElementById('expense-month-filter');
    const expenseTableBody = document.querySelector('#expense-table tbody');
    const totalExpenseEl = document.getElementById('total-expense');

    const populateExpenseDropdowns = () => {
        const categorySelect = document.getElementById('expense-category');
        const supplierSelect = document.getElementById('expense-supplier');
        const paymentSelect = document.getElementById('expense-payment-account');
        const populate = (select, data) => { const first = select.options[0]; select.innerHTML = ''; select.appendChild(first); data.forEach(item => select.appendChild(new Option(item.name, item.name))); };
        populate(categorySelect, allExpenseCategories);
        populate(supplierSelect, allSuppliers);
        populate(paymentSelect, allPaymentAccounts);
    };

    const populateExpenseMonthFilter = () => {
        const months = [...new Set(allExpenses.map(exp => { const d = new Date(exp.date.seconds * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }))].sort().reverse();
        expenseMonthFilter.innerHTML = '<option value="all">All Months</option>';
        months.forEach(monthYear => { const [year, month] = monthYear.split('-'); expenseMonthFilter.innerHTML += `<option value="${monthYear}">${new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`; });
        expenseMonthFilter.value = currentExpenseMonthFilter || 'all';
    };

    const renderExpenses = () => {
        let filtered = allExpenses;
        if (currentExpenseMonthFilter && currentExpenseMonthFilter !== 'all') {
            const [year, month] = currentExpenseMonthFilter.split('-').map(Number);
            filtered = allExpenses.filter(exp => { const d = new Date(exp.date.seconds * 1000); return d.getFullYear() === year && d.getMonth() + 1 === month; });
        }
        expenseTableBody.innerHTML = filtered.length === 0 ? `<tr><td colspan="8" class="py-6 text-center text-gray-400">No expenses found.</td></tr>` : '';
        filtered.forEach(exp => {
            const row = expenseTableBody.insertRow();
            row.className = 'bg-white border-b';
            row.innerHTML = `<td class="px-6 py-4">${new Date(exp.date.seconds * 1000).toLocaleDateString()}</td><td class="px-6 py-4">${exp.name}</td><td class="px-6 py-4">${exp.category || ''}</td><td class="px-6 py-4">${exp.supplier || ''}</td><td class="px-6 py-4">${exp.paymentAccount || ''}</td><td class="px-6 py-4">${exp.attachmentURL ? `<a href="${exp.attachmentURL}" target="_blank" class="text-blue-500 hover:underline">View</a>` : 'N/A'}</td><td class="px-6 py-4 text-right">$${exp.amount.toFixed(2)}</td><td class="px-6 py-4 text-center space-x-2"><button data-id="${exp.id}" class="edit-expense-btn text-blue-500"><i class="fas fa-edit"></i></button><button data-id="${exp.id}" class="delete-expense-btn text-red-500"><i class="fas fa-trash"></i></button></td>`;
        });
        totalExpenseEl.textContent = `$${filtered.reduce((sum, exp) => sum + exp.amount, 0).toFixed(2)}`;
    };

    expenseMonthFilter.addEventListener('change', (e) => { currentExpenseMonthFilter = e.target.value; renderExpenses(); });

    addExpenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const expenseId = document.getElementById('edit-expense-id').value;
        const file = document.getElementById('expense-attachment').files[0];
        let attachmentURL = document.getElementById('current-attachment-info').dataset.url || null;
        if (file) {
            const storageRef = ref(storage, `expenses/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            attachmentURL = await getDownloadURL(storageRef);
        }
        const expenseData = {
            name: document.getElementById('expense-name').value, amount: parseFloat(document.getElementById('expense-amount').value), date: Timestamp.fromDate(new Date(document.getElementById('expense-date').value + 'T12:00:00')),
            category: document.getElementById('expense-category').value, supplier: document.getElementById('expense-supplier').value, paymentAccount: document.getElementById('expense-payment-account').value, attachmentURL
        };
        try {
            if (expenseId) { await updateDoc(doc(db, "expenses", expenseId), expenseData); } 
            else { await addDoc(collection(db, "expenses"), expenseData); }
            resetExpenseForm();
        } catch (error) { console.error("Error saving expense:", error); alert("Could not save expense."); }
    });

    const resetExpenseForm = () => { addExpenseForm.reset(); document.getElementById('edit-expense-id').value = ''; document.getElementById('expense-date').value = getLocalDateString(); document.getElementById('add-expense-btn').textContent = 'Add Expense'; document.getElementById('cancel-edit-expense-btn').classList.add('hidden'); document.getElementById('current-attachment-info').textContent = ''; document.getElementById('current-attachment-info').dataset.url = ''; };
    document.getElementById('cancel-edit-expense-btn').addEventListener('click', resetExpenseForm);

    expenseTableBody.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-expense-btn');
        const editBtn = e.target.closest('.edit-expense-btn');
        if (deleteBtn) { showConfirmModal("Delete this expense?", async () => { await deleteDoc(doc(db, "expenses", deleteBtn.dataset.id)); }); } 
        else if (editBtn) {
            const expense = allExpenses.find(exp => exp.id === editBtn.dataset.id);
            if (expense) {
                document.getElementById('edit-expense-id').value = expense.id;
                document.getElementById('expense-name').value = expense.name;
                document.getElementById('expense-amount').value = expense.amount;
                document.getElementById('expense-date').value = new Date(expense.date.seconds * 1000).toISOString().split('T')[0];
                document.getElementById('expense-category').value = expense.category || '';
                document.getElementById('expense-supplier').value = expense.supplier || '';
                document.getElementById('expense-payment-account').value = expense.paymentAccount || '';
                const attachmentInfo = document.getElementById('current-attachment-info');
                attachmentInfo.textContent = expense.attachmentURL ? 'Current attachment exists.' : '';
                attachmentInfo.dataset.url = expense.attachmentURL || '';
                document.getElementById('add-expense-btn').textContent = 'Update Expense';
                document.getElementById('cancel-edit-expense-btn').classList.remove('hidden');
            }
        }
    });

    const serviceCategoriesAdminContainer = document.getElementById('service-categories-admin');
    const addCategoryForm = document.getElementById('add-category-form');
    const addServiceForm = document.getElementById('add-service-form');
    const editServiceSection = document.getElementById('edit-service-section');
    const renderServiceAdmin = (services) => {
        serviceCategoriesAdminContainer.innerHTML = '';
        Object.entries(services).forEach(([categoryName, items]) => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'p-3 border rounded-lg';
            categoryDiv.innerHTML = `<div class="flex justify-between items-center mb-2"><h4 class="font-bold">${categoryName}</h4><div><button class="add-service-to-category-btn text-green-500 mr-2" data-category="${categoryName}"><i class="fas fa-plus-circle"></i></button><button class="edit-category-btn text-blue-500 mr-2" data-category="${categoryName}"><i class="fas fa-edit"></i></button><button class="delete-category-btn text-red-500" data-category="${categoryName}"><i class="fas fa-trash"></i></button></div></div><ul class="service-list space-y-1 pl-4">${items.map((item, index) => `<li class="flex justify-between items-center text-sm"><span>${item.name} - ${item.price}</span><div><button class="edit-service-btn text-blue-500 mr-2" data-category="${categoryName}" data-index="${index}"><i class="fas fa-edit"></i></button><button class="delete-service-btn text-red-500" data-category="${categoryName}" data-index="${index}"><i class="fas fa-times-circle"></i></button></div></li>`).join('')}</ul>`;
            serviceCategoriesAdminContainer.appendChild(categoryDiv);
        });
    };
    onSnapshot(collection(db, "services"), (snapshot) => { servicesData = {}; snapshot.forEach(doc => { servicesData[doc.id] = doc.data().items; }); renderServiceAdmin(servicesData); renderCheckInServices(); });
    addCategoryForm.addEventListener('submit', async (e) => { e.preventDefault(); const categoryName = document.getElementById('new-category-name').value; if (categoryName) { await setDoc(doc(db, "services", categoryName), { items: [] }); addCategoryForm.reset(); } });
    serviceCategoriesAdminContainer.addEventListener('click', async (e) => {
        const delCatBtn = e.target.closest('.delete-category-btn'), editCatBtn = e.target.closest('.edit-category-btn'), addSvcBtn = e.target.closest('.add-service-to-category-btn'), editSvcBtn = e.target.closest('.edit-service-btn'), delSvcBtn = e.target.closest('.delete-service-btn');
        if (delCatBtn) { showConfirmModal(`Delete category "${delCatBtn.dataset.category}"?`, async () => { await deleteDoc(doc(db, "services", delCatBtn.dataset.category)); }); }
        if (editCatBtn) { const oldName = editCatBtn.dataset.category; const newName = prompt("New category name:", oldName); if (newName && newName !== oldName) { const docSnap = await getDoc(doc(db, "services", oldName)); if (docSnap.exists()) { await setDoc(doc(db, "services", newName), docSnap.data()); await deleteDoc(doc(db, "services", oldName)); } } }
        if (addSvcBtn) { addServiceForm.reset(); document.getElementById('edit-category-id').value = addSvcBtn.dataset.category; document.getElementById('edit-service-index').value = ''; document.getElementById('edit-service-title').textContent = `Add Service to ${addSvcBtn.dataset.category}`; editServiceSection.classList.remove('hidden'); }
        if (editSvcBtn) { const category = editSvcBtn.dataset.category, index = editSvcBtn.dataset.index, service = servicesData[category][index]; addServiceForm.reset(); document.getElementById('edit-category-id').value = category; document.getElementById('edit-service-index').value = index; document.getElementById('service-prefix').value = service.p || ''; document.getElementById('service-name').value = service.name; document.getElementById('service-price').value = service.price; document.getElementById('edit-service-title').textContent = `Edit Service in ${category}`; editServiceSection.classList.remove('hidden'); }
        if (delSvcBtn) { const category = delSvcBtn.dataset.category, index = parseInt(delSvcBtn.dataset.index, 10); showConfirmModal('Delete this service?', async () => { const updatedItems = [...servicesData[category]]; updatedItems.splice(index, 1); await updateDoc(doc(db, "services", category), { items: updatedItems }); }); }
    });
    addServiceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const category = document.getElementById('edit-category-id').value, index = document.getElementById('edit-service-index').value;
        const newService = { p: document.getElementById('service-prefix').value, name: document.getElementById('service-name').value, price: document.getElementById('service-price').value };
        const updatedItems = [...servicesData[category]];
        if (index !== '') { updatedItems[parseInt(index, 10)] = newService; } else { updatedItems.push(newService); }
        await updateDoc(doc(db, "services", category), { items: updatedItems });
        addServiceForm.reset(); editServiceSection.classList.add('hidden');
    });

    const nailsIdeaGallery = document.getElementById('nails-idea-gallery');
    const addNailIdeaForm = document.getElementById('add-nail-idea-form');
    const nailIdeasTableBody = document.querySelector('#nail-ideas-table tbody');

    const openShareModal = (idea) => {
        const salonUrl = "http://www.nailsxpressky.com";
        const shareText = `Check out this amazing nail design: ${idea.name}!`;
        document.getElementById('share-facebook').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(salonUrl)}`;
        document.getElementById('share-pinterest').href = `http://pinterest.com/pin/create/button/?url=${encodeURIComponent(salonUrl)}&media=${encodeURIComponent(idea.imageURL)}&description=${encodeURIComponent(shareText)}`;
        document.getElementById('share-twitter').href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(salonUrl)}`;
        document.getElementById('share-copy-link').onclick = () => { navigator.clipboard.writeText(salonUrl).then(() => alert('Link copied to clipboard!')); };
        shareModal.classList.remove('hidden');
        shareModal.classList.add('flex');
    };

    const closeShareModal = () => { shareModal.classList.add('hidden'); shareModal.classList.remove('flex'); };
    document.getElementById('share-close-btn').addEventListener('click', closeShareModal);
    document.querySelector('.share-modal-overlay').addEventListener('click', closeShareModal);
    
    const galleryClickHandler = (e) => {
        const shareBtn = e.target.closest('.share-nail-idea-btn');
        if (shareBtn) { const ideaId = shareBtn.dataset.id; const idea = allNailIdeas.find(i => i.id === ideaId); if (idea) { openShareModal(idea); } }
    };
    
    document.getElementById('nails-idea-gallery').addEventListener('click', galleryClickHandler);
    document.getElementById('nails-idea-landing').addEventListener('click', galleryClickHandler);


    const renderNailIdeasGallery = (ideas) => {
        const landingGallery = document.querySelector('#nails-idea-landing .columns-2');
        const appGallery = document.getElementById('nails-idea-gallery');
        
        const renderTo = (container, isLanding) => {
            container.innerHTML = '';
            if (ideas.length === 0) { container.innerHTML = '<p class="text-gray-500 col-span-full text-center">No nail ideas found. Check back later!</p>'; return; }
            const ideasToRender = isLanding ? ideas.slice(0, 8) : ideas;
            ideasToRender.forEach(idea => {
                const ideaEl = document.createElement('div');
                ideaEl.className = 'break-inside-avoid mb-4 relative gallery-item';
                ideaEl.innerHTML = `<img class="w-full rounded-lg shadow-md" src="${idea.imageURL}" alt="${idea.name}"><div class="overlay absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center rounded-lg"><button data-id="${idea.id}" class="share-nail-idea-btn text-white text-3xl"><i class="fas fa-share-alt"></i></button></div>${!isLanding ? `<div class="p-2"><h5 class="font-bold text-sm">${idea.name}</h5><p class="text-xs text-gray-600">${idea.categories.join(', ')}</p></div>` : ''}`;
                container.appendChild(ideaEl);
            });
        };

        renderTo(landingGallery, true);
        renderTo(appGallery, false);
    };

    const renderNailIdeasAdminTable = (ideas) => {
        nailIdeasTableBody.innerHTML = '';
        ideas.forEach(idea => {
            const row = nailIdeasTableBody.insertRow();
            row.innerHTML = `<td class="px-6 py-4"><img src="${idea.imageURL}" alt="${idea.name}" class="w-16 h-16 object-cover rounded"></td><td class="px-6 py-4">${idea.name}</td><td class="px-6 py-4">${idea.shape}</td><td class="px-6 py-4">${idea.categories.join(', ')}</td><td class="px-6 py-4 text-center space-x-2"><button data-id="${idea.id}" class="edit-nail-idea-btn text-blue-500"><i class="fas fa-edit"></i></button><button data-id="${idea.id}" class="delete-nail-idea-btn text-red-500"><i class="fas fa-trash"></i></button></td>`;
        });
    };

    const applyNailIdeaFilters = () => {
        const searchTerm = document.getElementById('nail-idea-search').value.toLowerCase();
        const shapeFilter = document.getElementById('nail-idea-shape-filter').value;
        const categoryFilter = document.getElementById('nail-idea-category-filter').value;
        const filteredIdeas = allNailIdeas.filter(idea => { const matchesSearch = idea.name.toLowerCase().includes(searchTerm) || idea.categories.some(cat => cat.toLowerCase().includes(searchTerm)); const matchesShape = !shapeFilter || idea.shape === shapeFilter; const matchesCategory = !categoryFilter || idea.categories.includes(categoryFilter); return matchesSearch && matchesShape && matchesCategory; });
        renderNailIdeasGallery(filteredIdeas);
    };

    onSnapshot(query(collection(db, "nail_ideas"), orderBy("createdAt", "desc")), (snapshot) => {
        allNailIdeas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const shapes = [...new Set(allNailIdeas.map(i => i.shape).filter(Boolean))];
        const categories = [...new Set(allNailIdeas.flatMap(i => i.categories).filter(Boolean))];
        const shapeFilter = document.getElementById('nail-idea-shape-filter');
        const categoryFilter = document.getElementById('nail-idea-category-filter');
        shapeFilter.innerHTML = '<option value="">All Shapes</option>' + shapes.map(s => `<option value="${s}">${s}</option>`).join('');
        categoryFilter.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
        applyNailIdeaFilters();
        renderNailIdeasAdminTable(allNailIdeas);
    });

    document.getElementById('nail-idea-search').addEventListener('input', applyNailIdeaFilters);
    document.getElementById('nail-idea-shape-filter').addEventListener('change', applyNailIdeaFilters);
    document.getElementById('nail-idea-category-filter').addEventListener('change', applyNailIdeaFilters);

    addNailIdeaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ideaId = document.getElementById('edit-nail-idea-id').value;
        const file = document.getElementById('nail-idea-image').files[0];
        if (!ideaId && !file) { alert('Please select an image to upload.'); return; }
        const btn = document.getElementById('add-nail-idea-btn');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
            let imageURL = null;
            if (file) {
                const storageRef = ref(storage, `nail_ideas/${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                imageURL = await getDownloadURL(storageRef);
            }
            const ideaData = { name: document.getElementById('nail-idea-name').value, color: document.getElementById('nail-idea-color').value, shape: document.getElementById('nail-idea-shape').value, categories: document.getElementById('nail-idea-categories').value.split(',').map(s => s.trim()).filter(Boolean), };
            if (ideaId) {
                const existingIdea = allNailIdeas.find(i => i.id === ideaId);
                if (imageURL) {
                    ideaData.imageURL = imageURL;
                    if (existingIdea.imageURL) { try { const oldImageRef = ref(storage, existingIdea.imageURL); await deleteObject(oldImageRef); } catch (storageError) { console.warn("Could not delete old image, it might not exist:", storageError); } }
                }
                await updateDoc(doc(db, "nail_ideas", ideaId), ideaData);
            } else { ideaData.imageURL = imageURL; ideaData.createdAt = serverTimestamp(); await addDoc(collection(db, "nail_ideas"), ideaData); }
            resetNailIdeaForm();
        } catch (error) { console.error("Error saving nail idea:", error); alert("Could not save nail idea."); } 
        finally { btn.disabled = false; btn.textContent = 'Add Idea'; }
    });

    const resetNailIdeaForm = () => {
        addNailIdeaForm.reset();
        document.getElementById('edit-nail-idea-id').value = '';
        document.getElementById('add-nail-idea-btn').textContent = 'Add Idea';
        document.getElementById('cancel-edit-nail-idea-btn').classList.add('hidden');
    };
    document.getElementById('cancel-edit-nail-idea-btn').addEventListener('click', resetNailIdeaForm);

    nailIdeasTableBody.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-nail-idea-btn');
        const deleteBtn = e.target.closest('.delete-nail-idea-btn');
        if (editBtn) {
            const idea = allNailIdeas.find(i => i.id === editBtn.dataset.id);
            if (idea) {
                document.getElementById('edit-nail-idea-id').value = idea.id;
                document.getElementById('nail-idea-name').value = idea.name;
                document.getElementById('nail-idea-color').value = idea.color;
                document.getElementById('nail-idea-shape').value = idea.shape;
                document.getElementById('nail-idea-categories').value = idea.categories.join(', ');
                document.getElementById('add-nail-idea-btn').textContent = 'Update Idea';
                document.getElementById('cancel-edit-nail-idea-btn').classList.remove('hidden');
            }
        } else if (deleteBtn) {
            const ideaId = deleteBtn.dataset.id;
            showConfirmModal("Delete this nail idea? This will also delete the image.", async () => {
                const ideaToDelete = allNailIdeas.find(i => i.id === ideaId);
                if (ideaToDelete.imageURL) {
                    const imageRef = ref(storage, ideaToDelete.imageURL);
                    await deleteObject(imageRef).catch(err => console.error("Error deleting image from storage", err));
                }
                await deleteDoc(doc(db, "nail_ideas", ideaId));
            });
        }
    });

    const giftCardsTableBody = document.querySelector('#gift-cards-table tbody');

    const renderGiftCardsAdminTable = (cards) => {
        giftCardsTableBody.innerHTML = '';
        if (cards.length === 0) {
            giftCardsTableBody.innerHTML = `<tr><td colspan="8" class="py-6 text-center text-gray-400">No gift cards have been sold.</td></tr>`;
            return;
        }
        cards.forEach(card => {
            const row = giftCardsTableBody.insertRow();
            const balance = card.balance !== undefined ? card.balance : card.amount;
            let status = card.status;
            let statusColor = 'text-gray-500';
            if (balance > 0) {
                status = 'Active';
                statusColor = 'text-green-600';
            } else {
                status = 'Depleted';
            }

            row.innerHTML = `<td class="px-6 py-4">${new Date(card.createdAt.seconds * 1000).toLocaleDateString()}</td><td class="px-6 py-4 font-mono text-xs">${card.code}</td><td class="px-6 py-4">$${card.amount.toFixed(2)}</td><td class="px-6 py-4 font-bold">$${balance.toFixed(2)}</td><td class="px-6 py-4">${card.recipientName}<br><span class="text-xs text-gray-500">${card.recipientEmail || 'Physical Card'}</span></td><td class="px-6 py-4">${card.senderName}</td><td class="px-6 py-4 font-bold ${statusColor}">${status}</td><td class="px-6 py-4 text-center"><button data-id="${card.id}" class="edit-gift-card-btn text-blue-500 hover:text-blue-700" title="Manage Card"><i class="fas fa-edit text-lg"></i></button></td>`;
        });
    };

    onSnapshot(query(collection(db, "gift_cards"), orderBy("createdAt", "desc")), (snapshot) => {
        allGiftCards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderGiftCardsAdminTable(allGiftCards);
    });

    const addPromotionForm = document.getElementById('add-promotion-form');
    const promotionsTableBody = document.querySelector('#promotions-table tbody');
    const promotionsContainerLanding = document.getElementById('promotions-container-landing');
    
    const renderPromotionsAdminTable = (promotions) => {
        promotionsTableBody.innerHTML = '';
        const now = new Date();
        promotions.forEach(promo => {
            const startDate = promo.startDate.toDate();
            const endDate = promo.endDate.toDate();
            let status, statusColor;
            if (now < startDate) { status = 'Scheduled'; statusColor = 'text-blue-600'; } 
            else if (now > endDate) { status = 'Expired'; statusColor = 'text-gray-500'; } 
            else { status = 'Active'; statusColor = 'text-green-600'; }
            const row = promotionsTableBody.insertRow();
            row.innerHTML = `<td class="px-6 py-4">${promo.title}</td><td class="px-6 py-4">${promo.description}</td><td class="px-6 py-4">${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}</td><td class="px-6 py-4 font-bold ${statusColor}">${status}</td><td class="px-6 py-4 text-center space-x-2"><button data-id="${promo.id}" class="send-promo-notification-btn text-purple-500" title="Send Notification"><i class="fas fa-paper-plane"></i></button><button data-id="${promo.id}" class="edit-promotion-btn text-blue-500"><i class="fas fa-edit"></i></button><button data-id="${promo.id}" class="delete-promotion-btn text-red-500"><i class="fas fa-trash"></i></button></td>`;
        });
    };

    const renderPromotionsLanding = (promotions) => {
        promotionsContainerLanding.innerHTML = '';
        const now = new Date();
        const activePromos = promotions.filter(promo => {
            const startDate = promo.startDate.toDate();
            const endDate = promo.endDate.toDate();
            return now >= startDate && now <= endDate;
        });
        if (activePromos.length === 0) { promotionsContainerLanding.innerHTML = '<p class="text-gray-600 col-span-full text-center">No active promotions right now. Check back soon!</p>'; return; }
        activePromos.forEach(promo => { const promoEl = document.createElement('div'); promoEl.className = 'bg-white p-6 rounded-lg shadow-md text-center'; promoEl.innerHTML = `<h3 class="text-xl font-bold text-pink-700 mb-2">${promo.title}</h3><p class="text-gray-600">${promo.description}</p>`; promotionsContainerLanding.appendChild(promoEl); });
    };

    onSnapshot(query(collection(db, "promotions"), orderBy("startDate", "desc")), (snapshot) => {
        allPromotions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderPromotionsAdminTable(allPromotions);
        renderPromotionsLanding(allPromotions);
    });

    addPromotionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const promoId = document.getElementById('edit-promotion-id').value;
        const promoData = { title: document.getElementById('promotion-title').value, description: document.getElementById('promotion-description').value, startDate: Timestamp.fromDate(new Date(document.getElementById('promotion-start-date').value + 'T00:00:00')), endDate: Timestamp.fromDate(new Date(document.getElementById('promotion-end-date').value + 'T23:59:59')), };
        try {
            if (promoId) { await updateDoc(doc(db, "promotions", promoId), promoData); } 
            else { promoData.createdAt = serverTimestamp(); await addDoc(collection(db, "promotions"), promoData); }
            addPromotionForm.reset(); document.getElementById('edit-promotion-id').value = '';
        } catch (error) { console.error("Error saving promotion:", error); alert("Could not save promotion."); }
    });

    promotionsTableBody.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-promotion-btn');
        const deleteBtn = e.target.closest('.delete-promotion-btn');
        const sendBtn = e.target.closest('.send-promo-notification-btn');
        if (editBtn) {
            const promo = allPromotions.find(p => p.id === editBtn.dataset.id);
            if (promo) { document.getElementById('edit-promotion-id').value = promo.id; document.getElementById('promotion-title').value = promo.title; document.getElementById('promotion-description').value = promo.description; document.getElementById('promotion-start-date').value = promo.startDate.toDate().toISOString().split('T')[0]; document.getElementById('promotion-end-date').value = promo.endDate.toDate().toISOString().split('T')[0]; document.getElementById('add-promotion-btn').textContent = 'Update Promotion'; document.getElementById('cancel-edit-promotion-btn').classList.remove('hidden'); }
        } else if (deleteBtn) { showConfirmModal("Are you sure you want to delete this promotion?", async () => { await deleteDoc(doc(db, "promotions", deleteBtn.dataset.id)); });
        } else if (sendBtn) {
            const promo = allPromotions.find(p => p.id === sendBtn.dataset.id);
            if (promo) { showConfirmModal(`Send a notification for "${promo.title}" to all clients?`, () => { addNotification('promo', `New Promotion: ${promo.title}! ${promo.description}`); alert('Promotion notification sent!'); }); }
        }
    });

    document.getElementById('cancel-edit-promotion-btn').addEventListener('click', () => {
        addPromotionForm.reset();
        document.getElementById('edit-promotion-id').value = '';
        document.getElementById('add-promotion-btn').textContent = 'Add Promotion';
        document.getElementById('cancel-edit-promotion-btn').classList.add('hidden');
    });

    const openClientModal = (client = null) => {
        clientForm.reset();
        const modalTitle = document.getElementById('client-form-title');
        if (client) {
            modalTitle.textContent = 'Edit Client Information';
            document.getElementById('edit-client-id').value = client.id;
            document.getElementById('client-form-name').value = client.name;
            document.getElementById('client-form-phone').value = client.phone || '';
            document.getElementById('client-form-dob').value = client.dob || '';
        } else {
            modalTitle.textContent = 'Create New Client';
            document.getElementById('edit-client-id').value = '';
        }
        clientFormModal.classList.remove('hidden');
        clientFormModal.classList.add('flex');
    };

    const closeClientModal = () => { clientFormModal.classList.add('hidden'); clientFormModal.classList.remove('flex'); };
    document.getElementById('create-new-client-btn').addEventListener('click', () => openClientModal());
    document.getElementById('client-form-cancel-btn').addEventListener('click', closeClientModal);
    document.querySelector('.client-form-modal-overlay').addEventListener('click', closeClientModal);

    clientForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const clientId = document.getElementById('edit-client-id').value;
        const clientData = { name: document.getElementById('client-form-name').value, phone: document.getElementById('client-form-phone').value, dob: document.getElementById('client-form-dob').value, };
        if (!clientData.name) { alert('Client name is required.'); return; }
        try {
            if (clientId) { await updateDoc(doc(db, "clients", clientId), clientData); } 
            else { await addDoc(collection(db, "clients"), clientData); }
            closeClientModal();
        } catch (error) { console.error("Error saving client:", error); alert("Could not save client data."); }
    });

    const importClientsBtn = document.getElementById('import-clients-btn');
    const importClientsInput = document.getElementById('import-clients-input');
    importClientsBtn.addEventListener('click', () => importClientsInput.click());
    importClientsInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const clientsToImport = XLSX.utils.sheet_to_json(firstSheet);
            if (clientsToImport.length === 0) { alert('No clients found in the file.'); return; }
            const batch = writeBatch(db);
            clientsToImport.forEach(client => { const newClientRef = doc(collection(db, "clients")); batch.set(newClientRef, { name: client.Name || 'N/A', phone: client.Phone || '', dob: client.DOB || '' }); });
            try { await batch.commit(); alert(`${clientsToImport.length} clients imported successfully!`); } 
            catch (error) { console.error("Error importing clients: ", error); alert("An error occurred during import."); }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    });
    
    // --- Initialize a few event listeners for the new gift card modals ---
    document.getElementById('gift-cards-table tbody').addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-gift-card-btn');
        if (editBtn) {
            const card = allGiftCards.find(c => c.id === editBtn.dataset.id);
            if(card) openEditGiftCardModal(card);
        }
    });

    document.getElementById('close-edit-gift-card-modal-btn').addEventListener('click', () => editGiftCardModal.classList.add('hidden'));
    editGiftCardModal.querySelector('.modal-overlay').addEventListener('click', () => editGiftCardModal.classList.add('hidden'));


    loadAndRenderServices();
    const todayString = getLocalDateString();
    const currentMonthIndex = new Date().getMonth();
    document.getElementById('finished-date-filter').value = todayString;
    currentFinishedDateFilter = todayString;
    renderFinishedClients(applyClientFilters(allFinishedClients, '', 'All', currentFinishedDateFilter));
    document.getElementById('staff-earning-date').value = todayString;
    document.getElementById('earning-date-filter').value = todayString;
    currentEarningDateFilter = todayString;
    renderStaffEarnings(applyEarningFilters(allEarnings, 'All', currentEarningDateFilter, 'daily'));
    document.getElementById('salon-earning-date').value = todayString;
    const salonEarningRangeFilter = document.getElementById('salon-earning-range-filter');
    const salonEarningDateFilter = document.getElementById('salon-earning-date-filter');
    salonEarningRangeFilter.value = currentMonthIndex;
    salonEarningDateFilter.style.display = 'none';
    currentSalonEarningRangeFilter = String(currentMonthIndex);
    currentSalonEarningDateFilter = '';
    renderSalonEarnings(applySalonEarningFilters(allSalonEarnings, currentSalonEarningDateFilter, currentSalonEarningRangeFilter));
    document.getElementById('expense-date').value = todayString;
    document.getElementById('sign-out-btn').addEventListener('click', () => { signOut(auth); });
    document.getElementById('floating-booking-btn').addEventListener('click', () => { openAddAppointmentModal(getLocalDateString()); });
}


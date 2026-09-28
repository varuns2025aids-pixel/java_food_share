/* ==========================================================================
   FoodShare - Modern & Creative Application Logic
   ========================================================================== */

const API = "/api";
const PAGE_SIZE = 6;
const TAB_STORAGE_KEY = "foodshare.activeTab";
const VIEW_STORAGE_KEY = "foodshare.listingView";

let page = 0;
let lastCount = 0;
let currentListings = [];
let allLoadedListings = [];
let currentDonors = [];
let currentNgos = [];
let activeStatusFilter = "ALL";
let activeView = localStorage.getItem(VIEW_STORAGE_KEY) || "cards";

/* --------------------------------------------------------------------------
   Notification & Toast System
   -------------------------------------------------------------------------- */
function showToast(title, text, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const icons = {
        success: "✓",
        error: "✕",
        info: "ℹ"
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || "ℹ"}</div>
        <div class="toast-body">
            <div class="toast-title">${esc(title)}</div>
            <div class="toast-text">${esc(text)}</div>
        </div>
        <button type="button" class="toast-close" title="Dismiss">✕</button>
    `;

    const closeBtn = toast.querySelector(".toast-close");
    closeBtn.onclick = () => dismissToast(toast);

    container.appendChild(toast);

    setTimeout(() => {
        dismissToast(toast);
    }, 4500);
}

function dismissToast(toast) {
    if (!toast || toast.classList.contains("dismissing")) return;
    toast.classList.add("dismissing");
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
}

function showMsg(text, isError) {
    // Preserve accessibility element
    const message = document.getElementById("msg");
    if (message) {
        message.textContent = text;
        message.className = isError ? "error" : "success";
    }

    if (!text) return;
    if (isError) {
        showToast("Error Encountered", text, "error");
    } else {
        showToast("Success", text, "success");
    }
}

function esc(value) {
    const element = document.createElement("div");
    element.textContent = value ?? "";
    return element.innerHTML;
}

function ensureCurrentMonth() {
    const monthInput = document.getElementById("month");
    if (monthInput && !monthInput.value) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        monthInput.value = `${yyyy}-${mm}`;
    }
}

/* --------------------------------------------------------------------------
   API Wrapper
   -------------------------------------------------------------------------- */
async function call(url, method = "GET", body) {
    try {
        const response = await fetch(API + url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const details = data.details ? " " + JSON.stringify(data.details) : "";
            showMsg((data.error || "Request failed") + details, true);
            return null;
        }
        return data;
    } catch (err) {
        showMsg("Network connection error: " + err.message, true);
        return null;
    }
}

/* --------------------------------------------------------------------------
   Tab Navigation & Routing
   -------------------------------------------------------------------------- */
function activateTab(tabName, remember = true) {
    const validTabs = ["directory", "list-food", "listings", "report"];
    const selected = validTabs.includes(tabName) ? tabName : "listings";

    document.querySelectorAll(".tab").forEach(tab => {
        const active = tab.dataset.tab === selected;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
    });

    document.querySelectorAll(".tab-panel").forEach(panel => {
        const active = panel.id === `panel-${selected}`;
        panel.classList.toggle("active-panel", active);
        panel.hidden = !active;
    });

    if (remember) sessionStorage.setItem(TAB_STORAGE_KEY, selected);

    if (selected === "listings") loadListings();
    if (selected === "list-food" || selected === "directory") loadDropdowns();
    if (selected === "report") {
        ensureCurrentMonth();
        loadReport();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

/* --------------------------------------------------------------------------
   Food Category Icons & Expiry Time Calculations
   -------------------------------------------------------------------------- */
function getFoodIcon(name = "") {
    const lower = name.toLowerCase();
    if (lower.includes("rice") || lower.includes("biryani") || lower.includes("pulao")) return "🍚";
    if (lower.includes("bread") || lower.includes("bun") || lower.includes("bakery") || lower.includes("cake") || lower.includes("pastry")) return "🥖";
    if (lower.includes("curry") || lower.includes("soup") || lower.includes("gravy") || lower.includes("dal")) return "🍲";
    if (lower.includes("fruit") || lower.includes("apple") || lower.includes("banana") || lower.includes("orange")) return "🍎";
    if (lower.includes("salad") || lower.includes("vegetable") || lower.includes("veg")) return "🥗";
    if (lower.includes("milk") || lower.includes("dairy") || lower.includes("paneer") || lower.includes("cheese")) return "🧀";
    if (lower.includes("sandwich") || lower.includes("burger") || lower.includes("wrap") || lower.includes("snack")) return "🥪";
    if (lower.includes("can") || lower.includes("pack") || lower.includes("cereal") || lower.includes("biscuit")) return "🥫";
    return "🍲";
}

function getExpiryMeta(safeUntilStr) {
    if (!safeUntilStr) return { text: "Time not set", statusClass: "fresh" };
    const expiry = new Date(safeUntilStr);
    const now = new Date();
    const diffMs = expiry - now;

    if (diffMs <= 0) {
        return { text: "⚠️ Expired", statusClass: "expired" };
    }

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) {
        return { text: `⏰ Expiring in ${diffMins}m`, statusClass: "urgent" };
    } else if (diffHours < 6) {
        return { text: `⏰ Safe for ${diffHours}h ${remainingMins}m`, statusClass: "warning" };
    } else if (diffDays < 1) {
        return { text: `Fresh for ${diffHours} hours`, statusClass: "fresh" };
    } else {
        return { text: `Fresh for ${diffDays}d ${diffHours % 24}h`, statusClass: "fresh" };
    }
}

/* --------------------------------------------------------------------------
   Live Network & Impact Statistics Ribbon
   -------------------------------------------------------------------------- */
async function refreshGlobalStats() {
    try {
        const [donors, ngos, allListings] = await Promise.all([
            call("/donors") || [],
            call("/ngos") || [],
            call("/listings?page=0&size=10000&sortBy=id") || []
        ]);

        // Donors count
        const donorCount = donors.length;
        const ngoCount = ngos.length;

        const statDonors = document.getElementById("statDonors");
        if (statDonors) statDonors.textContent = donorCount;

        const statNgos = document.getElementById("statNgos");
        if (statNgos) statNgos.textContent = ngoCount;

        // Listings analysis
        let availableKg = 0;
        let availableCount = 0;
        let collectedKg = 0;

        (allListings || []).forEach(listing => {
            const qty = Number(listing.quantity) || 0;
            if (listing.status === "AVAILABLE") {
                availableKg += qty;
                availableCount++;
            } else if (listing.status === "COLLECTED") {
                collectedKg += qty;
            }
        });

        const statAvailableKg = document.getElementById("statAvailableKg");
        if (statAvailableKg) {
            statAvailableKg.textContent = `${availableKg.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })} kg`;
        }

        const statAvailableSub = document.getElementById("statAvailableSub");
        if (statAvailableSub) {
            statAvailableSub.textContent = `${availableCount} active surplus listing${availableCount === 1 ? "" : "s"}`;
        }

        const statRescuedKg = document.getElementById("statRescuedKg");
        if (statRescuedKg) {
            statRescuedKg.textContent = `${collectedKg.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })} kg`;
        }

        const statRescuedMeals = document.getElementById("statRescuedMeals");
        if (statRescuedMeals) {
            const meals = Math.round(collectedKg * 2.5);
            statRescuedMeals.textContent = `~${meals.toLocaleString()} meals saved`;
        }

        const availableCountBadge = document.getElementById("availableCount");
        if (availableCountBadge) {
            availableCountBadge.textContent = availableCount;
        }
    } catch (e) {
        console.warn("Could not refresh global stats:", e);
    }
}

/* --------------------------------------------------------------------------
   Directory (Donors & NGOs)
   -------------------------------------------------------------------------- */
function renderDirectory(elementId, records, label) {
    const isDonor = label === "Donor";
    const container = document.getElementById(elementId);
    if (!container) return;

    if (!records || records.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 24px; color: var(--slate-400);">
                <div style="font-size: 28px; margin-bottom: 6px;">📂</div>
                <div style="font-size: 13px;">No registered ${label.toLowerCase()}s found.</div>
            </div>`;
        return;
    }

    container.innerHTML = `
        <table class="directory-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>${label}</th>
                    <th>Contact</th>
                    <th style="text-align: right;">Action</th>
                </tr>
            </thead>
            <tbody>
                ${records.map(record => {
                    const initials = (record.name || "??")
                        .split(" ")
                        .map(n => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase();

                    return `
                        <tr>
                            <td><span style="font-weight:700; color:var(--slate-500);">#${record.id}</span></td>
                            <td>
                                <div style="display:flex; align-items:center;">
                                    <span class="entity-avatar ${isDonor ? "donor" : ""}">${initials}</span>
                                    <strong style="color:var(--slate-900); font-size:13px;">${esc(record.name)}</strong>
                                </div>
                            </td>
                            <td>
                                ${record.contact 
                                    ? `<a href="tel:${esc(record.contact)}" style="color:var(--primary); font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
                                        <span>📞</span><span>${esc(record.contact)}</span>
                                       </a>` 
                                    : `<span style="color:var(--slate-400);">-</span>`}
                            </td>
                            <td style="text-align: right;">
                                <div style="display:inline-flex; gap:6px;">
                                    <button type="button" class="small secondary" onclick="${isDonor ? "editDonor" : "editNgo"}(${record.id})">✏️ Edit</button>
                                    <button type="button" class="small danger" onclick="${isDonor ? "deleteDonor" : "deleteNgo"}(${record.id})">🗑️</button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join("")}
            </tbody>
        </table>
    `;
}

function filterDonorsLocal() {
    const query = (document.getElementById("searchDonorInput")?.value || "").toLowerCase().trim();
    if (!query) {
        renderDirectory("donorList", currentDonors, "Donor");
        return;
    }
    const filtered = currentDonors.filter(d => 
        (d.name && d.name.toLowerCase().includes(query)) ||
        (d.contact && d.contact.toLowerCase().includes(query)) ||
        String(d.id).includes(query)
    );
    renderDirectory("donorList", filtered, "Donor");
}

function filterNgosLocal() {
    const query = (document.getElementById("searchNgoInput")?.value || "").toLowerCase().trim();
    if (!query) {
        renderDirectory("ngoList", currentNgos, "NGO");
        return;
    }
    const filtered = currentNgos.filter(n => 
        (n.name && n.name.toLowerCase().includes(query)) ||
        (n.contact && n.contact.toLowerCase().includes(query)) ||
        String(n.id).includes(query)
    );
    renderDirectory("ngoList", filtered, "NGO");
}

async function loadDropdowns() {
    const [donors, ngos] = await Promise.all([
        call("/donors") || [],
        call("/ngos") || []
    ]);

    currentDonors = donors;
    currentNgos = ngos;

    const donorBadge = document.getElementById("donorCountBadge");
    if (donorBadge) donorBadge.textContent = donors.length;

    const ngoBadge = document.getElementById("ngoCountBadge");
    if (ngoBadge) ngoBadge.textContent = ngos.length;

    // Populate listing donor select
    const prevListingDonor = document.getElementById("listingDonor").value;
    document.getElementById("listingDonor").innerHTML = donors.length
        ? donors.map(donor => `<option value="${donor.id}">${esc(donor.name)}</option>`).join("")
        : `<option value="">No Donors Registered Yet</option>`;
    if (prevListingDonor && donors.some(d => String(d.id) === String(prevListingDonor))) {
        document.getElementById("listingDonor").value = prevListingDonor;
    }

    // Populate claim NGO select
    const prevClaimNgo = document.getElementById("claimNgo").value;
    document.getElementById("claimNgo").innerHTML = ngos.length
        ? ngos.map(ngo => `<option value="${ngo.id}">${esc(ngo.name)}</option>`).join("")
        : `<option value="">No NGOs Registered</option>`;
    if (prevClaimNgo && ngos.some(n => String(n.id) === String(prevClaimNgo))) {
        document.getElementById("claimNgo").value = prevClaimNgo;
    }

    // Populate modal edit donor select
    const prevEditDonor = document.getElementById("editListingDonor").value;
    document.getElementById("editListingDonor").innerHTML = donors
        .map(donor => `<option value="${donor.id}">${esc(donor.name)}</option>`).join("");
    if (prevEditDonor && donors.some(d => String(d.id) === String(prevEditDonor))) {
        document.getElementById("editListingDonor").value = prevEditDonor;
    }

    renderDirectory("donorList", donors, "Donor");
    renderDirectory("ngoList", ngos, "NGO");

    updateLivePreview();
    refreshGlobalStats();
}

function viewDonors() {
    loadDropdowns();
    showToast("Donors Refreshed", "Loaded latest donor registry.", "info");
}

function viewNgos() {
    loadDropdowns();
    showToast("NGOs Refreshed", "Loaded latest NGO partner registry.", "info");
}

async function addDonor() {
    const name = document.getElementById("donorName").value.trim();
    const contact = document.getElementById("donorContact").value.trim();
    if (!name) {
        showMsg("Donor name is required", true);
        return;
    }

    const donor = await call("/donors", "POST", { name, contact });
    if (donor) {
        showMsg(`Donor "${name}" registered successfully!`, false);
        document.getElementById("donorName").value = "";
        document.getElementById("donorContact").value = "";
        await Promise.all([loadDropdowns(), loadListings()]);
    }
}

function editDonor(id) {
    const donor = currentDonors.find(item => item.id === id);
    if (!donor) return;
    document.getElementById("editDonorId").value = donor.id;
    document.getElementById("editDonorName").value = donor.name || "";
    document.getElementById("editDonorContactValue").value = donor.contact || "";

    const modal = document.getElementById("modalDonorEditor");
    if (modal) modal.classList.remove("hidden");

    const editor = document.getElementById("donorEditor");
    if (editor) editor.classList.remove("hidden");
}

function cancelDonorEdit() {
    const modal = document.getElementById("modalDonorEditor");
    if (modal) modal.classList.add("hidden");
    const editor = document.getElementById("donorEditor");
    if (editor) editor.classList.add("hidden");
}

async function saveDonorEdit() {
    const id = document.getElementById("editDonorId").value;
    const name = document.getElementById("editDonorName").value.trim();
    const contact = document.getElementById("editDonorContactValue").value.trim();
    if (!name) {
        showMsg("Donor name is required", true);
        return;
    }
    const result = await call(`/donors/${id}`, "PUT", { name, contact });
    if (result) {
        showMsg(`Donor "${name}" updated successfully`, false);
        cancelDonorEdit();
        await Promise.all([loadDropdowns(), loadListings()]);
    }
}

async function deleteDonor(id) {
    if (!confirm("Are you sure you want to delete this donor? Donors with active food listings cannot be removed.")) return;
    const result = await call(`/donors/${id}`, "DELETE");
    if (result !== null) {
        showMsg("Donor removed from registry", false);
        if (document.getElementById("editDonorId").value === String(id)) {
            cancelDonorEdit();
        }
        await Promise.all([loadDropdowns(), loadListings()]);
    }
}

async function addNgo() {
    const name = document.getElementById("ngoName").value.trim();
    const contact = document.getElementById("ngoContact").value.trim();
    if (!name) {
        showMsg("NGO name is required", true);
        return;
    }

    const ngo = await call("/ngos", "POST", { name, contact });
    if (ngo) {
        showMsg(`NGO "${name}" registered successfully!`, false);
        document.getElementById("ngoName").value = "";
        document.getElementById("ngoContact").value = "";
        await Promise.all([loadDropdowns(), loadListings()]);
    }
}

function editNgo(id) {
    const ngo = currentNgos.find(item => item.id === id);
    if (!ngo) return;
    document.getElementById("editNgoId").value = ngo.id;
    document.getElementById("editNgoNameValue").value = ngo.name || "";
    document.getElementById("editNgoContactValue").value = ngo.contact || "";

    const modal = document.getElementById("modalNgoEditor");
    if (modal) modal.classList.remove("hidden");

    const editor = document.getElementById("ngoEditor");
    if (editor) editor.classList.remove("hidden");
}

function cancelNgoEdit() {
    const modal = document.getElementById("modalNgoEditor");
    if (modal) modal.classList.add("hidden");
    const editor = document.getElementById("ngoEditor");
    if (editor) editor.classList.add("hidden");
}

async function saveNgoEdit() {
    const id = document.getElementById("editNgoId").value;
    const name = document.getElementById("editNgoNameValue").value.trim();
    const contact = document.getElementById("editNgoContactValue").value.trim();
    if (!name) {
        showMsg("NGO name is required", true);
        return;
    }
    const result = await call(`/ngos/${id}`, "PUT", { name, contact });
    if (result) {
        showMsg(`NGO "${name}" updated successfully`, false);
        cancelNgoEdit();
        await Promise.all([loadDropdowns(), loadListings()]);
    }
}

async function deleteNgo(id) {
    if (!confirm("Are you sure you want to delete this NGO? NGOs with active or historical claims cannot be removed.")) return;
    const result = await call(`/ngos/${id}`, "DELETE");
    if (result !== null) {
        showMsg("NGO removed from registry", false);
        if (document.getElementById("editNgoId").value === String(id)) {
            cancelNgoEdit();
        }
        await Promise.all([loadDropdowns(), loadListings()]);
    }
}

/* --------------------------------------------------------------------------
   Panel: List Surplus Food Helpers & Presets
   -------------------------------------------------------------------------- */
function applyFoodPreset(presetName) {
    const cleanName = presetName.replace(/[^\w\s/&]/gi, "").trim();
    const input = document.getElementById("foodType");
    if (input) {
        input.value = cleanName;
        updateLivePreview();
    }
}

function adjustQuantity(delta) {
    const input = document.getElementById("quantity");
    if (input) {
        const cur = Number(input.value) || 0;
        input.value = Math.max(0.1, Number((cur + delta).toFixed(1)));
        updateLivePreview();
    }
}

function formatLocalDateForInput(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${mins}`;
}

function applyExpiryHours(hours) {
    const date = new Date(Date.now() + hours * 60 * 60 * 1000);
    const input = document.getElementById("safeUntil");
    if (input) {
        input.value = formatLocalDateForInput(date);
        updateLivePreview();
    }
}

function applyExpiryTonight() {
    const date = new Date();
    date.setHours(23, 0, 0, 0);
    // If already past 23:00, push to tomorrow night
    if (date.getTime() <= Date.now()) {
        date.setDate(date.getDate() + 1);
    }
    const input = document.getElementById("safeUntil");
    if (input) {
        input.value = formatLocalDateForInput(date);
        updateLivePreview();
    }
}

function applyExpiryTomorrowNoon() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(12, 0, 0, 0);
    const input = document.getElementById("safeUntil");
    if (input) {
        input.value = formatLocalDateForInput(date);
        updateLivePreview();
    }
}

function updateLivePreview() {
    const donorSelect = document.getElementById("listingDonor");
    const foodType = document.getElementById("foodType")?.value || "";
    const quantity = document.getElementById("quantity")?.value || "0";
    const safeUntil = document.getElementById("safeUntil")?.value || "";

    const selectedDonorId = donorSelect ? Number(donorSelect.value) : null;
    const donor = currentDonors.find(d => d.id === selectedDonorId);

    // Update Preview Elements
    const titleEl = document.getElementById("previewFoodTitle");
    if (titleEl) titleEl.textContent = foodType.trim() || "Surplus Food Item";

    const iconEl = document.getElementById("previewFoodIcon");
    if (iconEl) iconEl.textContent = getFoodIcon(foodType);

    const qtyEl = document.getElementById("previewQtyBadge");
    if (qtyEl) qtyEl.textContent = `${Number(quantity || 0).toFixed(1)} kg`;

    const donorEl = document.getElementById("previewDonorName");
    if (donorEl) donorEl.textContent = donor ? donor.name : "Select Donor";

    const phoneEl = document.getElementById("previewDonorPhone");
    if (phoneEl) phoneEl.textContent = (donor && donor.contact) ? donor.contact : "-";

    const expiryTagEl = document.getElementById("previewExpiryTag");
    if (expiryTagEl) {
        const meta = getExpiryMeta(safeUntil);
        expiryTagEl.textContent = meta.text;
        expiryTagEl.className = `expiry-tag ${meta.statusClass}`;
    }

    const mealsEl = document.getElementById("previewImpactMeals");
    if (mealsEl) {
        const meals = Math.round(Number(quantity || 0) * 2.5);
        mealsEl.textContent = `~${meals} meals saved`;
    }
}

async function addListing() {
    const donorId = Number(document.getElementById("listingDonor").value);
    const foodType = document.getElementById("foodType").value.trim();
    const quantity = Number(document.getElementById("quantity").value);
    const safeUntil = document.getElementById("safeUntil").value;

    if (!donorId) {
        showMsg("Please register and select a donating organization first.", true);
        activateTab("directory");
        return;
    }
    if (!foodType) {
        showMsg("Food item description is required", true);
        return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
        showMsg("Quantity must be a positive number", true);
        return;
    }
    if (!safeUntil) {
        showMsg("Please specify safe until expiration time", true);
        return;
    }

    const result = await call("/listings", "POST", {
        donorId,
        foodType,
        quantity,
        safeUntil
    });

    if (result) {
        showMsg(`🎉 "${foodType}" (${quantity} kg) published to marketplace!`, false);
        // Reset form
        document.getElementById("foodType").value = "";
        document.getElementById("quantity").value = "";
        document.getElementById("safeUntil").value = "";
        updateLivePreview();
        activateTab("listings");
    }
}

/* --------------------------------------------------------------------------
   Panel: Listings Marketplace
   -------------------------------------------------------------------------- */
function switchListingView(viewMode) {
    activeView = viewMode;
    localStorage.setItem(VIEW_STORAGE_KEY, viewMode);

    const btnCards = document.getElementById("btnViewCards");
    const btnTable = document.getElementById("btnViewTable");
    const cardsContainer = document.getElementById("listingCardsContainer");
    const tableContainer = document.getElementById("listingTableContainer");

    if (btnCards) btnCards.classList.toggle("active", viewMode === "cards");
    if (btnTable) btnTable.classList.toggle("active", viewMode === "table");

    if (cardsContainer) cardsContainer.classList.toggle("hidden", viewMode !== "cards");
    if (tableContainer) tableContainer.classList.toggle("hidden", viewMode !== "table");
}

function setStatusFilter(status) {
    activeStatusFilter = status;
    document.querySelectorAll(".filter-pill").forEach(pill => {
        pill.classList.toggle("active", pill.dataset.filter === status);
    });
    renderListingsView();
}

function filterListingsLocal() {
    renderListingsView();
}

async function loadListings() {
    const sortBy = document.getElementById("sortBy") ? document.getElementById("sortBy").value : "safeUntil";
    const [list, allListings] = await Promise.all([
        call(`/listings?page=${page}&size=${PAGE_SIZE}&sortBy=${sortBy}`),
        call(`/listings?page=0&size=10000&sortBy=id`)
    ]);

    currentListings = list || [];
    allLoadedListings = allListings || [];
    lastCount = currentListings.length;

    const available = (allLoadedListings || []).filter(listing => listing.status === "AVAILABLE").length;
    const availableCountEl = document.getElementById("availableCount");
    if (availableCountEl) availableCountEl.textContent = available;

    const pageInfo = document.getElementById("pageInfo");
    if (pageInfo) pageInfo.textContent = `Page ${page + 1}`;

    renderListingsView();
    refreshGlobalStats();

    // Preserve open modal sync
    const openListingId = Number(document.getElementById("editListingId")?.value);
    const modalListing = document.getElementById("modalListingEditor");
    if (openListingId && modalListing && !modalListing.classList.contains("hidden")) {
        const updatedCurrent = currentListings.find(item => item.id === openListingId);
        if (updatedCurrent) {
            document.getElementById("editNgoName").value = updatedCurrent.ngoName || "Not claimed";
            document.getElementById("editNgoContact").value = updatedCurrent.ngoContact || "";
            document.getElementById("editDonorContact").value = updatedCurrent.donorContact || "";
        }
    }
}

function renderListingsView() {
    const searchQuery = (document.getElementById("listingSearch")?.value || "").toLowerCase().trim();
    
    // Filter listings based on search and status pills
    let displayList = currentListings.filter(item => {
        if (activeStatusFilter !== "ALL" && item.status !== activeStatusFilter) {
            return false;
        }
        if (!searchQuery) return true;
        return (
            (item.foodType && item.foodType.toLowerCase().includes(searchQuery)) ||
            (item.donorName && item.donorName.toLowerCase().includes(searchQuery)) ||
            (item.ngoName && item.ngoName.toLowerCase().includes(searchQuery)) ||
            String(item.id).includes(searchQuery)
        );
    });

    const emptyState = document.getElementById("emptyListingsState");
    const cardsContainer = document.getElementById("listingCardsContainer");
    const tableBody = document.getElementById("listingBody");

    if (displayList.length === 0) {
        if (emptyState) emptyState.classList.remove("hidden");
        if (cardsContainer) cardsContainer.innerHTML = "";
        if (tableBody) tableBody.innerHTML = "";
        return;
    }

    if (emptyState) emptyState.classList.add("hidden");

    // 1. Render Card Grid
    if (cardsContainer) {
        cardsContainer.innerHTML = displayList.map(listing => {
            const expiry = getExpiryMeta(listing.safeUntil);
            const foodIcon = getFoodIcon(listing.foodType);

            return `
                <div class="food-card">
                    <div class="food-card-header">
                        <div class="food-type-title">
                            <div class="food-icon-circle">${foodIcon}</div>
                            <div>
                                <span style="display:block;">${esc(listing.foodType)}</span>
                                <span style="font-size:11px; font-weight:600; color:var(--slate-400);">#${listing.id}</span>
                            </div>
                        </div>
                        <span class="qty-badge">${listing.quantity} kg</span>
                    </div>

                    <div class="food-card-details">
                        <div class="detail-row">
                            <span>Donor:</span>
                            <strong>${esc(listing.donorName)}</strong>
                        </div>
                        <div class="detail-row">
                            <span>Donor Phone:</span>
                            ${listing.donorContact 
                                ? `<a href="tel:${esc(listing.donorContact)}" style="color:var(--primary); font-weight:600; text-decoration:none;">📞 ${esc(listing.donorContact)}</a>` 
                                : `<span>-</span>`}
                        </div>
                        <div class="detail-row">
                            <span>Safe Until:</span>
                            <span class="expiry-tag ${expiry.statusClass}">${expiry.text}</span>
                        </div>
                        <div class="detail-row">
                            <span>Claim Status:</span>
                            <span class="tag ${listing.status}">● ${listing.status}</span>
                        </div>
                        ${listing.ngoName ? `
                            <div class="detail-row" style="border-top:1px dashed var(--slate-200); padding-top:6px; margin-top:2px;">
                                <span>NGO:</span>
                                <strong style="color:var(--info);">${esc(listing.ngoName)}</strong>
                            </div>
                            ${listing.ngoContact ? `
                                <div class="detail-row">
                                    <span>NGO Phone:</span>
                                    <a href="tel:${esc(listing.ngoContact)}" style="color:var(--info); font-weight:600; text-decoration:none;">📞 ${esc(listing.ngoContact)}</a>
                                </div>
                            ` : ""}
                        ` : ""}
                    </div>

                    <div class="food-card-actions">
                        ${listing.status === "AVAILABLE" ? `
                            <button type="button" class="main-action" onclick="claim(${listing.id})" title="Claim as selected NGO">
                                🤝 Claim
                            </button>
                        ` : ""}
                        ${listing.status === "CLAIMED" ? `
                            <button type="button" class="main-action" style="background:#2563eb;" onclick="collect(${listing.id})" title="Confirm pickup & distribution">
                                ✓ Mark Collected
                            </button>
                        ` : ""}
                        ${listing.status === "COLLECTED" ? `
                            <span style="font-size:12px; font-weight:700; color:#1d4ed8; display:flex; align-items:center; gap:4px;">
                                <span>🎉</span> Collected
                            </span>
                        ` : ""}
                        ${listing.status === "EXPIRED" ? `
                            <span style="font-size:12px; font-weight:700; color:var(--slate-500);">
                                ⌛ Expired
                            </span>
                        ` : ""}

                        <div style="display:flex; gap:6px;">
                            <button type="button" class="small secondary" onclick="editListing(${listing.id})" title="Edit listing">✏️</button>
                            <button type="button" class="small danger" onclick="deleteListing(${listing.id})" title="Delete listing">🗑️</button>
                        </div>
                    </div>
                </div>
            `;
        }).join("");
    }

    // 2. Render Table View (Preserved for compatibility and power users)
    if (tableBody) {
        tableBody.innerHTML = displayList.map(listing => `
            <tr>
                <td><span style="font-weight:700; color:var(--slate-500);">#${listing.id}</span></td>
                <td><strong>${esc(listing.donorName)}</strong></td>
                <td>${esc(listing.donorContact) || "-"}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span>${getFoodIcon(listing.foodType)}</span>
                        <strong>${esc(listing.foodType)}</strong>
                    </div>
                </td>
                <td><span class="qty-badge" style="font-size:11px; padding:2px 8px;">${listing.quantity} kg</span></td>
                <td>${listing.safeUntil.replace("T", " ")}</td>
                <td>${listing.ngoName ? `<strong style="color:var(--info);">${esc(listing.ngoName)}</strong>` : `<span style="color:var(--slate-400);">Not claimed</span>`}</td>
                <td>${esc(listing.ngoContact) || "-"}</td>
                <td><span class="tag ${listing.status}">● ${listing.status}</span></td>
                <td class="actions">
                    <button class="small secondary" onclick="editListing(${listing.id})">Edit</button>
                    ${listing.status === "AVAILABLE" ? `<button class="small" onclick="claim(${listing.id})">Claim</button>` : ""}
                    ${listing.status === "CLAIMED" ? `<button class="small" style="background:#2563eb;" onclick="collect(${listing.id})">Collect</button>` : ""}
                    <button class="small danger" onclick="deleteListing(${listing.id})">Delete</button>
                </td>
            </tr>
        `).join("");
    }

    switchListingView(activeView);
}

function editListing(id) {
    const listing = currentListings.find(item => item.id === id);
    if (!listing) return;

    document.getElementById("editListingId").value = listing.id;
    document.getElementById("editListingDonor").value = listing.donorId;
    document.getElementById("editDonorContact").value = listing.donorContact || "";
    document.getElementById("editNgoName").value = listing.ngoName || "Not claimed";
    document.getElementById("editNgoContact").value = listing.ngoContact || "";
    document.getElementById("editFoodType").value = listing.foodType || "";
    document.getElementById("editQuantity").value = listing.quantity;
    document.getElementById("editSafeUntil").value = listing.safeUntil;

    const modal = document.getElementById("modalListingEditor");
    if (modal) modal.classList.remove("hidden");

    const editor = document.getElementById("listingEditor");
    if (editor) editor.classList.remove("hidden");
}

function updateEditDonorContact() {
    const donor = currentDonors.find(item => item.id === Number(document.getElementById("editListingDonor").value));
    const phoneInput = document.getElementById("editDonorContact");
    if (phoneInput) {
        phoneInput.value = donor?.contact || "";
    }
}

async function saveListingEdit() {
    const id = document.getElementById("editListingId").value;
    const foodType = document.getElementById("editFoodType").value.trim();
    const quantity = Number(document.getElementById("editQuantity").value);
    const safeUntil = document.getElementById("editSafeUntil").value;

    if (!foodType) { showMsg("Food type is required", true); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { showMsg("Quantity must be a positive number", true); return; }
    if (!safeUntil) { showMsg("Safe until expiry time is required", true); return; }

    const result = await call(`/listings/${id}`, "PUT", {
        donorId: Number(document.getElementById("editListingDonor").value),
        foodType,
        quantity,
        safeUntil
    });

    if (result) {
        showMsg(`Food listing #${id} updated successfully!`, false);
        cancelListingEdit();
        await Promise.all([loadListings(), loadDropdowns()]);
    }
}

function cancelListingEdit() {
    const modal = document.getElementById("modalListingEditor");
    if (modal) modal.classList.add("hidden");
    const editor = document.getElementById("listingEditor");
    if (editor) editor.classList.add("hidden");
}

async function deleteListing(id) {
    if (!confirm("Delete this food listing and all its associated claims?")) return;
    const result = await call(`/listings/${id}`, "DELETE");
    if (result !== null) {
        showMsg(`Listing #${id} deleted from network`, false);
        await Promise.all([loadListings(), loadDropdowns()]);
    }
}

function prevPage() {
    if (page > 0) {
        page--;
        loadListings();
    }
}

function nextPage() {
    if (lastCount === PAGE_SIZE) {
        page++;
        loadListings();
    }
}

async function claim(id) {
    const ngoSelect = document.getElementById("claimNgo");
    const ngoId = Number(ngoSelect?.value) || null;

    if (!ngoId) {
        showMsg("Please register and select an NGO to claim surplus food.", true);
        activateTab("directory");
        return;
    }

    const ngoName = ngoSelect.options[ngoSelect.selectedIndex]?.text || "NGO";
    const result = await call(`/listings/${id}/claim`, "POST", { ngoId });
    if (result) {
        showMsg(`Listing #${id} claimed on behalf of "${ngoName}"!`, false);
        await loadListings();
    }
}

async function collect(id) {
    const result = await call(`/listings/${id}/collect`, "PUT");
    if (result) {
        showMsg(`Food listing #${id} marked as successfully collected & redistributed!`, false);
        await loadListings();
        if (!document.getElementById("panel-report").hidden) {
            await loadReport();
        }
    }
}

/* --------------------------------------------------------------------------
   Panel: Monthly Impact Analytics
   -------------------------------------------------------------------------- */
async function loadReport() {
    ensureCurrentMonth();
    const value = document.getElementById("month").value;
    if (!value) { showMsg("Please select a valid month", true); return; }

    const [year, month] = value.split("-");
    const result = await call(`/reports/monthly?year=${year}&month=${Number(month)}`);

    if (result) {
        const kg = Number(result.totalFoodDivertedKg || 0);
        const reportEl = document.getElementById("report");
        if (reportEl) {
            reportEl.textContent = `${kg.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })} kg`;
        }

        const count = result.collectedCount != null ? result.collectedCount : (result.listings ? result.listings.length : 0);
        const dateObj = new Date(Number(year), Number(month) - 1, 1);
        const monthName = dateObj.toLocaleString("default", { month: "long" });

        const summaryEl = document.getElementById("reportSummary");
        if (summaryEl) {
            summaryEl.textContent = count > 0
                ? `${count} donation${count === 1 ? "" : "s"} successfully collected and distributed in ${monthName} ${year}`
                : `No food collections recorded yet in ${monthName} ${year}.`;
        }

        // Environmental & Social Impact Cards
        const repMeals = document.getElementById("repMeals");
        if (repMeals) repMeals.textContent = Math.round(kg * 2.5).toLocaleString();

        const repCo2 = document.getElementById("repCo2");
        if (repCo2) repCo2.textContent = `${(kg * 2.5).toFixed(1)} kg`;

        const repCollections = document.getElementById("repCollections");
        if (repCollections) repCollections.textContent = count;

        const listingsWrap = document.getElementById("reportListings");
        if (listingsWrap) {
            if (result.listings && result.listings.length > 0) {
                listingsWrap.innerHTML = `
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Donor</th>
                                <th>Food Item</th>
                                <th>Quantity</th>
                                <th>Distributed By</th>
                                <th>NGO Phone</th>
                                <th>Collected Timestamp</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${result.listings.map(item => `
                                <tr>
                                    <td><span style="font-weight:700; color:var(--slate-500);">#${item.id}</span></td>
                                    <td><strong>${esc(item.donorName)}</strong></td>
                                    <td>
                                        <div style="display:flex; align-items:center; gap:6px;">
                                            <span>${getFoodIcon(item.foodType)}</span>
                                            <strong>${esc(item.foodType)}</strong>
                                        </div>
                                    </td>
                                    <td><span class="qty-badge" style="font-size:11px; padding:2px 8px;">${item.quantity} kg</span></td>
                                    <td><strong style="color:var(--info);">${esc(item.ngoName) || "-"}</strong></td>
                                    <td>${esc(item.ngoContact) || "-"}</td>
                                    <td>${item.collectedAt ? item.collectedAt.replace("T", " ") : "-"}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                `;
            } else {
                listingsWrap.innerHTML = `
                    <div class="empty-state" style="border:none; padding:32px 16px;">
                        <div class="empty-state-icon">📊</div>
                        <h3>No Rescues In This Month</h3>
                        <p>No food collections were marked as collected in ${monthName} ${year}.</p>
                    </div>
                `;
            }
        }
    }
}

/* --------------------------------------------------------------------------
   Event Listeners & Initialization
   -------------------------------------------------------------------------- */
document.getElementById("tabBar")?.addEventListener("click", event => {
    const tab = event.target.closest("[data-tab]");
    if (tab) activateTab(tab.dataset.tab);
});

document.getElementById("sortBy")?.addEventListener("change", () => {
    page = 0;
    loadListings();
});

document.getElementById("editListingDonor")?.addEventListener("change", updateEditDonorContact);

// Close modals on Escape key
document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        cancelListingEdit();
        cancelDonorEdit();
        cancelNgoEdit();
    }
});

// App Startup
ensureCurrentMonth();
loadDropdowns();
loadListings();
activateTab(sessionStorage.getItem(TAB_STORAGE_KEY) || "listings", false);

// Background refresh every 30 seconds
setInterval(() => {
    loadListings();
    refreshGlobalStats();
}, 30000);

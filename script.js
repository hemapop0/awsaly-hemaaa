// =====================================
// أوصلي - Report System
// الموقع -> Cloudinary (الصور) + Google Apps Script (تسجيل + Telegram)
// =====================================

// رابط الـ Web App من Google Apps Script (بينتهي بـ /exec)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxmGd5TQr4pfrtAXsgLSAs7Jfr7Q0vkDtL57y6-75dlESj_4e-WrgA_rgHF6cN9hkrQ/exec";

// إعدادات Cloudinary
const CLOUD_NAME = "fi1tfnpe";
const UPLOAD_PRESET = "awsally_upload";

// حدود الصور
const MAX_IMAGES = 8;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

// بيانات السيارة
const carModel = "Chevrolet Cruze";
const plateNumber = "وه - ٥٧٩٤";

// عناصر HTML
const form = document.getElementById("requestForm");
const description = document.getElementById("description");
const phoneInput = document.getElementById("phone");
const sendWhatsApp = document.getElementById("sendWhatsApp"); // زرار الإرسال
const imagesInput = document.getElementById("images");
const cameraInput = document.getElementById("cameraInput");
const imagePreview = document.getElementById("imagePreview");
const successSection = document.getElementById("successSection");
const newReportBtn = document.getElementById("newReport");

const defaultButtonText = sendWhatsApp.textContent.trim();

function isConfigured() {
    return APPS_SCRIPT_URL.startsWith("https://script.google.com/");
}


// =====================================
// معلومات الجهاز
// =====================================

async function getDeviceInfo() {

    const ua = navigator.userAgent || "";
    let model = "";
    let platformVersion = "";

    // كروم على أندرويد بيخبي الموديل في الـ UA، فبنطلبه بالطريقة دي (بتشتغل على https بس)
    try {
        if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
            const h = await navigator.userAgentData.getHighEntropyValues(
                ["model", "platformVersion"]
            );
            model = h.model || "";
            platformVersion = h.platformVersion || "";
        }
    } catch (e) { /* مش مشكلة */ }

    let device = "غير معروف";
    let m;

    if (/iPhone/.test(ua)) {
        m = ua.match(/OS (\d+)[_.](\d+)/);
        device = "iPhone" + (m ? ` (iOS ${m[1]}.${m[2]})` : "");
    } else if (/iPad/.test(ua)) {
        m = ua.match(/OS (\d+)[_.](\d+)/);
        device = "iPad" + (m ? ` (iOS ${m[1]}.${m[2]})` : "");
    } else if (/Android/.test(ua)) {
        if (!model) {
            m = ua.match(/Android [\d.]+;\s*([^;)]+)/);
            model = m ? m[1].trim() : "";
        }
        if (model === "K") model = ""; // قيمة وهمية بيحطها كروم
        const ver = platformVersion
            ? platformVersion.split(".")[0]
            : ((ua.match(/Android ([\d.]+)/) || [])[1] || "");
        device = "Android" + (model ? " " + model : "") + (ver ? ` (Android ${ver})` : "");
    } else if (/Windows/.test(ua)) {
        device = "Windows PC";
    } else if (/Macintosh|Mac OS X/.test(ua)) {
        device = "Mac";
    } else if (/CrOS/.test(ua)) {
        device = "Chromebook";
    } else if (/Linux/.test(ua)) {
        device = "Linux";
    }

    let browser = "غير معروف";
    if (/Instagram/.test(ua)) browser = "Instagram (داخل التطبيق)";
    else if (/FBAN|FBAV/.test(ua)) browser = "Facebook (داخل التطبيق)";
    else if (/Edg\//.test(ua)) browser = "Edge";
    else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
    else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
    else if (/Firefox|FxiOS/.test(ua)) browser = "Firefox";
    else if (/CriOS|Chrome/.test(ua)) browser = "Chrome";
    else if (/Safari/.test(ua)) browser = "Safari";

    return {
        device: device,
        browser: browser,
        screen: `${screen.width}x${screen.height}`,
        lang: navigator.language || "",
        ua: ua.slice(0, 300)
    };

}


// =====================================
// تسجيل الزيارة (مرة واحدة في كل جلسة)
// =====================================

async function logVisit() {

    if (!isConfigured()) return;

    try {
        if (sessionStorage.getItem("awsally_visit")) return;
    } catch (e) { /* مش مشكلة */ }

    try {

        const info = await getDeviceInfo();

        await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify({ type: "visit", ...info })
        });

        try {
            sessionStorage.setItem("awsally_visit", "1");
        } catch (e) { /* مش مشكلة */ }

    } catch (e) { /* التسجيل ما يوقفش الموقع */ }

}

logVisit();


// =====================================
// حفظ مؤقت للبيانات (لو الصفحة اتعملها ريفرش بعد الكاميرا)
// =====================================

const DRAFT_KEY = "awsally_draft";

function saveDraft() {
    try {
        const p = document.querySelector('input[name="problem"]:checked');
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
            problem: p ? p.value : "",
            description: description.value,
            phone: phoneInput.value
        }));
    } catch (e) { /* مش مشكلة */ }
}

function restoreDraft() {
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (!raw) return;
        const d = JSON.parse(raw);

        description.value = d.description || "";
        phoneInput.value = d.phone || "";

        if (d.problem) {
            const radio = Array.from(
                document.querySelectorAll('input[name="problem"]')
            ).find((r) => r.value === d.problem);
            if (radio) radio.checked = true;
        }
    } catch (e) { /* مش مشكلة */ }
}

function clearDraft() {
    try {
        sessionStorage.removeItem(DRAFT_KEY);
    } catch (e) { /* مش مشكلة */ }
}

restoreDraft();
form.addEventListener("input", saveDraft);
form.addEventListener("change", saveDraft);


// =====================================
// الصور المختارة + المعاينة
// =====================================

let selectedFiles = [];
let previewUrls = [];

function renderPreview() {

    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];

    imagePreview.innerHTML = "";

    selectedFiles.forEach(function (file, index) {

        const url = URL.createObjectURL(file);
        previewUrls.push(url);

        const item = document.createElement("div");
        item.className = "preview-item";

        const img = document.createElement("img");
        img.src = url;
        img.alt = "صورة المشكلة";

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "remove-image";
        removeBtn.textContent = "✕";
        removeBtn.setAttribute("aria-label", "حذف الصورة");

        removeBtn.addEventListener("click", function () {
            selectedFiles.splice(index, 1);
            renderPreview();
        });

        item.appendChild(img);
        item.appendChild(removeBtn);
        imagePreview.appendChild(item);

    });

}

function addFiles(input) {

    // ملفات فاضية (بتحصل أحيانًا مع الكاميرا) نتجاهلها
    const newFiles = Array.from(input.files || []).filter((f) => f.size > 0);

    if (newFiles.length === 0) return;

    const freeSlots = Math.max(MAX_IMAGES - selectedFiles.length, 0);

    if (newFiles.length > freeSlots) {
        alert(`أقصى عدد للصور هو ${MAX_IMAGES}. تم إضافة ${freeSlots} فقط.`);
    }

    selectedFiles = selectedFiles.concat(newFiles.slice(0, freeSlots));

    renderPreview();

}

// بنفضّي الـ input قبل فتح الاختيار (مش بعد الاختيار)
// علشان نقدر نختار نفس الصورة تاني، من غير ما نمسح الملف اللي لسه واخدينه
imagesInput.addEventListener("click", () => { imagesInput.value = ""; });
cameraInput.addEventListener("click", () => { cameraInput.value = ""; });

imagesInput.addEventListener("change", () => addFiles(imagesInput));
cameraInput.addEventListener("change", () => addFiles(cameraInput));


// =====================================
// ضغط الصورة قبل الرفع
// =====================================

function compressImage(file) {

    return new Promise(function (resolve) {

        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = function () {

            URL.revokeObjectURL(url);

            let { width, height } = img;
            const ratio = Math.min(1, MAX_DIMENSION / Math.max(width, height));

            width = Math.round(width * ratio);
            height = Math.round(height * ratio);

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            canvas.getContext("2d").drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => resolve(blob || file),
                "image/jpeg",
                JPEG_QUALITY
            );

        };

        img.onerror = function () {
            URL.revokeObjectURL(url);
            resolve(file);
        };

        img.src = url;

    });

}


// =====================================
// رفع صورة على Cloudinary
// =====================================

async function uploadImage(file) {

    const blob = await compressImage(file);

    const formData = new FormData();
    formData.append("file", blob);
    formData.append("upload_preset", UPLOAD_PRESET);

    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const reason = (data.error && data.error.message) || ("HTTP " + response.status);
        throw new Error(reason);
    }

    return data.secure_url;

}


// =====================================
// أدوات الرقم
// =====================================

function normalizePhone(value) {

    let p = value
        .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))   // أرقام عربية
        .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))   // أرقام فارسية
        .replace(/[\s\-().]/g, "");

    if (p.startsWith("+20")) p = "0" + p.slice(3);
    else if (p.startsWith("0020")) p = "0" + p.slice(4);
    else if (/^20\d{10}$/.test(p)) p = "0" + p.slice(2);

    return p;

}

function newRequestId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}


// =====================================
// إرسال البلاغ
// =====================================

let currentRequestId = newRequestId();

sendWhatsApp.addEventListener("click", async function () {

    if (!isConfigured()) {
        alert("رابط الإرسال لسه متظبطش في ملف script.js");
        return;
    }

    const selectedProblem = document.querySelector(
        'input[name="problem"]:checked'
    );

    if (!selectedProblem) {
        alert("من فضلك اختار نوع المشكلة");
        return;
    }

    const phone = normalizePhone(phoneInput.value);

    if (!/^01[0125]\d{8}$/.test(phone)) {
        alert("من فضلك اكتب رقم تليفون مصري صحيح (مثال: 01012345678)");
        phoneInput.focus();
        return;
    }

    sendWhatsApp.disabled = true;

    try {

        // 1) رفع الصور
        let imageLinks = [];

        if (selectedFiles.length > 0) {

            sendWhatsApp.textContent = "⏳ جاري رفع الصور...";

            try {
                imageLinks = await Promise.all(
                    selectedFiles.slice(0, MAX_IMAGES).map(uploadImage)
                );
            } catch (error) {
                console.error(error);
                alert("حصلت مشكلة أثناء رفع الصور.\n\nالسبب: " + error.message);
                return;
            }

        }

        // 2) إرسال البلاغ
        sendWhatsApp.textContent = "⏳ جاري إرسال البلاغ...";

        const info = await getDeviceInfo();

        let result;

        try {

            const response = await fetch(APPS_SCRIPT_URL, {
                method: "POST",
                body: JSON.stringify({
                    type: "report",
                    rid: currentRequestId,
                    problem: selectedProblem.value,
                    description: description.value.trim(),
                    phone: phone,
                    car: carModel,
                    plate: plateNumber,
                    images: imageLinks,
                    device: info.device,
                    browser: info.browser
                })
            });

            result = await response.json();

        } catch (error) {
            console.error(error);
            alert("تعذر إرسال البلاغ. اتأكد من النت وجرب تاني.");
            return;
        }

        if (!result || !result.ok) {
            alert((result && result.error) || "حصلت مشكلة أثناء إرسال البلاغ، جرب تاني.");
            return;
        }

        // 3) نجح
        clearDraft();
        form.classList.add("hidden");
        successSection.classList.remove("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });

    } finally {

        sendWhatsApp.disabled = false;
        sendWhatsApp.textContent = defaultButtonText;

    }

});


// بلاغ جديد
newReportBtn.addEventListener("click", function () {

    selectedFiles = [];
    renderPreview();

    form.reset();
    currentRequestId = newRequestId();

    successSection.classList.add("hidden");
    form.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });

});
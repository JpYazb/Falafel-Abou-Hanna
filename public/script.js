// Title + Reviews fade in
window.onload = function () {
  const title = document.getElementById("title");
  if (title) title.style.top = "35%";

  const reviewsSection = document.getElementById("reviewsSection");
  if (reviewsSection) {
    setTimeout(() => { reviewsSection.style.opacity = "1"; }, 2000);
  }
};

// --- Sidebar ---
function toggleMainMenu() {
  const sidebar = document.getElementById("sidebar");
  const isOpen = sidebar.style.width === "250px";
  if (isOpen) {
    sidebar.style.width = "0";
    document.removeEventListener("click", closeSidebarOnClickOutside);
  } else {
    closeAllPanels();
    sidebar.style.width = "250px";
    setTimeout(() => document.addEventListener("click", closeSidebarOnClickOutside), 0);
  }
}

function closeSidebarOnClickOutside(e) {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar.contains(e.target) && !e.target.closest("#detailsBtn")) {
    sidebar.style.width = "0";
    document.removeEventListener("click", closeSidebarOnClickOutside);
  }
}

// --- Hours ---
function toggleHours() {
  const hoursSection = document.getElementById("hours");
  const items = document.querySelectorAll(".hours li");

  if (hoursSection.classList.contains("open")) {
    items.forEach((item, index) => {
      setTimeout(() => {
        item.style.transform = "translateX(100%)";
        item.style.opacity = "0";
      }, index * 100);
    });
    setTimeout(() => hoursSection.classList.remove("open"), 450);

    document.removeEventListener("click", closeHoursOnClickOutside);
  } else {
    hoursSection.classList.add("open");
    requestAnimationFrame(() => {
      items.forEach((item, index) => {
        setTimeout(() => {
          item.style.transform = "translateX(0)";
          item.style.opacity = "1";
        }, index * 100);
      });
    });

    setTimeout(() => document.addEventListener("click", closeHoursOnClickOutside), 0);
  }
}

function closeHoursOnClickOutside(e) {
  const hours = document.getElementById("hours");
  if (!hours || !hours.classList.contains("open")) {
    document.removeEventListener("click", closeHoursOnClickOutside);
    return;
  }

  // If the click is inside the hours panel or on the button that opens it, ignore
  if (hours.contains(e.target) || e.target.closest("#hoursBtn")) return;

  // Otherwise, close the hours panel
  toggleHours();
  document.removeEventListener("click", closeHoursOnClickOutside);
}


// --- Contact ---
function openContact() {
  document.getElementById("contact").style.display = "block";
}
function closeContact() {
  document.getElementById("contact").style.display = "none";
}

// --- Menu ---
function toggleMenu() {
  const menuPage = document.getElementById("menuPage");
  menuPage.classList.remove("open");
  menuPage.style.transform = "";
  menuPage.scrollTop = 0;
  document.body.classList.remove("menu-open");
}

// --- Close-all helper ---
function closeAllPanels() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.style.width = "0";

  const hours = document.getElementById("hours");
  if (hours) {
    hours.classList.remove("open");
    document.querySelectorAll(".hours li").forEach(li => {
      li.style.transform = "translateX(100%)";
      li.style.opacity = "0";
    });
  }

  const contact = document.getElementById("contact");
  if (contact) contact.style.display = "none";

  const menuPage = document.getElementById("menuPage");
  if (menuPage) {
    menuPage.classList.remove("open");
    menuPage.style.transform = "";
    menuPage.scrollTop = 0;
  }

  document.body.classList.remove("menu-open");
}

// --- Reviews ---
async function loadReviews() {
  try {
    const res = await fetch("/reviews");
    const reviews = await res.json();

    const container = document.querySelector(".reviews-container");
    if (!container) return;

    container.innerHTML = "";

    reviews.forEach(r => {
      const bubble = document.createElement("div");
      bubble.className = "review-bubble";

      const full = Math.round(r.rating || 0);
      const stars = "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);

      bubble.innerHTML = `
        <div class="review-stars">${stars}</div>
        <p class="review-text">"${r.text || ""}"</p>
        <p class="review-author">- ${r.author_name || "Customer"}</p>
      `;
      container.appendChild(bubble);
    });

    // reset track & (re)initialize AFTER content exists
    container.style.transform = "translateX(0px)";
    setupCarousel();
  } catch (e) {
    console.error("Error loading reviews:", e);
  }
}

// --- Carousel ---
function setupCarousel() {
  const container = document.querySelector(".reviews-container");
  const prevArrow = document.getElementById("prevReviewBtn");
  const nextArrow = document.getElementById("nextReviewBtn");
  if (!container || !prevArrow || !nextArrow) return;

  let current = 0;

  const metrics = () => {
    const cards = container.querySelectorAll(".review-bubble");
    if (!cards.length) return { card: 0, max: 0 };
    const style = getComputedStyle(cards[0]);
    const gap = parseFloat(style.marginRight || 30) || 30; // fallback
    const card = cards[0].offsetWidth + gap;
    const max = Math.max(0, cards.length * card - container.clientWidth);
    return { card, max };
  };

  let { card, max } = metrics();

  const clamp = () => {
    current = Math.max(0, Math.min(current, max));
    container.scrollLeft = current;
    prevArrow.style.opacity = current <= 0 ? "0.5" : "1";
    nextArrow.style.opacity = current >= max ? "0.5" : "1";
  };

  prevArrow.onclick = () => { current -= card; clamp(); };
  nextArrow.onclick = () => { current += card; clamp(); };

  window.addEventListener("resize", () => {
    ({ card, max } = metrics());
    clamp();
  });

  // initial state
  clamp();
}

// --- Review Form ---
function setupReviewForm() {
  const form = document.getElementById("reviewForm");
  if (!form) return;

  // ✅ Prevent binding twice (e.g., if script runs twice or hot reload)
  if (form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  let submitting = false; // ✅ blocks double clicks / Enter spam

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (submitting) return;
    submitting = true;

    const rating = Number(document.querySelector('input[name="rating"]:checked')?.value || 0);
    const text = document.getElementById("reviewText")?.value.trim();
    const author_name = document.getElementById("reviewName")?.value.trim();
    if (!text || !author_name) {
      alert("Please enter your name and review.");
      submitting = false;
      return;
    }

    // Optional: disable submit button while sending
    const btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;

    try {
      const res = await fetch("/reviews/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author_name, text, rating })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Could not save review.");
      }

      await loadReviews();    // refresh list
      form.reset();
      alert("Thank you for your review!");
    } catch (err) {
      console.error(err);
      alert("Sorry, we couldn't save your review.");
    } finally {
      submitting = false;
      if (btn) btn.disabled = false;
    }
  });

  // Character counter
  const reviewText = document.getElementById("reviewText");
  const charCount = document.getElementById("charCount");
  if (reviewText && charCount) {
    const maxLength = reviewText.getAttribute("maxlength");
    reviewText.addEventListener("input", () => {
      const remaining = maxLength - reviewText.value.length;
      charCount.textContent = `${remaining} characters remaining`;
    });
  }
}


// --- Attach all event listeners ---
document.addEventListener("DOMContentLoaded", () => {
  // Sidebar
  document.getElementById("detailsBtn")?.addEventListener("click", toggleMainMenu);
  document.getElementById("sidebarCloseBtn")?.addEventListener("click", toggleMainMenu);

  // Hours
  document.getElementById("hoursBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  closeAllPanels();          // this will close the sidebar/details
  toggleHours();             // then open the Hours panel
  });
  document.getElementById("hoursCloseBtn")?.addEventListener("click", toggleHours);

  // Contact
  document.getElementById("contactUsBtn")?.addEventListener("click", openContact);
  document.getElementById("contactCloseBtn")?.addEventListener("click", closeContact);

  // Menu
  document.getElementById("menuButton")?.addEventListener("click", (e) => {
    e.preventDefault();
    closeAllPanels();
    document.getElementById("menuPage")?.classList.add("open");
    document.body.classList.add("menu-open");
  });
  document.getElementById("menuCloseBtn")?.addEventListener("click", toggleMenu);

  // Close menu if clicking outside
  document.addEventListener("click", (e) => {
    const menuPage = document.getElementById("menuPage");
    if (menuPage?.classList.contains("open") &&
        !menuPage.contains(e.target) &&
        !e.target.closest("#menuButton")) {
      toggleMenu();
    }
  });

  // Menu scroll effect
  const menuPage = document.getElementById("menuPage");
  if (menuPage) {
    menuPage.addEventListener("scroll", () => {
      if (!menuPage.classList.contains("open")) return;
      const scrollTrigger = 150;
      const progress = Math.min(menuPage.scrollTop / scrollTrigger, 1);
      const start = 42;
      const end = 0;
      const newTranslateY = start - (start - end) * progress;
      menuPage.style.transform = `translateY(${newTranslateY}vh)`;
    });
  }

  // Reviews
  loadReviews();
  setupReviewForm();
});

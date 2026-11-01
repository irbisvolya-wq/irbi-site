const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const pricing = {
  regular: { name: "Підтримувальне", prices: { 1: 1200, 2: 1500, 3: 1800, 4: 2200 } },
  general: { name: "Генеральне", prices: { 1: 2500, 2: 3200, 3: 3900, 4: 4700 } },
  move: { name: "Заселення / виселення", prices: { 1: 2900, 2: 3700, 3: 4500, 4: 5400 } },
  repair: { name: "Після ремонту", prices: { 1: 3000, 2: 4000, 3: 5000, 4: null } }
};

const serviceType = $("#serviceType");
const rooms = $("#rooms");
const totalPrice = $("#totalPrice");
const summaryService = $("#summaryService");
const summaryRooms = $("#summaryRooms");
const summaryAddons = $("#summaryAddons");
const summaryWarning = $("#summaryWarning");

function formatMoney(value) {
  return new Intl.NumberFormat("uk-UA").format(value) + " ₴";
}

function calculate() {
  const service = pricing[serviceType.value];
  const roomCount = Number(rooms.value);
  let base = service.prices[roomCount];
  let total = base || 0;
  const selected = [];

  const moveInOut = serviceType.value === "move";
  $$("[data-addon]").forEach((checkbox) => {
    const isIncluded = moveInOut && checkbox.dataset.addon === "balcony";
    checkbox.disabled = isIncluded;

    const card = checkbox.closest(".check");
    if (card) {
      card.style.opacity = isIncluded ? "0.55" : "1";
      const priceLabel = card.querySelector("b");
      if (priceLabel && checkbox.dataset.addon === "balcony") {
        priceLabel.textContent = isIncluded ? "включено" : "від +300 ₴";
      }
    }

    if (isIncluded) {
      checkbox.checked = false;
      return;
    }

    if (checkbox.checked) {
      total += Number(checkbox.dataset.price || 0);
      selected.push(checkbox.nextElementSibling?.textContent?.trim() || "Додаткова робота");
    }
  });

  summaryService.textContent = service.name;
  summaryRooms.textContent = roomCount;
  summaryAddons.textContent = selected.length ? selected.join(", ") : "—";

  if (base === null) {
    totalPrice.textContent = "Індивідуально";
    summaryWarning.textContent = "Для 4-кімнатного житла після ремонту вартість визначається після оцінки обсягу робіт.";
  } else {
    totalPrice.textContent = serviceType.value === "repair" ? "від " + formatMoney(total) : formatMoney(total);
    summaryWarning.textContent = "Фінальна ціна підтверджуватиметься до оформлення замовлення.";
  }
}

[serviceType, rooms, ...$$("[data-addon]")].forEach((el) => {
  el.addEventListener("change", calculate);
});

function openModal() {
  const modal = $("#interestModal");
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  $("#interestName")?.focus();
}

function closeModal() {
  const modal = $("#interestModal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

$("#openInterest")?.addEventListener("click", openModal);
$("#openInterestBottom")?.addEventListener("click", openModal);
$("[data-close]")?.addEventListener("click", closeModal);
$("#interestModal")?.addEventListener("click", (event) => {
  if (event.target.id === "interestModal") closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

$("#interestForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = $("#interestForm");
  const button = form.querySelector('button[type="submit"]');
  const success = $("#interestSuccess");
  const status = $("#interestStatus");
  const payload = {
    name: $("#interestName").value.trim(),
    contact: $("#interestContact").value.trim(),
    privacyAccepted: $("#privacyAccepted").checked,
    marketingConsent: $("#marketingConsent").checked,
    website: $("#interestWebsite").value,
    service: serviceType.value,
    rooms: Number(rooms.value),
    requestId: form.dataset.requestId || crypto.randomUUID()
  };
  if (!payload.privacyAccepted) { status.textContent = "Підтвердіть ознайомлення з умовами обробки даних."; return; }
  form.dataset.requestId = payload.requestId;
  button.disabled = true;
  status.textContent = "Надсилаємо заявку…";
  try {
    const response = await fetch("https://xcfbzlyososeetbnrvhf.supabase.co/functions/v1/irbi-prelaunch-lead", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Не вдалося зберегти заявку");
    success.hidden = false;
    status.textContent = "";
    form.reset();
    delete form.dataset.requestId;
    window.setTimeout(() => { success.hidden = true; }, 6000);
  } catch {
    status.textContent = "Заявку не вдалося надіслати. Спробуйте ще раз пізніше.";
  } finally { button.disabled = false; }
});

calculate();
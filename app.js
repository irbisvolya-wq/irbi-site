const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const pricing = {
  regular: { name: "Підтримувальне", base: 590, perM2: 10 },
  general: { name: "Генеральне", base: 990, perM2: 18 },
  repair: { name: "Після ремонту", base: 1490, perM2: 24 }
};

const cleaningType = $("#cleaningType");
const area = $("#area");
const rooms = $("#rooms");
const subscription = $("#subscription");
const totalPrice = $("#totalPrice");
const summaryType = $("#summaryType");
const summaryArea = $("#summaryArea");
const summaryRooms = $("#summaryRooms");
const summaryAddons = $("#summaryAddons");

function calc() {
  const type = pricing[cleaningType.value];
  const m2 = Math.max(20, Number(area.value || 20));
  const roomCount = Number(rooms.value);
  let total = type.base + m2 * type.perM2 + Math.max(0, roomCount - 1) * 90;

  const selected = [];
  $$("input[type=\"checkbox\"][data-price]").forEach((el) => {
    if (el.checked) {
      total += Number(el.dataset.price);
      selected.push(el.value);
    }
  });

  if (subscription.checked) total *= 0.9;
  total = Math.round(total / 10) * 10;

  summaryType.textContent = type.name;
  summaryArea.textContent = `${m2} м²`;
  summaryRooms.textContent = rooms.options[rooms.selectedIndex].text;
  summaryAddons.textContent = selected.length ? selected.join(", ") : "—";
  totalPrice.textContent = `${total.toLocaleString("uk-UA")} ₴`;
  return total;
}

[cleaningType, area, rooms, subscription, ...$$("input[type=\"checkbox\"][data-price]")]
  .forEach(el => el.addEventListener("input", calc));

const dateInput = $("#date");
const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);
dateInput.min = today.toISOString().split("T")[0];
dateInput.value = tomorrow.toISOString().split("T")[0];

function openModal(id){
  const modal = document.getElementById(id);
  modal.classList.add("show");
  modal.setAttribute("aria-hidden","false");
}
function closeModal(modal){
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden","true");
}
$$("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.closest(".modal"))));
$$(".modal").forEach(m => m.addEventListener("click", e => { if(e.target === m) closeModal(m); }));

function loadOrders(){
  return JSON.parse(localStorage.getItem("irbiOrders") || "[]");
}
function saveOrders(items){
  localStorage.setItem("irbiOrders", JSON.stringify(items));
}
function renderOrders(){
  const items = loadOrders();
  const list = $("#ordersList");
  const empty = $("#emptyOrders");
  list.innerHTML = "";
  empty.style.display = items.length ? "none" : "block";
  items.slice().reverse().forEach(order => {
    const node = document.createElement("div");
    node.className = "order-item";
    node.innerHTML = `
      <div class="order-item-top">
        <strong>${order.type}</strong>
        <span class="status">Заплановано</span>
      </div>
      <p>${order.date} · ${order.time}<br>${order.address}</p>
      <small>${order.area} м² · ${order.rooms} кімн. · ${order.price.toLocaleString("uk-UA")} ₴</small>
    `;
    list.appendChild(node);
  });
}

$("#openCabinet").addEventListener("click", () => {
  renderOrders();
  openModal("cabinetModal");
});

$("#orderForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const address = $("#address").value.trim();
  const name = $("#name").value.trim();
  const phone = $("#phone").value.trim();

  if (!address || !name || !phone) {
    alert("Будь ласка, заповніть адресу, ім’я та телефон.");
    return;
  }

  const order = {
    id: Date.now(),
    type: pricing[cleaningType.value].name,
    area: Number(area.value),
    rooms: Number(rooms.value),
    date: $("#date").value,
    time: $("#time").value,
    address,
    name,
    phone,
    subscription: subscription.checked,
    price: calc()
  };

  const orders = loadOrders();
  orders.push(order);
  saveOrders(orders);

  $("#successText").textContent = `Замовлення на ${order.date} о ${order.time} створено. Вартість: ${order.price.toLocaleString("uk-UA")} ₴.`;
  openModal("successModal");
});

calc();

import { CONFIG } from "./config.js";
import { auth, db, storage, fb, ensureAnon } from "./firebase-init.js";

const K = { shipping:"njge_shipping", cart:"njge_cart", orders:"njge_orders", products:"njge_products" };
const $ = (id)=>document.getElementById(id);

let LAST_WA_URL = null;
let LAST_ORDER_ERROR = null;

/* ✅ FIX iPhone: guardamos el file seleccionado aquí */
let PROOF_FILE = null;
let PROOF_URL_TEMP = "";

function getJSON(k,f){ try{ const r=localStorage.getItem(k); return r?JSON.parse(r):f; }catch{ return f; } }
function setJSON(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function Num(x){ const n = Number(x); return Number.isFinite(n)?n:0; }
function money(n){ return (Num(n)).toLocaleString("es-EC",{style:"currency",currency:"USD"}); }
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
function uid(){ return Math.random().toString(16).slice(2)+Date.now().toString(16); }

let state = {
  products: [],
  cats: [],
  prov: "",
  ship: "",
  shipping: CONFIG.shipping || [],
  cart: getJSON(K.cart, []),
};

function setCart(cart){
  state.cart = cart;
  setJSON(K.cart, cart);
}

function openDrawer(){ $("cartDrawer").classList.add("open"); }
function closeDrawer(){ $("cartDrawer").classList.remove("open"); }

function showModal(title, html){
  $("mTitle").textContent = title;
  $("mBody").innerHTML = html;
  $("modal").style.display = "grid";
}
function hideModal(){ $("modal").style.display = "none"; }

function renderCats(){
  const sel = $("cat");
  const cats = ["Todos", ...state.cats];
  sel.innerHTML = cats.map(c=>`<option value="${c}">${c}</option>`).join("");
}

function renderShipping(){
  const provSel = $("provSel");
  const shipSel = $("shipSel");
  const provs = CONFIG.provinces || [];
  provSel.innerHTML = provs.map(p=>`<option value="${p}">${p}</option>`).join("");
  if(!state.prov) state.prov = provs[0] || "";
  provSel.value = state.prov;

  const methods = (state.shipping || []).filter(s=>s.province===state.prov);
  shipSel.innerHTML = methods.map(m=>`<option value="${m.id}">${m.name}</option>`).join("");
  if(!methods.find(m=>m.id===state.ship)) state.ship = methods[0]?.id || "";
  shipSel.value = state.ship;

  const current = methods.find(m=>m.id===state.ship);
  $("shipInfo").textContent = current ? `${current.name}: ${money(current.price)}` : "";
}

function getShipPrice(){
  const methods = (state.shipping || []).filter(s=>s.province===state.prov);
  const current = methods.find(m=>m.id===state.ship);
  return current ? Num(current.price) : 0;
}

function renderGrid(){
  const q = ($("q").value||"").trim().toLowerCase();
  const cat = $("cat").value || "Todos";
  const list = state.products.filter(p=>{
    const okq = !q || (p.title||"").toLowerCase().includes(q) || (p.desc||"").toLowerCase().includes(q);
    const okc = cat==="Todos" || p.category===cat;
    return okq && okc;
  });

  $("grid").innerHTML = list.map(p=>{
    const stock = Num(p.stock);
    const inCart = state.cart.find(x=>x.id===p.id)?.qty || 0;
    const disabled = stock<=0 ? "disabled" : "";
    return `
      <article class="prod">
        <div class="imgbox">
          <img src="${p.image||""}" alt="${p.title||""}" />
        </div>
        <div class="pinfo">
          <div class="ptitle">${p.title||""}</div>
          <div class="pdesc">${p.desc||""}</div>
          <div class="prow">
            <div class="price">${money(p.price||0)}</div>
            <div class="stock ${stock<=0?"out":""}">${stock<=0?"Agotado":`Stock: ${stock}`}</div>
          </div>
          <div class="btnrow">
            <button class="btn" data-add="${p.id}" ${disabled}>Agregar</button>
            <button class="btn ghost" data-view="${p.id}">Ver</button>
            ${inCart?`<span class="small muted">En carrito: ${inCart}</span>`:""}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function updateCartBadge(){
  const count = state.cart.reduce((s,x)=>s+Num(x.qty),0);
  $("cartBadge").textContent = String(count);
}

function renderCart(){
  const list = state.cart.map(ci=>{
    const p = state.products.find(x=>x.id===ci.id);
    if(!p) return "";
    const qty = clamp(Num(ci.qty),1,999);
    const price = Num(p.price);
    return `
      <div class="cartItem">
        <img class="cimg" src="${p.image||""}" alt="" />
        <div class="cinfo">
          <div class="ctitle">${p.title||""}</div>
          <div class="csub">${money(price)} • <span class="muted">${p.category||""}</span></div>
          <div class="qtyRow">
            <button class="iconbtn" data-dec="${p.id}">−</button>
            <strong>${qty}</strong>
            <button class="iconbtn" data-inc="${p.id}">+</button>
            <button class="iconbtn danger" data-rem="${p.id}">🗑</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  $("cartList").innerHTML = list || `<div class="small muted">Tu carrito está vacío.</div>`;

  const subtotal = state.cart.reduce((s,ci)=>{
    const p = state.products.find(x=>x.id===ci.id);
    return s + (p? Num(p.price)*Num(ci.qty):0);
  },0);

  const ship = getShipPrice();
  $("subTotal").textContent = money(subtotal);
  $("shipTotal").textContent = money(ship);
  $("grandTotal").textContent = money(subtotal+ship);
}

function addToCart(pid){
  const p = state.products.find(x=>x.id===pid);
  if(!p) return;
  if(Num(p.stock)<=0){ alert("Producto agotado."); return; }

  const cart = [...state.cart];
  const idx = cart.findIndex(x=>x.id===pid);
  if(idx>=0){
    cart[idx].qty = clamp(Num(cart[idx].qty)+1,1,999);
  }else{
    cart.push({ id: pid, qty: 1 });
  }
  setCart(cart);
  updateCartBadge();
  renderCart();
  openDrawer();
}

function incQty(pid,delta){
  const cart = [...state.cart];
  const idx = cart.findIndex(x=>x.id===pid);
  if(idx<0) return;
  cart[idx].qty = clamp(Num(cart[idx].qty)+delta,1,999);
  setCart(cart);
  updateCartBadge();
  renderCart();
}

function removeItem(pid){
  const cart = state.cart.filter(x=>x.id!==pid);
  setCart(cart);
  updateCartBadge();
  renderCart();
}

function bindGridEvents(){
  $("grid").addEventListener("click", (e)=>{
    const add = e.target?.getAttribute?.("data-add");
    const view = e.target?.getAttribute?.("data-view");
    if(add) addToCart(add);
    if(view){
      const p = state.products.find(x=>x.id===view);
      if(!p) return;
      showModal(p.title||"Producto", `
        <div class="mprod">
          <img class="mimg" src="${p.image||""}" alt="" />
          <div class="mtext">
            <div class="price big">${money(p.price||0)}</div>
            <div class="muted">${p.category||""}</div>
            <p style="margin-top:10px">${p.desc||""}</p>
            <div class="small muted">Stock: ${Num(p.stock)}</div>
            <div style="margin-top:12px">
              <button class="btn primary" onclick="document.getElementById('mClose').click(); document.querySelector('[data-add=&quot;${p.id}&quot;]')?.click();">Agregar al carrito</button>
            </div>
          </div>
        </div>
      `);
    }
  });
}

function bindCartEvents(){
  $("cartList").addEventListener("click",(e)=>{
    const inc = e.target?.getAttribute?.("data-inc");
    const dec = e.target?.getAttribute?.("data-dec");
    const rem = e.target?.getAttribute?.("data-rem");
    if(inc) incQty(inc, +1);
    if(dec) incQty(dec, -1);
    if(rem) removeItem(rem);
  });
}

/* ========= FIX iPhone: comprobante estable ========= */
function bindProofInput(){
  const inp = $("proof");
  const label = $("proofName");
  if(!inp || !label) return;

  const update = async ()=>{
    const f = (inp.files && inp.files[0]) ? inp.files[0] : null;
    PROOF_FILE = f;
    PROOF_URL_TEMP = "";
    label.textContent = f ? f.name : "Ningún archivo seleccionado";

    if(f){
      try{
        // Intento 1: subir en el momento (más confiable)
        label.textContent = `${f.name} (subiendo...)`;
        PROOF_URL_TEMP = await uploadProofTemp(f);
        label.textContent = `${f.name} ✅`;
      }catch(e){
        console.warn("No se pudo subir el comprobante al seleccionar:", e);
        // dejamos el archivo en memoria para intentar en checkout
        label.textContent = f.name;
      }
    }
  };

  inp.onchange = update; // iPhone: más estable
  inp.addEventListener('input', update);
  update();
}
/* ================================================ */

function buildWA(enriched, totals, proofUrl){
  const items = enriched.map(({ci,p})=>`• ${p.title} x${ci.qty} = ${money(Num(p.price)*Num(ci.qty))}`).join("\n");
  const ship = money(totals.ship);
  const sub  = money(totals.subtotal);
  const tot  = money(totals.total);

  const prov = state.prov || "";
  const shipName = (state.shipping||[]).filter(s=>s.province===prov).find(m=>m.id===state.ship)?.name || "";

  const msg = [
    "🛍️ *Nuevo pedido*",
    "",
    items,
    "",
    `Subtotal: ${sub}`,
    `Envío (${prov} - ${shipName}): ${ship}`,
    `Total: *${tot}*`,
    "",
    proofUrl ? `📎 Comprobante: ${proofUrl}` : "📎 Comprobante: (adjunto en sistema)",
    "",
    "✅ Gracias por tu compra."
  ].join("\n");

  const phone = CONFIG.whatsappPhone || "";
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  return url;
}

async function createOrder(enriched, totals, proofUrl){
  const order = {
    createdAt: fb.serverTimestamp(),
    status: "nuevo",
    province: state.prov,
    shippingId: state.ship,
    shippingPrice: totals.ship,
    subtotal: totals.subtotal,
    total: totals.total,
    items: enriched.map(({ci,p})=>({
      id: p.id,
      title: p.title,
      price: Num(p.price),
      qty: Num(ci.qty),
      image: p.image || "",
    })),
    proofUrl: proofUrl || "",
    user: auth.currentUser ? { uid: auth.currentUser.uid } : null,
    ua: navigator.userAgent || "",
  };

  const ref = await fb.addDoc(fb.collection(db, "orders"), order);
  return ref.id;
}

async function uploadProof(file, orderId){
  const ext = (file.name || "jpg").split(".").pop().toLowerCase();
  const path = `proofs/${orderId}.${ext}`;
  const ref = fb.ref(storage, path);
  await fb.uploadBytes(ref, file);
  const url = await fb.getDownloadURL(ref);
  return url;
}


async function uploadProofTemp(file){
  // Sube el comprobante apenas se selecciona (evita que el input "pierda" el archivo en algunos celulares)
  const u = auth.currentUser || await ensureAnon();
  const ext = (file.name || "jpg").split(".").pop().toLowerCase();
  const safe = (file.name||"comprobante").replace(/[^\w.\-]+/g,"_").slice(0,80);
  const path = `proofs/tmp/${u.uid}/${Date.now()}_${safe}.${ext}`;
  const ref = fb.ref(storage, path);
  await fb.uploadBytes(ref, file);
  const url = await fb.getDownloadURL(ref);
  return url;
}

async function checkout(){
  const btn = $("checkoutBtn");
  const msg = $("checkoutMsg");
  if(msg) msg.textContent = "";

  try{
    if(btn){ btn.disabled = true; btn.textContent = "Enviando..."; }

    if(state.cart.length===0){ alert("Carrito vacío."); return; }

    const enriched = state.cart.map(ci=>({ ci, p: state.products.find(x=>x.id===ci.id) })).filter(x=>x.p);
    if(enriched.length===0){ alert("Carrito vacío."); return; }

    for(const {ci,p} of enriched){
      if((p.stock||0) < (ci.qty||0)){
        alert(`Stock insuficiente para: ${p.title}`);
        return;
      }
    }

    /* ✅ FIX: 1) si ya se subió al seleccionar, usamos esa URL; 2) si no, usamos el file en memoria */
    const file = PROOF_FILE || $("proof").files?.[0] || null;
    const hasProof = !!PROOF_URL_TEMP || !!file;
    if(!hasProof){
      alert("Adjunta el comprobante de pago antes de realizar el pedido.");
      return;
    }

    const subtotal = enriched.reduce((s,x)=>s+(Num(x.p.price)*Num(x.ci.qty)),0);
    const ship = getShipPrice();
    const total = subtotal + ship;
    const totals = { subtotal, ship, total };

    const orderId = await createOrder(enriched, totals, PROOF_URL_TEMP || "");

    let proofUrl = PROOF_URL_TEMP || "";
    if(!proofUrl && file){
      try{
        // Fallback: si no se pudo subir al seleccionar, subimos ahora
        proofUrl = await uploadProof(file, orderId);
        await fb.updateDoc(fb.doc(db, "orders", orderId), { proofUrl });
      }catch(e){
        console.warn("No se pudo subir/guardar comprobante:", e);
      }
    }

    try{
      for(const {ci,p} of enriched){
        const ref = fb.doc(db, "products", p.id);
        const newStock = Math.max(0, Num(p.stock) - Num(ci.qty));
        await fb.updateDoc(ref, { stock: newStock });
      }
    }catch(e){
      console.warn(e);
    }

    try{
      if(msg) msg.innerHTML = `Pedido creado: <strong>${orderId}</strong>. ✅ (Revisa el panel Admin para ver el comprobante.)`;
    }catch(e){
      console.warn(e);
    }

    }

    $("proof").value = "";
    PROOF_FILE = null;         // ✅ reset
    PROOF_URL_TEMP = "";
    bindProofInput();          // ✅ refresh label
    setCart([]); updateCartBadge(); renderCart();

  } finally {
    if(btn){ btn.disabled = false; btn.textContent = "Realizar pedido"; }
  }
}

function bindUI(){
  $("openCartBtn").addEventListener("click", openDrawer);
  $("closeCartBtn").addEventListener("click", closeDrawer);
  $("mClose").addEventListener("click", hideModal);
  $("modal").addEventListener("click",(e)=>{ if(e.target?.id==="modal") hideModal(); });

  $("q").addEventListener("input", renderGrid);
  $("cat").addEventListener("change", renderGrid);

  $("provSel").addEventListener("change",(e)=>{ state.prov = e.target.value; renderShipping(); renderCart(); });
  $("shipSel").addEventListener("change",(e)=>{ state.ship = e.target.value; renderShipping(); renderCart(); });

  $("checkoutBtn").addEventListener("click", checkout);

  bindGridEvents();
  bindCartEvents();
  bindProofInput();

  const logo = $("logoTap");
  const brandTap = $("brandTap");
  let taps = 0;
  let tmo = null;

  const onTap = ()=>{
    taps++;
    clearTimeout(tmo);
    tmo = setTimeout(()=>{ taps=0; }, 800);
    if(taps>=4){
      window.location.href = "admin.html";
      taps=0;
    }
  };

  logo?.addEventListener("click", onTap);
  brandTap?.addEventListener("click", onTap);

}

async function loadProducts(){
  const snap = await fb.getDocs(fb.collection(db, "products"));
  const list = [];
  snap.forEach(d=> list.push({ id:d.id, ...d.data() }));
  state.products = list;
  state.cats = Array.from(new Set(list.map(x=>x.category).filter(Boolean))).sort();
}

async function init(){
  await ensureAnon();

  state.shipping = CONFIG.shipping || state.shipping;

  await loadProducts();
  renderCats();
  renderShipping();
  renderGrid();
  updateCartBadge();
  renderCart();
  bindUI();
}

init().catch(e=>{
  console.error(e);
  alert("Error iniciando la app. Revisa consola.");
});

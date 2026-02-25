import { CONFIG } from "./config.js";
import { auth, db, storage, fb, ensureAnon } from "./firebase-init.js";

const K = { shipping:"njge_shipping", cart:"njge_cart", orders:"njge_orders", products:"njge_products" };
const $ = (id)=>document.getElementById(id);

let LAST_WA_URL = null;
let LAST_ORDER_ERROR = null;
let PROOF_FILE = null; // mantiene el archivo seleccionado aunque el input se reinicie

function getJSON(k,f){ try{ const r=localStorage.getItem(k); return r?JSON.parse(r):f; }catch{ return f; } }
function setJSON(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function formatMoney(n){ return `$${Number(n||0).toFixed(2)}`; }
function toWhatsAppE164(ec){ const d=String(ec).replace(/\D/g,""); return d.startsWith("0")?`593${d.slice(1)}`:d; }
function ensurePWA(){ if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{}); }
function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isStandalone(){ return (window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone; }

let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",(e)=>{ e.preventDefault(); deferredPrompt=e; $("btnInstall").style.display="inline-block"; });
$("btnInstall").addEventListener("click", async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); try{ await deferredPrompt.userChoice; }catch{} deferredPrompt=null; $("btnInstall").style.display="none"; });

function showIOSHint(){
  if(!isIOS() || isStandalone()) return;
  const hint=$("iosHint");
  hint.classList.add("show");
  const close=()=>{ hint.classList.remove("show"); localStorage.setItem("njge_ios_hint_dismissed","1"); };
  $("iosClose").addEventListener("click", close);
  setTimeout(close, 8000);
}

function demoProducts(){
  // NO mostrar productos “de ejemplo”.
  return [];
}
function normalizeProduct(p){
  const o={...p};
  if(Array.isArray(o.variants)&&o.variants.length){
    o.stock=o.variants.reduce((s,v)=>s+(Number(v.stock)||0),0);
    const prices=o.variants.map(v=>Number(v.price||0)).filter(n=>n>0);
    o.price=prices.length?Math.min(...prices):(o.price||0);
    o.size="Varias";
  }
  return o;
}
let FB_PRODUCTS_CACHE = null;
let MY_ORDERS = [];

function bindProofInput(){
  const inp = $("proof");
  const label = $("proofName");
  const fileBtn = document.querySelector('label.filebtn[for="proof"]');
  if(!inp || !label) return;
  const update = ()=>{
    const f = inp.files?.[0] || null;
    PROOF_FILE = f;
    label.textContent = f ? f.name : "Ningún archivo seleccionado";
  };
  inp.addEventListener("change", update);
  // Permite abrir el selector tocando el texto o el botón/label
  const pick = ()=>{ try{ inp.click(); }catch(_){ } };
  label.addEventListener("click", pick);
  if(fileBtn) fileBtn.addEventListener("click", pick);
  update();
}


function getProducts(){
  if(FB_PRODUCTS_CACHE) return FB_PRODUCTS_CACHE;
  const stored=getJSON(K.products,null);
  const list=(stored&&stored.length)?stored:[];
  return list.map(normalizeProduct);
}
function setProducts(p){ setJSON(K.products,p); }

function getShipping(){ return getJSON(K.shipping,null); }
function setShipping(s){ setJSON(K.shipping,s); }
function getCart(){ return getJSON(K.cart,[]); }
function setCart(c){ setJSON(K.cart,c); }
function getOrders(){ return getJSON(K.orders,[]); }
function saveOrder(o){ const all=getOrders(); setJSON(K.orders,[o,...all]); }

function updateProductStock(productId, delta){
  const products=getJSON(K.products,demoProducts());
  const next=products.map(x=>{
    if(x.id!==productId) return x;
    if(Array.isArray(x.variants)&&x.variants.length){
      let rem=delta;
      const vs=x.variants.map(v=>{
        if(rem<=0) return v;
        const s=Number(v.stock||0);
        if(s<=0) return v;
        const take=Math.min(s,rem);
        rem-=take;
        return {...v, stock:s-take};
      });
      return {...x, variants:vs};
    }
    return {...x, stock:Math.max(0,(x.stock||0)-delta)};
  });
  setProducts(next);
}

function cartCount(c){ return c.reduce((s,i)=>s+(i.qty||0),0); }
function uid(){ return `ORD-${Math.random().toString(16).slice(2,8)}-${String(Date.now()).slice(-6)}`.toUpperCase(); }
function openModal(id){ $(id).classList.add("open"); }
function closeModal(id){ $(id).classList.remove("open"); }
document.addEventListener("click",(e)=>{ const t=e.target; if(t?.dataset?.close) closeModal(t.dataset.close); });

let activeCat="all";

function pillColor(catId){
  return (CONFIG.categoryColors && CONFIG.categoryColors[catId]) ? CONFIG.categoryColors[catId] : "rgba(255,255,255,.10)";
}


let activeSub="";
let rotationIndex=0;
let rotationTimer=null;

$("appNameLine1").textContent = "NJ Global";
$("appNameLine2").textContent = "Express EC";
$("subtitle").textContent = CONFIG.subtitle;
$("howPayLine").innerHTML = CONFIG.paymentMode==="deposit50"
 ? "<b>Pago</b>: transferencia/depósito de <b>reserva (50%)</b>. El saldo + envío se confirma por WhatsApp."
 : "<b>Pago</b>: transferencia/depósito del total (incluye envío si ya está definido).";

$("btnHow").addEventListener("click",()=>openModal("modalHow"));
$("btnMyData").addEventListener("click",()=>{ loadShippingForm(); openModal("modalReg"); });
$("btnCart").addEventListener("click",()=>{ renderCart(); openModal("modalCart"); });

$("btnShare").addEventListener("click", async ()=>{
  const url=location.href;
  const data={ title:CONFIG.appName, text:"Mira el catálogo aquí:", url };
  if(navigator.share){ try{ await navigator.share(data);}catch{} }
  else{ await navigator.clipboard.writeText(url); alert("Link copiado ✅"); }
});

$("btnTrack").addEventListener("click",()=>window.open(CONFIG.servientregaTrackingUrl,"_blank","noopener,noreferrer"));
$("igBtn").addEventListener("click",()=>window.open(CONFIG.socials.instagram,"_blank","noopener,noreferrer"));
$("ttBtn").addEventListener("click",()=>window.open(CONFIG.socials.tiktok,"_blank","noopener,noreferrer"));
$("fbBtn").addEventListener("click",()=>window.open(CONFIG.socials.facebook,"_blank","noopener,noreferrer"));


/* Admin discreto (sin zoom):
   - Toca "Compras Ecuador" 4 veces rápido, o
   - En el tope (scroll arriba), jala hacia abajo 3 veces (pull).
*/
(function setupHiddenAdmin(){
  // A veces el usuario toca el bloque completo (no solo el texto).
  // Soportamos tap 4x en: "Compras Ecuador" (subtitle) y en el bloque .brand.
  const targets = [$("subtitle"), document.querySelector(".brand")].filter(Boolean);
  if(targets.length){
    let taps=0; let tmr=null;
    const onTap = ()=>{
      taps += 1;
      if(tmr) clearTimeout(tmr);
      tmr = setTimeout(()=>{ taps=0; }, 900);
      if(taps>=4){ taps=0; location.href="admin.html"; }
    };
    targets.forEach(el=>el.addEventListener("click", onTap));
  }

  let pulls=0; let pullTimer=null;
  let startY=0;
  window.addEventListener("touchstart",(e)=>{
    if(window.scrollY===0){ startY = e.touches?.[0]?.clientY || 0; }
  }, {passive:true});
  window.addEventListener("touchend",(e)=>{
    if(window.scrollY!==0) return;
    const endY = e.changedTouches?.[0]?.clientY || 0;
    if(endY - startY > 75){
      pulls += 1;
      if(pullTimer) clearTimeout(pullTimer);
      pullTimer = setTimeout(()=>{ pulls=0; }, 1800);
      if(pulls>=3){ pulls=0; location.href="admin.html"; }
    }
  }, {passive:true});
})();

function buildCategoryPills(){
  const wrap=$("catPills");
  const cats=[{id:"all",label:"Todo",subs:[]}, ...CONFIG.categories];
  wrap.innerHTML=cats.map(c=>{
    const col=pillColor(c.id);
    return `<button class="pillbtn ${c.id===activeCat?"active":""}" style="--pill:${col}" data-cat="${c.id}">${c.label}</button>`;
  }).join("");
  wrap.querySelectorAll("[data-cat]").forEach(b=>b.addEventListener("click",(e)=>{
    activeCat=e.currentTarget.dataset.cat;
    activeSub="";
    buildCategoryPills();
    buildSubPills();
    startRotation();
  }));
}
function buildSubPills(){
  const subWrap=$("subPills");
  const cat=CONFIG.categories.find(c=>c.id===activeCat);
  const subs=cat?.subs||[];
  if(activeCat==="all" || !subs.length){
    subWrap.classList.remove("show"); subWrap.innerHTML=""; return;
  }
  const col=pillColor(activeCat);
  subWrap.classList.add("show");
  subWrap.innerHTML=[`<button class="pillbtn ${activeSub===""?"active":""}" style="--pill:${col}" data-sub="">Todos</button>`]
    .concat(subs.map(s=>`<button class="pillbtn ${activeSub===s?"active":""}" style="--pill:${col}" data-sub="${s}">${s}</button>`)).join("");
  subWrap.querySelectorAll("[data-sub]").forEach(b=>b.addEventListener("click",(e)=>{
    activeSub=e.currentTarget.dataset.sub;
    buildSubPills();
    startRotation();
  }));
}
function filterProducts(all){
  return all.filter(p=>{
    if(activeCat!=="all" && (p.category||"")!==activeCat) return false;
    if(activeSub && (p.subcategory||p.sub||"")!==activeSub) return false;
    return true;
  });
}
function takeRotating4(list){
  if(list.length<=4) return list;
  const start=rotationIndex%list.length;
  const out=[];
  for(let i=0;i<4;i++) out.push(list[(start+i)%list.length]);
  return out;
}
function labelCat(id){ const c=CONFIG.categories.find(x=>x.id===id); return c?c.label:id; }
function rangeLabel(arr){
  const nums=arr.map(x=>Number(x)).filter(n=>!isNaN(n));
  if(nums.length===arr.length && nums.length){ nums.sort((a,b)=>a-b); return nums[0]===nums.at(-1)?String(nums[0]):`${nums[0]}–${nums.at(-1)}`; }
  const u=[...new Set(arr)];
  return u.length<=3?u.join(", "):`${u[0]}…`;
}
function minmax(nums){ const a=[...nums].sort((x,y)=>x-y); return a[0]===a.at(-1)?String(a[0]):`${a[0]}–${a.at(-1)}`; }
function getVariantMeta(p){
  if(Array.isArray(p.variants)&&p.variants.length){
    const sizes=p.variants.map(v=>String(v.size||"")).filter(Boolean);
    const cms=p.variants.map(v=>Number(v.cm)).filter(n=>!isNaN(n));
    const sPart=sizes.length?`Tallas: <b>${rangeLabel(sizes)}</b>`:"Varias tallas";
    const cmPart=cms.length?` • cm: <b>${minmax(cms)}</b>`:"";
    return `${sPart}${cmPart}`;
  }
  return p.size?`${escapeHtml(p.measureLabel||"Talla")}: <b>${escapeHtml(p.size)}</b>`:"Varias";
}
function cardHTML(p){
  const soldOut=(p.stock||0)<=0;
  return `
  <article class="card">
    <div class="thumb">
      <img src="${p.imageUrl}" alt="${escapeHtml(p.title)}"/>
      <div class="badgePill left">${formatMoney(Number(p.price||0))}</div>
      <div class="badgePill right stock ${soldOut?"no":"ok"}">${soldOut?"Agotado":"Stock: "+(p.stock||0)}</div>
    </div>
    <div class="body">
      <div class="title">${escapeHtml(p.title)}</div>
      <div class="meta"><b>${escapeHtml(p.brand||"")}</b>${p.category?` • ${escapeHtml(labelCat(p.category))}`:""}${(p.subcategory||p.sub)?` • ${escapeHtml(p.subcategory||p.sub)}`:""}<br/>${getVariantMeta(p)}</div>
      <button class="btn primary add" data-add="${p.id}" ${soldOut?"disabled":""}>${soldOut?"No disponible":"Agregar"}</button>
    </div>
  </article>`;
}
let lastViewIds = [];

function preloadImages(urls){
  return Promise.all(urls.map(u=>new Promise((res)=>{
    const img = new Image();
    img.onload = ()=>res(true);
    img.onerror = ()=>res(true);
    img.src = u;
  })));
}

async function renderGrid(){
  const grid=$("grid");
  const filtered=filterProducts(getProducts());
  if(!filtered.length){
    lastViewIds=[];
    grid.style.opacity="1";
    grid.innerHTML = `
      <div class="card" style="grid-column:1/-1; text-align:center; padding:22px">
        <div style="font-weight:950; font-size:18px">Aún no hay productos cargados</div>
        <div class="small" style="margin-top:8px">Entra al <b>Admin</b> y agrega tus productos. Luego se verán aquí automáticamente.</div>
      </div>`;
    return;
  }
  const view=takeRotating4(filtered);

  const ids=view.map(v=>v.id).join("|");
  if(ids === lastViewIds.join("|")) return;
  lastViewIds = view.map(v=>v.id);

  const urls=view.map(v=>v.imageUrl);
  await preloadImages(urls);

  // Swap sin flash
  const html=view.map(cardHTML).join("");
  grid.style.transition = "opacity .22s ease";
  grid.style.opacity = "0";
  setTimeout(()=>{
    grid.innerHTML = html;
    grid.querySelectorAll("[data-add]").forEach(btn=>btn.addEventListener("click",(e)=>{
      requireShippingThen(()=>addToCart(e.currentTarget.dataset.add));
    }));
    grid.style.opacity = "1";
  }, 180);
}
function startRotation(){
  if(rotationTimer) clearInterval(rotationTimer);
  rotationIndex=0;
  renderGrid();
  rotationTimer=setInterval(()=>{ rotationIndex+=4; renderGrid(); }, CONFIG.featuredRotationMs);
}

function updateCartBadge(){ $("cartCount").textContent=String(cartCount(getCart())); }
function loadShippingForm(){
  const s=getShipping();
  $("fullName").value=s?.fullName||"";
  $("cedula").value=s?.cedula||"";
  $("phone").value=s?.phone||"";
  $("city").value=s?.city||"";
  $("address").value=s?.address||"";
  $("reference").value=s?.reference||"";
}
$("saveShipping").addEventListener("click",()=>{
  const shipping={ fullName:$("fullName").value.trim(), cedula:$("cedula").value.trim(), phone:$("phone").value.trim(),
    city:$("city").value.trim(), address:$("address").value.trim(), reference:$("reference").value.trim() };
  const ok=shipping.fullName.length>=5 && shipping.cedula.length>=8 && shipping.phone.length>=7 && shipping.city.length>=2 && shipping.address.length>=8;
  if(!ok){ alert("Completa: nombre, cédula, teléfono, ciudad y dirección."); return; }
  setShipping(shipping);
  upsertCustomerProfile(shipping);
  closeModal("modalReg");
});
function requireShippingThen(cb){ if(!getShipping()){ loadShippingForm(); openModal("modalReg"); return; } cb(); }
function addToCart(productId){
  const cart=getCart();
  const found=cart.find(i=>i.productId===productId);
  const next=found?cart.map(i=>i.productId===productId?({...i, qty:(i.qty||0)+1}):i):[...cart,{productId,qty:1}];
  setCart(next); updateCartBadge(); renderCart(); openModal("modalCart");
}
function enrichCart(cart){
  const products=getProducts(); const map=new Map(products.map(p=>[p.id,p]));
  return cart.map(ci=>({ci,p:map.get(ci.productId)})).filter(x=>x.p);
}
function inc(id){ setCart(getCart().map(i=>i.productId===id?({...i,qty:(i.qty||0)+1}):i)); updateCartBadge(); renderCart(); }
function dec(id){ setCart(getCart().map(i=>i.productId===id?({...i,qty:(i.qty||0)-1}):i).filter(i=>(i.qty||0)>0)); updateCartBadge(); renderCart(); }
function rm(id){ setCart(getCart().filter(i=>i.productId!==id)); updateCartBadge(); renderCart(); }

function renderPay(enriched){
  const subtotal=enriched.reduce((s,x)=>s+(Number(x.p.price||0)*x.ci.qty),0);
  $("subtotal").textContent=formatMoney(subtotal);
  const ship=Math.max(0,Number($("shippingCost").value||0));
  $("shippingLabel").textContent=ship>0?formatMoney(ship):"Se confirma";
  const due=CONFIG.paymentMode==="deposit50"?subtotal*0.5:(ship>0?subtotal+ship:subtotal);
  $("dueLabel").textContent=CONFIG.paymentMode==="deposit50"?"Pago ahora (50%)":"Pago ahora";
  $("dueNow").textContent=formatMoney(due);
  // Bancos con “logo” + acordeón
  const bankLogo = (key)=>{
    // Iconos simples (sin depender de imágenes externas)
    if(key==="pichincha") return "🏦";
    if(key==="guayaquil") return "💳";
    if(key==="cb") return "🏛️";
    return "🏦";
  };
  const banksHtml = CONFIG.banks.map((b,idx)=>{
    const key=(b.key||b.id||b.name||"").toLowerCase();
    return `
      <div class="bankItem" data-bank="${idx}">
        <div class="bankHead">
          <div class="bankLeft">
            <div class="bankLogo" aria-hidden="true">${bankLogo(key)}</div>
            <div>
              <div class="bankName">${escapeHtml(b.name)}</div>
              <div class="small">Toca para ver datos</div>
            </div>
          </div>
          <div class="bankChevron">▾</div>
        </div>
        <div class="bankBody">
          <small>Completa estos datos en <b>config.js</b>.</small>
          <div class="row" style="margin-top:10px">
            <div class="pill">Cuenta: ${escapeHtml(b.account||"(pega aquí)")}</div>
            <div class="pill">Tipo: ${escapeHtml(b.type||"(corriente/ahorros)")}</div>
            <div class="pill">Nombre: ${escapeHtml(b.holder||"(titular)")}</div>
            <div class="pill">Cédula/RUC: ${escapeHtml(b.idNumber||"(ID)")}</div>
          </div>
        </div>
      </div>`;
  }).join("");
  const banksEl=$("banks");
  banksEl.innerHTML = banksHtml;
  banksEl.querySelectorAll('.bankHead').forEach(head=>{
    head.addEventListener('click',()=>{
      const item=head.closest('.bankItem');
      const body=item.querySelector('.bankBody');
      const open=body.style.display==='block';
      // cerrar otros
      banksEl.querySelectorAll('.bankBody').forEach(b=>b.style.display='none');
      body.style.display = open ? 'none' : 'block';
    });
  });
}
$("shippingCost").addEventListener("input",()=>renderCart());

function renderOrders(){
  const orders=(Array.isArray(MY_ORDERS) && MY_ORDERS.length) ? MY_ORDERS : [];
  const list=$("ordersList");
  list.innerHTML=orders.length?orders.slice(0,8).map(o=>`
    <div class="item" style="align-items:flex-start;">
      <div style="min-width:0; flex:1;">
        <div style="font-weight:980; font-size:13px;">${o.id}</div>
        <div class="small" style="margin-top:4px;">Estado: <b>${escapeHtml(o.status||"nuevo")}</b> • Guía: <b>${escapeHtml(o.trackingNumber||"(pendiente)")}</b></div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
        ${o.trackingNumber?`<button class="btn" data-copy="${escapeHtml(o.trackingNumber)}">Copiar guía</button><a class="btn aqua" href="${CONFIG.servientregaTrackingUrl}" target="_blank" rel="noopener noreferrer">Rastrear</a>`:
        `<div class="small" style="max-width:170px; text-align:right;">Te enviamos la guía por WhatsApp cuando se despache.</div>`}
      </div>
    </div>`).join(""):`<div class="small">Aún no hay pedidos.</div>`;
  list.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",async(e)=>{
    await navigator.clipboard.writeText(e.currentTarget.dataset.copy); alert("Guía copiada ✅");
  }));
}

function fileToDataUrl(file){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result)); r.onerror=rej; r.readAsDataURL(file); });
}
function buildWhatsAppMessage(order){
  const lines=[];
  lines.push(`🧾 *Pedido ${CONFIG.appName}*`);
  lines.push(`ID: *${order.id}*`,"");
  lines.push("📦 *Productos:*");
  order.items.forEach(it=>lines.push(`• ${it.title} x${it.qty} = ${formatMoney(it.price*it.qty)}`));
  lines.push("",`Subtotal: *${formatMoney(order.subtotal)}*`);
  if(CONFIG.paymentMode==="deposit50"){ lines.push(`Pago de reserva (50%): *${formatMoney(order.totalDueNow)}*`,"Saldo + envío: *se confirma por WhatsApp*"); }
  else{ lines.push(`Pago ahora: *${formatMoney(order.totalDueNow)}*`, order.shippingCost?`Envío incluido: *${formatMoney(order.shippingCost)}*`:"Envío: *se confirma por WhatsApp*"); }
  lines.push("","👤 *Datos de envío:*");
  lines.push(`Nombre: ${order.shipping.fullName}`,`Cédula: ${order.shipping.cedula}`,`Teléfono: ${order.shipping.phone}`,`Ciudad: ${order.shipping.city}`,`Dirección: ${order.shipping.address}`);
  if(order.shipping.reference) lines.push(`Referencia: ${order.shipping.reference}`);
  lines.push("","💳 *Pago por transferencia/depósito*");
  if(order.proofUrl){ lines.push(`Comprobante: ${order.proofUrl}`); }
  else{ lines.push("Comprobante: (subido en el sistema)"); }
  return encodeURIComponent(lines.join("\n"));
}
function openWhatsApp(order){
  const e164=toWhatsAppE164(CONFIG.whatsapp);
  window.open(`https://wa.me/${e164}?text=${buildWhatsAppMessage(order)}`,"_blank","noopener,noreferrer");
}

function renderCart(){
  const list=$("cartList");
  const enriched=enrichCart(getCart());
  $("payPanel").style.display=enriched.length?"block":"none";
  list.innerHTML=enriched.length?enriched.map(({ci,p})=>`
    <div class="item">
      <img src="${p.imageUrl}" alt="${escapeHtml(p.title)}"/>
      <div style="min-width:0">
        <div style="font-weight:980; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.title)}</div>
        <div class="small">${formatMoney(p.price)} • ${p.category?labelCat(p.category):""}</div>
      </div>
      <div style="margin-left:auto; display:flex; align-items:center; gap:6px;">
        <button class="qtybtn" data-dec="${p.id}">−</button>
        <div style="width:24px; text-align:center; font-weight:980;">${ci.qty}</div>
        <button class="qtybtn" data-inc="${p.id}">+</button>
        <button class="trash" data-rm="${p.id}">🗑️</button>
      </div>
    </div>`).join(""):`<div class="small">Tu carrito está vacío.</div>`;
  list.querySelectorAll("[data-inc]").forEach(b=>b.addEventListener("click",(e)=>inc(e.currentTarget.dataset.inc)));
  list.querySelectorAll("[data-dec]").forEach(b=>b.addEventListener("click",(e)=>dec(e.currentTarget.dataset.dec)));
  list.querySelectorAll("[data-rm]").forEach(b=>b.addEventListener("click",(e)=>rm(e.currentTarget.dataset.rm)));
  renderPay(enriched);
  renderOrders();
}

$("btnPlaceOrder").addEventListener("click", async ()=>{
  const btn = $("btnPlaceOrder");
  const prevTxt = btn?.textContent;
  if(btn){ btn.disabled = true; btn.textContent = "Procesando…"; }

  try{
    const shipping=getShipping();
    if(!shipping){ openModal("modalReg"); return; }

    const cart=getCart();
    const enriched=enrichCart(cart);
    if(!enriched.length){ alert("Carrito vacío."); return; }

    for(const {ci,p} of enriched){
      if((p.stock||0) < (ci.qty||0)){
        alert(`Stock insuficiente para: ${p.title}`);
        return;
      }
    }

    const file = PROOF_FILE || $("proof").files?.[0] || null;
    if(!file){
      alert("Adjunta el comprobante de pago antes de realizar el pedido.");
      return;
    }

    const subtotal=enriched.reduce((s,x)=>s+(Number(x.p.price||0)*x.ci.qty),0);
    const ship=Math.max(0,Number($("shippingCost").value||0));
    const totalFinal=ship>0?subtotal+ship:null;
    const due=CONFIG.paymentMode==="deposit50"?subtotal*0.5:(totalFinal??subtotal);

    const created = await createOrderInFirestore({ shipping, cart, shippingCost: ship, proofFile: file });
    const orderId = typeof created === "string" ? created : created?.orderId;
    const proofUrl = (typeof created === "object" && created) ? (created.proofUrl||null) : null;

    if(!orderId){
      const msg = LAST_ORDER_ERROR
        ? `No se pudo crear el pedido. (${LAST_ORDER_ERROR})`
        : "No se pudo crear el pedido.";
      alert(msg);
      return;
    }

    const order={
      id: orderId,
      createdAt: Date.now(),
      shipping,
      items: enriched.map(({ci,p})=>({ title:p.title, price:Number(p.price||0), qty:ci.qty })),
      subtotal,
      shippingCost: ship>0?ship:null,
      totalDueNow: due,
      totalFinal,
      proofUrl,
    };

    // Mostrar confirmación + botón de WhatsApp (fallback iPhone/WebView)
    const e164=toWhatsAppE164(CONFIG.whatsapp || "0983706294");
    const waUrl = `https://wa.me/${e164}?text=${buildWhatsAppMessage(order)}`;

    const resBox = $("orderResult");
    const resTxt = $("orderResultText");
    const waBtn = $("btnSendWhats");
    if(resTxt) resTxt.textContent = `ID: ${order.id} • Total: ${formatMoney(due)} • Comprobante ✅`;
    LAST_WA_URL = waUrl; if(waBtn){ waBtn.style.display = "inline-flex"; }
    if(resBox) resBox.style.display = "block";

    // Intento de abrir WhatsApp (misma pestaña evita about:blank en iPhone)
    try{
      window.location.href = waUrl;
    }catch(e){
      console.warn(e);
      // si falla, el botón queda para tocarlo manual
    }

    // Guardado silencioso: limpiamos carrito y comprobante
    PROOF_FILE = null;
    $("proof").value = "";
    bindProofInput();
    setCart([]); updateCartBadge(); renderCart();

  } finally {
    if(btn){ btn.disabled = false; btn.textContent = prevTxt || "Realizar pedido"; }
  }
});


function escapeHtml(s){ return String(s??"").replace(/[&<>"']/g,(m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])); }

async function initLiveFirebase(){
  bindProofInput();
  const btnSend = $("btnSendWhats");
  const btnNew = $("btnNewOrder");
  if(btnSend) btnSend.addEventListener("click", ()=>{ if(LAST_WA_URL) window.location.href = LAST_WA_URL; });
  if(btnNew) btnNew.addEventListener("click", ()=>{ try{ closeModal("modalCart"); }catch(_){ } });
  // Evita que “productos demo” guardados en el navegador se mezclen con Firestore.
  try{ localStorage.removeItem(K.products); }catch(e){}
  // Productos (stock global)
  try{
    fb.onSnapshot(fb.collection(db, "products"), (snap)=>{
      const arr=[];
      snap.forEach(d=>arr.push({ id:d.id, ...d.data() }));
      FB_PRODUCTS_CACHE = arr
        .filter(p => (p && (p.active === undefined ? true : !!p.active)))
        .sort((a,b)=>{
          const ta=a.updatedAt?.seconds||0; const tb=b.updatedAt?.seconds||0;
          return tb-ta;
        });
      renderGrid();
    });
  }catch(e){
    console.warn("Firestore products listener failed:", e);
  }

  // Pedidos (por cliente anónimo)
  try{
    const u = await ensureAnon();
    if(u){
      const q = fb.query(
        fb.collection(db, "orders"),
        fb.where("customerUid","==",u.uid),
        fb.orderBy("createdAt","desc"),
        fb.limit(25)
      );
      fb.onSnapshot(q, (snap)=>{
        const arr=[];
        snap.forEach(d=>arr.push({ id:d.id, ...d.data() }));
        MY_ORDERS = arr;
        renderOrders();
      });
    }
  }catch(e){
    console.warn("Orders listener failed:", e);
  }
}

async function upsertCustomerProfile(profile){
  try{
    const u = await ensureAnon();
    const ref = fb.doc(db, "customers", u.uid);
    await fb.setDoc(ref, {
      ...profile,
      updatedAt: fb.serverTimestamp(),
      createdAt: fb.serverTimestamp(),
    }, { merge:true });
    return u.uid;
  }catch(e){
    console.warn("Customer save failed:", e);
    return null;
  }
}

async function createOrderInFirestore({ shipping, cart, shippingCost, proofFile }){
  try{
    LAST_ORDER_ERROR = null;
    const u = await ensureAnon();
    if(!u) throw new Error("anon-auth-failed");

    // Recalcular con precios actuales
    const products = getProducts();
    const items = cart.map(c=>{
      const p = products.find(x=>x.id===c.id) || { title:c.title, price:c.price };
      return {
        id: c.id,
        title: p.title,
        price: Number(p.price||0),
        qty: Number(c.qty||1),
        category: p.category||c.category||"",
        sub: p.sub||c.sub||"",
      };
    });
    const subtotal = items.reduce((s,i)=>s + i.price*i.qty, 0);
    const ship = Number(shippingCost||0);
    const total = subtotal + ship;
    // Mantener coherencia con CONFIG.paymentMode y lo que el cliente ve en pantalla.
    const payNow = (CONFIG.paymentMode === "deposit50")
      ? Math.round((subtotal*0.5)*100)/100
      : Math.round((total)*100)/100;
    const pointsEarned = Math.floor(subtotal/10);

    // 1) Crear el pedido primero para tener ID (si esto falla, NO hay pedido)
    const orderRef = await fb.addDoc(fb.collection(db, "orders"), {
      customerUid: u.uid,
      shipping,
      items,
      subtotal,
      shippingCost: ship,
      total,
      payNow,
      paymentMode: CONFIG.paymentMode || "full",
      status: proofFile ? "recibo_subido" : "nuevo",
      trackingNumber: "",
      pointsEarned,
      createdAt: fb.serverTimestamp(),
      updatedAt: fb.serverTimestamp(),
    });
    const orderId = orderRef.id;
    let proofUrl = null;

    // A PARTIR DE AQUÍ: todo es "best effort".
    // Si algo falla (Storage, stock, cliente), igual devolvemos el orderId.

    // 2) Subir comprobante (si existe) — si falla NO bloquea el pedido
    if(proofFile){
      try{
        const safeName = (proofFile.name||"pago.jpg").replace(/[^a-zA-Z0-9._-]/g,"_");
        const path = `orders/${u.uid}/${orderId}/${safeName}`;
        const r = fb.ref(storage, path);
        await fb.uploadBytes(r, proofFile);
        proofUrl = await fb.getDownloadURL(r);
        await fb.updateDoc(fb.doc(db, "orders", orderId), {
          proofUrl,
          proofName: safeName,
          status: "recibo_subido",
          updatedAt: fb.serverTimestamp(),
        });
      }catch(e){
        console.warn("Proof upload failed:", e);
        // marcamos el pedido para que admin sepa que faltó comprobante
        try{ await fb.updateDoc(fb.doc(db, "orders", orderId), { status:"nuevo", proofError:true, updatedAt: fb.serverTimestamp() }); }catch(_){ }
      }
    }

    // 3) Descontar stock + actualizar cliente (transacción)
    // OJO: si tus Rules NO permiten al cliente modificar products/customers, esto fallará.
    // En ese caso, igual devolvemos orderId.
    try{ await fb.runTransaction(db, async (tx)=>{
      // stock
      for(const it of items){
        const pref = fb.doc(db, "products", it.id);
        const snap = await tx.get(pref);
        if(!snap.exists()) continue;
        const cur = snap.data().stock ?? 0;
        const next = Math.max(0, Number(cur) - Number(it.qty||1));
        tx.update(pref, { stock: next, updatedAt: fb.serverTimestamp() });
      }
      // cliente
      const cref = fb.doc(db, "customers", u.uid);
      const csnap = await tx.get(cref);
      const prev = csnap.exists() ? csnap.data() : {};
      const prevPoints = Number(prev.points||0);
      const prevSpent = Number(prev.totalSpent||0);
      const prevCount = Number(prev.ordersCount||0);
      tx.set(cref, {
        uid: u.uid,
        fullName: shipping.fullName,
        cedula: shipping.cedula,
        phone: shipping.phone,
        city: shipping.city,
        address: shipping.address,
        reference: shipping.reference||"",
        points: prevPoints + pointsEarned,
        totalSpent: Math.round((prevSpent + subtotal)*100)/100,
        ordersCount: prevCount + 1,
        lastOrderId: orderId,
        lastOrderAt: fb.serverTimestamp(),
        updatedAt: fb.serverTimestamp(),
        createdAt: prev.createdAt || fb.serverTimestamp(),
      }, { merge:true });
    }); }catch(e){
      console.warn("Post-order transaction failed:", e);
      try{ await fb.updateDoc(fb.doc(db, "orders", orderId), { postProcessError:true, updatedAt: fb.serverTimestamp() }); }catch(_){ }
    }

    return { orderId, proofUrl };
  }catch(e){
    console.warn("Order create failed:", e);
    // Guardamos el error real para mostrarlo
    LAST_ORDER_ERROR = e?.code || e?.message || String(e);
    return null;
  }
}


ensurePWA();
buildCategoryPills();
buildSubPills();
renderGrid();
renderOrders();
updateCartBadge();
startRotation();
initLiveFirebase();
if(!localStorage.getItem("njge_ios_hint_dismissed")) showIOSHint();

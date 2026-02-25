import { CONFIG } from "./config.js";
import { auth, db, storage, fb } from "./firebase-init.js";

const $ = (id)=>document.getElementById(id);
const escapeHtml = (s)=>String(s??"")
  .replaceAll("&","&amp;")
  .replaceAll("<","&lt;")
  .replaceAll(">","&gt;")
  .replaceAll('"',"&quot;")
  .replaceAll("'","&#039;");

function show(id){
  const el=$(id);
  if(!el) return;
  if(el.classList && el.classList.contains("modal")) el.style.display="flex";
  else el.style.display="";
}
function hide(id){ const el=$(id); if(el) el.style.display="none"; }

function setActiveTab(tab){
  ["panelClientes","panelPedidos","panelAgregar"].forEach(hide);
  if(tab==="clientes") show("panelClientes");
  if(tab==="pedidos") show("panelPedidos");
  if(tab==="agregar") show("panelAgregar");
}

function money(n){
  const v = Number(n||0);
  return `$${v.toFixed(2)}`;
}

/* ===== ADMIN GUARD (DEFINITIVO) ===== */
async function forceAdminSession(){
  const u = auth.currentUser;

  // Si NO hay UID configurado, no sigas: sin esto nunca será “definitivo”.
  if(!CONFIG.adminUid){
    show("firebaseLogin");
    hide("adminArea");
    $("logoutFirebase").style.display = "none";
    try{ alert("Falta configurar CONFIG.adminUid en config.js (UID del admin)."); }catch(_){}
    return false;
  }

  // Si está como anónimo, afuera.
  if(u && u.isAnonymous){
    show("firebaseLogin");
    hide("adminArea");
    $("logoutFirebase").style.display = "none";
    try{ await fb.signOut(auth); }catch(_){}
    return false;
  }

  // Si no hay user, mostrar login
  if(!u){
    show("firebaseLogin");
    hide("adminArea");
    $("logoutFirebase").style.display = "none";
    return false;
  }

  // UID debe coincidir
  if(u.uid !== CONFIG.adminUid){
    show("firebaseLogin");
    hide("adminArea");
    $("logoutFirebase").style.display = "none";
    try{ alert("Esta cuenta NO es admin de esta tienda."); }catch(_){}
    try{ await fb.signOut(auth); }catch(_){}
    return false;
  }

  // ok
  hide("firebaseLogin");
  show("adminArea");
  $("logoutFirebase").style.display = "";
  return true;
}

/* ===== LOGIN ===== */
$("loginFirebase").addEventListener("click", async ()=>{
  const email = $("fbEmail").value.trim();
  const pass = $("fbPass").value;
  try{
    await fb.signInWithEmailAndPassword(auth, email, pass);
    const ok = await forceAdminSession();
    if(!ok) return;
    setActiveTab("pedidos");
    await Promise.all([loadOrders(), loadProducts(), loadClientes()]);
  }catch(e){
    console.warn(e);
    alert("No se pudo iniciar sesión. Revisa correo/clave.");
  }
});

$("logoutFirebase").addEventListener("click", async ()=>{
  await fb.signOut(auth);
  show("firebaseLogin");
  hide("adminArea");
  $("logoutFirebase").style.display = "none";
});

fb.onAuthStateChanged(auth, async ()=>{
  const ok = await forceAdminSession();
  if(!ok) return;
  setActiveTab("pedidos");
  await Promise.all([loadOrders(), loadProducts(), loadClientes()]);
});

$("fbPass").addEventListener("keydown", (e)=>{ if(e.key==="Enter") $("loginFirebase").click(); });
$("fbEmail").addEventListener("keydown", (e)=>{ if(e.key==="Enter") $("loginFirebase").click(); });

/* ===== TABS ===== */
$("tabClientes").addEventListener("click", ()=>{ setActiveTab("clientes"); loadClientes(); });
$("tabPedidos").addEventListener("click", ()=>{ setActiveTab("pedidos"); loadOrders(); });
$("tabAgregar").addEventListener("click", ()=>{ setActiveTab("agregar"); loadProducts(); });

$("btnRefreshOrders").addEventListener("click", loadOrders);
$("btnRefreshClientes").addEventListener("click", loadClientes);

/* ===== CLIENTES ===== */
async function loadClientes(){
  const wrap = $("adminClientes");
  wrap.innerHTML = '<div class="small">Cargando…</div>';

  // Intento con orderBy
  try{
    const q = fb.query(
      fb.collection(db,"customers"),
      fb.orderBy("updatedAt","desc"),
      fb.limit(200)
    );
    const snap = await fb.getDocs(q);
    const items=[];
    snap.forEach(d=>items.push({id:d.id, ...d.data()}));
    renderClientes(items);
    return;
  }catch(e){
    console.warn("loadClientes primary failed:", e);
  }

  // Fallback sin orderBy
  try{
    const q2 = fb.query(
      fb.collection(db,"customers"),
      fb.limit(200)
    );
    const snap2 = await fb.getDocs(q2);
    const items2=[];
    snap2.forEach(d=>items2.push({id:d.id, ...d.data()}));
    items2.sort((a,b)=>{
      const ta=a.updatedAt?.seconds||0, tb=b.updatedAt?.seconds||0;
      return tb-ta;
    });
    renderClientes(items2);
  }catch(e2){
    console.warn("loadClientes fallback failed:", e2);
    wrap.innerHTML = '<div class="small">No se pudo cargar clientes.</div>';
  }
}

function renderClientes(items){
  const wrap = $("adminClientes");
  wrap.innerHTML = items.length ? items.map(c=>{
    const name = c.fullName || "(sin nombre)";
    const pts = Number(c.points||0);
    const spent = Number(c.totalSpent||0);
    const cnt = Number(c.ordersCount||0);
    return `
      <div class="item" style="align-items:flex-start;">
        <div style="min-width:0; flex:1;">
          <div style="font-weight:980;">${escapeHtml(name)}</div>
          <div class="small" style="margin-top:4px;">
            Tel: <b>${escapeHtml(c.phone||"-")}</b> • Cédula: <b>${escapeHtml(c.cedula||"-")}</b>
          </div>
          <div class="small" style="margin-top:4px;">${escapeHtml(c.city||"")}${c.address?" • "+escapeHtml(c.address):""}</div>
          <div class="small" style="margin-top:6px;">Puntos: <b>${pts}</b> • Compras: <b>${cnt}</b> • Total: <b>${money(spent)}</b></div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end;">
          <button class="btn" data-view-orders="${escapeHtml(c.id)}">Ver pedidos</button>
        </div>
      </div>`;
  }).join("") : '<div class="small">Aún no hay clientes.</div>';

  wrap.querySelectorAll("[data-view-orders]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const uid = btn.getAttribute("data-view-orders");
      await showOrdersForCustomer(uid);
    });
  });
}

async function showOrdersForCustomer(customerUid){
  setActiveTab("pedidos");
  const wrap = $("adminOrders");
  wrap.innerHTML = '<div class="small">Cargando pedidos del cliente…</div>';

  // Intento con orderBy
  try{
    const q = fb.query(
      fb.collection(db,"orders"),
      fb.where("customerUid","==",customerUid),
      fb.orderBy("createdAt","desc"),
      fb.limit(100)
    );
    const snap = await fb.getDocs(q);
    const orders=[];
    snap.forEach(d=>orders.push({id:d.id, ...d.data()}));
    renderOrders(orders);
    return;
  }catch(e){
    console.warn("showOrdersForCustomer primary failed:", e);
  }

  // Fallback sin orderBy
  try{
    const q2 = fb.query(
      fb.collection(db,"orders"),
      fb.where("customerUid","==",customerUid),
      fb.limit(100)
    );
    const snap2 = await fb.getDocs(q2);
    const orders2=[];
    snap2.forEach(d=>orders2.push({id:d.id, ...d.data()}));
    orders2.sort((a,b)=>{
      const ta=a.createdAt?.seconds||0, tb=b.createdAt?.seconds||0;
      return tb-ta;
    });
    renderOrders(orders2);
  }catch(e2){
    console.warn("showOrdersForCustomer fallback failed:", e2);
    wrap.innerHTML = '<div class="small">No se pudo cargar pedidos.</div>';
  }
}

/* ===== PEDIDOS ===== */
async function loadOrders(){
  const wrap = $("adminOrders");
  wrap.innerHTML = '<div class="small">Cargando…</div>';

  // Intento con orderBy
  try{
    const q = fb.query(
      fb.collection(db,"orders"),
      fb.orderBy("createdAt","desc"),
      fb.limit(200)
    );
    const snap = await fb.getDocs(q);
    const orders=[];
    snap.forEach(d=>orders.push({id:d.id, ...d.data()}));
    renderOrders(orders);
    return;
  }catch(e){
    console.warn("loadOrders primary failed:", e);
  }

  // Fallback sin orderBy
  try{
    const q2 = fb.query(
      fb.collection(db,"orders"),
      fb.limit(200)
    );
    const snap2 = await fb.getDocs(q2);
    const orders2=[];
    snap2.forEach(d=>orders2.push({id:d.id, ...d.data()}));
    orders2.sort((a,b)=>{
      const ta=a.createdAt?.seconds||0, tb=b.createdAt?.seconds||0;
      return tb-ta;
    });
    renderOrders(orders2);
  }catch(e2){
    console.warn("loadOrders fallback failed:", e2);
    wrap.innerHTML = '<div class="small">No se pudo cargar pedidos.</div>';
  }
}

function renderOrders(orders){
  const wrap = $("adminOrders");

  wrap.innerHTML = orders.length ? orders.map(o=>{
    const ship = o.shipping || {};
    const status = o.status || "nuevo";
    const tracking = o.trackingNumber || "";

    const proofUrl =
      o.proofUrl || o.proofURL ||
      o.receiptUrl || o.receiptURL ||
      o.comprobanteUrl || o.comprobanteURL ||
      o.voucherUrl || o.voucherURL || "";

    const items = Array.isArray(o.items) ? o.items : [];
    const lines = items.map(it=>`• ${escapeHtml(it.title||"Producto")} x${Number(it.qty||1)} (${money(it.price||0)})`).join("<br>");

    return `
    <div class="item" style="align-items:flex-start;">
      <div style="min-width:0; flex:1;">
        <div style="font-weight:980;">Pedido: ${escapeHtml(o.id)}</div>
        <div class="small" style="margin-top:4px;">Cliente: <b>${escapeHtml(ship.fullName||"-")}</b> • Tel: <b>${escapeHtml(ship.phone||"-")}</b></div>
        <div class="small" style="margin-top:6px; line-height:1.35;">${lines || "(sin items)"}</div>
        <div class="small" style="margin-top:6px;">Subtotal: <b>${money(o.subtotal||0)}</b> • Envío: <b>${money(o.shippingCost||0)}</b> • Total: <b>${money(o.total||0)}</b></div>
        ${proofUrl ? `
          <div style="margin-top:10px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <a class="btn" href="${escapeHtml(proofUrl)}" target="_blank" rel="noopener noreferrer">Ver comprobante</a>
            <img class="proofThumb" src="${escapeHtml(proofUrl)}" alt="Comprobante" style="height:70px; border-radius:10px; border:1px solid rgba(255,255,255,.15);" />
          </div>` : ""}
      </div>
      <div style="display:flex; flex-direction:column; gap:8px; min-width:170px;">
        <select class="input" data-status="${escapeHtml(o.id)}">
          ${["nuevo","recibo_subido","aprobado","enviado","entregado","cancelado"].map(s=>`<option value="${s}" ${s===status?"selected":""}>${s}</option>`).join("")}
        </select>
        <input class="input" data-tracking="${escapeHtml(o.id)}" placeholder="Guía (Servientrega)" value="${escapeHtml(tracking)}" />
        <button class="btn primary" data-save="${escapeHtml(o.id)}">Actualizar</button>
      </div>
    </div>`;
  }).join("") : '<div class="small">No hay pedidos aún.</div>';

  wrap.querySelectorAll("[data-save]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-save");
      const status = wrap.querySelector(`[data-status="${CSS.escape(id)}"]`)?.value || "nuevo";
      const tracking = wrap.querySelector(`[data-tracking="${CSS.escape(id)}"]`)?.value?.trim() || "";
      try{
        await fb.updateDoc(fb.doc(db,"orders",id), {
          status,
          trackingNumber: tracking,
          updatedAt: fb.serverTimestamp(),
        });
        btn.textContent = "Actualizado";
        setTimeout(()=>btn.textContent="Actualizar", 800);
      }catch(e){
        console.warn(e);
        alert("No se pudo actualizar.");
      }
    });
  });
}

/* ===== PRODUCTOS: tu mismo código (no lo toco) ===== */
$("btnAddProduct").addEventListener("click", ()=>{
  show("productModal");
  $("pmTitle").value="";
  $("pmBrand").value="";
  $("pmPrice").value="";
  $("pmStock").value="";
  $("pmCategory").value="ropa";
  $("pmSub").value="";
  $("pmSizeLabel").value="";
  $("pmSizeValue").value="";
  $("pmCm").value="";
  $("pmImage").value="";
  $("pmId").value="";
});
$("pmClose").addEventListener("click", ()=>hide("productModal"));

$("pmSave").addEventListener("click", async ()=>{
  const id = $("pmId").value.trim();
  const title = $("pmTitle").value.trim();
  const brand = $("pmBrand").value.trim();
  const category = $("pmCategory").value;
  const sub = $("pmSub").value;
  const price = Number($("pmPrice").value||0);
  const stock = Number($("pmStock").value||0);
  const sizeLabel = $("pmSizeLabel").value.trim();
  const sizeValue = $("pmSizeValue").value.trim();
  const cm = $("pmCm").value.trim();
  const file = $("pmImage").files?.[0] || null;

  if(!title || !category){
    alert("Completa al menos: Título y Categoría.");
    return;
  }

  try{
    let imageUrl = $("pmImageUrl").value || "";
    if(file){
      const safe = (file.name||"img.jpg").replace(/[^a-zA-Z0-9._-]/g,"_");
      const path = `products/${Date.now()}_${safe}`;
      const r = fb.ref(storage, path);
      await fb.uploadBytes(r, file);
      imageUrl = await fb.getDownloadURL(r);
    }

    const payload = {
      title, brand, category,
      subcategory: sub, sub,
      price, stock,
      sizeLabel, sizeValue, cm,
      imageUrl,
      active: true,
      updatedAt: fb.serverTimestamp(),
      createdAt: fb.serverTimestamp(),
    };

    if(id) await fb.updateDoc(fb.doc(db,"products",id), payload);
    else await fb.addDoc(fb.collection(db,"products"), payload);

    hide("productModal");
    await loadProducts();
  }catch(e){
    console.warn(e);
    alert("No se pudo guardar el producto.");
  }
});

async function loadProducts(){
  const wrap = $("adminProducts");
  wrap.innerHTML = '<div class="small">Cargando…</div>';
  try{
    const q = fb.query(
      fb.collection(db,"products"),
      fb.orderBy("updatedAt","desc"),
      fb.limit(300)
    );
    const snap = await fb.getDocs(q);
    const items=[];
    snap.forEach(d=>items.push({id:d.id, ...d.data()}));
    const visible = items.filter(p => (p && (p.active === undefined ? true : !!p.active)));
    wrap.innerHTML = visible.length ? visible.map(p=>{
      const meta = [p.brand, p.category, p.sub].filter(Boolean).join(" • ");
      const size = p.sizeLabel && p.sizeValue ? `${p.sizeLabel}: ${p.sizeValue}` : (p.sizeValue?`${p.sizeValue}`:"");
      const cm2 = p.cm ? ` • cm: ${escapeHtml(p.cm)}` : "";
      return `
      <div class="item" style="align-items:flex-start;">
        <div style="width:56px; height:56px; border-radius:12px; overflow:hidden; background:rgba(255,255,255,.06); flex:0 0 56px;">
          ${p.imageUrl?`<img src="${escapeHtml(p.imageUrl)}" style="width:100%; height:100%; object-fit:cover;" />`:""}
        </div>
        <div style="min-width:0; flex:1;">
          <div style="font-weight:980;">${escapeHtml(p.title||"Producto")}</div>
          <div class="small" style="margin-top:4px;">${escapeHtml(meta)}</div>
          <div class="small" style="margin-top:4px;">${size?escapeHtml(size):""}${cm2}</div>
          <div class="small" style="margin-top:6px;">Precio: <b>${money(p.price||0)}</b> • Stock: <b>${Number(p.stock||0)}</b></div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end;">
          <button class="btn" data-edit="${escapeHtml(p.id)}">Editar</button>
          <button class="btn" data-del="${escapeHtml(p.id)}">Eliminar</button>
        </div>
      </div>`;
    }).join("") : '<div class="small">No hay productos aún.</div>';
  }catch(e){
    console.warn(e);
    wrap.innerHTML = '<div class="small">No se pudo cargar productos.</div>';
  }
}

/* INIT */
hide("adminArea");
show("firebaseLogin");
setActiveTab("pedidos");

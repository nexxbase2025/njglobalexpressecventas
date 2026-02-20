export const CONFIG = {
  appName: "NJ Global Express EC",
  subtitle: "Compras Ecuador",
  whatsapp: "0983706294",
  socials: {
    instagram: "https://example.com",
    tiktok: "https://example.com",
    facebook: "https://example.com",
  },
  // Completa estos datos (se muestran al tocar el banco en el carrito)
  banks: [
    { key: "pichincha", name: "Banco Pichincha", account: "(pega aquí)", type: "(ahorros/corriente)", holder: "(titular)", idNumber: "(cédula/RUC)" },
    { key: "guayaquil", name: "Banco Guayaquil", account: "(pega aquí)", type: "(ahorros/corriente)", holder: "(titular)", idNumber: "(cédula/RUC)" },
    { key: "cb", name: "CB Cooperativa", account: "(pega aquí)", type: "(ahorros/corriente)", holder: "(titular)", idNumber: "(cédula/RUC)" },
  ],
  paymentMode: "deposit50", // "deposit50" o "full"
  servientregaTrackingUrl: "https://www.servientrega.com.ec/TrackingNoLocalizado/Index/0?mensaje=La%20gu%C3%ADa%20con%20n%C3%BAmero%20%2C%20no%20se%20encuentra%20en%20el%20sistema.%20Verifique%20que%20el%20n%C3%BAmero%20de%20gu%C3%ADa%20sea%20el%20correcto%20y%20consulte%20una%20vez%20m%C3%A1s%2C%20o%20comuniquese%20con%20su%20asesor%20comercial.%20&titulo=Gu%C3%ADa%20no%20encontrada",
  // Admin es por Email/Password de Firebase Auth (ya no usamos PIN demo)

  // Pega aquí tu UID de Firebase (solo este UID podrá entrar al Admin)
  adminUid: "bAytuyDJDEasrhwOYcp9LSbwFgu1",

  
categoryColors: {
  all: "rgba(0,180,255,.18)",
  ropa: "rgba(255,60,90,.20)",
  calzado: "rgba(0,200,255,.18)",
  bisuteria: "rgba(0,255,170,.16)",
  electronica: "rgba(170,120,255,.18)",
},

categories: [

    { id: "ropa", label: "Ropa", subs: ["Dama", "Caballero", "Niños"] },
    { id: "calzado", label: "Calzado", subs: ["Dama", "Caballero", "Niños"] },
    { id: "bisuteria", label: "Bisutería", subs: ["Dama", "Caballero", "Niños"] },
    { id: "electronica", label: "Electrónica", subs: [] },
  ],

  featuredRotationMs: 6500,
};

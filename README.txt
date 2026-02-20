NJ Global Express EC – PWA Ventas

ARCHIVOS (12 con logo):
- index.html
- styles.css
- app.js
- admin.html
- admin.js
- config.js
- firebase-config.js
- firebase-init.js
- manifest.json
- sw.js
- (logo.png)

REQUISITOS EN FIREBASE (para que funcione 100%):
1) Authentication
   - Habilita Email/Password (para Admin)
   - Habilita Anonymous (para que los clientes puedan hacer pedidos sin login)

2) Firestore Database
   Colecciones:
   - products
   - customers
   - orders

3) Storage
   - Se usa para guardar el comprobante (foto/captura) del pedido.

REGLAS RECOMENDADAS (rápidas para arrancar)
Firestore (Rules):
- Permite que usuarios anónimos creen/lean products (solo lectura)
- Permite que usuarios anónimos creen orders y customers (solo su UID)
- Permite que ADMIN (adminUid en config.js) lea TODO.

TIP: Si algo “se queda viejo” en Vercel
- Cambia el número de CACHE en sw.js y vuelve a deploy.

ADMIN
- En la app: toca 4 veces rápido el texto “Compras Ecuador” para abrir login.
- Login con tu Email/Password (Firebase Auth).

NOTA
- El botón del navegador “Seleccionar archivo” NO se puede renombrar.
  Por eso el texto arriba dice: “Comprobante de pago (foto o captura)”.

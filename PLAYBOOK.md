# Playbook: test + dashboard en tiempo real (replicable por cliente)

Sistema de 3 piezas. Cada cliente nuevo = 1 proyecto Supabase + 1 repo del test + 1 repo del dashboard.

```
[Test (HTML estático, Vercel)] --INSERT con clave pública--> [Supabase: tabla resultados]
                                                                   ^
[Dashboard (Vercel + 2 funciones /api)] --lee con clave secreta----+
        ^ clave de acceso (cookie firmada, 12 h)
```

**Seguridad (no negociable)**
- La clave `sb_publishable_...` va en el test (pública). Con RLS solo puede INSERTAR y solo con `consentimiento = true`. No puede leer, editar ni borrar.
- La clave `sb_secret_...` y la clave del dashboard viven SOLO en variables de entorno de Vercel. Nunca en el repo ni en el chat.
- El dashboard lee a través de `/api/data`, que valida la cookie antes de hablar con Supabase.

---

## 0. Qué cambia por cliente (checklist de adaptación)

| Qué | Dónde | Ejemplo en Wendy |
|---|---|---|
| Proyecto Supabase nuevo | supabase.com | `test-liderazgo` |
| Columnas de resultado (bloques/escalas) | SQL (paso 1), `sendResult()` del test, `COLS`, `BLOCKS`, `pct()` y KPIs del dashboard | b1..b4 de 5 a 25 |
| Perfiles / niveles | `PERFILES`, clases `.p-1/.p-2/.p-3` | Modo jefe / En construcción / Hace crecer |
| Campos del participante | formulario del test + columnas SQL | nombre, email, empresa, grupo |
| Marca | logos en `/assets`, variables `:root`, fuentes | colores Wendy |
| Texto de consentimiento | formulario del test | correo de contacto para borrar datos |
| Variables Vercel | 3 por dashboard | ver paso 4 |

---

## 1. Supabase: proyecto y tabla

1. supabase.com → New project (nombre del cliente, región cercana, contraseña de BD guardada por ti). Esperar a "Healthy".
2. SQL Editor → pegar y ejecutar (ajusta columnas/rangos al test del cliente):

```sql
create table public.resultados (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null check (char_length(nombre) between 1 and 120),
  email text not null check (char_length(email) between 3 and 200),
  empresa text check (char_length(empresa) <= 120),
  grupo text check (char_length(grupo) <= 120),
  consentimiento boolean not null check (consentimiento = true),
  respuestas smallint[] not null check (array_length(respuestas,1) = 20),  -- nº de preguntas
  b1 smallint not null check (b1 between 5 and 25),
  b2 smallint not null check (b2 between 5 and 25),
  b3 smallint not null check (b3 between 5 and 25),
  b4 smallint not null check (b4 between 5 and 25),
  total smallint not null check (total between 20 and 100),
  perfil text not null,
  bloque_bajo text not null
);

alter table public.resultados enable row level security;

create policy "anon puede insertar" on public.resultados
  for insert to anon with check (consentimiento = true);

grant insert on public.resultados to anon;
revoke select, update, delete on public.resultados from anon;
```

3. Settings → API Keys: anota la **Project URL**, la **Publishable key** (`sb_publishable_...`) y, solo para Vercel, la **Secret key** (`sb_secret_...`).

**Verificación (debe dar 201 / permiso denegado):**
```js
// node, usa fetch con UTF-8 (curl en Windows rompe los acentos)
const K="<publishable>",U="<url>/rest/v1/resultados";
const h={"Content-Type":"application/json",apikey:K,Authorization:"Bearer "+K};
fetch(U,{method:"POST",headers:{...h,Prefer:"return=minimal"},body:JSON.stringify({nombre:"PRUEBA BORRAR",email:"p@x.co",consentimiento:true,respuestas:Array(20).fill(3),b1:15,b2:15,b3:15,b4:15,total:60,perfil:"x",bloque_bajo:"y"})}).then(r=>console.log("insert",r.status));   // 201
fetch(U+"?select=*",{headers:h}).then(r=>console.log("read",r.status));                                                                      // 401/403
```
Borra la fila de prueba en el SQL Editor: `delete from public.resultados where nombre like 'PRUEBA BORRAR%';`

---

## 2. El test: qué agregar a cualquier test estático

**a) Estado** (añadir `lead` y `sent` al objeto de estado que ya se guarda en localStorage):
```js
const SB_URL="https://XXXX.supabase.co", SB_KEY="sb_publishable_XXXX"; // pública: solo inserta
let st={ /* ...lo existente... */ lead:null, sent:false };
```

**b) Pantalla de datos** (nueva `<section id="s-data" hidden>`; añadir `"data"` a la lista de pantallas que maneja `show()`):
```html
<section id="s-data" hidden><div class="wrap">
  <form class="lead" id="lead-form" novalidate>
    <h2>Cuéntanos quién eres</h2>
    <label class="field"><span>Nombre y apellido</span><input type="text" id="f-nombre" autocomplete="name" maxlength="120" required></label>
    <label class="field"><span>Correo electrónico</span><input type="email" id="f-email" autocomplete="email" maxlength="200" required></label>
    <label class="field"><span>Empresa <i>(opcional)</i></span><input type="text" id="f-empresa" maxlength="120"></label>
    <label class="field"><span>Grupo o taller <i>(opcional)</i></span><input type="text" id="f-grupo" maxlength="120"></label>
    <label class="consent"><input type="checkbox" id="f-consent"><span>Autorizo a [MARCA] a guardar y tratar mi nombre, correo y respuestas del test para [FINALIDAD]. Puedo pedir que borren mis datos escribiendo a [CORREO].</span></label>
    <div class="lead-err" id="lead-err" role="alert"></div>
    <button class="btn btn-grad" type="submit">Comenzar el test →</button>
    <button class="linkbtn" id="lead-back" type="button">← Volver</button>
  </form>
</div></section>
```

**c) Lógica** (el botón "Empezar" abre el formulario; al enviar, empieza el test):
```js
function beginQuiz(){ /* resetea respuestas */ st.sent=false; show("quiz"); renderQ(); }
function openLead(){ const L=st.lead||{};
  $("f-nombre").value=L.nombre||"";$("f-email").value=L.email||"";$("f-empresa").value=L.empresa||"";$("f-grupo").value=L.grupo||"";$("f-consent").checked=!!L.ok;
  $("lead-err").textContent="";show("data"); }
$("btn-start").addEventListener("click",()=>{ if(st.lead&&st.lead.ok)beginQuiz(); else openLead(); });
$("lead-back").addEventListener("click",()=>show("intro"));
$("lead-form").addEventListener("submit",e=>{ e.preventDefault();
  const nombre=$("f-nombre").value.trim(),email=$("f-email").value.trim(),err=$("lead-err");
  if(!nombre){err.textContent="Escribe tu nombre.";return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){err.textContent="Escribe un correo válido.";return;}
  if(!$("f-consent").checked){err.textContent="Necesitamos tu autorización para continuar.";return;}
  st.lead={nombre,email,empresa:$("f-empresa").value.trim(),grupo:$("f-grupo").value.trim(),ok:true};
  beginQuiz(); });
```

**d) Envío** (llamar `sendResult(...)` al mostrar el resultado; reintenta solo si falló):
```js
function sendResult(scores,total,P,low){
  if(st.sent||!st.lead||!st.lead.ok)return;
  const body={nombre:st.lead.nombre,email:st.lead.email,empresa:st.lead.empresa||null,grupo:st.lead.grupo||null,consentimiento:true,
    respuestas:st.answers,b1:scores[0],b2:scores[1],b3:scores[2],b4:scores[3],total,perfil:P.name,bloque_bajo:BLOCKS[low].name};
  fetch(SB_URL+"/rest/v1/resultados",{method:"POST",keepalive:true,
    headers:{"Content-Type":"application/json",apikey:SB_KEY,Authorization:"Bearer "+SB_KEY,Prefer:"return=minimal"},
    body:JSON.stringify(body)}).then(r=>{if(r.ok){st.sent=true;save();}}).catch(()=>{});
}
```
Reglas: `Prefer: return=minimal` es obligatorio (sin permiso de lectura, pedir la fila de vuelta falla). Al "repetir el test" conserva `st.lead` y pon `sent:false`.

---

## 3. El dashboard: copiar este repo

Estructura (no requiere build):
```
index.html        UI: login, filtros, KPIs, 4 gráficos (Chart.js 4.4.1 por CDN), tabla, detalle, CSV
api/_auth.js      cookie firmada HMAC (12 h), HttpOnly+Secure+SameSite=Strict
api/login.js      POST valida DASHBOARD_PASSWORD (frena fuerza bruta 800 ms) · GET estado · DELETE sale
api/data.js       con sesión válida, lee `resultados` con la secret key (máx. 10 000 filas)
assets/           logos y favicon del cliente
package.json      {"private":true,"engines":{"node":">=18"}}
.gitignore        node_modules, .vercel, .env*
```

Qué tocar en `index.html` para otro cliente:
- `BLOCKS`, `COLORS`, `PERFILES`, `COLS` y la función `pct` (divisor 25 = máximo por bloque).
- KPIs en `renderKpis()` y gráficos en `renderCharts()` (el de "por grupo" cae a empresa si no hay grupos).
- Variables `:root` y logos para la marca.
- Seguridad ya resuelta: todo texto de usuario pasa por `esc()` (anti-XSS) y el CSV neutraliza fórmulas (`=`, `+`, `-`, `@`).

---

## 4. Despliegue (cada cliente)

1. GitHub: repo vacío para el test y otro para el dashboard; `git push`.
2. Vercel → Add New → Project → importar cada repo. Preset **Other**, sin build ni output.
3. En el proyecto del **dashboard**, antes de Deploy, Environment Variables (Production y Preview):

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | `https://XXXX.supabase.co` |
| `SUPABASE_SECRET_KEY` | la `sb_secret_...` (la pegas tú) |
| `DASHBOARD_PASSWORD` | clave que eliges por cliente |

4. Deploy. Si cambias una variable después, hay que **redesplegar** para que aplique.
5. Prueba E2E: responder el test en el link público → entrar al dashboard con la clave → ver la fila → borrar la fila de prueba.

---

## 5. Problemas conocidos

- **Acentos rotos en pruebas con `curl` de Windows** (400): usar Node `fetch`, no curl.
- **El test público no cambia tras el push:** verifica en Vercel → Deployments que el commit esté "Ready" y que pruebas el dominio real del proyecto (Settings → Domains), no uno parecido.
- **Dashboard dice "Faltan variables":** revisa nombres exactos y redespliega.
- **Dashboard 401 en loop:** `SUPABASE_SECRET_KEY` firma la cookie; si la rotas, se cierran las sesiones (esperado).
- **Supabase SQL pide confirmar un `delete`:** es normal ("Potential issue detected").

## 6. Mejoras si el cliente las pide
- Clave distinta por persona/rol (Supabase Auth en vez de clave única).
- Más de un test por proyecto: añadir columna `test_id` y un filtro.
- Alertas por correo ante nuevos resultados (Supabase Database Webhooks).
- Vista por participante a lo largo del tiempo (si repite el test).
- Exportar el dashboard a PDF para entregar a gerencia.

---

## 7. Prompt para pegar en Claude Code (proyecto nuevo del cliente)

> Replica el sistema "test + dashboard en tiempo real" descrito en PLAYBOOK.md de https://github.com/AyllonJDN/dashboard-liderazgo para este cliente.
> Cliente: [NOMBRE]. Marca: [colores/fuentes/logos en /assets].
> Test: [describe bloques, nº de preguntas, escala, perfiles].
> Pasos: (1) adapta el SQL del playbook a este test y guíame para ejecutarlo en Supabase; (2) añade formulario con consentimiento y `sendResult` al test actual; (3) crea el repo del dashboard copiando la estructura y adaptando `BLOCKS`, `COLS`, `PERFILES`, KPIs y marca; (4) déjame los commits listos y dime exactamente las 3 variables de entorno para Vercel.
> Reglas: nunca pidas ni escribas claves secretas ni contraseñas; yo las pongo en Vercel. Verifica insert=201 y lectura anónima bloqueada antes de desplegar.

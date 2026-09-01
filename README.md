# Dashboard · Programa de Nivelación (UCSUR)

Dashboard interactivo (participantes, asistencia, rendimiento, satisfacción, comparativo
histórico y exportación de informe) para el Programa de Nivelación del Departamento
Académico de Cursos Básicos. Recrea el reporte de Power BI original a partir de los
formatos oficiales **GIE-DCB-FOR-01** (asistencia y calificaciones) y **GIE-DCB-FOR-02**
(satisfacción).

**Arranca vacío, sin datos de ejemplo.** La primera vez que se abre, cada pestaña muestra
un aviso pidiendo subir los Excel oficiales desde el panel superior — no hay que borrar
ni ignorar ninguna data de muestra.

No usa backend ni base de datos: es HTML/CSS/JS puro que corre 100% en el navegador.

---

## 0. Crear el repositorio en GitHub (primera vez)

**Necesitas:** una cuenta en [github.com](https://github.com) (gratis) y tener
[Git](https://git-scm.com/downloads) instalado en tu computadora.

**A) Crear el repo vacío en GitHub:**
1. Entra a [github.com/new](https://github.com/new).
2. Ponle un nombre, ej. `nivelacion-dashboard`.
3. Puede ser público o privado (Pages funciona en ambos casos si tienen GitHub Pro/Team/Enterprise;
   con cuenta gratuita, Pages solo funciona en repos **públicos**).
4. **No marques** "Add a README" ni ".gitignore" — ya vienen incluidos en esta carpeta.
5. Clic en **Create repository**. GitHub te mostrará una página con comandos — los de abajo
   son básicamente esos.

**B) Subir esta carpeta desde tu computadora:**

```bash
# Entra a la carpeta del proyecto (donde está este README)
cd nivelacion-dashboard

# Inicializa git y sube todo
git init
git add .
git commit -m "Primera versión del dashboard"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/nivelacion-dashboard.git
git push -u origin main
```

Reemplaza `TU-USUARIO` por tu usuario de GitHub. Si te pide autenticación, GitHub ya no
acepta contraseña normal — usa un
[Personal Access Token](https://github.com/settings/tokens) como contraseña, o
[GitHub Desktop](https://desktop.github.com/) si prefieres una interfaz gráfica en vez
de la terminal.

**C) Invitar al equipo:** en el repo → **Settings → Collaborators → Add people** →
busca su usuario de GitHub. Así todos pueden hacer `git push` de las actualizaciones de
datos (sección "Actualizar los datos que ve todo el equipo" más abajo).

Con eso ya está el repo. Sigue con la sección 3 para publicarlo con GitHub Pages.

---

## 1. Ver el dashboard en línea (recomendado para el equipo)

Una vez publicado con GitHub Pages (ver sección 3), cualquiera del equipo entra con el
link — no necesita instalar nada.

## 2. Correrlo en tu computadora

Los datos se cargan con `fetch()`, así que **no funciona abriendo `index.html` con doble
clic** (los navegadores bloquean `fetch()` sobre `file://` por seguridad). Necesitas
servirlo con un servidor local muy simple:

```bash
# Desde la carpeta del proyecto
python3 -m http.server 8000
# Abre http://localhost:8000 en tu navegador
```

O, si usas VS Code, la extensión **Live Server** hace lo mismo con un clic.

## 3. Publicarlo con GitHub Pages

1. Sube esta carpeta a un repositorio de GitHub (ver sección 0).
2. En el repo: **Settings → Pages → Build and deployment → Source: "Deploy from a
   branch"** → elige la rama `main` y la carpeta `/ (root)` → **Save**.
3. En un par de minutos GitHub te da un link tipo
   `https://tu-usuario.github.io/nombre-del-repo/`. Compártelo con el equipo.

Cada vez que hagan `git push` a `main`, la página se actualiza sola.

---

## Base de datos "en vivo" (sin git, sin backend)

Si prefieres no depender de `git push` cada semestre, puedes conectar el dashboard a una
**Google Sheet publicada** (o una hoja de Excel Online) que edites como una hoja de cálculo
normal — el dashboard la vuelve a consultar **cada vez que alguien abre el link**, así que
los cambios se ven en vivo, sin comandos ni commits.

⚠️ **Importante sobre seguridad de navegadores (CORS):** los navegadores bloquean que una
página web lea datos de otro dominio a menos que ese dominio lo permita explícitamente.
Probamos ambos métodos de abajo en un navegador real: el método simple (Opción 1) puede
fallar según cómo Google sirva tu hoja en un momento dado — por eso el dashboard **siempre
prueba la conexión antes de usarla** y, si falla, muestra el error exacto y recae
automáticamente en los datos locales sin romperse. El método de Apps Script (Opción 2) es
más confiable porque tú controlas la respuesta.

### Cómo se activa

1. Crea tu Google Sheet con las mismas columnas que el Excel oficial (puedes copiar/pegar
   el contenido de un GIE-DCB-FOR-01/02 directamente en una hoja nueva).
2. Consigue una URL pública siguiendo la **Opción 1** o la **Opción 2** de abajo.
3. Abre el dashboard → botón **⚙️** (arriba a la derecha) → pega la(s) URL(s) →
   **🔎 Probar conexión**.
4. Si dice "✓ Conectado", copia el JSON que aparece y súbelo como
   `data/source-config.json` al repositorio (a mano en github.com, o con git — una sola vez).
5. Listo: desde ahora, todo el equipo que abra el link consulta la hoja en vivo. El ícono
   🔄 en el encabezado permite forzar una actualización sin recargar toda la página.

Si solo quieres probar antes de hacerlo oficial, usa **"💾 Guardar solo para mí"** en vez
de subirlo al repo — queda guardado solo en tu navegador para que lo pruebes primero.

### Opción 1 — Google Sheet publicada como CSV (más simple, pruébala primero)

1. En tu Google Sheet: **Archivo → Compartir → Publicar en la Web**.
2. Elige la hoja/pestaña específica (ej. "Asistencia") y el formato **Valores separados por
   comas (.csv)** → **Publicar**.
3. Copia la URL que te da (algo como
   `https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=0&single=true&output=csv`).
4. Además, en **Compartir** (botón azul arriba a la derecha, no "Publicar"), asegúrate de
   que el acceso general esté en **"Cualquiera con el enlace" → Lector** — sin esto, ni
   publicado funcionará.
5. Pega esa URL en el dashboard y prueba la conexión. Si falla con un mensaje sobre CORS,
   pasa a la Opción 2.

### Opción 2 — Apps Script Web App (más confiable, recomendada si la Opción 1 falla)

Esto crea una mini-API propia a partir de tu Google Sheet, sin escribir código real —
solo pegar este script una vez. Además de servir la hoja como CSV (`doGet`), incluye
`doPost`, que permite que el botón de **subir Excel** del dashboard guarde los datos
directamente en esta Google Sheet — así se convierte en la base de datos compartida de
todo el equipo, sin tocar git (ver "Subir Excel con escritura a la Sheet" más abajo).

1. En tu Google Sheet: **Extensiones → Apps Script**.
2. Borra el contenido y pega esto:
   ```javascript
   function doGet(e) {
     var sheetName = e.parameter.sheet || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getName();
     var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
     var data = sheet.getDataRange().getValues();
     var csv = data.map(function(row){
       return row.map(function(cell){
         if (Object.prototype.toString.call(cell) === '[object Date]') {
           return Utilities.formatDate(cell, Session.getScriptTimeZone(), 'yyyy-MM-dd');
         }
         var s = String(cell);
         // También hay que escapar saltos de línea (\n / \r) — si no, un encabezado como
         // "Eficacia\n(%)" corta la fila del encabezado en dos partes en el CSV, y la columna
         // "Eficacia" deja de coincidir con ningún nombre esperado (queda vacía en todo el
         // dashboard cuando se lee desde esta fuente en vivo).
         return (s.indexOf(',') > -1 || s.indexOf('"') > -1 || s.indexOf('\n') > -1 || s.indexOf('\r') > -1) ? '"' + s.replace(/"/g,'""') + '"' : s;
       }).join(',');
     }).join('\n');
     return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
   }

   // Recibe las filas que sube alguien desde el dashboard (botón "Seleccionar archivo") y las
   // guarda en esta Google Sheet como base de datos compartida: si el periodo que trae el Excel
   // ya existía, reemplaza esas filas (no las duplica); si es nuevo, las agrega al final. Misma
   // regla que usa el dashboard localmente y scripts/build_data.py.
   function doPost(e) {
     var body = JSON.parse(e.postData.contents);
     // El nombre de pestaña viaja como "?sheet=..." en la URL (igual que en doGet), no dentro
     // del body — por eso se lee de e.parameter primero.
     var sheetName = (e.parameter && e.parameter.sheet) || body.sheet || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].getName();
     var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
     if (!sheet) {
       return jsonOut({ ok: false, error: 'No existe la pestaña "' + sheetName + '" en esta hoja de cálculo.' });
     }

     // "Limpiar información" del dashboard: borra todas las filas de datos (deja el encabezado).
     if (body.action === 'clear') {
       var lastRowClear = sheet.getLastRow();
       var lastColClear = sheet.getLastColumn();
       var cleared = 0;
       if (lastRowClear > 1 && lastColClear > 0) {
         cleared = lastRowClear - 1;
         sheet.getRange(2, 1, cleared, lastColClear).clearContent();
       }
       return jsonOut({ ok: true, cleared: cleared });
     }

     var incomingHeaders = body.headers || [];
     var incomingRows = body.rows || [];
     var periodoHeader = body.periodoHeader || 'Periodo académico';

     var lastRow = sheet.getLastRow();
     var lastCol = sheet.getLastColumn();
     if (lastRow === 0 || lastCol === 0) {
       return jsonOut({ ok: false, error: 'La pestaña "' + sheetName + '" está vacía — pégale primero la fila de encabezados oficiales.' });
     }

     var sheetHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

     // Encabezados con salto de línea (ej. "Eficacia\n(%)") no llegan siempre con el mismo texto
     // exacto: Excel suele guardarlos como \r\n, mientras que la Sheet los guarda como \n y a
     // veces con un espacio extra alrededor. Sin normalizar, una comparación literal (indexOf)
     // no los reconoce como la misma columna y esa columna queda sin escribirse — aunque el
     // Excel sí tenga el dato. Se normaliza igual que normHeader() en el dashboard.
     function normalizeHeader(h) {
       return String(h).replace(/\r\n|\r|\n/g, ' ').replace(/\s+/g, ' ').trim();
     }
     var sheetHeadersNorm = sheetHeaders.map(normalizeHeader);
     var incomingHeadersNorm = incomingHeaders.map(normalizeHeader);
     var periodoHeaderNorm = normalizeHeader(periodoHeader);

     // Mapea cada encabezado del Excel a la columna correspondiente EN LA HOJA por nombre (no
     // por posición), así el orden de columnas no tiene que ser idéntico.
     var colForIncomingIdx = incomingHeadersNorm.map(function (h) { return sheetHeadersNorm.indexOf(h); });
     var periodoColInSheet = sheetHeadersNorm.indexOf(periodoHeaderNorm);
     var periodoIncomingIdx = incomingHeadersNorm.indexOf(periodoHeaderNorm);

     // Periodos que trae este Excel: sus filas existentes en la hoja se reemplazan por completo.
     var incomingPeriods = {};
     if (periodoIncomingIdx !== -1) {
       incomingRows.forEach(function (row) {
         var p = row[periodoIncomingIdx];
         if (p !== null && p !== '') incomingPeriods[String(p)] = true;
       });
     }

     // Borra filas existentes del/los periodo(s) que se reemplazan, de abajo hacia arriba para
     // no desfasar los números de fila mientras se borra.
     var deleted = 0;
     if (periodoColInSheet !== -1 && Object.keys(incomingPeriods).length && lastRow > 1) {
       var dataRows = sheet.getRange(2, periodoColInSheet + 1, lastRow - 1, 1).getValues();
       for (var i = dataRows.length - 1; i >= 0; i--) {
         var val = dataRows[i][0];
         if (val !== null && val !== '' && incomingPeriods[String(val)]) {
           sheet.deleteRow(i + 2);
           deleted++;
         }
       }
     }

     // Arma las filas nuevas en el orden de columnas DE LA HOJA y las agrega al final.
     if (incomingRows.length) {
       var outRows = incomingRows.map(function (row) {
         var out = new Array(sheetHeaders.length).fill('');
         colForIncomingIdx.forEach(function (sheetIdx, incomingIdx) {
           if (sheetIdx !== -1) out[sheetIdx] = row[incomingIdx];
         });
         return out;
       });
       var targetRange = sheet.getRange(sheet.getLastRow() + 1, 1, outRows.length, sheetHeaders.length);
       // Texto plano: evita que Sheets vuelva a "adivinar" un valor como "2025-1" como fecha al
       // escribirlo (lo que rompería el filtro de periodo — ver README, "Sobre las fechas...").
       targetRange.setNumberFormat('@');
       targetRange.setValues(outRows);
     }

     return jsonOut({ ok: true, escritos: incomingRows.length, reemplazados: deleted, periodos: Object.keys(incomingPeriods) });
   }

   function jsonOut(obj) {
     return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
   }
   ```
3. Guarda (ícono de disco), ponle un nombre al proyecto.
4. **Implementar → Nueva implementación** → tipo **Aplicación web**.
5. Configura: **Ejecutar como: Yo** / **Quién tiene acceso: Cualquier usuario** → **Implementar**.
6. Autoriza los permisos que pida (es tu propio script, sobre tu propia hoja) — ahora te
   pedirá permiso también para **editar** la hoja (por el `doPost`), no solo leerla.
7. Copia la URL que te da (termina en `/exec`). Si tu hoja tiene varias pestañas, agrégale
   `?sheet=NombreDeLaPestaña` al final (ej. `.../exec?sheet=Asistencia`).
8. Pega esa URL en el dashboard y prueba la conexión.

Cada vez que edites la Google Sheet, ambos métodos reflejan el cambio de inmediato — no
hace falta volver a implementar el script ni republicar, solo recargar el dashboard (o
usar el botón 🔄).

⚠️ Cada vez que **modifiques el código** del script (no la hoja, el código en sí) sí hace
falta volver a **Implementar → Gestionar implementaciones → ✏️ editar → Nueva versión →
Implementar**, para que la URL `/exec` sirva la versión nueva.

### Subir Excel con escritura a la Sheet

Si la URL configurada como fuente en vivo es de Apps Script (Opción 2, termina en `/exec`),
el botón de **subir Excel** dentro del dashboard hace dos cosas a la vez: carga los datos en
tu navegador (como siempre) **y** los envía por `doPost` para que se guarden en la Google
Sheet — el equipo entero los ve la próxima vez que abra el link, sin tocar git. Si la fuente
configurada es la Opción 1 (CSV publicado, de solo lectura) o no hay ninguna configurada, la
subida se comporta como antes: solo queda en tu navegador.

El mensaje junto al archivo subido indica si se pudo compartir (`✓ guardado también en la
base de datos compartida`) o si falló y quedó solo local (`⚠ no se pudo compartir...`) — en
ese caso revisa que la implementación de Apps Script siga activa y con "Cualquier usuario"
como acceso.

### Si prefieres no usar una fuente en vivo

No pasa nada — deja `data/source-config.json` con las URLs vacías (como viene por
defecto) y el dashboard sigue funcionando exactamente como se describe en la sección
siguiente ("Cómo funcionan los datos"), con `data/*.json` actualizado por git.

---

## Cómo funcionan los datos

**Lo importante primero:** el link que da GitHub Pages muestra a **todo el equipo por
igual** el contenido de `data/attendance.json` y `data/satisfaction.json` que esté
en el repositorio en ese momento — eso sí es realmente compartido por link.

Lo que **NO** se comparte automáticamente por el link es lo que alguien suba con el
botón de subir Excel *dentro* del dashboard ya abierto: eso queda guardado solo en el
navegador de esa persona (autoguardado), como respaldo personal para no perder su
trabajo entre sesiones — pero el resto del equipo, al entrar por el link, no lo ve.

|                                                                        | ¿Todo el equipo lo ve por el link? |
|------------------------------------------------------------------------|:---:|
| Subir un Excel con el panel *dentro* del dashboard (sin fuente en vivo, o con Opción 1 CSV) | ❌ No (solo en tu navegador) |
| Subir un Excel con el panel, con Apps Script (Opción 2) configurado    | ✅ Sí, para todos — se escribe en la Google Sheet vía `doPost` |
| Reemplazar `data/*.json` en el repositorio de GitHub                  | ✅ Sí, para todos |
| Configurar una fuente en vivo (sección anterior)                      | ✅ Sí, para todos — y sin volver a tocar git |

Entonces, para que aparezcan datos nuevos en la versión que ve todo el equipo, hay que
actualizar los archivos del repositorio. Dos formas de hacerlo, de más simple a más
"con git":

### Opción A — Sin usar git (arrastrar y soltar en la web de GitHub)

1. **Primero descarga los `data/*.json` que están ACTUALMENTE en GitHub** a tu carpeta
   local `data/` (botón "Download raw file" en cada archivo, dentro de github.com) —
   esto evita que el paso siguiente fusione contra una versión vieja y borre periodos
   que otros ya subieron.
2. Corre el script para convertir el Excel nuevo a JSON (ver más abajo) — esto
   actualiza `data/attendance.json` / `data/satisfaction.json` en tu carpeta local,
   agregando el periodo nuevo a lo que acabas de descargar.
3. Entra al repositorio en **github.com**, abre la carpeta `data/`.
4. Clic en `attendance.json` → ícono de lápiz (editar) o botón **"Upload files"** →
   arrastra el archivo actualizado desde tu computadora → reemplaza el contenido.
5. Abajo, clic **"Commit changes"**. Repite para `satisfaction.json` si también cambió.
6. En 1-2 minutos, GitHub Pages redeploya y todo el equipo ve los datos nuevos al
   recargar el link.

No requiere terminal ni git — solo el navegador.

### Opción B — Con git paso a paso (si prefieres ver cada comando)

```bash
pip install pandas openpyxl   # solo la primera vez

python scripts/build_data.py \
  --att ruta/al/GIEDCBFOR01_nuevo_semestre.xlsx \
  --sat ruta/al/GIEDCBFOR02_nuevo_semestre.xlsx

git add data/
git commit -m "Agrega datos del periodo 2025-2"
git push
```

### Opción C — Un solo comando (la más rápida si repites esto seguido)

```bash
pip install pandas openpyxl   # solo la primera vez

./scripts/publish_data.sh \
  --att ruta/al/GIEDCBFOR01_nuevo_semestre.xlsx \
  --sat ruta/al/GIEDCBFOR02_nuevo_semestre.xlsx
```

Hace todo junto: convierte el Excel, y si hay cambios, los sube automáticamente
(`git add` + `commit` + `push`) con un mensaje de commit que detecta solo los periodos
incluidos. Si no hay cambios nuevos, no crea un commit vacío. En Windows, corre con
`bash scripts/publish_data.sh ...` (Git Bash, que ya viene con Git para Windows) o
`wsl bash scripts/publish_data.sh ...`.

Las tres opciones **agregan** el nuevo periodo a los datos existentes (si el periodo ya
existía, lo reemplaza — no duplica). `--replace-all` en vez de agregar, ignora lo que
había y deja solo el archivo nuevo.

### Sobre la carga de Excel *dentro* del dashboard

Sigue siendo útil para: probar datos antes de publicarlos oficialmente, o para uso
personal de alguien que solo quiere revisar algo puntual sin tocar el repositorio — y,
con la fuente en vivo de Apps Script (Opción 2) configurada, para oficializar datos
directamente en la base de datos compartida sin pasar por git en absoluto (ver "Subir
Excel con escritura a la Sheet" más arriba).

### Botón "🗑️ Limpiar información"

Vacía lo cargado para empezar de cero: borra `ATT`/`SAT` en este navegador y su
autoguardado. Si la fuente en vivo configurada es un Apps Script (Opción 2), **también
borra todas las filas de datos de la Google Sheet compartida** (deja el encabezado) — lo
notará todo el equipo, así que pide una confirmación explícita (hay que escribir
`BORRAR`) antes de ejecutarse. Es irreversible; si necesitas conservar lo que hay,
descárgalo primero manualmente desde la Google Sheet (Archivo → Descargar).

### Sobre las fechas en columnas de texto (ej. "Semestre")

Si Excel/Sheets interpreta una columna que debería ser texto (como "Semestre" o "Periodo
académico", ej. "2025-1") como si fuera una **fecha**, el valor que verás no será el que
escribiste, sino una fecha reformateada — y como la otra planilla (asistencia) sí guarda
su periodo como texto plano, el filtro de "Periodo académico" dejará de emparejar ambos
conjuntos de datos (verás información distinta según el periodo elegido). Para evitarlo:
antes de escribir esos valores, selecciona la columna en Excel/Sheets y ponle formato
**Texto sin formato / Texto plano** (clic derecho → Formato de celdas, o
Formato → Número → Texto plano en Sheets). Si una hoja ya tiene filas con este problema,
usa "🗑️ Limpiar información" (o borra esas filas a mano en la Sheet) y vuelve a subir el
Excel con la columna ya en formato texto.

---

## Acceso al dashboard (prototipo)

Antes de entrar, el dashboard pide un usuario y contraseña únicos (no hay cuentas por
persona). Esto es un **filtro suave, no seguridad real** — como el sitio no tiene
backend, cualquiera con conocimientos técnicos puede saltárselo (leyendo `js/app.js` o
pidiendo `data/attendance.json` / `data/satisfaction.json` directo por URL). Solo evita
que alguien sin la clave entre por la pantalla normal del link.

Una vez ingresada la clave correcta, queda guardada en ese navegador (no hay que volver
a escribirla cada vez que se abre el link, solo si se borran los datos del sitio).

**Para cambiar la contraseña:**
1. Abre la consola del navegador (F12) en cualquier página y corre:
   ```js
   crypto.subtle.digest('SHA-256', new TextEncoder().encode('tu-contraseña-nueva'))
     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
   ```
2. Copia el texto largo que imprime (el hash) y reemplázalo en `js/app.js`, en la
   constante `AUTH_PASS_HASH` (sección `AUTH GATE` cerca del inicio del archivo). Cambia
   también `AUTH_USER` si quieres otro usuario.
3. Actualiza el archivo `.env` local (no se sube a git) con la contraseña real en texto
   plano, solo para que quede anotada — el navegador nunca lee ese archivo.
4. `git add`/`commit`/`push` de `js/app.js` como cualquier otro cambio.

Las credenciales actuales están en el `.env` local del proyecto.

---

## Estructura del proyecto

```
nivelacion-dashboard/
├── index.html              # Estructura de la página (header, tabs, filtros, modal)
├── css/
│   └── styles.css          # Todos los estilos
├── js/
│   └── app.js               # Toda la lógica: filtros, gráficos, carga de Excel,
│                             #   autoguardado, exportación de informe y de base de datos
├── data/
│   ├── attendance.json       # Datos base de asistencia/notas (GIE-DCB-FOR-01)
│   ├── satisfaction.json     # Datos base de satisfacción (GIE-DCB-FOR-02)
│   └── source-config.json    # URLs opcionales de la fuente de datos en vivo (Google Sheets)
├── scripts/
│   ├── build_data.py         # Regenera data/*.json a partir de nuevos Excel oficiales
│   └── publish_data.sh       # Atajo: build_data.py + git add/commit/push en un paso
├── .env                       # Credenciales de acceso en texto plano — LOCAL, no se sube a git
├── informes-oficiales/        # Informes oficiales (PDF) para validar indicadores — LOCAL, no se sube a git
└── README.md
```

Librerías usadas (vía CDN, no hay que instalar nada para ver el dashboard):
[Chart.js](https://www.chartjs.org/) 4.4.4,
[chartjs-plugin-datalabels](https://chartjs-plugin-datalabels.netlify.app/) 2.2.0,
[SheetJS/xlsx](https://sheetjs.com/) 0.18.5,
[html2canvas](https://html2canvas.hertzen.com/) 1.4.1 (capturas de pantalla para el informe).

---

## Funcionalidades

- **4 pestañas + comparativo**: Participantes, Asistencia, Rendimiento, Satisfacción,
  Comparativo histórico por periodo.
- **Filtros**: Periodo académico (con selector de "todos los periodos"), Facultad,
  Carrera, Sede, Curso.
- **Carga de Excel** en el navegador, con selección múltiple (varios archivos a la vez,
  procesados uno por uno en orden) y acumulativa por periodo, con reemplazo si repites
  un periodo ya cargado — con **autoguardado personal** entre sesiones (ver
  "Cómo funcionan los datos" para la diferencia entre esto y los datos compartidos por link).
- **Exportar informe**: genera una vista previa imprimible con la misma estructura del
  informe oficial (memo + gráficos + tablas + conclusiones), con cuadros resumen de
  referencia y campos editables para escribir tus propias conclusiones, recomendaciones,
  y los datos de "Para" / "De" (nombre y cargo) antes de guardarlo como PDF. Incluye
  imágenes reales de los gráficos (participación, asistencia, rendimiento, satisfacción),
  igual que las capturas de dashboard del informe original, y un anexo final con capturas
  de pantalla completas de las 4 pestañas del dashboard tal como se ven en ese momento.
- **Limpiar información**: borra lo cargado en este navegador y, si hay una fuente en vivo
  de Apps Script configurada, también vacía la base de datos compartida (con confirmación).
- **Fuente de datos en vivo** (opcional): conecta una Google Sheet publicada para que el
  equipo vea los mismos datos por el link sin necesidad de git — ver "Base de datos en vivo".
- **Acceso con clave** (prototipo): pantalla de login antes de entrar al dashboard — ver
  "Acceso al dashboard (prototipo)" más abajo para cómo cambiar el usuario/contraseña.

---

## Contribuir / desarrollo

Todo el código vive en `js/app.js` (vanilla JS, sin framework ni build step) y
`css/styles.css`. Para probar cambios localmente, sirve la carpeta como se explica en
la sección 2 y recarga el navegador — no hay paso de compilación.

Si agregas una librería nueva, referénciala por CDN en `index.html` (mismo patrón que
las existentes) para mantener el repo liviano.

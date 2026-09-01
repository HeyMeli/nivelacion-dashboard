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

## Cómo funcionan los datos

**Lo importante primero:** el link que da GitHub Pages muestra a **todo el equipo por
igual** el contenido de `data/attendance.json` y `data/satisfaction.json` que esté
en el repositorio en ese momento — eso sí es realmente compartido por link.

Lo que **NO** se comparte automáticamente por el link es lo que alguien suba con el
botón de subir Excel *dentro* del dashboard ya abierto: eso queda guardado solo en el
navegador de esa persona (autoguardado), como respaldo personal para no perder su
trabajo entre sesiones — pero el resto del equipo, al entrar por el link, no lo ve.

|                                                              | ¿Todo el equipo lo ve por el link? |
|--------------------------------------------------------------|:---:|
| Subir un Excel con el panel *dentro* del dashboard ya abierto | ❌ No (solo en tu navegador) |
| Reemplazar `data/*.json` en el repositorio de GitHub          | ✅ Sí, para todos |

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

### Opción B — Con git (más rápido si ya lo usan seguido)

```bash
pip install pandas openpyxl   # solo la primera vez

python scripts/build_data.py \
  --att ruta/al/GIEDCBFOR01_nuevo_semestre.xlsx \
  --sat ruta/al/GIEDCBFOR02_nuevo_semestre.xlsx

git add data/
git commit -m "Agrega datos del periodo 2025-2"
git push
```

Ambas opciones **agregan** el nuevo periodo a los datos existentes (si el periodo ya
existía, lo reemplaza — no duplica). `--replace-all` en vez de agregar, ignora lo que
había y deja solo el archivo nuevo.

### Sobre la carga de Excel *dentro* del dashboard

Sigue siendo útil para: probar datos antes de publicarlos oficialmente, o para uso
personal de alguien que solo quiere revisar algo puntual sin tocar el repositorio.
El botón **"Descargar base de datos (.xlsx)"** exporta lo que tengas cargado ahí como
Excel real — que es justamente el archivo que puedes usar en la Opción A o B de arriba
para "oficializar" esos datos y que los vea todo el equipo.

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
│   ├── attendance.json      # Datos base de asistencia/notas (GIE-DCB-FOR-01)
│   └── satisfaction.json    # Datos base de satisfacción (GIE-DCB-FOR-02)
├── scripts/
│   └── build_data.py        # Regenera data/*.json a partir de nuevos Excel oficiales
└── README.md
```

Librerías usadas (vía CDN, no hay que instalar nada para ver el dashboard):
[Chart.js](https://www.chartjs.org/) 4.4.4,
[chartjs-plugin-datalabels](https://chartjs-plugin-datalabels.netlify.app/) 2.2.0,
[SheetJS/xlsx](https://sheetjs.com/) 0.18.5.

---

## Funcionalidades

- **4 pestañas + comparativo**: Participantes, Asistencia, Rendimiento, Satisfacción,
  Comparativo histórico por periodo.
- **Filtros**: Periodo académico (con selector de "todos los periodos"), Facultad,
  Carrera, Sede, Curso.
- **Carga de Excel** en el navegador (acumulativo por periodo, con reemplazo si repites
  un periodo ya cargado) — con **autoguardado personal** entre sesiones (ver
  "Cómo funcionan los datos" para la diferencia entre esto y los datos compartidos por link).
- **Exportar informe**: genera una vista previa imprimible con la misma estructura del
  informe oficial (memo + gráficos + tablas + conclusiones), con cuadros resumen de
  referencia y campos editables para escribir tus propias conclusiones, recomendaciones,
  y los datos de "Para" / "De" (nombre y cargo) antes de guardarlo como PDF. Incluye
  imágenes reales de los gráficos (participación, asistencia, rendimiento, satisfacción),
  igual que las capturas de dashboard del informe original.
- **Descargar base de datos**: exporta todo lo cargado como Excel real, reimportable.

---

## Contribuir / desarrollo

Todo el código vive en `js/app.js` (vanilla JS, sin framework ni build step) y
`css/styles.css`. Para probar cambios localmente, sirve la carpeta como se explica en
la sección 2 y recarga el navegador — no hay paso de compilación.

Si agregas una librería nueva, referénciala por CDN en `index.html` (mismo patrón que
las existentes) para mantener el repo liviano.

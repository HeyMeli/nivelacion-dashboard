# Historial de problemas y soluciones — datos en vivo (Google Sheets)

Este documento resume, en orden cronológico, los problemas encontrados y arreglados desde que se
publicó el módulo de Reforzamiento, específicamente los relacionados con **la carga de datos desde
las Google Sheets en vivo** (por qué a veces demora, por qué a veces sale "0 registros", y por qué
en un momento se mezclaron datos entre programas). No cubre bugs de interfaz que no tienen que ver
con la carga de datos (esos están solo en el historial de commits de git).

## Resumen para quien tenga prisa

- Hubo **un incidente real de datos**: una carga de Reforzamiento terminó escrita por error en la
  Google Sheet de Nivelación (producción). La causa (un bug de sincronización de estado) ya está
  arreglada — ver [Problema 3](#3-incidente-datos-de-reforzamiento-escritos-en-la-sheet-de-nivelación).
  **Sigue pendiente limpiar manualmente las filas mezcladas en ambas Sheets** (no es algo que el
  código pueda arreglar solo).
- El **"demora mucho" y el "sale 0 registros"** que sigues viendo en Reforzamiento vienen de la
  misma causa de fondo: la Google Sheet de asistencia de Reforzamiento ya es grande (10,600+ filas)
  y Google Apps Script a veces tarda más de lo que el dashboard espera — ver
  [Problema 8](#8-problema-actual-sin-terminar-de-resolver-demora-o-0-registros-al-reiniciar).
- Las 6 correcciones intermedias (Problemas 4 a 7) fueron necesarias para llegar a un
  comportamiento razonable, pero **el problema de fondo (Apps Script lento con una hoja grande)
  todavía no tiene una solución definitiva** — ver la sección final de este documento para las
  opciones que faltan evaluar contigo.

---

## 1. El selector de programa no respondía al hacer clic

**Síntoma:** al hacer clic en "Reforzamiento" en el selector, no pasaba nada.

**Causa:** `loadBaseData()` cargaba los dos programas (Nivelación y Reforzamiento) en paralelo
*antes* de mostrar cualquier cosa en pantalla. Con las 4 fuentes en vivo (2 por programa)
configuradas, eso significaba esperar a las 4 antes de que el selector de programa siquiera tuviera
su evento de clic conectado — si una fuente estaba lenta, toda la app se quedaba en
"⏳ Cargando datos…" indefinidamente y el clic no hacía nada porque el botón todavía no estaba
"vivo".

**Arreglo:** `loadBaseData()` ahora carga primero el programa activo (el que se ve al entrar) y dej
el otro cargándose en segundo plano, sin bloquear el primer dibujo en pantalla. Si cambias de
programa antes de que termine de cargar en segundo plano, se muestra "⏳ Cargando datos de
[programa]…" y se actualiza solo cuando termina.

*(Commit: "Sidebar de programas + arregla carga lenta que dejaba el selector sin responder")*

## 2. El botón de Reforzamiento seguía sin responder incluso después del arreglo anterior

**Síntoma:** parecido al problema 1, pero seguía pasando ocasionalmente.

**Causa:** la carga inicial de Nivelación (el programa activo por defecto) en sí misma podía tardar
mucho (hasta 20-30s) si su propia fuente en vivo estaba lenta — el arreglo del problema 1 solo
evitaba que Reforzamiento bloqueara a Nivelación, pero no evitaba que la fuente en vivo de
Nivelación bloqueara todo el arranque.

Esto llevó a diagnosticar el problema de fondo de Google Apps Script respondiendo lento de forma
intermitente (ver problemas 6, 7 y 8 más abajo).

## 3. Incidente: datos de Reforzamiento escritos en la Sheet de Nivelación

**Síntoma:** la Google Sheet de asistencia de **Nivelación** (producción, la que usa el tester
externo) apareció con ~10,600 filas de más, todas con "Periodo académico" = "2026-1" — un periodo
que Nivelación nunca tuvo. Coincidía exactamente con el tamaño del archivo real de Reforzamiento.

**Causa confirmada:** al cambiar de programa, `switchProgram()` actualizaba `currentProgram` de
inmediato, pero si los datos del programa nuevo todavía se estaban cargando en segundo plano, la
variable que decide a qué Google Sheet escribir (`sourceConfig`) no se actualizaba hasta que esa
carga terminaba — se quedaba apuntando a las URLs del programa **anterior**. Si alguien subía un
Excel en esa ventana de pocos segundos, se parseaba correctamente con el formato del programa nuevo
(eso sí era instantáneo) pero se escribía en la Google Sheet del programa viejo.

**Arreglo:**
- `switchProgram()` ahora aplica los datos del programa nuevo (`applyProgramData()`) de inmediato,
  sin esperar a que termine de cargar — así `sourceConfig`/`ATT`/`SAT` nunca quedan desincronizados
  de qué programa está activo.
- Blindaje adicional: los inputs de subir archivo y "Limpiar información" se deshabilitan mientras
  el programa activo todavía se está cargando en segundo plano.

**⚠️ Pendiente — acción manual, no de código:** falta limpiar a mano las filas mezcladas:
  - Sheet de **Nivelación**: borrar filas con "Periodo académico" = **2026-1**.
  - Sheet de **Reforzamiento**: borrar filas con "Periodo académico" = **Nivelación 2025-1**.

*(Commit: "Arregla el bug que escribió datos de Reforzamiento en la Sheet de Nivelación")*

## 4. El autoguardado de Reforzamiento no se restauraba al recargar la página

**Síntoma:** subir un Excel a Reforzamiento, ver que carga bien, recargar la página — y los datos
desaparecían.

**Causa:** el autoguardado en el navegador (IndexedDB) ya estaba separado por programa, pero solo
se **revisaba** para el programa activo al arrancar (que siempre es Nivelación por defecto). El
programa que se carga en segundo plano (normalmente Reforzamiento) nunca pasaba por esa revisión:
si su fuente en vivo fallaba, caía directo al JSON vacío del repositorio en vez de a la copia
guardada en el navegador.

**Arreglo:** la función que carga cada programa (`loadProgramData()`) ahora revisa el autoguardado
de *ese* programa específico antes de caer al JSON vacío, sin importar si es el programa activo o
el que se está cargando en segundo plano.

*(Commit: "Arregla el autoguardado de Reforzamiento: nunca se volvía a leer al recargar")*

## 5. Mensaje incorrecto: "los cambios se guardan solo en este navegador"

**Síntoma:** el mensaje de estado decía que las subidas se guardaban solo en el navegador, aunque
la fuente en vivo configurada sí admite escritura compartida (Apps Script).

**Causa:** el texto salía siempre que al menos una fuente en vivo cargara bien, sin revisar si esa
URL realmente admite escritura compartida o no.

**Arreglo:** el mensaje ahora revisa cada URL configurada y dice con precisión qué se comparte con
el equipo y qué se queda solo en el navegador.

*(Commit: "Corrige el mensaje que decía que las subidas solo se guardan en este navegador")*

## 6. "0 registros" cuando solo UNA de las dos fuentes (asistencia/satisfacción) fallaba

**Síntoma:** si asistencia fallaba en vivo pero satisfacción sí respondía, asistencia mostraba 0
registros en vez de la copia autoguardada.

**Causa:** el autoguardado (ver problema 4) solo se revisaba cuando las DOS fuentes fallaban a la
vez — con una sola fallando (muy común, dado que Google devuelve errores intermitentes en una
fuente sí y en la otra no), no se revisaba el autoguardado de la fuente que sí falló.

**Arreglo:** ahora se revisa el autoguardado **por campo** (asistencia y satisfacción por
separado), no en bloque.

*(Commit: "Arregla '0 registros' cuando solo una de las dos fuentes en vivo falla")*

## 7. Reintentos automáticos — y el efecto secundario de superar el minuto de espera

**Primer arreglo:** se agregaron reintentos automáticos (hasta 2, con pausa de 1.5s entre cada uno)
porque Google devuelve fallas pasajeras (404, o una página "anti-bot" en vez del CSV) que se
resuelven solas si se reintenta segundos después — visto muchas veces durante las pruebas.

**Efecto secundario descubierto:** los reintentos no tenían límite de tiempo por intento. Si la
fuente respondía genuinamente **lento** (no solo fallando rápido), cada uno de los 3 intentos podía
tardar 20+ segundos, sumando fácilmente más de un minuto antes de caer al respaldo local — esto es
lo que reportaste como "la carga de satisfacción excede el minuto de espera".

**Arreglo:** cada intento ahora se corta a los 12 segundos (en vez de esperar indefinidamente), y se
bajó de 2 reintentos a 1 — el peor caso quedó en ~25.5 segundos en vez de hasta ~63 segundos.

*(Commits: "Arregla '0 registros' cuando solo una de las dos fuentes en vivo falla" y "Acota el
tiempo de espera de la carga en vivo a ~25s")*

## 8. Problema actual, sin terminar de resolver: demora o "0 registros" al reiniciar

**Esto es lo que sigues viendo y todavía no está resuelto del todo.**

Medido en vivo hoy contra el sitio publicado: la fuente de asistencia de Reforzamiento tardó más de
12 segundos en responder y el dashboard se rindió, cayendo al archivo de respaldo local — que está
**vacío** (`data/attendance-reforzamiento.json` se creó vacío en la Fase 3 del proyecto y nunca se
actualizó con datos reales). Resultado: exactamente lo que describes — esperas ~25 segundos y al
final sale "0 registros".

**Causa de fondo, confirmada con una medición directa (sin ningún límite de tiempo de por medio):**
la fuente de asistencia de Reforzamiento tardó **45 a 51 segundos en responder**, dos veces
seguidas. No son 12 ni 25 segundos — es casi un minuto completo, consistentemente. Es un problema de
**volumen de datos**: la Google Sheet ya tiene más de 10,600 filas, y leerla completa y convertirla
a CSV dentro de Google Apps Script (el script que armamos en el README) simplemente toma ese tiempo.
No es que Google esté "fallando" — el script no es instantáneo con tantas filas. (También es posible
que la cuota de ejecuciones de tu cuenta esté ajustada por todas las pruebas de hoy, pero eso no lo
puedo confirmar desde aquí — se ve solo dentro de tu cuenta de Google, en Apps Script → Ejecuciones.)

Con esta medición queda claro que **ningún valor de espera razonable (12s, 25s, incluso 40s) va a
alcanzar a tiempo contra esta hoja tal como está ahora** — subir el límite de espera solo cambiaría
"demora 25s y sale 0" por "demora 55s y a veces sí carga". La solución de fondo no es esperar más,
es alguna de las opciones de la sección siguiente.

**Ya apliqué un arreglo inmediato y seguro mientras se decide lo de fondo:** actualicé
`data/attendance-reforzamiento.json` y `data/satisfaction-reforzamiento.json` (que estaban vacíos
desde la Fase 3 del proyecto) con una copia real de los datos actuales. Esto no arregla la demora,
pero si la fuente en vivo tarda demasiado, ahora el respaldo muestra datos reales en vez de "0
registros" — mucho menos confuso mientras se decide la solución definitiva.

**Lo que falta decidir contigo** (ver la sección siguiente).

---

## Opciones pendientes de evaluar (para la próxima sesión)

No las implementé todavía porque cambian el comportamiento de forma más notoria y prefiero que las
decidas tú:

1. **Actualizar el archivo de respaldo local con datos reales.** Ahora mismo
   `data/attendance-reforzamiento.json` / `satisfaction-reforzamiento.json` están vacíos — si se
   actualizan con una copia real de los datos (aunque no sea la más reciente al segundo), cuando la
   fuente en vivo falle o tarde, el respaldo mostraría datos reales en vez de "0 registros". Esto no
   arregla la demora, pero sí evita el "0 registros" engañoso.
2. **Subir el límite de espera** (hoy 12s por intento) para darle más tiempo a la hoja grande de
   Reforzamiento antes de rendirse — con el riesgo de que la espera se sienta más larga si la fuente
   de verdad está caída.
3. **Cambiar el orden: mostrar datos guardados de inmediato y actualizar en segundo plano** ("mostrar
   lo que ya tengo, y refrescar solo cuando lo en vivo esté listo") en vez de esperar a la fuente en
   vivo antes de mostrar cualquier cosa. Es el cambio más grande de los tres, pero es el que de
   verdad eliminaría la sensación de "demora" para quien abre el dashboard.
4. Revisar la cuota de ejecuciones de Apps Script en tu cuenta de Google (Extensiones → Apps Script
   → Ejecuciones, en la Google Sheet), para descartar que esté limitada por todas las pruebas de hoy.

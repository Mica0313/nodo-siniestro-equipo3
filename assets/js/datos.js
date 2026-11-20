/* =====================================================================
   DATOS DEL EQUIPO — este es el ÚNICO archivo que tienen que editar
   para personalizar la documentación. Cambien los textos entre comillas.
   ===================================================================== */

window.PROYECTO = {
  // --- Identidad del producto (elijan un nombre: Smart Campus IoT, Aula Viva,
  //     Campus Sense, Escuela Inteligente, Nodo Escolar, EduSense u otro) ---
  nombre: "Smart Campus IoT",
  bajada: "Sistema distribuido de monitoreo ambiental, energético y operativo para la escuela",
  equipo: "Equipo 3",                 // nombre del equipo
  curso: "6to Informática · División A",
  institucion: "Instituto Leonardo Murialdo",
  ciclo: "2026",

  // Nodo que construye este equipo (uno de: luz, presencia, aire, ruido,
  // consumo, suelo, red). Define qué sensor específico se destaca.
  nodoAsignado: "siniestro",   // 

  // --- Acceso al proyecto ---
  // previewUrl: dirección pública del dashboard (GitHub Pages, Netlify, Grafana
  // con acceso público, etc.). Mientras esté vacía se muestra el aviso "sin publicar".
  previewUrl: "https://mica0313.github.io/nodo-siniestro-equipo3/dashboard/",
  repoUrl: "https://github.com/Mica0313/nodo-siniestro-equipo3",                        // repositorio del código (GitHub)

  // Carta Gantt en Google Sheets: Archivo → Compartir → Publicar en la Web →
  // Insertar → copiar la dirección de src="…" (termina en /pubhtml?...)
  ganttSheetUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSdOcSqfFGbZJmleheFyeu2moJrL496ECrV2AZ62cSaAyqlKREUFupWWPt3WIOuTQ/pubhtml",

  // --- Integrantes (orden alfabético por apellido). rol = rol principal; apoyo = otras funciones ---
  integrantes: [
    { nombre: "De Donato, Agustín", rol: "desarrollo", apoyo: ["2.º Project Manager"], foto: "assets/img/integrantes/de-donato.jpeg", y:-8, zoom: 1.2,x: 1, github: "" },
    { nombre: "Florentino, Luciano", rol: "infraestructura", apoyo: ["Ayudante de Aplicaciones"], foto: "assets/img/integrantes/florentino.jpeg", y:-16, github: "" },
    { nombre: "Pittis, Agustín", rol: "aplicaciones", apoyo: [], foto: "assets/img/integrantes/pittis.jpeg", zoom:0.95, y:-10, github: "" },
    { nombre: "Torrecilla, Micaela", rol: "pm", apoyo: ["Ayudante de Desarrollo"], foto: "assets/img/integrantes/torrecilla.jpeg", github: "" },
    { nombre: "Torres, Dylan", rol: "infraestructura", apoyo: ["3.er Project Manager"], foto: "assets/img/integrantes/torres.jpeg", zoom: 1.3, y:-10, github: "" }
  ],

  // --- Docentes (orden alfabético por asignatura) ---
  docentes: [
    { asignatura: "Investigación Operativa", nombre: "Santisi, Gabriel" },
    { asignatura: "Laboratorio de Aplicaciones", nombre: "De Donato, Marcelo" },
    { asignatura: "Laboratorio de Hardware", nombre: "Werner, Gustavo" },
    { asignatura: "Laboratorio de Programación", nombre: "Barral, Martín" },
    { asignatura: "Laboratorio de Sistemas Operativos", nombre: "Martini, Diego" },
    { asignatura: "Seguridad Informática", nombre: "Pedaci, Lourdes" }
  ],
  auditor: "A completar",

  // --- Control de cambios ---
  cambios: [
    { version: "1", fecha: "Abril", responsable: "Equipo", detalle: "Conformación del equipo al comenzar las clases. En abril se sumó una integrante, cuando en Investigaciones Operativas se abrió la posibilidad de modificar los equipos." },
    { version: "2", fecha: "2026-08-13", responsable: "Equipo", detalle: "Confirmación del NODO Siniestro como nodo del equipo. Se había asignado el 14/07, pero el archivo de Teams no coincidía con lo definido en clase." },
    { version: "3", fecha: "2026-08-28", responsable: "Equipo", detalle: "Se incorpora un nuevo ESP32-C3 Mini, porque los pines del primero habían quedado soldados al revés, y se sueldan los pines del acelerómetro." },
    { version: "4", fecha: "2026-10-09", responsable: "Pittis", detalle: "Se suelda una antena al nuevo ESP32-C3 Mini porque la señal WiFi era muy baja." },
    { version: "5", fecha: "2026-11-06", responsable: "Equipo", detalle: "Se le da forma de rulito (espiral) a la antena del nuevo ESP para que capte mejor la señal." },
    { version: "6", fecha: "Octubre 2026", responsable: "Torrecilla y Torres", detalle: "Se descarta el módulo step-down (la salida de 5 V entregaba 12 V) y se adopta un regulador LM7805, soldado a la placa el 3 y 4 de noviembre." },
    { version: "7", fecha: "2026-11-03", responsable: "De Donato", detalle: "Por pedido de la profesora Pedaci, el dashboard del nodo se rediseña igual al de los demás nodos." },
    { version: "8", fecha: "2026-11-06", responsable: "Torres", detalle: "Se vuelven a soldar las conexiones de la placa experimental: estaban con el cobre desnudo y ahora quedan con el cobre cubierto (vaina aislante), porque el cobre expuesto absorbía la señal WiFi. Por sí solo este cambio no resolvió la conexión (ver 1.0)." },
    { version: "9", fecha: "2026-11-06", responsable: "Torrecilla", detalle: "Se baja la potencia de transmisión WiFi a 8,5 dBm para evitar caídas de voltaje. Con ese cambio el ESP se conecta y envía datos desde la placa experimental." },
    { version: "10", fecha: "2026-11-12", responsable: "Equipo", detalle: "Se descarta la batería de 12V debido a una falla en todos los equipos y el equipo opta por alimentar el proyecto con una batería portátil de 5V" },
  ],

  // Duración de cada sprint en semanas (Scrum recomienda entre 1 y 4)
  semanasPorSprint: 3,

  // --- Presupuesto / BOM: precios en pesos argentinos, tomados de la bitácora (0 = falta el precio) ---
  bom: [
    { item: "ESP32-C3 Mini", cant: 1, unit: 7999 },
    { item: "Sensor DHT22 (temperatura y humedad)", cant: 1, unit: 11052 },
    { item: "Display LCD 16x2", cant: 1, unit: 6999 },
    { item: "Adaptador I2C del display LCD", cant: 1, unit: 3399 },
    { item: "MQ-2 (humo y gas)", cant: 1, unit: 11000 },
    { item: "KY-026 (sensor de llama IR)", cant: 1, unit: 3400 },
    { item: "MPU6050 (acelerómetro)", cant: 1, unit: 3675 },
    { item: "Cables HH-MM-MH", cant: 1, unit: 4095 },
    { item: "Bornera x4", cant: 1, unit: 5567 },
    { item: "Placa experimental", cant: 1, unit: 3090 },
    { item: "Tira de pines hembra x2", cant: 1, unit: 4000 },
    { item: "Módulo regulador step-down (se quemó, reemplazado por el LM7805)", cant: 1, unit: 3675 },
    { item: "Regulador de tensión LM7805", cant: 1, unit: 0 },
    { item: "Pegamento Fastix", cant: 1, unit: 6500 },
    { item: "Caja estanca (115 x 115 x 100 mm)", cant: 1, unit: 0 }
  ],

  // --- Bitácora de pruebas: tomada de la bitácora y de la carta Gantt ---
  pruebas: [
    { fecha: "16/07 al 20/08", prueba: "Práctica I: DHT22, ESP32-C3 Mini y display", esperado: "El display muestra la temperatura y la humedad", resultado: "Funcionó con el primer ESP", estado: "ok" },
    { fecha: "21/08", prueba: "Obtener la dirección MAC del ESP32", esperado: "Conseguir la MAC para que el profesor la habilite", resultado: "MAC obtenida y publicada en Teams", estado: "ok" },
    { fecha: "25/08 al 05/09", prueba: "Práctica II: MQ-2, MPU6050 y sensor de llama por separado", esperado: "Cada sensor mide correctamente", resultado: "Funcionamiento verificado. Los errores de sensor eran pines mal asignados en el código y se corrigieron", estado: "ok" },
    { fecha: "04/09", prueba: "Obtener la MAC del nuevo ESP", esperado: "Conseguir la MAC del nuevo ESP", resultado: "MAC obtenida", estado: "ok" },
    { fecha: "18/09 al 25/09", prueba: "Práctica III: todos los sensores juntos en la protoboard", esperado: "Todos los sensores funcionan en conjunto", resultado: "Probados en conjunto; el código ya reporta los datos al Dashboard", estado: "ok" },
    { fecha: "16/10 al 22/10", prueba: "Sensores con batería y módulo step-down", esperado: "La salida de 5 V entrega 5 V", resultado: "La salida de 5 V entregaba 12 V: el módulo se quemó y se decidió usar un regulador LM7805, que hoy funciona bien. Hay un inconveniente con la batería: al conectar el nodo solo a la batería, el display titila (falta probar otra batería o revisar las conexiones). Solucionado. Se usará una batería portátitl", estado: "ok" },
    { fecha: "23/10 al 06/11", prueba: "Envío de datos al Dashboard", esperado: "Los datos llegan al Dashboard", resultado: "La primera prueba (23/10) fue exitosa, después de mejorar la señal (antena, cables y ESP sobre tiras de pines). Después hubo varios inconvenientes por la señal y por los tópicos, y hoy está todo correcto", estado: "ok" },
    { fecha: "Desde la práctica II hasta el 29/10", prueba: "Conectar todos los sensores al ESP nuevo", esperado: "Los sensores funcionan con el ESP nuevo y la computadora detecta el puerto", resultado: "Venía todo bien desde la práctica II. El 29/10 la computadora no detectaba el puerto por un resto de estaño de la soldadura de la antena; al retirarlo se quemaron unas resistencias, pero el ESP funcionó. Hoy funciona todo correctamente", estado: "ok" },
    { fecha: "30/10", prueba: "Envío de datos al Dashboard y a la página web del nodo", esperado: "Todos los sensores reportan", resultado: "Llegaron los datos, salvo los del acelerómetro. La causa era que faltaba agregar el tópico en el Dashboard (ya corregido) y modificar el código del dashboard", estado: "ok" },
    { fecha: "03/11 y 04/11", prueba: "Regulador de tensión LM7805", esperado: "Voltaje correcto", resultado: "Soldado a la placa. Voltaje verificado con multímetro y probado con el ESP de respaldo", estado: "ok" },
    { fecha: "05/11", prueba: "Conexión WiFi del ESP en la placa experimental", esperado: "El ESP se conecta rápido", resultado: "Fuera de la placa se conectaba rápido, pero en la placa tardaba muchísimo. Tema solucionado, agregando una línea al código de Arduino IDE, el problema estaba en que las placas sufrían una caída de voltaje o interferencias en la antena", estado: "ok" },
    { fecha: "06/11", prueba: "WiFi y envío de datos con la potencia de transmisión reducida (8,5 dBm)", esperado: "El ESP se conecta y envía todos los datos", resultado: "Se conectó y envió todo correctamente, también el acelerómetro. En el Dashboard sobraba una variable sin tópico: se decidió sacarla y falta avisarle al equipo del Dashboard", estado: "ok" },
    { fecha: "03/11 al 06/11", prueba: "Página web propia del nodo (ruta /data)", esperado: "Los datos llegan a la página", resultado: "La página web del nodo registra correctamente todos los datos", estado: "ok" },
    { fecha: "13/11", prueba: "Prueba completa del nodo armado en la caja, con el Dashboard general y la página del nodo", esperado: "Los cuatro sensores reportan", resultado: "Un éxito", estado: "ok" }
  ]
};

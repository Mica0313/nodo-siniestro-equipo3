#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <WiFi.h>
#include <WebServer.h>
#include <PubSubClient.h>
#include <math.h>
#include "secrets.h"
// =========================================================================
//  SECCIÓN 2: WIFI
// =========================================================================

// Potencia de transmisión del Wi-Fi. La potencia por defecto (19.5 dBm) puede
// hacer caer el voltaje de la placa y reiniciarla o desconectarla. Bajarla da estabilidad.
const wifi_power_t WIFI_TX_POWER = WIFI_POWER_8_5dBm;

// =========================================================================
// SECCIÓN 3: MQTT - BROKER DEL DASHBOARD DEL GRUPO
// =========================================================================

const uint16_t MQTT_PORT = 1883;


// =========================================================================
// SECCIÓN 4: TÓPICOS
// =========================================================================
const char* TOP_TEMP      = "6to_info/A/G3/temperatura";
const char* TOP_HUM       = "6to_info/A/G3/humedad";
const char* TOP_GASES     = "6to_info/A/G3/gases";
const char* TOP_LLAMA     = "6to_info/A/G3/llama";
const char* TOP_POSICION  = "6to_info/A/G3/posicion";
// El topico de posición es el que envía la info del acelerómetro sobre la vibración, 
//esto ocurrió por una confusión al momento de decidir los tópicos
//el TOP_VIBRACION lo dejamos puesto en el codigo en caso de una futura mejora, cambio o actualización
const char* TOP_VIBRACION = "6to_info/A/G3/vibracion";

const char* TOP_JSON      = "campus/lab-hardware/siniestro/telemetria";

// =========================================================================
// SECCIÓN 5: ASIGNACIÓN DE PINES DEL MICROCONTROLADOR (ESP32-C3)
// =========================================================================
#define SDA_PIN 8
#define SCL_PIN 9
#define DHTPIN 2
#define MQ2_PIN 1
#define FLAME_PIN 0
#define BUTTON_PIN 4

// =========================================================================
// SECCIÓN 6: INSTANCIAS Y PARÁMETROS DE SENSORES
// =========================================================================
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

Adafruit_MPU6050 mpu;
LiquidCrystal_I2C lcd(0x27, 16, 2);

// =========================================================================
// SECCIÓN 6B: UMBRALES (TODO SE AJUSTA ACÁ, NO HACE FALTA TOCAR EL RESTO)
// =========================================================================

// ---- MODO CALIBRACIÓN ----
// true  = imprime por Serial (115200) una línea por segundo con los valores
//         de llama y gas, para medir y elegir los umbrales.
//         En este modo NO se espera al Wi-Fi al arrancar (conecta en segundo plano).
// false = silencioso y espera al Wi-Fi al arrancar (usar en la versión final).
const bool CALIBRACION = false;

// ---- LLAMA (módulo IR de 4 pines, salida analógica AO) ----
// Sentido del sensor (depende del módulo, se confirma midiendo):
//   true  = con fuego el valor SUBE  (promedio por encima del umbral = fuego)
//   false = con fuego el valor BAJA  (promedio por debajo del umbral = fuego)
const bool FUEGO_SUBE_EL_VALOR = false;
// Se mide: aula con luz normal, sol directo sobre el sensor y llama real.
const int UMBRAL_LLAMA = 190;        // PROVISORIO: aula ~210-250, llama ~150-200 (falta blindar el sensor de la luz ambiente)
const int HISTERESIS_LLAMA = 20;     // para soltar la alarma, el promedio tiene que alejarse este margen del umbral
const int MUESTRAS_LLAMA = 8;        // tamaño de la ventana de promedio
const unsigned long INTERVALO_MUESTRA_LLAMA = 100; // una muestra cada 100 ms
const int LECTURAS_PARA_ACTIVAR = 20;    // 20 x 100 ms = 2 s seguidos con IR para declarar fuego
const int LECTURAS_PARA_DESACTIVAR = 30; // 30 x 100 ms = 3 s seguidos sin IR para limpiar la alarma

// Filtro anti-sol: la llama parpadea y el sol no.
// Si se pone en true, además del IR exige variación (máx - mín) dentro de la ventana.
const bool EXIGIR_PARPADEO = false;
const int UMBRAL_PARPADEO = 150;     // diferencia mínima máx-mín (en cuentas del ADC)

// ---- GAS (MQ-2) ----
const int UMBRAL_GAS = 700;          // valor filtrado por encima de esto = alerta de gas
const int HISTERESIS_GAS = 150;      // para soltar la alerta tiene que bajar de UMBRAL_GAS - este valor
const unsigned long INTERVALO_MUESTRA_GAS = 200;   // una muestra cada 200 ms
const unsigned long PRECALENTAMIENTO_MQ2_MS = 60000; // el MQ-2 necesita calentarse; sin alerta de gas durante este tiempo

// ---- VIBRACIÓN / MOVIMIENTO ----
// Para elegir este valor usar el sketch calibrar_umbral_vibracion.ino
const float UMBRAL_MOVIMIENTO = 2.5; // Umbral de aceleración en m/s²
const unsigned long RETENCION_MOVIMIENTO_MS = 1000;  // la vibración se mantiene 1 s desde el último movimiento
const unsigned long INTERVALO_MUESTRA_MPU = 100;     // una muestra del acelerómetro cada 100 ms

// =========================================================================
// SECCIÓN 7: OBJETOS DE RED
// =========================================================================
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
WebServer server(80);   // Servidor HTTP para la página HTML

String clientId;        // Identificador único del ESP32 en el broker

// =========================================================================
// SECCIÓN 8: VARIABLES DE CONTROL Y TIEMPO
// =========================================================================
int paginaActual = 0;
int ultimoEstadoBoton = HIGH;

// Doble click en el botón = reiniciar el ESP32
unsigned long ultimoClick = 0;
const unsigned long VENTANA_DOBLE_CLICK_MS = 400;  // máximo tiempo entre los dos clicks

unsigned long ultimoRefresco = 0;
const long intervaloRefresco = 500;      // Refresco de la pantalla LCD

unsigned long ultimaPublicacion = 0;
const long intervaloPublicacion = 2000;  // Envío de datos al broker cada 2 s

unsigned long ultimoIntentoWifi = 0;
unsigned long ultimoIntentoMqtt = 0;
const long intervaloReintento = 5000;    // Reintento de conexión cada 5 s

// Estado de los sensores analógicos (llama y gas)
int ventanaLlama[MUESTRAS_LLAMA];
int idxVentana = 0;
int muestrasCargadas = 0;
unsigned long ultimaMuestraLlama = 0;
int contadorActivar = 0;
int contadorDesactivar = 0;
int llamaPromedio = 4095;
int llamaMin = 4095;
int llamaMax = 0;
bool llamaDetectada = false;

float gasFiltrado = 0;
unsigned long ultimaMuestraGas = 0;
bool gasAlerta = false;

// Estado del acelerómetro y la vibración
bool mpuOk = false;                      // false si el MPU6050 no respondió al arrancar
unsigned long ultimaMuestraMpu = 0;
unsigned long ultimoMovimiento = 0;
bool hayMovimiento = false;
float aceleracionG = 1.0;                // última aceleración medida, en g

bool cambioDeEstado = false;             // fuerza una publicación inmediata si cambia una alarma
unsigned long ultimoPrintCalibracion = 0;

// Declaración previa de funciones
void mostrarPagina(int pagina);
void responderJSON();
void mantenerConexiones();
void publicarDatos();
void actualizarLlama();
void actualizarGas();
void actualizarMovimiento();

// =========================================================================
// SECCIÓN 9: CONFIGURACIÓN INICIAL (SETUP)
// =========================================================================
void setup() {
  Serial.begin(115200);

  Wire.begin(SDA_PIN, SCL_PIN);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(MQ2_PIN, INPUT);
  pinMode(FLAME_PIN, INPUT);

  lcd.init();
  lcd.backlight();
  dht.begin();

  lcd.setCursor(0, 0);
  lcd.print("Estacion Sensor");
  lcd.setCursor(0, 1);
  lcd.print("Conectando Wi-Fi");

  // Conexión a la red Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Bajar la potencia de transmisión para que no caiga el voltaje de la placa
  WiFi.setTxPower(WIFI_TX_POWER);

  Serial.print("Conectando a WiFi");

  int intentos = 0;
  while (!CALIBRACION && WiFi.status() != WL_CONNECTED && intentos < 30) {
    delay(500);
    Serial.print(".");
    intentos++;
  }
  Serial.println();

  // ID único para el broker
  clientId = "6toA_G3_" + String((uint32_t)ESP.getEfuseMac(), HEX);

  if (!mpu.begin(0x68, &Wire)) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Err: MPU6050");
    delay(1500);
  } else {
    mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
    mpuOk = true;
  }

  lcd.clear();
  if (WiFi.status() == WL_CONNECTED) {
    lcd.setCursor(0, 0);
    lcd.print("Wi-Fi OK!");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP().toString());

    Serial.println("¡Conectado exitosamente!");
    Serial.print("IP Asignada al ESP32: ");
    Serial.println(WiFi.localIP());
  } else {
    lcd.setCursor(0, 0);
    lcd.print("Wi-Fi Error!");
    lcd.setCursor(0, 1);
    lcd.print("Reintentando...");
    Serial.println("No se pudo conectar al Wi-Fi (se seguira intentando)");
  }
  if (!CALIBRACION) delay(2500);

  // Valor inicial del filtro de gas
  gasFiltrado = analogRead(MQ2_PIN);

  // Configuración del cliente MQTT
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(512);    // el mensaje JSON del nodo supera los 256 bytes por defecto de PubSubClient cuando se suma el tópico
  mqtt.setSocketTimeout(3);   // Evita que el equipo se congele si el broker no responde

  // Rutas del servidor HTTP
  server.on("/data", responderJSON);
  server.begin();

  lcd.clear();
}

// =========================================================================
// SECCIÓN 10: BUCLE PRINCIPAL (LOOP)
// =========================================================================
void loop() {
  server.handleClient();
  mantenerConexiones();
  mqtt.loop();

  // Lectura y filtrado de llama y gas (sin delay, se ejecutan cuando les toca)
  actualizarLlama();
  actualizarGas();
  actualizarMovimiento();

  // Botón para cambiar de página en la LCD
  int estadoBoton = digitalRead(BUTTON_PIN);

  if (ultimoEstadoBoton == HIGH && estadoBoton == LOW) {
    delay(50);
    if (digitalRead(BUTTON_PIN) == LOW) {
      unsigned long ahora = millis();

      // Doble click: dos pulsaciones separadas por menos de VENTANA_DOBLE_CLICK_MS
      if (ultimoClick != 0 && ahora - ultimoClick < VENTANA_DOBLE_CLICK_MS) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Reiniciando...");
        delay(500);
        ESP.restart();
      }
      ultimoClick = ahora;

      // Click simple: cambia de página
      paginaActual++;
      if (paginaActual > 3) {
        paginaActual = 0;
      }
      lcd.clear();
    }
  }
  ultimoEstadoBoton = estadoBoton;

  // Envío periódico de datos al broker MQTT (o inmediato si cambió una alarma)
  if (cambioDeEstado || millis() - ultimaPublicacion >= intervaloPublicacion) {
    ultimaPublicacion = millis();
    cambioDeEstado = false;
    publicarDatos();
  }

  // Refresco de la pantalla LCD
  if (millis() - ultimoRefresco >= intervaloRefresco) {
    ultimoRefresco = millis();
    mostrarPagina(paginaActual);
  }

  // Salida por Serial para calibrar umbrales
  if (CALIBRACION && millis() - ultimoPrintCalibracion >= 1000) {
    ultimoPrintCalibracion = millis();
    Serial.printf("LLAMA prom=%d min=%d max=%d | GAS=%d | llama=%d gas=%d\n",
                  llamaPromedio, llamaMin, llamaMax, (int)gasFiltrado,
                  llamaDetectada ? 1 : 0, gasAlerta ? 1 : 0);
  }
}

// =========================================================================
// SECCIÓN 10B: FILTRADO DE LLAMA Y GAS
// =========================================================================

// Llama: promedio de una ventana de muestras + confirmación sostenida + histéresis.
// Un pico aislado o un cambio de luz breve no alcanzan para declarar fuego.
void actualizarLlama() {
  if (millis() - ultimaMuestraLlama < INTERVALO_MUESTRA_LLAMA) return;
  ultimaMuestraLlama = millis();

  ventanaLlama[idxVentana] = analogRead(FLAME_PIN);
  idxVentana = (idxVentana + 1) % MUESTRAS_LLAMA;

  // Hasta no llenar la ventana no se evalúa nada
  if (muestrasCargadas < MUESTRAS_LLAMA) {
    muestrasCargadas++;
    return;
  }

  long suma = 0;
  int minimo = 4095;
  int maximo = 0;
  for (int i = 0; i < MUESTRAS_LLAMA; i++) {
    suma += ventanaLlama[i];
    if (ventanaLlama[i] < minimo) minimo = ventanaLlama[i];
    if (ventanaLlama[i] > maximo) maximo = ventanaLlama[i];
  }
  llamaPromedio = suma / MUESTRAS_LLAMA;
  llamaMin = minimo;
  llamaMax = maximo;

  bool parpadeoOk = (!EXIGIR_PARPADEO) || ((maximo - minimo) >= UMBRAL_PARPADEO);
  bool superaUmbral = FUEGO_SUBE_EL_VALOR ? (llamaPromedio > UMBRAL_LLAMA)
                                          : (llamaPromedio < UMBRAL_LLAMA);
  bool superaUmbralSalida = FUEGO_SUBE_EL_VALOR ? (llamaPromedio > UMBRAL_LLAMA - HISTERESIS_LLAMA)
                                                : (llamaPromedio < UMBRAL_LLAMA + HISTERESIS_LLAMA);
  bool condicionEntrada = superaUmbral && parpadeoOk;
  bool condicionSigue = superaUmbralSalida && parpadeoOk;

  if (!llamaDetectada) {
    if (condicionEntrada) {
      contadorActivar++;
      if (contadorActivar >= LECTURAS_PARA_ACTIVAR) {
        llamaDetectada = true;
        contadorDesactivar = 0;
        cambioDeEstado = true;
      }
    } else {
      contadorActivar = 0;
    }
  } else {
    if (!condicionSigue) {
      contadorDesactivar++;
      if (contadorDesactivar >= LECTURAS_PARA_DESACTIVAR) {
        llamaDetectada = false;
        contadorActivar = 0;
        cambioDeEstado = true;
      }
    } else {
      contadorDesactivar = 0;
    }
  }
}

// Gas: promedio móvil exponencial + histéresis + período de precalentamiento del MQ-2.
void actualizarGas() {
  if (millis() - ultimaMuestraGas < INTERVALO_MUESTRA_GAS) return;
  ultimaMuestraGas = millis();

  int lectura = analogRead(MQ2_PIN);
  gasFiltrado = 0.8f * gasFiltrado + 0.2f * lectura;

  if (millis() < PRECALENTAMIENTO_MQ2_MS) {
    gasAlerta = false;
    return;
  }

  bool anterior = gasAlerta;
  if (!gasAlerta && gasFiltrado > UMBRAL_GAS) {
    gasAlerta = true;
  } else if (gasAlerta && gasFiltrado < (UMBRAL_GAS - HISTERESIS_GAS)) {
    gasAlerta = false;
  }
  if (gasAlerta != anterior) cambioDeEstado = true;
}

// Movimiento: se mide cada 100 ms. Si la aceleración se aleja de 1 g más que el umbral,
// se marca movimiento y se mantiene 3 s, así una sacudida corta no se pierde entre
// dos publicaciones (que salen cada 2 s).
void actualizarMovimiento() {
  if (!mpuOk) return;
  if (millis() - ultimaMuestraMpu < INTERVALO_MUESTRA_MPU) return;
  ultimaMuestraMpu = millis();

  sensors_event_t a, g, tempMPU;
  mpu.getEvent(&a, &g, &tempMPU);
  float magnitud = sqrt(pow(a.acceleration.x, 2) + pow(a.acceleration.y, 2) + pow(a.acceleration.z, 2));
  aceleracionG = magnitud / 9.81;

  if (fabs(magnitud - 9.81) > UMBRAL_MOVIMIENTO) ultimoMovimiento = millis();

  bool anterior = hayMovimiento;
  hayMovimiento = (ultimoMovimiento != 0) && (millis() - ultimoMovimiento < RETENCION_MOVIMIENTO_MS);
  if (hayMovimiento != anterior) cambioDeEstado = true;   // publica enseguida si cambia
}

// =========================================================================
// SECCIÓN 11: MANTENER CONEXIONES (WIFI Y MQTT)
// =========================================================================
void mantenerConexiones() {
  // 1) Wi-Fi
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - ultimoIntentoWifi >= intervaloReintento) {
      ultimoIntentoWifi = millis();
      Serial.println("Wi-Fi caido, reconectando...");
      WiFi.reconnect();
      WiFi.setTxPower(WIFI_TX_POWER);   // reaplicar la potencia reducida
    }
    return;
  }

  // 2) MQTT (solo si hay Wi-Fi)
  if (!mqtt.connected() && millis() - ultimoIntentoMqtt >= intervaloReintento) {
    ultimoIntentoMqtt = millis();
    Serial.print("Conectando al broker MQTT... ");

    if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println("MQTT conectado");
    } else {
      Serial.print("fallo, codigo = ");
      Serial.println(mqtt.state());
    }
  }
}

// =========================================================================
// SECCIÓN 12: PUBLICACIÓN DE DATOS EN LOS TÓPICOS MQTT
// =========================================================================
void publicarDatos() {
  if (!mqtt.connected()) return;

  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int gas = (int)gasFiltrado;

  // --- Tópicos sueltos (los que también lee el dashboard del grupo) ---
  if (!isnan(temp)) mqtt.publish(TOP_TEMP, String(temp, 1).c_str());
  if (!isnan(hum))  mqtt.publish(TOP_HUM, String(hum, 1).c_str());

  mqtt.publish(TOP_GASES, String(gas).c_str());
  mqtt.publish(TOP_LLAMA, llamaDetectada ? "1" : "0");

  // Si el MPU6050 falló al arrancar no se publica nada de movimiento (evita una presencia falsa)
  if (mpuOk) {
    // El dashboard lee la vibración desde el tópico "posicion" (por una confusión de nombres),
    // así que ahí va 1 = vibración, 0 = no. También se publica en "vibracion" por si se corrige el nombre.
    mqtt.publish(TOP_POSICION, hayMovimiento ? "1" : "0");
    mqtt.publish(TOP_VIBRACION, hayMovimiento ? "1" : "0");
  }

  // --- Mensaje JSON completo del nodo (incluye señal WiFi y tiempo encendido) ---
  char json[220];
  int n = snprintf(json, sizeof(json), "{");
  if (!isnan(temp)) n += snprintf(json + n, sizeof(json) - n, "\"temperatura\":%.1f,", temp);
  if (!isnan(hum))  n += snprintf(json + n, sizeof(json) - n, "\"humedad\":%.1f,", hum);
  n += snprintf(json + n, sizeof(json) - n, "\"gases\":%d,\"llama\":%d,", gas, llamaDetectada ? 1 : 0);
  if (mpuOk) n += snprintf(json + n, sizeof(json) - n, "\"presencia\":%d,\"posicion\":%.2f,", hayMovimiento ? 1 : 0, aceleracionG);
  snprintf(json + n, sizeof(json) - n, "\"rssi\":%d,\"uptime\":%lu}", (int)WiFi.RSSI(), (unsigned long)(millis() / 1000UL));
  mqtt.publish(TOP_JSON, json);
}

// =========================================================================
// SECCIÓN 13: MANEJO DE PETICIONES HTTP (ENDPOINT /data)
// =========================================================================
void responderJSON() {
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();

  bool deteccionMovimiento = hayMovimiento;   // mismo criterio que el MQTT

  if (isnan(temp)) temp = 0.0;
  if (isnan(hum)) hum = 0.0;

  String json = "{";
  json += "\"temp\":" + String(temp, 1) + ",";
  json += "\"humidity\":" + String(hum, 1) + ",";
  json += "\"gasAlert\":" + String(gasAlerta ? "true" : "false") + ",";
  json += "\"flameAlert\":" + String(llamaDetectada ? "true" : "false") + ",";
  json += "\"motion\":" + String(deteccionMovimiento ? "true" : "false");
  json += "}";

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

// =========================================================================
// SECCIÓN 14: INTERFAZ DE USUARIO LCD
// =========================================================================
void mostrarPagina(int pagina) {
  switch (pagina) {

    // ---------------------------------------------------------------
    // PÁGINA 0: temperatura y humedad del ambiente (sensor DHT22)
    // ---------------------------------------------------------------
    case 0: {
      float temp = dht.readTemperature();
      float hum = dht.readHumidity();

      lcd.setCursor(0, 0);
      if (isnan(temp)) {
        lcd.print("Temp: Error     ");
      } else {
        lcd.print("Temp: ");
        lcd.print(temp, 1);
        lcd.print((char)223);
        lcd.print("C   ");
      }

      lcd.setCursor(0, 1);
      if (isnan(hum)) {
        lcd.print("Hum: Error      ");
      } else {
        lcd.print("Hum: ");
        lcd.print(hum, 1);
        lcd.print("%   ");
      }
      break;
    }

    // ---------------------------------------------------------------
    // PÁGINA 1: gas combustible y humo (sensor MQ-2)
    // El número es la lectura del ADC (0 a 4095) de la salida analógica
    // del MQ-2: a más gas o humo en el aire, más alto el valor.
    // No son ppm: es un nivel relativo.
    // ---------------------------------------------------------------
    case 1: {
      // Conversión de la lectura del ADC (0 a 4095) a porcentaje (0 a 100 %)
      int porcentajeGas = (int)lroundf(gasFiltrado * 100.0f / 4095.0f);
      if (porcentajeGas < 0) porcentajeGas = 0;
      if (porcentajeGas > 100) porcentajeGas = 100;

      lcd.setCursor(0, 0);
      lcd.print("Gas/humo: ");
      lcd.print(porcentajeGas);
      lcd.print("%  ");

      lcd.setCursor(0, 1);
      if (millis() < PRECALENTAMIENTO_MQ2_MS) {
        lcd.print("Calentando MQ-2 ");
      } else if (gasAlerta) {
        lcd.print("Estado: ALERTA! ");
      } else {
        lcd.print("Estado: Seguro  ");
      }
      break;
    }

    // ---------------------------------------------------------------
    // PÁGINA 2: llama (sensor infrarrojo de llama)
    // ---------------------------------------------------------------
    case 2: {
      lcd.setCursor(0, 0);
      lcd.print("Llama:          ");

      lcd.setCursor(0, 1);
      if (llamaDetectada) {
        lcd.print("ALERTA! FUEGO   ");
      } else {
        lcd.print("No hay          ");
      }
      break;
    }

    // ---------------------------------------------------------------
    // PÁGINA 3: vibración (MPU6050)
    // Muestra SI/NO con el mismo criterio que la página web (tópico vibracion).
    // ---------------------------------------------------------------
    case 3: {
      lcd.setCursor(0, 0);
      lcd.print("Vibracion:      ");

      lcd.setCursor(0, 1);
      if (!mpuOk) {
        lcd.print("Sin sensor MPU  ");
      } else if (hayMovimiento) {
        lcd.print("SI - Movimiento!");
      } else {
        lcd.print("NO - Estable    ");
      }
      break;
    }
  }
}

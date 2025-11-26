# UDP PING Simulator - Simulador de PING UDP

Un simulador educativo interactivo que permite entender el funcionamiento del protocolo PING (ICMP) usando comunicación UDP. Desarrollado con React/Next.js en el frontend y Python en el backend.

##  Descripción del Proyecto

Este proyecto es un **simulador de red educativo** que permite:

- Simular máquinas conectadas en una red local
- Enviar paquetes PING entre máquinas usando el protocolo UDP
- Visualizar de forma interactiva el envío de paquetes como "cables" animados
- Capturar y analizar estadísticas descriptivas de la comunicación (RTT, pérdida de paquetes, etc.)
- Funcionar en modo local (una PC) o modo red (múltiples PCs en la misma red)

### Características Principales

✅ **Simulación UDP Bidireccional**: Envío y recepción de paquetes simulados  
✅ **Visualización Interactiva**: Cables animados mostrando el flujo de datos  
✅ **Dashboard de Estadísticas**: Análisis descriptivo de pings (mediana, desviación estándar, cuartiles)  
✅ **Soporte Multired**: Detecta y conecta múltiples máquinas en la red  
✅ **Terminal Interactiva**: Interfaz CLI para ejecutar comandos ping  
✅ **Gestión de Máquinas**: Agregar, editar y eliminar máquinas simuladas  

---

##  Requisitos Previos

### Backend (Python)
- Python 3.8+
- `websockets` library

### Frontend (React/Node.js)
- Node.js 18+
- npm o pnpm

---

##  Instalación

### 1. Clonar o descargar el proyecto

\`\`\`bash
git clone <tu-repositorio>
cd udp-ping-simulator
\`\`\`

### 2. Instalar dependencias

**Frontend:**
\`\`\`bash
npm install
# o
pnpm install
\`\`\`

**Backend:**
\`\`\`bash
pip install websockets
\`\`\`

---

##  Uso

### Ejecución Local (Recomendado para Desarrollo)

**Terminal 1 - Inicia el servidor WebSocket (Python):**
\`\`\`bash
python servidor_websocket.py
\`\`\`

Deberías ver:
\`\`\`
[WebSocket] Servidor escuchando en ws://localhost:8765
\`\`\`

**Terminal 2 - Inicia el frontend (React):**
\`\`\`bash
npm run dev
\`\`\`

El navegador se abrirá automáticamente en `http://localhost:3000`

### Ejecución en Red (Múltiples PCs)

1. En la **PC principal**, ejecuta:
   \`\`\`bash
   python servidor_websocket.py
   \`\`\`

2. En las **PC adicionales**, modifica `App.tsx` para cambiar la dirección del servidor WebSocket a la IP de la PC principal:
   \`\`\`javascript
   const ws = new WebSocket('ws://192.168.1.X:8765')
   \`\`\`

3. Inicia React en cada PC:
   \`\`\`bash
   npm run dev
   \`\`\`

---

##  Guía de Uso

### Interfaz Principal

1. **Selector de Modo**: Al iniciar, elige entre:
   - **Modo Local**: Simula máquinas en una sola PC
   - **Modo Red**: Conecta múltiples PCs en la red

2. **Panel de Máquinas**: Muestra computadoras conectadas
   - Click en **WiFi** para activar/desactivar servidor UDP
   - Click en **Terminal** para abrir la consola

3. **Terminal Interactiva**: Ejecuta comandos ping
   \`\`\`bash
   ping 192.168.1.102
   \`\`\`

4. **Visualización**: Ve los paquetes viajando como cables animados

5. **Dashboard de Estadísticas**: Click en "Ver Dashboard Estadístico" para ver:
   - Paquetes enviados, recibidos, perdidos
   - RTT mín, máx, promedio
   - Mediana, desviación estándar, cuartiles

---

##  Estructura del Proyecto

\`\`\`
.
├── App.tsx                      # Componente principal React
├── components/
│   ├── Dashboard.jsx           # Dashboard de estadísticas
│   └── StartCard.jsx           # Tarjeta de selección de modo
├── servidor_websocket.py       # Servidor WebSocket + UDP
├── network_scanner.py          # Scanner de red (opcional)
├── package.json                # Dependencias Node.js
├── README.md                   # Este archivo
└── app/
    ├── globals.css            # Estilos globales
    └── page.tsx               # Página principal
\`\`\`

---

##  Protocolo de Comunicación

### Formato de Mensajes WebSocket (JSON)

**Cliente → Servidor (Ping):**
\`\`\`json
{
  "type": "ping",
  "source_machine_id": "1",
  "target_ip": "192.168.1.102",
  "target_port": 9002,
  "packet_count": 10
}
\`\`\`

**Servidor → Cliente (Respuesta):**
\`\`\`json
{
  "type": "ping_packet",
  "packet_num": 1,
  "rtt": 0.45,
  "bytes": 64,
  "status": "recibido"
}
\`\`\`

**Servidor → Cliente (Estadísticas Finales):**
\`\`\`json
{
  "type": "ping_stats",
  "sent": 10,
  "received": 9,
  "lost": 1,
  "rtt_times": [0.32, 0.45, 0.48, ...]
}
\`\`\`

---

##  Estadística Descriptiva Incluida

El dashboard calcula automáticamente:

| Métrica | Descripción |
|---------|------------|
| **Enviados** | Total de paquetes enviados |
| **Recibidos** | Paquetes que llegaron correctamente |
| **Perdidos** | Paquetes no recibidos |
| **Pérdida %** | Porcentaje de pérdida de paquetes |
| **RTT Mín** | Tiempo mínimo de ida y vuelta |
| **RTT Máx** | Tiempo máximo de ida y vuelta |
| **RTT Promedio** | Media aritmética de RTT |
| **Mediana** | Valor central de RTT |
| **Desv. Estándar** | Dispersión de datos |
| **Q1 (Cuartil 1)** | 25% de los datos |
| **Q3 (Cuartil 3)** | 75% de los datos |
| **RIC** | Rango Intercuartil (Q3 - Q1) |

---

##  Configuración

### Variables de Entorno (Opcional)

Crea un archivo `.env.local` para personalizar:

\`\`\`env
NEXT_PUBLIC_WS_URL=ws://localhost:8765
NEXT_PUBLIC_WS_PORT=8765
\`\`\`

### Parámetros del Backend

Edita `servidor_websocket.py`:

- **Puertos de máquinas**: Línea ~25 - Cambia los puertos predeterminados
- **Timeout de UDP**: Línea ~85 - Ajusta el tiempo de espera
- **Número de paquetes**: Línea ~120 - Cambia cantidad de pings

---

##  Solución de Problemas

### Error: "Desconectado" en el header

**Causa**: El servidor WebSocket no está corriendo.

**Solución**:
\`\`\`bash
python servidor_websocket.py
\`\`\`

### Error: "WinError 10048" (Windows)

**Causa**: Puerto ya está en uso.

**Solución**: Cambia el puerto en `servidor_websocket.py` (línea ~200):
\`\`\`python
async with websockets.serve(websocket_handler, "0.0.0.0", 8766):
\`\`\`

### No hay conexión entre máquinas

**Causa**: Firewall bloqueando UDP.

**Solución**:
- Desactiva firewall temporalmente (solo para pruebas)
- O agrega excepciones para puertos 9001-9003

### El botón de estadísticas no aparece

**Causa**: Aún no has completado un ping.

**Solución**: Ejecuta un ping primero (terminal > `ping 192.168.1.X`)

---

##  Optimizaciones Futuras

- [ ] Soporte para protocolo ICMP real
- [ ] Simulación de latencia variable
- [ ] Pérdida de paquetes configurable
- [ ] Exportar estadísticas a CSV/PDF
- [ ] Gráficos en tiempo real (chartjs)
- [ ] Autenticación de usuarios

---

##  Licencia

Proyecto educativo desarrollado para la materia de Ingeniería de Redes.

---

**¡Disfruta simulando redes! **

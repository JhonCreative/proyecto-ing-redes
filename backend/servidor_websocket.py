# servidor_websocket.py
# Backend que integra tu código UDP con el frontend React

import asyncio
import json
import socket
import time
import random
from datetime import datetime
import websockets
from threading import Thread

# Diccionario para almacenar servidores UDP activos
udp_servers = {}
# Diccionario para almacenar sockets UDP por máquina
udp_sockets = {}

class UDPServerThread(Thread):
    """Servidor UDP que corre en un thread separado"""
    def __init__(self, machine_id, ip, port):
        Thread.__init__(self)
        self.machine_id = machine_id
        self.ip = ip
        self.port = port
        self.running = True
        self.socket = None
        
    def run(self):
        """Ejecutar servidor UDP"""
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Bind to 0.0.0.0 to listen on all available interfaces
        self.socket.bind(('0.0.0.0', self.port))
        self.socket.settimeout(1.0)
        
        print(f"✅ Servidor UDP iniciado en {self.ip}:{self.port} (Machine {self.machine_id})")
        
        while self.running:
            try:
                data, addr = self.socket.recvfrom(1024)
                print(f"📥 [{self.machine_id}] Paquete recibido de {addr}: {data.decode()}")
                # Enviar eco de vuelta
                self.socket.sendto(data, addr)
                print(f"📤 [{self.machine_id}] Respuesta enviada a {addr}")
            except socket.timeout:
                continue
            except Exception as e:
                if self.running:
                    print(f"❌ Error en servidor {self.machine_id}: {e}")
                    
    def stop(self):
        """Detener servidor"""
        self.running = False
        if self.socket:
            self.socket.close()
        print(f"🛑 Servidor UDP detenido (Machine {self.machine_id})")


async def udp_ping(source_ip, target_ip, count=10, loss_rate=0.15):
    """
    Realizar ping UDP real usando tu código original
    """
    results = []
    
    # Crear socket UDP
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(2.0)
    
    rtts = []
    lost_packets = 0
    
    for i in range(1, count + 1):
        # Simular pérdida (opcional, puedes desactivarlo para pérdida real)
        if random.random() < loss_rate:
            lost_packets += 1
            results.append({
                'packet': i,
                'status': 'lost',
                'rtt': None,
                'message': f'❌ Paquete {i}: Tiempo de espera agotado'
            })
            await asyncio.sleep(0.4)
            continue
        
        # Mensaje con timestamp
        msg = f"ping {i} {time.time()}"
        
        try:
            # Enviar paquete
            start = time.time()
            sock.sendto(msg.encode(), (target_ip, 9999))
            
            # Recibir respuesta
            data, _ = sock.recvfrom(1024)
            end = time.time()
            
            # Calcular RTT
            rtt = (end - start) * 1000
            rtts.append(rtt)
            
            results.append({
                'packet': i,
                'status': 'success',
                'rtt': round(rtt, 2),
                'message': f'✅ Paquete {i}: bytes=64 tiempo={rtt:.1f}ms TTL=64'
            })
            
        except socket.timeout:
            lost_packets += 1
            results.append({
                'packet': i,
                'status': 'timeout',
                'rtt': None,
                'message': f'⏳ Paquete {i}: Tiempo de espera agotado'
            })
        
        await asyncio.sleep(0.15)
    
    sock.close()
    
    # Calcular estadísticas
    stats = {
        'sent': count,
        'received': count - lost_packets,
        'lost': lost_packets,
        'loss_percentage': round((lost_packets / count) * 100, 2),
        'avg_rtt': round(sum(rtts) / len(rtts), 2) if rtts else 0,
        'min_rtt': round(min(rtts), 2) if rtts else 0,
        'max_rtt': round(max(rtts), 2) if rtts else 0
    }
    
    return {
        'results': results,
        'stats': stats
    }


async def handle_websocket(websocket):
    """
    Manejar conexiones WebSocket desde el frontend
    """
    print(f"🔌 Cliente conectado: {websocket.remote_address}")
    
    try:
        async for message in websocket:
            data = json.loads(message)
            command = data.get('command')
            
            print(f"📨 Comando recibido: {command}")
            
            # Comando: Iniciar servidor UDP
            if command == 'start_server':
                machine_id = data['machine_id']
                ip = data['ip']
                port = data.get('port', 9999)
                
                if machine_id not in udp_servers:
                    server = UDPServerThread(machine_id, ip, port)
                    server.start()
                    udp_servers[machine_id] = server
                    
                    await websocket.send(json.dumps({
                        'type': 'server_started',
                        'machine_id': machine_id,
                        'message': f'🟢 Servidor UDP iniciado en {ip}:{port}'
                    }))
                else:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': 'Servidor ya está corriendo'
                    }))
            
            # Comando: Detener servidor UDP
            elif command == 'stop_server':
                machine_id = data['machine_id']
                
                if machine_id in udp_servers:
                    udp_servers[machine_id].stop()
                    udp_servers[machine_id].join()
                    del udp_servers[machine_id]
                    
                    await websocket.send(json.dumps({
                        'type': 'server_stopped',
                        'machine_id': machine_id,
                        'message': '🛑 Servidor UDP detenido'
                    }))
            
            # Comando: Ejecutar PING
            elif command == 'ping':
                source_ip = data['source_ip']
                target_ip = data['target_ip']
                machine_id = data['machine_id']
                
                # Enviar inicio de ping
                await websocket.send(json.dumps({
                    'type': 'ping_start',
                    'machine_id': machine_id,
                    'message': f'🔄 Iniciando PING a {target_ip}...'
                }))
                
                # Ejecutar ping real
                ping_result = await udp_ping(source_ip, target_ip)
                
                # Enviar resultados progresivamente
                for result in ping_result['results']:
                    await websocket.send(json.dumps({
                        'type': 'ping_packet',
                        'machine_id': machine_id,
                        'data': result
                    }))
                    await asyncio.sleep(0.1)
                
                # Enviar estadísticas finales
                await websocket.send(json.dumps({
                    'type': 'ping_complete',
                    'machine_id': machine_id,
                    'stats': ping_result['stats']
                }))
    
    except websockets.exceptions.ConnectionClosed:
        print(f"🔌 Cliente desconectado")
    except Exception as e:
        print(f"❌ Error: {e}")


async def main():
    """Iniciar servidor WebSocket"""
    print("=" * 50)
    print("🚀 Servidor WebSocket UDP PING Simulator")
    print("=" * 50)
    print("Escuchando en ws://localhost:8765")
    print("Presiona Ctrl+C para detener")
    print("=" * 50)
    
    async with websockets.serve(handle_websocket, "localhost", 8765):
        await asyncio.Future()  # Correr forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Deteniendo servidor...")
        # Detener todos los servidores UDP
        for server in udp_servers.values():
            server.stop()
        print("👋 Servidor detenido")
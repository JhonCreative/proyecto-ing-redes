# servidor_websocket.py
# Backend UDP PING con detección automática de IPs en la red

import asyncio
import json
import socket
import time
import random
from threading import Thread
import websockets

udp_servers = {}

def get_local_ip():
    """Obtener la IP local de la máquina"""
    try:
        # Crear socket temporal para obtener IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        print(f"✅ IP local detectada: {local_ip}")
        return local_ip
    except Exception as e:
        print(f"⚠️ No se pudo detectar IP local: {e}")
        return "127.0.0.1"

def scan_network():
    """Escanear IPs activas en la red local"""
    local_ip = get_local_ip()
    network_prefix = '.'.join(local_ip.split('.')[:-1])
    active_ips = []
    
    print(f"🔍 Escaneando red {network_prefix}.0/24...")
    
    # Escanear solo algunas IPs para ser rápido (puedes ajustar el rango)
    for i in range(1, 255):
        ip = f"{network_prefix}.{i}"
        try:
            # Intentar conectar rápidamente
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(0.1)
            result = sock.connect_ex((ip, 80))  # Probar puerto 80
            sock.close()
            
            if result == 0 or ip == local_ip:
                active_ips.append(ip)
                print(f"   ✅ Encontrada: {ip}")
        except:
            pass
    
    return active_ips

class UDPServerThread(Thread):
    def __init__(self, machine_id, ip, port):
        Thread.__init__(self)
        self.machine_id = machine_id
        self.ip = ip
        self.port = port
        self.running = True
        self.socket = None
        
    def run(self):
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            # Permitir reutilizar la dirección
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            # Escuchar en todas las interfaces (0.0.0.0) para recibir desde cualquier IP
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
        except Exception as e:
            print(f"❌ Error al iniciar servidor {self.machine_id} en {self.ip}:{self.port}: {e}")
                    
    def stop(self):
        self.running = False
        if self.socket:
            self.socket.close()
        print(f"🛑 Servidor UDP detenido (Machine {self.machine_id})")

async def udp_ping(source_ip, target_ip, target_port, count=10, loss_rate=0.15):
    """Realizar ping UDP real"""
    results = []
    
    try:
        # Crear socket UDP
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(2.0)
        
        rtts = []
        lost_packets = 0
        
        for i in range(1, count + 1):
            # Simular pérdida de paquetes (puedes cambiar loss_rate o quitarlo)
            if random.random() < loss_rate:
                lost_packets += 1
                results.append({
                    'packet': i,
                    'status': 'lost',
                    'rtt': None,
                    'message': f'❌ Paquete {i}: Simulación de pérdida'
                })
                await asyncio.sleep(0.4)
                continue
            
            # Mensaje con timestamp
            msg = f"ping {i} {time.time()}"
            
            try:
                # Enviar paquete a la IP y puerto reales
                start = time.time()
                sock.sendto(msg.encode(), (target_ip, target_port))
                
                # Recibir respuesta
                data, addr = sock.recvfrom(1024)
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
            except Exception as e:
                lost_packets += 1
                results.append({
                    'packet': i,
                    'status': 'error',
                    'rtt': None,
                    'message': f'❌ Paquete {i}: Error - {str(e)}'
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
        
        return {'results': results, 'stats': stats}
        
    except Exception as e:
        print(f"❌ Error en udp_ping: {e}")
        return {
            'results': [{'packet': 1, 'status': 'error', 'rtt': None, 'message': f'Error: {str(e)}'}],
            'stats': {'sent': 0, 'received': 0, 'lost': 0, 'loss_percentage': 100, 'avg_rtt': 0, 'min_rtt': 0, 'max_rtt': 0}
        }

async def handle_websocket(websocket):
    print(f"🔌 Cliente conectado: {websocket.remote_address}")
    
    try:
        async for message in websocket:
            data = json.loads(message)
            command = data.get('command')
            
            print(f"📨 Comando recibido: {command}")
            
            # Comando: Escanear red
            if command == 'scan_network':
                local_ip = get_local_ip()
                await websocket.send(json.dumps({
                    'type': 'network_info',
                    'local_ip': local_ip,
                    'message': f'Tu IP local es: {local_ip}'
                }))
            
            # Comando: Iniciar servidor UDP
            elif command == 'start_server':
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
                        'machine_id': machine_id,
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
                target_port = data.get('target_port', 9999)
                machine_id = data['machine_id']
                
                # Enviar inicio de ping
                await websocket.send(json.dumps({
                    'type': 'ping_start',
                    'machine_id': machine_id,
                    'message': f'🔄 Iniciando PING a {target_ip}:{target_port}...'
                }))
                
                # Ejecutar ping real
                ping_result = await udp_ping(source_ip, target_ip, target_port)
                
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
    # Obtener IP local
    local_ip = get_local_ip()
    
    print("=" * 50)
    print("🚀 Servidor WebSocket UDP PING Simulator")
    print("=" * 50)
    print(f"Tu IP local: {local_ip}")
    print("Escuchando en ws://localhost:8765")
    print("Presiona Ctrl+C para detener")
    print("=" * 50)
    
    async with websockets.serve(handle_websocket, "0.0.0.0", 8765):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Deteniendo servidor...")
        for server in udp_servers.values():
            server.stop()
        print("👋 Servidor detenido")
# servidor_websocket.py
# Backend UDP PING con escaneo de red y sincronización

import asyncio
import json
import socket
import time
import random
from threading import Thread
import websockets
import subprocess
import platform
import re

udp_servers = {}
connected_clients = set()  # Todos los clientes conectados
network_devices = {}  # Dispositivos detectados en la red

def get_local_ip():
    """Obtener la IP local de la máquina"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        print(f"✅ IP local detectada: {local_ip}")
        return local_ip
    except Exception as e:
        print(f"⚠️ No se pudo detectar IP local: {e}")
        return "127.0.0.1"

def scan_network_devices():
    """Escanear dispositivos en la red local usando ARP"""
    devices = []
    local_ip = get_local_ip()
    network_prefix = '.'.join(local_ip.split('.')[:-1])
    
    print(f"\n🔍 Escaneando red {network_prefix}.0/24...")
    
    system = platform.system()
    
    try:
        if system == "Windows":
            # Usar arp en Windows
            output = subprocess.check_output("arp -a", shell=True).decode('utf-8', errors='ignore')
            for line in output.split('\n'):
                # Buscar IPs en formato XXX.XXX.XXX.XXX
                ip_match = re.findall(r'(\d+\.\d+\.\d+\.\d+)', line)
                if ip_match and network_prefix in ip_match[0]:
                    ip = ip_match[0]
                    # Detectar tipo de dispositivo (básico)
                    device_type = detect_device_type(line)
                    devices.append({
                        'ip': ip,
                        'type': device_type,
                        'online': True
                    })
                    print(f"   ✅ {ip} - {device_type}")
        else:
            # Linux/Mac: usar arp o ip neigh
            try:
                output = subprocess.check_output("arp -a", shell=True).decode('utf-8', errors='ignore')
            except:
                output = subprocess.check_output("ip neigh", shell=True).decode('utf-8', errors='ignore')
            
            for line in output.split('\n'):
                ip_match = re.findall(r'(\d+\.\d+\.\d+\.\d+)', line)
                if ip_match and network_prefix in ip_match[0]:
                    ip = ip_match[0]
                    device_type = detect_device_type(line)
                    devices.append({
                        'ip': ip,
                        'type': device_type,
                        'online': True
                    })
                    print(f"   ✅ {ip} - {device_type}")
    except Exception as e:
        print(f"⚠️ Error al escanear red: {e}")
    
    # Agregar la IP local si no está
    if not any(d['ip'] == local_ip for d in devices):
        devices.append({
            'ip': local_ip,
            'type': 'pc',
            'online': True
        })
    
    print(f"📊 Total dispositivos encontrados: {len(devices)}")
    return devices

def detect_device_type(line):
    """Detectar tipo de dispositivo basado en información ARP"""
    line_lower = line.lower()
    
    # Patrones para detectar móviles
    mobile_patterns = ['android', 'iphone', 'mobile', 'phone', 'samsung', 'xiaomi', 'huawei']
    if any(pattern in line_lower for pattern in mobile_patterns):
        return 'mobile'
    
    # Patrones para routers
    router_patterns = ['router', 'gateway', 'modem']
    if any(pattern in line_lower for pattern in router_patterns):
        return 'router'
    
    # Por defecto es PC
    return 'pc'

async def broadcast_to_clients(message, exclude=None):
    """Enviar mensaje a todos los clientes conectados"""
    if connected_clients:
        disconnected = set()
        for client in connected_clients:
            if client != exclude:
                try:
                    await client.send(json.dumps(message))
                except:
                    disconnected.add(client)
        
        # Limpiar clientes desconectados
        for client in disconnected:
            connected_clients.discard(client)

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
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind(('0.0.0.0', self.port))
            self.socket.settimeout(1.0)
            
            print(f"✅ Servidor UDP iniciado en 0.0.0.0:{self.port} (Machine {self.machine_id} - IP: {self.ip})")
            
            while self.running:
                try:
                    data, addr = self.socket.recvfrom(1024)
                    print(f"📥 [{self.machine_id}] Paquete recibido de {addr}: {data.decode()}")
                    self.socket.sendto(data, addr)
                    print(f"📤 [{self.machine_id}] Respuesta enviada a {addr}")
                except socket.timeout:
                    continue
                except Exception as e:
                    if self.running:
                        print(f"❌ Error en servidor {self.machine_id}: {e}")
        except OSError as e:
            if e.errno == 48 or e.errno == 10048:
                print(f"❌ Puerto {self.port} ya está en uso")
            else:
                print(f"❌ Error al iniciar servidor en puerto {self.port}: {e}")
        except Exception as e:
            print(f"❌ Error inesperado: {e}")
                    
    def stop(self):
        self.running = False
        if self.socket:
            self.socket.close()
        print(f"🛑 Servidor UDP detenido (Machine {self.machine_id})")

async def udp_ping(source_ip, target_ip, target_port, machine_id, count=10, loss_rate=0.10):
    """Realizar ping UDP real con broadcast a todos los clientes"""
    results = []
    
    print(f"\n🎯 PING: {source_ip} → {target_ip}:{target_port}")
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(2.0)
        
        rtts = []
        lost_packets = 0
        
        for i in range(1, count + 1):
            if random.random() < loss_rate:
                lost_packets += 1
                result = {
                    'packet': i,
                    'status': 'lost',
                    'rtt': None,
                    'message': f'❌ Paquete {i}: Simulación de pérdida'
                }
                results.append(result)
                
                # Broadcast a todos los clientes
                await broadcast_to_clients({
                    'type': 'ping_packet',
                    'machine_id': machine_id,
                    'data': result
                })
                
                await asyncio.sleep(0.4)
                continue
            
            msg = f"ping {i} {time.time()}"
            
            try:
                start = time.time()
                sock.sendto(msg.encode(), (target_ip, target_port))
                
                data, addr = sock.recvfrom(1024)
                end = time.time()
                
                rtt = (end - start) * 1000
                rtts.append(rtt)
                
                result = {
                    'packet': i,
                    'status': 'success',
                    'rtt': round(rtt, 2),
                    'message': f'✅ Paquete {i}: bytes=64 tiempo={rtt:.1f}ms TTL=64'
                }
                results.append(result)
                
                # Broadcast a todos los clientes
                await broadcast_to_clients({
                    'type': 'ping_packet',
                    'machine_id': machine_id,
                    'data': result
                })
                
            except socket.timeout:
                lost_packets += 1
                result = {
                    'packet': i,
                    'status': 'timeout',
                    'rtt': None,
                    'message': f'⏳ Paquete {i}: Tiempo de espera agotado'
                }
                results.append(result)
                
                await broadcast_to_clients({
                    'type': 'ping_packet',
                    'machine_id': machine_id,
                    'data': result
                })
                
            except Exception as e:
                lost_packets += 1
                result = {
                    'packet': i,
                    'status': 'error',
                    'rtt': None,
                    'message': f'❌ Paquete {i}: Error'
                }
                results.append(result)
                
                await broadcast_to_clients({
                    'type': 'ping_packet',
                    'machine_id': machine_id,
                    'data': result
                })
            
            await asyncio.sleep(0.15)
        
        sock.close()
        
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
        print(f"❌ Error en ping: {e}")
        return {
            'results': [],
            'stats': {'sent': 0, 'received': 0, 'lost': 0, 'loss_percentage': 100, 'avg_rtt': 0, 'min_rtt': 0, 'max_rtt': 0}
        }

async def handle_websocket(websocket):
    print(f"🔌 Cliente conectado: {websocket.remote_address}")
    connected_clients.add(websocket)
    
    try:
        async for message in websocket:
            data = json.loads(message)
            command = data.get('command')
            
            print(f"📨 Comando: {command}")
            
            if command == 'get_network_info':
                local_ip = get_local_ip()
                await websocket.send(json.dumps({
                    'type': 'network_info',
                    'local_ip': local_ip,
                    'message': f'Tu IP: {local_ip}'
                }))
            
            elif command == 'scan_network':
                devices = scan_network_devices()
                
                # Broadcast a todos los clientes
                await broadcast_to_clients({
                    'type': 'network_scan_complete',
                    'devices': devices
                })
            
            elif command == 'start_server':
                machine_id = data['machine_id']
                ip = data['ip']
                port = data.get('port', 9999)
                
                if machine_id not in udp_servers:
                    server = UDPServerThread(machine_id, ip, port)
                    server.start()
                    udp_servers[machine_id] = server
                    
                    # Broadcast a todos
                    await broadcast_to_clients({
                        'type': 'server_started',
                        'machine_id': machine_id,
                        'ip': ip,
                        'port': port,
                        'message': f'🟢 Servidor UDP iniciado en {ip}:{port}'
                    })
            
            elif command == 'stop_server':
                machine_id = data['machine_id']
                
                if machine_id in udp_servers:
                    udp_servers[machine_id].stop()
                    udp_servers[machine_id].join()
                    del udp_servers[machine_id]
                    
                    await broadcast_to_clients({
                        'type': 'server_stopped',
                        'machine_id': machine_id,
                        'message': '🛑 Servidor UDP detenido'
                    })
            
            elif command == 'ping':
                source_ip = data['source_ip']
                target_ip = data['target_ip']
                target_port = data.get('target_port', 9999)
                machine_id = data['machine_id']
                
                # Broadcast inicio de ping
                await broadcast_to_clients({
                    'type': 'ping_start',
                    'machine_id': machine_id,
                    'target_ip': target_ip,
                    'target_port': target_port,
                    'message': f'🔄 PING {source_ip} → {target_ip}:{target_port}'
                })
                
                ping_result = await udp_ping(source_ip, target_ip, target_port, machine_id)
                
                # Broadcast estadísticas finales
                await broadcast_to_clients({
                    'type': 'ping_complete',
                    'machine_id': machine_id,
                    'stats': ping_result['stats']
                })
    
    except websockets.exceptions.ConnectionClosed:
        print(f"🔌 Cliente desconectado")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        connected_clients.discard(websocket)

async def main():
    local_ip = get_local_ip()
    
    print("=" * 60)
    print("🚀 SERVIDOR UDP PING - Modo Sincronizado")
    print("=" * 60)
    print(f"📡 Tu IP: {local_ip}")
    print(f"🌐 WebSocket: ws://{local_ip}:8765")
    print(f"👥 Clientes pueden conectarse desde cualquier PC")
    print("=" * 60)
    print("💡 MODO 1: Simulación Local (misma IP, puertos diferentes)")
    print("💡 MODO 2: Red Real (escaneo automático de dispositivos)")
    print("=" * 60)
    
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
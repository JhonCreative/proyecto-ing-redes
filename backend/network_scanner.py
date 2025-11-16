# network_scanner.py (Opcional) - Script para descubrir máquinas en la red real
# Ejecutar este script aparte si quieres autodescubrir máquinas reales

import subprocess
import socket
import threading
from concurrent.futures import ThreadPoolExecutor
import sys

def get_local_ip():
    """Obtener IP local"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

def ping_host(host, timeout=1):
    """Verificar si un host está activo"""
    try:
        result = subprocess.run(
            ['ping', '-c', '1', '-W', str(timeout), host] if sys.platform != 'win32' 
            else ['ping', '-n', '1', '-w', str(timeout * 1000), host],
            capture_output=True,
            timeout=timeout + 1
        )
        return result.returncode == 0
    except:
        return False

def scan_network(network_prefix, start=1, end=254):
    """Escanear rango de IPs en la red"""
    active_hosts = []
    
    def check_ip(i):
        ip = f"{network_prefix}.{i}"
        if ping_host(ip):
            try:
                hostname = socket.gethostbyaddr(ip)[0]
            except:
                hostname = ip
            return (ip, hostname)
        return None
    
    with ThreadPoolExecutor(max_workers=20) as executor:
        results = executor.map(check_ip, range(start, end + 1))
        active_hosts = [r for r in results if r]
    
    return active_hosts

if __name__ == "__main__":
    local_ip = get_local_ip()
    network_prefix = ".".join(local_ip.split(".")[:3])
    
    print(f"IP Local: {local_ip}")
    print(f"Escaneando red: {network_prefix}.0/24...")
    print("Esto puede tomar un par de minutos...\n")
    
    hosts = scan_network(network_prefix)
    
    print(f"\n{len(hosts)} máquinas encontradas:\n")
    for ip, hostname in hosts:
        print(f"  {ip} - {hostname}")

import './App.css';
import React, { useState, useEffect, useRef } from 'react';
import { Monitor, Activity, Trash2, X, Terminal as TerminalIcon, Wifi, WifiOff, AlertCircle, Settings, Wifi as WifiIcon, Smartphone, Router, RefreshCw, Zap } from 'lucide-react';

const UDPPingSimulator = () => {
  const [mode, setMode] = useState('local'); // 'local' o 'network'
  const [machines, setMachines] = useState([]);
  const [connections, setConnections] = useState([]);
  const [activeTerminal, setActiveTerminal] = useState(null);
  const [terminalHistory, setTerminalHistory] = useState({});
  const [currentCommand, setCurrentCommand] = useState('');
  const [packets, setPackets] = useState([]);
  const [draggedMachine, setDraggedMachine] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [simulationActive, setSimulationActive] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const [wsStatus, setWsStatus] = useState('Desconectado');
  const [localIP, setLocalIP] = useState('');
  const [editingMachine, setEditingMachine] = useState(null);
  const [editIP, setEditIP] = useState('');
  const [editPort, setEditPort] = useState('');
  const [scanning, setScanning] = useState(false);
  const [showModeSelector, setShowModeSelector] = useState(true);
  
  const canvasRef = useRef(null);
  const terminalInputRef = useRef(null);
  const terminalEndRef = useRef(null);
  const wsRef = useRef(null);
  const nextId = useRef(1);
  const reconnectTimeoutRef = useRef(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalHistory]);

  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const connectWebSocket = () => {
    try {
      setWsStatus('Conectando...');
      const ws = new WebSocket('ws://localhost:8765');
      
      ws.onopen = () => {
        console.log('✅ Conectado al servidor WebSocket');
        setWsConnected(true);
        setWsStatus('Conectado');
        wsRef.current = ws;
        
        ws.send(JSON.stringify({ command: 'get_network_info' }));
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      };
      
      ws.onerror = (error) => {
        console.error('❌ Error WebSocket:', error);
        setWsStatus('Error');
      };
      
      ws.onclose = () => {
        console.log('🔌 Desconectado');
        setWsConnected(false);
        setWsStatus('Desconectado');
        wsRef.current = null;
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };
      
    } catch (error) {
      console.error('❌ Error:', error);
      setWsStatus('Error');
    }
  };

  const handleWebSocketMessage = (data) => {
    const { type, machine_id, message, data: msgData, stats, local_ip, devices, ip, port } = data;
    
    switch (type) {
      case 'network_info':
        setLocalIP(local_ip);
        break;
        
      case 'network_scan_complete':
        console.log('📡 Dispositivos detectados:', devices);
        const newMachines = devices.map((device, idx) => ({
          id: nextId.current + idx,
          name: device.type === 'mobile' ? `📱Mobile${idx + 1}` : 
                device.type === 'router' ? `🔀Router` : `PC${idx + 1}`,
          ip: device.ip,
          port: 9000 + idx + 1,
          x: 150 + (idx % 3) * 250,
          y: 150 + Math.floor(idx / 3) * 200,
          color: device.type === 'mobile' ? '#f59e0b' : 
                 device.type === 'router' ? '#8b5cf6' : '#3b82f6',
          isServer: false,
          deviceType: device.type,
          canPing: device.type !== 'mobile' && device.type !== 'router'
        }));
        
        nextId.current += devices.length;
        setMachines(newMachines);
        setScanning(false);
        break;
        
      case 'server_started':
        if (machine_id) {
          addToTerminal(machine_id, message, 'system');
        }
        setMachines(prevMachines => prevMachines.map(m => 
          m.id === machine_id || m.ip === ip ? { ...m, isServer: true } : m
        ));
        break;
        
      case 'server_stopped':
        if (machine_id) {
          addToTerminal(machine_id, message, 'system');
        }
        setMachines(prevMachines => prevMachines.map(m => 
          m.id === machine_id ? { ...m, isServer: false } : m
        ));
        break;
        
      case 'ping_start':
        if (machine_id) {
          addToTerminal(machine_id, message, 'info');
        }
        break;
        
      case 'ping_packet':
        if (machine_id && msgData) {
          addToTerminal(machine_id, msgData.message, msgData.status === 'success' ? 'success' : 'error');
          
          if (msgData.status === 'success' && msgData.rtt) {
            setMachines(currentMachines => {
              const sourceMachine = currentMachines.find(m => m.id === machine_id);
              const connKeys = Object.keys(simulationActive);
              const activeKey = connKeys.find(key => 
                simulationActive[key] && key.startsWith(`${machine_id}-`)
              );
              
              if (activeKey && sourceMachine) {
                const targetId = parseInt(activeKey.split('-')[1]);
                const targetMachine = currentMachines.find(m => m.id === targetId);
                
                if (targetMachine) {
                  const packetId = `${Date.now()}-${msgData.packet}`;
                  setPackets(prev => [...prev, {
                    id: packetId,
                    from: sourceMachine,
                    to: targetMachine,
                    progress: 0,
                    connKey: activeKey
                  }]);
                  
                  animatePacket(packetId, msgData.rtt);
                }
              }
              return currentMachines;
            });
          }
        }
        break;
        
      case 'ping_complete':
        if (machine_id && stats) {
          const { sent, received, lost, loss_percentage, avg_rtt, min_rtt, max_rtt } = stats;
          addToTerminal(machine_id, `\n📊 --- Estadísticas ---`, 'info');
          addToTerminal(machine_id, `    Paquetes: enviados = ${sent}, recibidos = ${received}, perdidos = ${lost} (${loss_percentage}% pérdida)`, 'info');
          addToTerminal(machine_id, `    RTT: min = ${min_rtt}ms, max = ${max_rtt}ms, promedio = ${avg_rtt}ms\n`, 'info');
          
          setSimulationActive(prevActive => {
            const activeConnKey = Object.keys(prevActive).find(key => 
              prevActive[key] && key.startsWith(`${machine_id}-`)
            );
            if (activeConnKey) {
              return { ...prevActive, [activeConnKey]: false };
            }
            return prevActive;
          });
        }
        break;
        
      case 'error':
        if (machine_id) {
          addToTerminal(machine_id, `❌ Error: ${message}`, 'error');
        }
        break;
        
      default:
        break;
    }
  };

  const sendWebSocketMessage = (data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.error('❌ WebSocket no conectado');
    }
  };

  const selectMode = (selectedMode) => {
    setMode(selectedMode);
    setShowModeSelector(false);
    
    if (selectedMode === 'local') {
      // Modo simulación local
      const localMachines = [
        { id: 1, name: 'PC1', ip: localIP || '192.168.1.100', port: 9001, x: 150, y: 150, color: '#3b82f6', isServer: false, deviceType: 'pc', canPing: true },
        { id: 2, name: 'PC2', ip: localIP || '192.168.1.100', port: 9002, x: 450, y: 150, color: '#10b981', isServer: false, deviceType: 'pc', canPing: true },
        { id: 3, name: 'PC3', ip: localIP || '192.168.1.100', port: 9003, x: 300, y: 300, color: '#f59e0b', isServer: false, deviceType: 'pc', canPing: true }
      ];
      setMachines(localMachines);
      nextId.current = 4;
    } else {
      // Modo red real - escanear red
      scanNetwork();
    }
  };

  const scanNetwork = () => {
    setScanning(true);
    setMachines([]);
    sendWebSocketMessage({ command: 'scan_network' });
  };

  useEffect(() => {
    if (activeTerminal && terminalInputRef.current) {
      terminalInputRef.current.focus();
    }
  }, [activeTerminal]);

  const addMachine = () => {
    if (machines.length >= 5 || mode === 'network') return;
    
    const newMachine = {
      id: nextId.current,
      name: `PC${nextId.current}`,
      ip: localIP || '192.168.1.100',
      port: 9000 + nextId.current,
      x: 100 + Math.random() * 400,
      y: 100 + Math.random() * 200,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      isServer: false,
      deviceType: 'pc',
      canPing: true
    };
    
    setMachines([...machines, newMachine]);
    setTerminalHistory(prev => ({ ...prev, [newMachine.id]: [] }));
    nextId.current++;
  };

  const removeMachine = (id) => {
    if (mode === 'network') return; // No permitir eliminar en modo red
    
    const machine = machines.find(m => m.id === id);
    if (machine && machine.isServer) {
      sendWebSocketMessage({
        command: 'stop_server',
        machine_id: id
      });
    }
    
    setMachines(machines.filter(m => m.id !== id));
    setConnections(connections.filter(c => c.from !== id && c.to !== id));
    const newHistory = { ...terminalHistory };
    delete newHistory[id];
    setTerminalHistory(newHistory);
    if (activeTerminal?.id === id) {
      setActiveTerminal(null);
    }
  };

  const handleMouseDown = (e, machine) => {
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'svg' || e.target.tagName === 'path' || e.target.tagName === 'INPUT') {
      return;
    }
    
    const rect = canvasRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left - machine.x,
      y: e.clientY - rect.top - machine.y
    });
    setDraggedMachine(machine);
  };

  const handleMouseMove = (e) => {
    if (draggedMachine && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const newX = Math.max(60, Math.min(e.clientX - rect.left - dragOffset.x, rect.width - 60));
      const newY = Math.max(60, Math.min(e.clientY - rect.top - dragOffset.y, rect.height - 60));
      
      setMachines(prevMachines => prevMachines.map(m => 
        m.id === draggedMachine.id ? { ...m, x: newX, y: newY } : m
      ));
    }
  };

  const handleMouseUp = () => {
    setDraggedMachine(null);
  };

  const openTerminal = (machine) => {
    if (!machine.canPing) {
      return; // No abrir terminal para móviles/routers
    }
    setActiveTerminal(machine);
    if (!terminalHistory[machine.id]) {
      setTerminalHistory(prev => ({ ...prev, [machine.id]: [] }));
    }
  };

  const openEditModal = (machine) => {
    if (mode === 'network') return; // No editar en modo red
    setEditingMachine(machine);
    setEditIP(machine.ip);
    setEditPort(machine.port.toString());
  };

  const saveIPConfig = () => {
    if (editingMachine) {
      setMachines(machines.map(m => 
        m.id === editingMachine.id ? { ...m, ip: editIP, port: parseInt(editPort) } : m
      ));
      setEditingMachine(null);
    }
  };

  const addToTerminal = (machineId, line, type = 'output') => {
    setTerminalHistory(prev => ({
      ...prev,
      [machineId]: [...(prev[machineId] || []), { text: line, type }]
    }));
  };

  const toggleServer = (machineId) => {
    const machine = machines.find(m => m.id === machineId);
    if (!machine || !machine.canPing) return;
    
    if (!wsConnected) {
      addToTerminal(machineId, '❌ No hay conexión con el backend', 'error');
      return;
    }
    
    if (machine.isServer) {
      sendWebSocketMessage({
        command: 'stop_server',
        machine_id: machineId
      });
    } else {
      sendWebSocketMessage({
        command: 'start_server',
        machine_id: machineId,
        ip: machine.ip,
        port: machine.port
      });
    }
  };

  const processCommand = async (machineId, command) => {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;

    addToTerminal(machineId, `${machine.name}@${machine.ip}:~$ ${command}`, 'command');

    const parts = command.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (cmd === 'ping') {
      if (parts.length < 2) {
        addToTerminal(machineId, '❌ Uso: ping <IP>', 'error');
        return;
      }

      if (!wsConnected) {
        addToTerminal(machineId, '❌ No hay conexión con el backend', 'error');
        return;
      }

      const targetIp = parts[1];
      const targetMachine = machines.find(m => m.ip === targetIp);

      if (!targetMachine) {
        addToTerminal(machineId, `❌ Host ${targetIp} no encontrado`, 'error');
        addToTerminal(machineId, `💡 IPs: ${machines.filter(m => m.id !== machineId && m.canPing).map(m => m.ip).join(', ')}`, 'info');
        return;
      }

      if (!targetMachine.canPing) {
        addToTerminal(machineId, `⚠️ No se puede hacer ping a ${targetMachine.name} (${targetMachine.deviceType})`, 'warning');
        return;
      }

      if (targetMachine.id === machineId) {
        addToTerminal(machineId, '❌ No puedes hacer ping a ti mismo', 'error');
        return;
      }

      if (!targetMachine.isServer) {
        addToTerminal(machineId, `⚠️ ${targetMachine.name} no tiene servidor activo`, 'warning');
        addToTerminal(machineId, `💡 Activa el servidor con el botón WiFi`, 'info');
        return;
      }

      const connKey = `${machineId}-${targetMachine.id}`;
      if (!connections.find(c => c.key === connKey)) {
        setConnections(prev => [...prev, { 
          from: machineId, 
          to: targetMachine.id, 
          key: connKey,
          active: true 
        }]);
      }

      setSimulationActive(prev => ({ ...prev, [connKey]: true }));

      sendWebSocketMessage({
        command: 'ping',
        machine_id: machineId,
        source_ip: machine.ip,
        target_ip: targetIp,
        target_port: targetMachine.port
      });

    } else if (cmd === 'help') {
      addToTerminal(machineId, '\n📖 Comandos:', 'info');
      addToTerminal(machineId, '  ping <IP>  - Hacer ping', 'info');
      addToTerminal(machineId, '  list       - Listar dispositivos', 'info');
      addToTerminal(machineId, '  clear      - Limpiar\n', 'info');
    } else if (cmd === 'list') {
      addToTerminal(machineId, '\n🖥️ Dispositivos:', 'info');
      machines.forEach(m => {
        const icon = m.deviceType === 'mobile' ? '📱' : m.deviceType === 'router' ? '🔀' : '💻';
        const status = m.isServer ? '🟢' : '⚫';
        const pingable = m.canPing ? '' : ' (no pingeable)';
        addToTerminal(machineId, `  ${icon} ${m.name}: ${m.ip}:${m.port} ${status}${pingable}`, 'info');
      });
      addToTerminal(machineId, '', 'info');
    } else if (cmd === 'clear') {
      setTerminalHistory(prev => ({ ...prev, [machineId]: [] }));
    } else if (cmd !== '') {
      addToTerminal(machineId, `❌ Comando desconocido: ${cmd}`, 'error');
    }
  };

  const animatePacket = (packetId, duration) => {
    return new Promise(resolve => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        setPackets(prev => prev.map(p => 
          p.id === packetId ? { ...p, progress } : p
        ));

        if (progress >= 1) {
          clearInterval(interval);
          setPackets(prev => prev.filter(p => p.id !== packetId));
          resolve();
        }
      }, 16);
    });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && currentCommand.trim() && activeTerminal) {
      processCommand(activeTerminal.id, currentCommand);
      setCurrentCommand('');
    }
  };

  const getDeviceIcon = (deviceType) => {
    switch(deviceType) {
      case 'mobile': return Smartphone;
      case 'router': return Router;
      default: return Monitor;
    }
  };

  if (showModeSelector) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white flex items-center justify-center">
        <div className="max-w-4xl w-full p-8">
          <div className="text-center mb-12">
            <Activity className="w-20 h-20 mx-auto mb-4 text-blue-400" />
            <h1 className="text-4xl font-bold mb-2">Simulador UDP PING</h1>
            <p className="text-gray-300">Ingeniería de Redes - Selecciona un modo</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* MODO 1 */}
            <button
              onClick={() => selectMode('local')}
              className="bg-gray-800/50 backdrop-blur border-2 border-blue-500 rounded-xl p-8 hover:bg-gray-800 hover:scale-105 transition-all text-left group"
            >
              <div className="flex items-center gap-4 mb-4">
                <Zap className="w-12 h-12 text-blue-400 group-hover:animate-pulse" />
                <h2 className="text-2xl font-bold">MODO 1</h2>
              </div>
              <h3 className="text-xl text-blue-300 mb-3">Simulación Local</h3>
              <ul className="space-y-2 text-gray-300 text-sm">
                <li>✅ Misma IP, diferentes puertos</li>
                <li>✅ Perfecto para demos rápidas</li>
                <li>✅ No requiere múltiples PCs</li>
                <li>✅ Ideal para presentaciones</li>
              </ul>
            </button>

            {/* MODO 2 */}
            <button
              onClick={() => selectMode('network')}
              disabled={!wsConnected}
              className="bg-gray-800/50 backdrop-blur border-2 border-green-500 rounded-xl p-8 hover:bg-gray-800 hover:scale-105 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-4 mb-4">
                <WifiIcon className="w-12 h-12 text-green-400 group-hover:animate-pulse" />
                <h2 className="text-2xl font-bold">MODO 2</h2>
              </div>
              <h3 className="text-xl text-green-300 mb-3">Red Real Sincronizada</h3>
              <ul className="space-y-2 text-gray-300 text-sm">
                <li>✅ Escaneo automático de dispositivos</li>
                <li>✅ Detección de PCs y móviles</li>
                <li>✅ Sincronización en tiempo real</li>
                <li>✅ PINGs reales entre computadoras</li>
              </ul>
            </button>
          </div>

          {!wsConnected && (
            <div className="mt-8 bg-red-900/30 border border-red-700 rounded-lg p-4 text-center">
              <AlertCircle className="w-6 h-6 inline mr-2" />
              <span>Conecta al backend primero: <code className="bg-red-950 px-2 py-1 rounded">python servidor_websocket.py</code></span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 border-b border-blue-700 p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Activity className="text-blue-300" size={32} />
              <span>Simulador UDP PING - {mode === 'local' ? 'Modo Local' : 'Modo Red Real'}</span>
            </h1>
            <p className="text-blue-200 text-sm mt-1">
              {mode === 'local' ? 'Simulación en una sola PC' : 'Red sincronizada con escaneo automático'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {localIP && (
              <div className="bg-blue-900/50 px-3 py-2 rounded-lg flex items-center gap-2">
                <WifiIcon className="text-blue-300" size={16} />
                <span className="text-sm text-blue-200">IP: {localIP}</span>
              </div>
            )}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              wsConnected ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
            }`}>
              <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-sm font-semibold">{wsStatus}</span>
            </div>
            <button
              onClick={() => setShowModeSelector(true)}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm transition-colors"
            >
              Cambiar Modo
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Edición */}
      {editingMachine && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-96 border border-gray-700">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Settings className="text-blue-400" />
              Configurar {editingMachine.name}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">IP</label>
                <input
                  type="text"
                  value={editIP}
                  onChange={(e) => setEditIP(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Puerto</label>
                <input
                  type="number"
                  value={editPort}
                  onChange={(e) => setEditPort(e.target.value)}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 outline-none"
                />
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={saveIPConfig}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded font-semibold"
                >
                  Guardar
                </button>
                <button
                  onClick={() => setEditingMachine(null)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <div 
          className="flex-1 relative bg-gradient-to-br from-gray-900 via-gray-850 to-gray-900" 
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <div className="absolute inset-0 opacity-10 pointer-events-none" 
               style={{
                 backgroundImage: 'linear-gradient(#444 1px, transparent 1px), linear-gradient(90deg, #444 1px, transparent 1px)',
                 backgroundSize: '50px 50px'
               }}
          />

          {scanning && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <div className="bg-gray-800 p-8 rounded-lg text-center">
                <RefreshCw className="w-16 h-16 mx-auto mb-4 animate-spin text-blue-400" />
                <p className="text-xl">Escaneando red...</p>
              </div>
            </div>
          )}

          <svg className="absolute inset-0 pointer-events-none" style={{zIndex: 1}}>
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {connections.map((conn) => {
              const from = machines.find(m => m.id === conn.from);
              const to = machines.find(m => m.id === conn.to);
              if (!from || !to) return null;
              
              const isActive = simulationActive[conn.key];
              
              return (
                <g key={conn.key}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={isActive ? '#fbbf24' : '#4b5563'}
                    strokeWidth={isActive ? '3' : '2'}
                    strokeDasharray={isActive ? '' : '5,5'}
                    filter={isActive ? 'url(#glow)' : ''}
                    style={{ transition: 'all 0.3s' }}
                  />
                  {isActive && (
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke="#fbbf24"
                      strokeWidth="3"
                      strokeDasharray="10,5"
                      opacity="0.5"
                    >
                      <animate attributeName="stroke-dashoffset" from="0" to="15" dur="0.5s" repeatCount="indefinite" />
                    </line>
                  )}
                </g>
              );
            })}
            
            {packets.map(packet => {
              if (!packet.from || !packet.to) return null;
              
              const x = packet.from.x + (packet.to.x - packet.from.x) * packet.progress;
              const y = packet.from.y + (packet.to.y - packet.from.y) * packet.progress;
              
              return (
                <g key={packet.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r="8"
                    fill="#fbbf24"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    filter="url(#glow)"
                  >
                    <animate attributeName="r" values="8;10;8" dur="0.5s" repeatCount="indefinite" />
                  </circle>
                </g>
              );
            })}
          </svg>

          {machines.map(machine => {
            const DeviceIcon = getDeviceIcon(machine.deviceType);
            
            return (
              <div
                key={machine.id}
                className="absolute select-none"
                style={{
                  left: machine.x - 60,
                  top: machine.y - 80,
                  zIndex: 2,
                  cursor: draggedMachine?.id === machine.id ? 'grabbing' : 'grab'
                }}
                onMouseDown={(e) => handleMouseDown(e, machine)}
              >
                <div className={`bg-gray-800 rounded-lg p-3 w-32 border-2 hover:border-blue-400 transition-all shadow-lg ${
                  activeTerminal?.id === machine.id ? 'ring-2 ring-blue-400 scale-105' : ''
                } ${!machine.canPing ? 'opacity-75' : ''}`}
                     style={{ borderColor: machine.color }}>
                  
                  {machine.isServer && (
                    <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1 shadow-lg pointer-events-none">
                      <Wifi className="w-3 h-3" />
                    </div>
                  )}

                  <DeviceIcon 
                    className="w-14 h-14 mx-auto mb-2 drop-shadow-lg pointer-events-none" 
                    style={{ color: machine.color }} 
                  />
                  <div className="text-center pointer-events-none">
                    <div className="font-bold text-sm">{machine.name}</div>
                    <div className="text-xs text-gray-400">{machine.ip}:{machine.port}</div>
                  </div>
                  
                  {machine.canPing && (
                    <div className="flex flex-col gap-1 mt-2">
                      <div className="flex gap-1">
                        <button
                          className="flex-1 p-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTerminal(machine);
                          }}
                        >
                          <TerminalIcon className="w-3 h-3 mx-auto" />
                        </button>
                        {mode === 'local' && (
                          <button
                            className="flex-1 p-1.5 bg-purple-600 hover:bg-purple-500 rounded text-xs transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(machine);
                            }}
                          >
                            <Settings className="w-3 h-3 mx-auto" />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          className={`flex-1 p-1.5 rounded text-xs transition-all ${
                            machine.isServer ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-600 hover:bg-gray-500'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleServer(machine.id);
                          }}
                        >
                          {machine.isServer ? <Wifi className="w-3 h-3 mx-auto" /> : <WifiOff className="w-3 h-3 mx-auto" />}
                        </button>
                        {mode === 'local' && (
                          <button
                            className="p-1.5 bg-red-600 hover:bg-red-500 rounded transition-all"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeMachine(machine.id);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {!machine.canPing && (
                    <div className="mt-2 text-xs text-gray-500 text-center italic">
                      Solo visualización
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {mode === 'local' && (
            <button
              onClick={addMachine}
              disabled={machines.length >= 5}
              className="absolute bottom-6 right-6 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg shadow-lg font-semibold flex items-center gap-2 transition-all hover:scale-105 z-10"
            >
              <Monitor className="w-5 h-5" />
              Agregar PC ({machines.length}/5)
            </button>
          )}

          {mode === 'network' && (
            <button
              onClick={scanNetwork}
              disabled={scanning}
              className="absolute bottom-6 right-6 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg shadow-lg font-semibold flex items-center gap-2 transition-all hover:scale-105 z-10"
            >
              <RefreshCw className={`w-5 h-5 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Escaneando...' : 'Reescanear Red'}
            </button>
          )}
        </div>

        {activeTerminal && (
          <div className="w-96 bg-black border-l border-gray-700 flex flex-col shadow-2xl">
            <div className="bg-gray-800 p-3 flex items-center justify-between border-b border-gray-700">
              <div className="flex items-center gap-2">
                <TerminalIcon className="w-5 h-5" style={{ color: activeTerminal.color }} />
                <span className="font-bold">{activeTerminal.name} - Terminal</span>
              </div>
              <button
                onClick={() => setActiveTerminal(null)}
                className="hover:bg-gray-700 p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 font-mono text-sm bg-black">
              <div className="text-green-400 mb-2">
                {activeTerminal.name} UDP Client v2.0
              </div>
              <div className="text-gray-400 mb-3">
                Modo: {mode === 'local' ? 'Simulación Local' : 'Red Real'} | IP: {activeTerminal.ip}:{activeTerminal.port}
              </div>
              
              {(terminalHistory[activeTerminal.id] || []).map((line, idx) => (
                <div
                  key={idx}
                  className={`mb-1 ${
                    line.type === 'command' ? 'text-white font-bold' :
                    line.type === 'error' ? 'text-red-400' :
                    line.type === 'success' ? 'text-green-400' :
                    line.type === 'warning' ? 'text-yellow-400' :
                    line.type === 'system' ? 'text-cyan-400' :
                    line.type === 'info' ? 'text-blue-300' :
                    'text-gray-300'
                  }`}
                >
                  {line.text}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>

            <div className="bg-gray-900 p-3 border-t border-gray-700 flex items-center gap-2">
              <span className="text-green-400">$</span>
              <input
                ref={terminalInputRef}
                type="text"
                value={currentCommand}
                onChange={(e) => setCurrentCommand(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 bg-transparent text-white outline-none font-mono"
                placeholder="ping <IP> | help | list"
                autoFocus
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-800 border-t border-gray-700 p-2 text-center text-xs text-gray-400">
        {mode === 'local' ? (
          <>💡 Modo Local: Arrastra PCs | ⚙️ Configurar IP | <Wifi className="inline w-3 h-3" /> Activar servidor | Comandos: ping, list, help</>
        ) : (
          <>🌐 Modo Red: Escaneo automático | 💻 PCs detectadas | 📱 Móviles en solo lectura | <Wifi className="inline w-3 h-3" /> Servidor UDP | Sincronizado en tiempo real</>
        )}
      </div>
    </div>
  );
};

export default UDPPingSimulator;
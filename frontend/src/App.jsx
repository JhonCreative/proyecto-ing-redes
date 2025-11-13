
import './App.css'
import React, { useState, useEffect, useRef } from 'react';
import { Monitor, Activity, Trash2, X, Terminal as TerminalIcon, Wifi, WifiOff, AlertCircle } from 'lucide-react';

const UDPPingSimulator = () => {
  const [machines, setMachines] = useState([
    { id: 1, name: 'PC1', ip: '192.168.1.101', port: 9001, x: 150, y: 150, color: '#3b82f6', isServer: false },
    { id: 2, name: 'PC2', ip: '192.168.1.102', port: 9002, x: 450, y: 150, color: '#10b981', isServer: false },
    { id: 3, name: 'PC3', ip: '192.168.1.103', port: 9003, x: 300, y: 300, color: '#f59e0b', isServer: false }
  ]);
  
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
  
  const canvasRef = useRef(null);
  const terminalInputRef = useRef(null);
  const terminalEndRef = useRef(null);
  const wsRef = useRef(null);
  const nextId = useRef(4);
  const reconnectTimeoutRef = useRef(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalHistory]);

  // Conectar a WebSocket
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
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      };
      
      ws.onerror = (error) => {
        console.error('❌ Error WebSocket:', error);
        setWsStatus('Error de conexión');
      };
      
      ws.onclose = () => {
        console.log('🔌 Desconectado del servidor');
        setWsConnected(false);
        setWsStatus('Desconectado');
        wsRef.current = null;
        
        // Reintentar conexión en 3 segundos
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('🔄 Intentando reconectar...');
          connectWebSocket();
        }, 3000);
      };
      
    } catch (error) {
      console.error('❌ Error al conectar:', error);
      setWsStatus('Error');
    }
  };

  const handleWebSocketMessage = (data) => {
    const { type, machine_id, message, data: msgData, stats } = data;
    
    switch (type) {
      case 'server_started':
        addToTerminal(machine_id, message, 'system');
        setMachines(prevMachines => prevMachines.map(m => 
          m.id === machine_id ? { ...m, isServer: true } : m
        ));
        break;
        
      case 'server_stopped':
        addToTerminal(machine_id, message, 'system');
        setMachines(prevMachines => prevMachines.map(m => 
          m.id === machine_id ? { ...m, isServer: false } : m
        ));
        break;
        
      case 'ping_start':
        addToTerminal(machine_id, message, 'info');
        break;
        
      case 'ping_packet':
        addToTerminal(machine_id, msgData.message, msgData.status === 'success' ? 'success' : 'error');
        
        // Animar paquete si fue exitoso
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
        break;
        
      case 'ping_complete':
        const { sent, received, lost, loss_percentage, avg_rtt, min_rtt, max_rtt } = stats;
        addToTerminal(machine_id, `\n📊 --- Estadísticas ---`, 'info');
        addToTerminal(machine_id, `    Paquetes: enviados = ${sent}, recibidos = ${received}, perdidos = ${lost} (${loss_percentage}% pérdida)`, 'info');
        addToTerminal(machine_id, `    Tiempos RTT (ms): min = ${min_rtt}, max = ${max_rtt}, promedio = ${avg_rtt}`, 'info');
        addToTerminal(machine_id, '', 'info');
        
        // Desactivar animación de conexión
        setSimulationActive(prevActive => {
          const activeConnKey = Object.keys(prevActive).find(key => 
            prevActive[key] && key.startsWith(`${machine_id}-`)
          );
          if (activeConnKey) {
            return { ...prevActive, [activeConnKey]: false };
          }
          return prevActive;
        });
        break;
        
      case 'error':
        if (machine_id) {
          addToTerminal(machine_id, `❌ Error: ${message}`, 'error');
        }
        console.error('Error del servidor:', message);
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
      if (activeTerminal) {
        addToTerminal(activeTerminal.id, '❌ Error: No hay conexión con el servidor backend', 'error');
        addToTerminal(activeTerminal.id, '💡 Asegúrate de que el servidor Python esté corriendo', 'warning');
      }
    }
  };

  useEffect(() => {
    if (activeTerminal && terminalInputRef.current) {
      terminalInputRef.current.focus();
    }
  }, [activeTerminal]);

  const addMachine = () => {
    if (machines.length >= 5) {
      return;
    }
    
    const newMachine = {
      id: nextId.current,
      name: `PC${nextId.current}`,
      ip: `192.168.1.${100 + nextId.current}`,
      port: 9000 + nextId.current,
      x: 100 + Math.random() * 400,
      y: 100 + Math.random() * 200,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      isServer: false
    };
    
    setMachines([...machines, newMachine]);
    setTerminalHistory(prev => ({ ...prev, [newMachine.id]: [] }));
    nextId.current++;
  };

  const removeMachine = (id) => {
    // Detener servidor si está activo
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
    // Evitar drag si se hace click en botones
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'svg' || e.target.tagName === 'path') {
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
    setActiveTerminal(machine);
    if (!terminalHistory[machine.id]) {
      setTerminalHistory(prev => ({ ...prev, [machine.id]: [] }));
    }
  };

  const addToTerminal = (machineId, line, type = 'output') => {
    setTerminalHistory(prev => ({
      ...prev,
      [machineId]: [...(prev[machineId] || []), { text: line, type, timestamp: new Date().toLocaleTimeString() }]
    }));
  };

  const toggleServer = (machineId) => {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;
    
    if (!wsConnected) {
      addToTerminal(machineId, '❌ No hay conexión con el servidor backend', 'error');
      return;
    }
    
    if (machine.isServer) {
      // Detener servidor
      sendWebSocketMessage({
        command: 'stop_server',
        machine_id: machineId
      });
    } else {
      // Iniciar servidor
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
        addToTerminal(machineId, '❌ No hay conexión con el servidor backend', 'error');
        addToTerminal(machineId, '💡 Asegúrate de que servidor_websocket.py esté corriendo', 'warning');
        return;
      }

      const targetIp = parts[1];
      const targetMachine = machines.find(m => m.ip === targetIp);

      if (!targetMachine) {
        addToTerminal(machineId, `❌ Host ${targetIp} no encontrado en la red`, 'error');
        addToTerminal(machineId, `💡 IPs disponibles: ${machines.filter(m => m.id !== machineId).map(m => m.ip).join(', ')}`, 'info');
        return;
      }

      if (targetMachine.id === machineId) {
        addToTerminal(machineId, '❌ No puedes hacer ping a ti mismo', 'error');
        return;
      }

      if (!targetMachine.isServer) {
        addToTerminal(machineId, `⚠️  Advertencia: ${targetMachine.name} no está ejecutando servidor UDP`, 'warning');
        addToTerminal(machineId, `💡 Activa el servidor en ${targetMachine.name} con el botón WiFi`, 'info');
        return;
      }

      // Crear conexión visual
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

      // Enviar comando PING al backend Python
      sendWebSocketMessage({
        command: 'ping',
        machine_id: machineId,
        source_ip: machine.ip,
        target_ip: targetIp
      });

    } else if (cmd === 'help') {
      addToTerminal(machineId, '\n📖 Comandos disponibles:', 'info');
      addToTerminal(machineId, '  ping <IP>     - Enviar ping UDP a otra máquina', 'info');
      addToTerminal(machineId, '  list          - Listar todas las máquinas en la red', 'info');
      addToTerminal(machineId, '  clear         - Limpiar terminal', 'info');
      addToTerminal(machineId, '  help          - Mostrar esta ayuda', 'info');
      addToTerminal(machineId, '\n💡 Asegúrate de activar el servidor en la PC destino\n', 'info');
    } else if (cmd === 'list') {
      addToTerminal(machineId, '\n🖥️  Máquinas en la red:', 'info');
      machines.forEach(m => {
        const status = m.isServer ? '🟢 Online' : '⚫ Offline';
        const isCurrent = m.id === machineId ? ' (esta PC)' : '';
        addToTerminal(machineId, `  ${m.name}: ${m.ip}:${m.port} - ${status}${isCurrent}`, 'info');
      });
      addToTerminal(machineId, '', 'info');
    } else if (cmd === 'clear') {
      setTerminalHistory(prev => ({ ...prev, [machineId]: [] }));
    } else if (cmd === '') {
      // No hacer nada
    } else {
      addToTerminal(machineId, `❌ Comando no reconocido: ${cmd}`, 'error');
      addToTerminal(machineId, '💡 Escribe "help" para ver comandos disponibles', 'info');
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

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 border-b border-blue-700 p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Activity className="text-blue-300" size={32} />
              <span>Simulador UDP PING - Ingeniería de Redes</span>
            </h1>
            <p className="text-blue-200 text-sm mt-1">Protocolo UDP con medición de RTT y simulación de pérdidas</p>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            wsConnected ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
          }`}>
            <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-sm font-semibold">{wsStatus}</span>
          </div>
        </div>
      </div>

      {/* Alerta si no está conectado */}
      {!wsConnected && (
        <div className="bg-red-900/30 border-b border-red-700 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="text-red-400" size={20} />
          <div className="flex-1 text-sm">
            <span className="font-semibold">No hay conexión con el servidor backend.</span>
            <span className="text-red-300 ml-2">Ejecuta: <code className="bg-red-950 px-2 py-0.5 rounded">python servidor_websocket.py</code></span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas de red */}
        <div 
          className="flex-1 relative bg-gradient-to-br from-gray-900 via-gray-850 to-gray-900" 
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ cursor: draggedMachine ? 'grabbing' : 'default' }}
        >
          
          {/* Grid pattern background */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" 
               style={{
                 backgroundImage: 'linear-gradient(#444 1px, transparent 1px), linear-gradient(90deg, #444 1px, transparent 1px)',
                 backgroundSize: '50px 50px'
               }}
          />

          {/* SVG para conexiones y paquetes */}
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
            
            {/* Paquetes animados */}
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

          {/* Máquinas */}
          {machines.map(machine => (
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
              }`}
                   style={{ borderColor: machine.color }}>
                
                {/* Indicador de servidor */}
                {machine.isServer && (
                  <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1 shadow-lg pointer-events-none">
                    <Wifi className="w-3 h-3" />
                  </div>
                )}

                <Monitor 
                  className="w-14 h-14 mx-auto mb-2 drop-shadow-lg pointer-events-none" 
                  style={{ color: machine.color }} 
                />
                <div className="text-center pointer-events-none">
                  <div className="font-bold text-sm">{machine.name}</div>
                  <div className="text-xs text-gray-400">{machine.ip}</div>
                </div>
                
                <div className="flex flex-col gap-1 mt-2">
                  <button
                    className="p-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs flex items-center justify-center gap-1 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      openTerminal(machine);
                    }}
                  >
                    <TerminalIcon className="w-3 h-3" />
                    Terminal
                  </button>
                  <div className="flex gap-1">
                    <button
                      className={`flex-1 p-1.5 rounded text-xs transition-all ${
                        machine.isServer ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleServer(machine.id);
                      }}
                      title={machine.isServer ? 'Detener servidor UDP' : 'Iniciar servidor UDP'}
                    >
                      {machine.isServer ? <Wifi className="w-3 h-3 mx-auto" /> : <WifiOff className="w-3 h-3 mx-auto" />}
                    </button>
                    <button
                      className="p-1.5 bg-red-600 hover:bg-red-500 rounded transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeMachine(machine.id);
                      }}
                      title="Eliminar máquina"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Botón agregar máquina flotante */}
          <button
            onClick={addMachine}
            disabled={machines.length >= 5}
            className="absolute bottom-6 right-6 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg shadow-lg font-semibold flex items-center gap-2 transition-all hover:scale-105 z-10"
          >
            <Monitor className="w-5 h-5" />
            Agregar PC ({machines.length}/5)
          </button>
        </div>

        {/* Terminal */}
        {activeTerminal && (
          <div className="w-96 bg-black border-l border-gray-700 flex flex-col shadow-2xl">
            {/* Terminal Header */}
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

            {/* Terminal Body */}
            <div className="flex-1 overflow-y-auto p-3 font-mono text-sm bg-black">
              <div className="text-green-400 mb-2">
                {activeTerminal.name} UDP Client v1.0
              </div>
              <div className="text-gray-400 mb-3">
                IP: {activeTerminal.ip}:{activeTerminal.port} | Escribe 'help' para ayuda
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

            {/* Terminal Input */}
            <div className="bg-gray-900 p-3 border-t border-gray-700 flex items-center gap-2">
              <span className="text-green-400">$</span>
              <input
                ref={terminalInputRef}
                type="text"
                value={currentCommand}
                onChange={(e) => setCurrentCommand(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 bg-transparent text-white outline-none font-mono"
                placeholder={`ping ${machines.find(m => m.id !== activeTerminal.id)?.ip || '192.168.1.x'}`}
                autoFocus
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-800 border-t border-gray-700 p-2 text-center text-xs text-gray-400">
        💡 Arrastra las PCs para moverlas | Click "Terminal" para abrir consola | Activa servidor con botón WiFi | Comandos: <code className="bg-gray-700 px-1">ping &lt;IP&gt;</code> | <code className="bg-gray-700 px-1">list</code>
      </div>
    </div>
  );
};

export default UDPPingSimulator;
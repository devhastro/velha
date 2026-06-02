const express = require("express");
const http = require("http");
const os = require("os");
const path = require("path");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.redirect("/jogo_da_velha_multinivel.html"));

let roomSeq = 1;
const rooms = new Map();

function getLanAddresses() {
  const addresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const net of interfaces || []) {
      const isIPv4 = net.family === "IPv4" || net.family === 4;
      if (isIPv4 && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
}

function normalizeRoomId(raw) {
  const base = String(raw || "").trim().slice(0, 24);
  return base.replace(/[^\w-]/g, "");
}

function ensureRoom(roomId) {
  let id = normalizeRoomId(roomId);
  if (!id) id = `sala-${roomSeq++}`;
  if (!rooms.has(id)) {
    rooms.set(id, {
      id,
      players: { X: null, O: null }, // { socketId, name }
      spectators: new Set(),
      started: false,
      gameConfig: null,
    });
  }
  return rooms.get(id);
}

function roomState(room) {
  return {
    roomId: room.id,
    players: {
      X: room.players.X ? room.players.X.name : "",
      O: room.players.O ? room.players.O.name : "",
    },
    started: room.started,
    spectatorCount: room.spectators.size,
    gameConfig: room.gameConfig,
  };
}

function roomSummary(room) {
  return {
    roomId: room.id,
    playerX: room.players.X ? room.players.X.name : "",
    playerO: room.players.O ? room.players.O.name : "",
    started: room.started,
    spectatorCount: room.spectators.size,
    hasFreeSlot: !room.players.X || !room.players.O,
  };
}

function emitRoomsSnapshot() {
  const payload = Array.from(rooms.values())
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(roomSummary);
  io.emit("roomsSnapshot", payload);
}

function emitRoomState(room) {
  io.to(room.id).emit("roomState", roomState(room));
}

function isRoomEmpty(room) {
  return !room.players.X && !room.players.O && room.spectators.size === 0;
}

function detachSocketFromRoom(socket) {
  const prevRoomId = socket.data.roomId;
  if (!prevRoomId || !rooms.has(prevRoomId)) return;

  const room = rooms.get(prevRoomId);
  const role = socket.data.role;
  if (role && room.players[role] && room.players[role].socketId === socket.id) {
    room.players[role] = null;
  }
  room.spectators.delete(socket.id);
  socket.leave(prevRoomId);
  socket.data.roomId = null;
  socket.data.role = null;
  socket.data.spectator = false;

  if (!room.players.X && !room.players.O) {
    room.started = false;
    room.gameConfig = null;
  }

  if (isRoomEmpty(room)) {
    rooms.delete(prevRoomId);
  } else {
    emitRoomState(room);
  }
  emitRoomsSnapshot();
}

function joinAsPlayer(socket, { roomId, name }) {
  const cleanName = String(name || "").trim().slice(0, 24);
  if (!cleanName) {
    socket.emit("roomError", { message: "Digite seu nome para entrar." });
    return;
  }

  detachSocketFromRoom(socket);
  const room = ensureRoom(roomId);

  let role = null;
  if (!room.players.X) role = "X";
  else if (!room.players.O) role = "O";

  if (!role) {
    socket.emit("roomError", { message: "Sala lotada para jogadores. Use Assistir." });
    emitRoomsSnapshot();
    return;
  }

  room.players[role] = { socketId: socket.id, name: cleanName };
  socket.join(room.id);
  socket.data.roomId = room.id;
  socket.data.role = role;
  socket.data.spectator = false;

  socket.emit("roomJoined", { roomId: room.id, role, spectator: false });
  emitRoomState(room);
  emitRoomsSnapshot();
}

function joinAsSpectator(socket, { roomId, name }) {
  const id = normalizeRoomId(roomId);
  if (!id || !rooms.has(id)) {
    socket.emit("roomError", { message: "Sala não encontrada para assistir." });
    return;
  }

  detachSocketFromRoom(socket);
  const room = rooms.get(id);
  room.spectators.add(socket.id);

  socket.join(room.id);
  socket.data.roomId = room.id;
  socket.data.role = null;
  socket.data.spectator = true;
  socket.data.viewerName = String(name || "").trim().slice(0, 24);

  socket.emit("roomJoined", { roomId: room.id, role: null, spectator: true });
  emitRoomState(room);
  emitRoomsSnapshot();
}

io.on("connection", (socket) => {
  emitRoomsSnapshot();

  socket.on("listRooms", () => {
    emitRoomsSnapshot();
  });

  socket.on("joinRoomAsPlayer", (payload = {}) => {
    joinAsPlayer(socket, payload);
  });

  socket.on("watchRoom", (payload = {}) => {
    joinAsSpectator(socket, payload);
  });

  socket.on("leaveRoom", () => {
    detachSocketFromRoom(socket);
  });

  socket.on("playMove", (data) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId) || socket.data.spectator || !socket.data.role) return;
    socket.to(roomId).emit("playMove", data);
  });

  socket.on("startGame", (data) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId) || socket.data.spectator || !socket.data.role) return;
    const room = rooms.get(roomId);
    room.started = true;
    room.gameConfig = data || null;
    io.to(roomId).emit("startGame", data);
    emitRoomState(room);
    emitRoomsSnapshot();
  });

  socket.on("restartGame", (data) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId) || socket.data.spectator || !socket.data.role) return;
    const room = rooms.get(roomId);
    room.started = true;
    room.gameConfig = data || null;
    io.to(roomId).emit("restartGame", data);
    emitRoomState(room);
    emitRoomsSnapshot();
  });

  socket.on("disconnect", () => {
    detachSocketFromRoom(socket);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\nServidor rodando na porta ${PORT}`);
  console.log(`\n  Neste PC:  http://localhost:${PORT}/`);
  const lan = getLanAddresses();
  if (lan.length) {
    console.log("\n  Na rede LAN (outros dispositivos):");
    for (const ip of lan) console.log(`    http://${ip}:${PORT}/`);
  } else {
    console.log("\n  (Nenhum IP de LAN detectado — verifique Wi-Fi/cabo.)");
  }
  console.log("\n  Salas habilitadas: multiplas partidas simultaneas + assistir.\n");
});

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server: http });

app.use(express.static('public'));

let players = {};
let bullets = [];
let loot = generateLoot();
let clientMap = {};

function generateLoot() {
  return [
    { id: 'loot1', x: 200, y: 200, name: 'Sniper' },
    { id: 'loot2', x: 600, y: 400, name: 'Shotgun' },
    { id: 'loot3', x: 400, y: 150, name: 'Pistol' }
  ];
}

function broadcastAll(type, payload) {
  const msg = JSON.stringify({ type, ...payload });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function collision(p1, p2, radius = 15) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y) < radius * 2;
}

wss.on('connection', ws => {
  const id = Date.now().toString();
  players[id] = { x: 400, y: 300, hp: 100, name: '', weapon: 'Pistol' };
  clientMap[ws] = id;

  ws.send(JSON.stringify({ id }));
  ws.send(JSON.stringify({ type: 'loot', loot }));

  ws.on('message', msg => {
    const data = JSON.parse(msg);
    const pid = clientMap[ws];
    if (!players[pid]) return;

    if (data.type === 'update') {
      players[pid].x = data.position.x;
      players[pid].y = data.position.y;
      players[pid].hp = data.hp;
      players[pid].name = data.name || players[pid].name;
      players[pid].weapon = data.weapon || players[pid].weapon;

      loot = loot.filter(item => {
        const dist = Math.hypot(players[pid].x - item.x, players[pid].y - item.y);
        if (dist < 20) {
          players[pid].weapon = item.name;
          return false;
        }
        return true;
      });
    }

    if (data.type === 'shoot') {
      bullets.push({ ...data.bullet, weapon: players[pid].weapon });
    }

    if (data.type === 'name') {
      players[pid].name = data.name;
    }

    if (data.type === 'chat') {
      broadcastAll('chat', { message: `${players[pid].name || 'Unknown'}: ${data.message}` });
    }
  });

  ws.on('close', () => {
    const id = clientMap[ws];
    delete players[id];
    delete clientMap[ws];
  });
});

setInterval(() => {
  bullets.forEach(b => {
    b.x += b.dx;
    b.y += b.dy;
  });

  bullets = bullets.filter(b => {
    for (const pid in players) {
      if (pid !== b.owner && players[pid].hp > 0) {
        if (collision(b, players[pid])) {
          let dmg = 25;
          if (b.weapon === 'Sniper') dmg = 50;
          if (b.weapon === 'Shotgun') dmg = 35;
          players[pid].hp -= dmg;
          if (players[pid].hp <= 0) players[pid].hp = 0;
          return false;
        }
      }
    }
    return b.x >= 0 && b.x <= 800 && b.y >= 0 && b.y <= 600;
  });

  broadcastAll('players', { players });
  broadcastAll('bullets', { bullets });
  broadcastAll('loot', { loot });

}, 1000 / 30);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

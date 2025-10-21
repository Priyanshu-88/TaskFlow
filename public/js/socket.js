let ioClient;
window.addEventListener('DOMContentLoaded', () => {
  if(typeof io !== 'undefined'){
    ioClient = io();
    // Auto-join room if ?room=ROOMID is present in URL
    try {
      const params = new URLSearchParams(window.location.search);
      const room = params.get('room');
      if (room) {
        ioClient.emit('join', room);
      }
    } catch (e) {}
    ioClient.on('task:created', () => {
      reloadTasks();
      // Also refresh completed tasks in overview
      setTimeout(() => {
        if(typeof reloadTasks === 'function') {
          fetch('/api/tasks')
            .then(res => res.json())
            .then(tasks => {
              if(typeof updateCompletedTasks === 'function') {
                updateCompletedTasks(tasks.filter(t => t.status === 'Completed'));
              }
            });
        }
      }, 100);
    });
    ioClient.on('task:updated', () => {
      reloadTasks();
      // Also refresh completed tasks in overview
      setTimeout(() => {
        if(typeof reloadTasks === 'function') {
          fetch('/api/tasks')
            .then(res => res.json())
            .then(tasks => {
              if(typeof updateCompletedTasks === 'function') {
                updateCompletedTasks(tasks.filter(t => t.status === 'Completed'));
              }
            });
        }
      }, 100);
    });
    ioClient.on('task:deleted', () => {
      reloadTasks();
      // Also refresh completed tasks in overview
      setTimeout(() => {
        if(typeof reloadTasks === 'function') {
          fetch('/api/tasks')
            .then(res => res.json())
            .then(tasks => {
              if(typeof updateCompletedTasks === 'function') {
                updateCompletedTasks(tasks.filter(t => t.status === 'Completed'));
              }
            });
        }
      }, 100);
    });
    ioClient.on('chat:message', (msg) => {
      const box = document.getElementById('msgs');
      if(!box) return;
      const div = document.createElement('div');
      div.className = 'message other';
      const senderName = msg.first_name && msg.last_name ? `${msg.first_name} ${msg.last_name}` : `User ${msg.sender_id}`;
      div.innerHTML = `
        <div class="message-header">
          <span class="message-sender">${senderName}</span>
          <span class="message-time">${new Date(msg.created_at).toLocaleTimeString()}</span>
        </div>
        <div class="message-text">${msg.text}</div>`;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    });

    // Notify when someone joins or leaves the current room
    ioClient.on('user:joined', (info) => {
      const box = document.getElementById('msgs');
      if(!box) return;
      const div = document.createElement('div');
      div.className = 'message system';
      const name = info && info.user ? (info.user.firstName || info.user.email || 'Someone') : 'Someone';
      div.textContent = `${name} joined the room`;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    });

    ioClient.on('user:left', (info) => {
      const box = document.getElementById('msgs');
      if(!box) return;
      const div = document.createElement('div');
      div.className = 'message system';
      const name = info && info.user ? (info.user.firstName || info.user.email || 'Someone') : 'Someone';
      div.textContent = `${name} left the room`;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    });
  }
});



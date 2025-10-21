let socket;

function switchTab(id){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===id));
  document.querySelectorAll('.section').forEach(s=>s.classList.toggle('active', s.id===id));
  
  // Update navigation links
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === '#' + id) {
      link.classList.add('active');
    }
  });
  
  // Smooth scroll to the section
  const section = document.getElementById(id);
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function signout(){
  await fetch('/signout',{method:'POST'});
  location.href = '/signin';
}

function toast(msg){
  const t = document.querySelector('.toast');
  if(!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(()=> t.style.display='none', 2000);
}

async function reloadTasks(){
  const params = new URLSearchParams();
  const s = document.getElementById('filter-status').value;
  const p = document.getElementById('filter-priority').value;
  const sortBy = document.getElementById('sortBy').value;
  const sortDir = document.getElementById('sortDir').value;
  if(s) params.set('status', s);
  if(p) params.set('priority', p);
  if(sortBy) params.set('sortBy', sortBy);
  if(sortDir) params.set('sortDir', sortDir);
  const res = await fetch('/api/tasks?'+params.toString());
  const data = await res.json();
  renderTasks(data);
  updateStats(data);
}

function renderTasks(tasks){
  const tbody = document.getElementById('task-body');
  tbody.innerHTML = '';
  for(const t of tasks){
    const tr = document.createElement('tr');
    const priorityClass = `priority ${t.priority}`;
    tr.innerHTML = `
      <td>${escapeHtml(t.title)}</td>
      <td><span class="${priorityClass}">${t.priority}</span></td>
      <td><span class="status ${t.status}">${t.status}</span></td>
      <td>${t.deadline? formatDateTime(t.deadline): ''}</td>
      <td>
        <button onclick="editTask(${t.id})">Edit</button>
        <button onclick="removeTask(${t.id})">Delete</button>
        ${t.status!== 'Completed' ? `<button onclick=\"markDone(${t.id})\">Mark Done</button>`: ''}
      </td>`;
    tbody.appendChild(tr);
  }
}

function updateStats(tasks){
  const total = tasks.length;
  const pending = tasks.filter(t=>t.status==='Pending').length;
  const inprog = tasks.filter(t=>t.status==='In-Progress').length;
  const done = tasks.filter(t=>t.status==='Completed').length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-inprog').textContent = inprog;
  document.getElementById('stat-done').textContent = done;
  const pct = total? Math.round((done/total)*100) : 0;
  document.getElementById('pct').textContent = pct+"%";
  document.getElementById('progressbar').style.width = pct+'%';
  
  // Update completed tasks in overview
  updateCompletedTasks(tasks.filter(t=>t.status==='Completed'));
  
  // Update progress chart
  updateProgressChart(tasks);
}

function updateCompletedTasks(completedTasks){
  const container = document.getElementById('completed-tasks-list');
  const countElement = document.getElementById('completed-count');
  
  countElement.textContent = `${completedTasks.length} completed`;
  
  if(completedTasks.length === 0){
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#888888">
        <div style="font-size:48px;margin-bottom:16px">✓</div>
        <div>No completed tasks yet</div>
        <div style="font-size:14px;margin-top:8px">Complete some tasks to see them here</div>
      </div>
    `;
    return;
  }
  
  // Sort by completion date (most recent first)
  const sortedTasks = completedTasks.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  
          container.innerHTML = sortedTasks.map(task => {
            const priorityClass = `priority ${task.priority}`;
            return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:8px;background:rgba(255,255,255,0.05);margin-bottom:8px;border:1px solid rgba(255,255,255,0.1)">
              <div style="width:8px;height:8px;background:#ffffff;border-radius:50%;flex-shrink:0"></div>
              <div style="flex:1">
                <div style="font-weight:600;color:#ffffff;margin-bottom:4px">${escapeHtml(task.title)}</div>
                <div style="font-size:12px;color:#888888;display:flex;align-items:center;gap:8px">
                  <span>Completed ${formatDateTime(task.updated_at)}</span>
                  <span class="${priorityClass}" style="font-size:10px;padding:2px 6px;border-radius:8px">${task.priority}</span>
                </div>
              </div>
              <div style="background:#ffffff;color:#000000;padding:4px 8px;border-radius:12px;font-size:11px;font-weight:600">
                ✓ Done
              </div>
            </div>
          `;
          }).join('');
}

function updateProgressChart(tasks) {
  console.log('Updating progress chart with', tasks.length, 'tasks');
  console.log('Tasks data:', tasks);
  const chartContainer = document.getElementById('progress-chart');
  if (!chartContainer) {
    console.error('Progress chart container not found');
    return;
  }
  console.log('Chart container found:', chartContainer);
  
  // Get last 7 days
  const today = new Date();
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    last7Days.push(date);
  }
  
  // Count completed tasks for each day
  const dailyData = last7Days.map(date => {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    
    const completedOnDay = tasks.filter(task => {
      if (task.status !== 'Completed') return false;
      const completedDate = new Date(task.updated_at);
      return completedDate >= dayStart && completedDate <= dayEnd;
    }).length;
    
    return {
      date: date,
      completed: completedOnDay,
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' })
    };
  });
  
  console.log('Daily data:', dailyData);
  
  // Find max value for scaling
  const maxCompleted = Math.max(...dailyData.map(d => d.completed), 1);
  console.log('Max completed:', maxCompleted);
  
  // Check if there's any data to show
  const totalCompleted = dailyData.reduce((sum, day) => sum + day.completed, 0);
  console.log('Total completed tasks:', totalCompleted);
  
  if (totalCompleted === 0) {
    console.log('No completed tasks, showing empty state');
    chartContainer.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#888888">
        <div style="font-size:48px;margin-bottom:16px">📊</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:8px">No completed tasks yet</div>
        <div style="font-size:14px;text-align:center">Complete some tasks to see your progress chart</div>
      </div>
    `;
  } else {
    console.log('Generating chart with data');
    // Generate chart HTML
    chartContainer.innerHTML = dailyData.map(dayData => {
      const height = (dayData.completed / maxCompleted) * 100;
      const heightPx = Math.max(height, 5); // Minimum 5% height
      console.log(`Day ${dayData.dayName}: ${dayData.completed} tasks, height: ${heightPx}%`);
      
      return `
        <div class="chart-day">
          <div 
            class="progress-bar" 
            style="height: ${heightPx}%"
            data-value="${dayData.completed} tasks"
            title="${dayData.dayName}: ${dayData.completed} tasks completed"
          ></div>
          <div class="chart-day-label">${dayData.dayName}</div>
        </div>
      `;
    }).join('');
  }
  
  console.log('Progress chart updated');
}

function openTaskModal(task){
  console.log('Opening task modal', task);
  document.getElementById('modal').style.display = 'flex';
  const form = document.getElementById('task-form');
  form.reset();
  if(task){
    document.getElementById('modal-title').textContent = 'Edit Task';
    form.id.value = task.id;
    form.title.value = task.title;
    form.description.value = task.description || '';
    form.priority.value = task.priority;
    form.status.value = task.status;
    form.deadline.value = task.deadline? toLocalDatetime(task.deadline): '';
  }else{
    document.getElementById('modal-title').textContent = 'Add New Task';
  }
}

function closeTaskModal(){
  document.getElementById('modal').style.display = 'none';
}

async function submitTask(ev){
  ev.preventDefault();
  console.log('Submitting task form');
  const form = ev.target;
  const payload = {
    title: form.title.value,
    description: form.description.value,
    priority: form.priority.value,
    status: form.status.value,
    deadline: form.deadline.value? new Date(form.deadline.value).toISOString(): null
  };
  console.log('Payload:', payload);
  
  if(form.id.value){
    console.log('Updating existing task');
    const res = await fetch('/api/tasks/'+form.id.value,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!res.ok){ 
      console.error('Failed to update task');
      toast('Failed to update'); 
      return; 
    }
    toast('Task updated successfully');
  }else{
    console.log('Creating new task');
    const res = await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!res.ok){ 
      console.error('Failed to create task');
      toast('Failed to create'); 
      return; 
    }
    toast('Task created successfully');
  }
  closeTaskModal();
  await reloadTasks();
}

async function editTask(id){
  const list = await (await fetch('/api/tasks')).json();
  const task = list.find(x=>x.id===id);
  if(task) openTaskModal(task);
}

async function removeTask(id){
  if(!confirm('Delete task?')) return;
  const res = await fetch('/api/tasks/'+id,{method:'DELETE'});
  if(!res.ok) { toast('Failed to delete'); return; }
  toast('Task deleted successfully');
  await reloadTasks();
}

async function markDone(id){
  const res = await fetch('/api/tasks/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'Completed'})});
  if(!res.ok) { toast('Failed to mark done'); return; }
  toast('Task marked as completed');
  await reloadTasks();
}

function toLocalDatetime(iso){
  const d = new Date(iso);
  const pad = n=> String(n).padStart(2,'0');
  return d.getFullYear()+ '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function formatDateTime(iso){
  const d = new Date(iso);
  return d.toLocaleString();
}

function escapeHtml(str){
  return String(str).replace(/[&<>"]/g, s=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

async function loadMessages(){
  const res = await fetch('/api/messages');
  const msgs = await res.json();
  renderMessages(msgs);
}

function renderMessages(msgs){
  const box = document.getElementById('msgs');
  box.innerHTML = '';
  for(const m of msgs){
    const div = document.createElement('div');
    div.className = 'message other';
    const senderName = m.first_name && m.last_name ? `${m.first_name} ${m.last_name}` : `User ${m.sender_id}`;
    div.innerHTML = `
      <div class="message-header">
        <span class="message-sender">${escapeHtml(senderName)}</span>
        <span class="message-time">${new Date(m.created_at).toLocaleTimeString()}</span>
      </div>
      <div class="message-text">${escapeHtml(m.text)}</div>`;
    box.appendChild(div);
  }
  box.scrollTop = box.scrollHeight;
}

async function sendMessage(){
  const input = document.getElementById('msgtext');
  const text = input.value.trim();
  if(!text) return;
  // Attach current room (if any) so server can scope the broadcast
  let room = null;
  try { room = (new URLSearchParams(window.location.search)).get('room'); } catch (e) { room = null; }
  const res = await fetch('/api/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text, room})});
  if(res.ok) {
    input.value='';
    hideEmojiPicker();
  }
}

async function sendMsg(ev){
  ev.preventDefault();
  await sendMessage();
}


async function init(){
  await reloadTasks();
  await loadMessages();
  
  // Set initial active navigation state
  const currentSection = document.querySelector('.section.active');
  if (currentSection) {
    const sectionId = currentSection.id;
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + sectionId) {
        link.classList.add('active');
      }
    });
  }
  
  // Add a welcome message to chat if no messages exist
  const msgs = await (await fetch('/api/messages')).json();
  if (msgs.length === 0) {
    await addWelcomeMessage();
  }
  
  // Force update progress chart
  console.log('Forcing progress chart update');
  const tasks = await (await fetch('/api/tasks')).json();
  updateProgressChart(tasks);
}

async function addWelcomeMessage() {
  try {
    const welcomeText = "Welcome to TaskFlow! This is a shared chat where you can communicate with your team.";
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: welcomeText })
    });
    if (res.ok) {
      console.log('Welcome message added');
    }
  } catch (error) {
    console.error('Failed to add welcome message:', error);
  }
}

async function addTestMessage() {
  const testMessages = [
    "Great work on the project!",
    "Let's discuss the new features",
    "Meeting at 3 PM today",
    "Task completed successfully",
    "Need help with this issue",
    "Awesome progress everyone!",
    "Don't forget to update the docs",
    "Celebrating our milestone!",
    "Important announcement",
    "Keep up the great work!"
  ];
  
  const randomMessage = testMessages[Math.floor(Math.random() * testMessages.length)];
  
  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: randomMessage })
    });
    if (res.ok) {
      console.log('Test message added:', randomMessage);
      await loadMessages();
    }
  } catch (error) {
    console.error('Failed to add test message:', error);
  }
}

async function addSampleTasks() {
  const sampleTasks = [
    { title: "Review project proposal", description: "Review and provide feedback on the new project proposal", priority: "High", status: "Completed" },
    { title: "Update documentation", description: "Update the user documentation with new features", priority: "Medium", status: "Completed" },
    { title: "Fix bug in login system", description: "Resolve the authentication issue reported by users", priority: "High", status: "Completed" },
    { title: "Prepare presentation", description: "Create slides for the quarterly review meeting", priority: "Medium", status: "Completed" },
    { title: "Code review", description: "Review pull requests from the development team", priority: "Low", status: "Completed" }
  ];
  
  try {
    for (const task of sampleTasks) {
      // Create tasks with completion dates spread over the last 7 days
      const daysAgo = Math.floor(Math.random() * 7);
      const completedDate = new Date();
      completedDate.setDate(completedDate.getDate() - daysAgo);
      completedDate.setHours(10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
      
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...task,
          updated_at: completedDate.toISOString()
        })
      });
      
      if (res.ok) {
        console.log('Sample task added:', task.title);
      }
    }
    
    // Reload tasks to update the chart
    await reloadTasks();
    console.log('Sample tasks added successfully');
  } catch (error) {
    console.error('Failed to add sample tasks:', error);
  }
}

// Test function to manually update chart
function testChart() {
  console.log('Testing chart manually');
  const chartContainer = document.getElementById('progress-chart');
  if (chartContainer) {
    chartContainer.innerHTML = `
      <div style="display:flex;align-items:end;justify-content:space-between;height:100%;gap:8px">
        <div style="display:flex;flex-direction:column;align-items:center;flex:1">
          <div style="background:#4CAF50;height:60%;width:20px;border-radius:4px 4px 0 0"></div>
          <div style="font-size:10px;margin-top:8px">Mon</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;flex:1">
          <div style="background:#4CAF50;height:80%;width:20px;border-radius:4px 4px 0 0"></div>
          <div style="font-size:10px;margin-top:8px">Tue</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;flex:1">
          <div style="background:#4CAF50;height:40%;width:20px;border-radius:4px 4px 0 0"></div>
          <div style="font-size:10px;margin-top:8px">Wed</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;flex:1">
          <div style="background:#4CAF50;height:100%;width:20px;border-radius:4px 4px 0 0"></div>
          <div style="font-size:10px;margin-top:8px">Thu</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;flex:1">
          <div style="background:#4CAF50;height:70%;width:20px;border-radius:4px 4px 0 0"></div>
          <div style="font-size:10px;margin-top:8px">Fri</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;flex:1">
          <div style="background:#4CAF50;height:30%;width:20px;border-radius:4px 4px 0 0"></div>
          <div style="font-size:10px;margin-top:8px">Sat</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;flex:1">
          <div style="background:#4CAF50;height:50%;width:20px;border-radius:4px 4px 0 0"></div>
          <div style="font-size:10px;margin-top:8px">Sun</div>
        </div>
      </div>
    `;
    console.log('Test chart displayed');
  } else {
    console.error('Chart container not found for test');
  }
}

window.addEventListener('DOMContentLoaded', init);



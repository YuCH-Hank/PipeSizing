// 管路風量畫布主程式
// 以原生 SVG 與 DOM 組成，維持結構化模組化函式。

const canvas = document.getElementById('canvas');
const contextMenu = document.getElementById('contextMenu');
const velocityInput = document.getElementById('velocityInput');
const ductShapeSelect = document.getElementById('ductShape');
const scaleInput = document.getElementById('scaleInput');
const exportTextBtn = document.getElementById('exportText');
const clearSelectionBtn = document.getElementById('clearSelection');
const textSummary = document.getElementById('textSummary');

const segmentModal = document.getElementById('segmentModal');
const addSegmentBtn = document.getElementById('addSegment');
const confirmSegmentBtn = document.getElementById('confirmSegment');
const closeModalBtn = document.getElementById('closeModal');
const segmentList = document.getElementById('segmentList');

// 狀態資料
let nodes = [];
let edges = [];
let selectedNodeId = null;
let connectingStart = null;
let pendingTarget = null;
let scale = Number(scaleInput.value); // px per meter
let velocity = Number(velocityInput.value); // m/s
let ductShape = ductShapeSelect.value; // round | rect

const counters = {
  inlet: 1,
  joint: 1,
  outlet: 1,
};

// 建立 SVG 容器
const edgeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
edgeLayer.classList.add('edge-layer');
edgeLayer.style.position = 'absolute';
edgeLayer.style.inset = '0';
canvas.appendChild(edgeLayer);

const nodeLayer = document.createElement('div');
nodeLayer.classList.add('node-layer');
canvas.appendChild(nodeLayer);

const labelLayer = document.createElement('div');
labelLayer.classList.add('label-layer');
canvas.appendChild(labelLayer);

// 工具函式
const directions = {
  right: { dx: 1, dy: 0, label: '→' },
  left: { dx: -1, dy: 0, label: '←' },
  up: { dx: 0, dy: -1, label: '↑' },
  down: { dx: 0, dy: 1, label: '↓' },
};

function newId(type) {
  const prefix = { inlet: 'A', joint: 'B', outlet: 'C' }[type];
  const value = counters[type]++;
  return `${prefix}${value}`;
}

function showContextMenu(x, y) {
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.remove('hidden');
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
}

function addNode(type, x, y) {
  const node = {
    id: newId(type),
    type,
    x,
    y,
    baseFlow: 0,
    computedFlow: 0,
  };
  nodes.push(node);
  render();
}

function removeNode(nodeId) {
  nodes = nodes.filter((n) => n.id !== nodeId);
  edges = edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
  if (selectedNodeId === nodeId) selectedNodeId = null;
  if (connectingStart === nodeId) connectingStart = null;
  render();
}

function updateScale(newScale) {
  scale = Math.max(1, newScale);
  render();
}

function updateVelocity(newVelocity) {
  velocity = Math.max(0.1, newVelocity);
  render();
}

function setDuctShape(shape) {
  ductShape = shape;
}

function promptFlow(node) {
  const value = prompt(`設定 ${node.id} 風量 (m³/s)`, node.baseFlow || 0);
  if (value === null) return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    alert('請輸入有效的風量數值');
    return;
  }
  node.baseFlow = numeric;
  render();
}

function openSegmentModal(fromId, toId) {
  pendingTarget = { fromId, toId };
  segmentList.innerHTML = '';
  addSegmentRow('right', 10);
  segmentModal.classList.remove('hidden');
}

function closeSegmentModal() {
  segmentModal.classList.add('hidden');
  pendingTarget = null;
}

function addSegmentRow(direction = 'right', length = 10) {
  const row = document.createElement('div');
  row.className = 'segment-row';
  const select = document.createElement('select');
  ['right', 'left', 'up', 'down'].forEach((dir) => {
    const opt = document.createElement('option');
    opt.value = dir;
    opt.textContent = dir.toUpperCase();
    if (dir === direction) opt.selected = true;
    select.appendChild(opt);
  });

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.step = '0.1';
  input.value = length;

  const delBtn = document.createElement('button');
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', () => {
    row.remove();
  });

  row.append(select, input, delBtn);
  segmentList.appendChild(row);
}

function collectSegments() {
  const rows = Array.from(segmentList.querySelectorAll('.segment-row'));
  const segments = rows.map((row) => {
    const direction = row.querySelector('select').value;
    const length = Number(row.querySelector('input').value);
    return { direction, length: Math.max(0, length) };
  }).filter((seg) => seg.length > 0);
  return segments;
}

function createEdge(fromId, toId, segments) {
  if (!segments.length) {
    alert('請至少新增一段距離');
    return;
  }
  const edge = {
    id: `E${edges.length + 1}`,
    from: fromId,
    to: toId,
    segments,
    ductShape,
    flow: 0,
  };
  edges.push(edge);
  applySegmentGeometry(edge);
  render();
}

function applySegmentGeometry(edge) {
  const start = nodes.find((n) => n.id === edge.from);
  const end = nodes.find((n) => n.id === edge.to);
  if (!start || !end) return;
  let x = start.x;
  let y = start.y;
  edge.points = [{ x, y }];
  edge.segments.forEach((seg) => {
    const dir = directions[seg.direction];
    x += dir.dx * seg.length * scale;
    y += dir.dy * seg.length * scale;
    edge.points.push({ x, y });
  });
  // 將終點移動到最後一個座標，以符合比例尺
  end.x = x;
  end.y = y;
}

function handleCanvasContextMenu(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  showContextMenu(e.clientX - rect.left, e.clientY - rect.top);
}

function handleContextMenuClick(e) {
  const type = e.target.dataset.type;
  if (!type) return;
  const rect = canvas.getBoundingClientRect();
  const x = parseFloat(contextMenu.style.left);
  const y = parseFloat(contextMenu.style.top);
  addNode(type, x, y);
  hideContextMenu();
}

function handleNodeClick(node) {
  hideContextMenu();
  if (!connectingStart) {
    selectedNodeId = node.id;
    if (node.type === 'inlet') {
      promptFlow(node);
    }
    connectingStart = node.id;
  } else if (connectingStart === node.id) {
    // 取消選取
    connectingStart = null;
    selectedNodeId = node.id;
  } else {
    selectedNodeId = node.id;
    openSegmentModal(connectingStart, node.id);
    connectingStart = null;
  }
  render();
}

function handleDeleteKey(e) {
  if (e.key === 'Delete' && selectedNodeId) {
    removeNode(selectedNodeId);
  }
}

function computeFlows() {
  nodes.forEach((n) => {
    n.computedFlow = n.type === 'inlet' ? n.baseFlow : 0;
  });
  edges.forEach((e) => { e.flow = 0; });

  for (let iter = 0; iter < 6; iter += 1) {
    edges.forEach((edge) => {
      const from = nodes.find((n) => n.id === edge.from);
      edge.flow = from ? from.computedFlow : 0;
    });
    nodes.forEach((node) => {
      if (node.type === 'inlet') return;
      const incoming = edges.filter((e) => e.to === node.id);
      const sum = incoming.reduce((acc, cur) => acc + (cur.flow || 0), 0);
      node.computedFlow = sum;
    });
  }
}

function requiredDiameter(flow, velocityValue) {
  if (!velocityValue || velocityValue <= 0) return 0;
  const area = flow / velocityValue;
  if (area <= 0) return 0;
  if (ductShape === 'round') {
    return Math.sqrt((4 * area) / Math.PI);
  }
  // 方管假設為正方形邊長
  return Math.sqrt(area);
}

function render() {
  computeFlows();
  nodeLayer.innerHTML = '';
  edgeLayer.innerHTML = '';
  labelLayer.innerHTML = '';

  edges.forEach((edge) => {
    applySegmentGeometry(edge);
    drawEdge(edge);
  });

  nodes.forEach((node) => {
    const el = document.createElement('div');
    el.className = `node ${node.type}${node.id === selectedNodeId ? ' selected' : ''}`;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.textContent = node.id;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = `${node.computedFlow.toFixed(2)} m³/s`;
    el.appendChild(label);
    el.addEventListener('click', () => handleNodeClick(node));
    nodeLayer.appendChild(el);
  });

  textSummary.textContent = buildSummary();
}

function drawEdge(edge) {
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  const pointsText = edge.points.map((p) => `${p.x},${p.y}`).join(' ');
  polyline.setAttribute('points', pointsText);
  polyline.classList.add(edge.ductShape === 'rect' ? 'rect' : 'round');
  polyline.addEventListener('click', (e) => {
    e.stopPropagation();
    promptSegmentLength(edge);
  });

  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.classList.add('edge');
  group.appendChild(polyline);
  edgeLayer.appendChild(group);

  // 為每段添加標籤
  edge.segments.forEach((seg, idx) => {
    const start = edge.points[idx];
    const end = edge.points[idx + 1];
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const label = document.createElement('div');
    label.className = 'segment-label';
    const diameter = requiredDiameter(edge.flow, velocity);
    const shapeText = edge.ductShape === 'rect'
      ? `${diameter.toFixed(2)}m × ${diameter.toFixed(2)}m`
      : `Ø${diameter.toFixed(2)}m`;
    label.textContent = `${seg.length}m / ${shapeText}`;
    label.style.left = `${mid.x}px`;
    label.style.top = `${mid.y}px`;
    label.style.transform = 'translate(-50%, -50%)';
    label.style.color = '#f8fafc';
    label.title = '點擊線條可調整距離';
    labelLayer.appendChild(label);
  });
}

function promptSegmentLength(edge) {
  const idx = Number(prompt(`欲修改哪一段? 1 - ${edge.segments.length}`, 1)) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= edge.segments.length) return;
  const current = edge.segments[idx].length;
  const value = prompt('設定距離 (m)', current);
  if (value === null) return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    alert('請輸入有效距離');
    return;
  }
  edge.segments[idx].length = numeric;
  applySegmentGeometry(edge);
  render();
}

function buildSummary() {
  const outgoing = new Map();
  edges.forEach((e) => {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    outgoing.get(e.from).push(e);
  });
  const inletNodes = nodes.filter((n) => n.type === 'inlet');
  const lines = [];
  inletNodes.forEach((n) => {
    dfs(n, '', lines, outgoing);
  });
  return lines.join('\n');
}

function dfs(node, prefix, lines, outgoing) {
  const edgesFrom = outgoing.get(node.id) || [];
  if (!edgesFrom.length) {
    lines.push(`${prefix}${node.id}`);
    return;
  }
  edgesFrom.forEach((edge) => {
    const segmentText = edge.segments.map((s) => `${directions[s.direction].label}${s.length}m`).join('⭢');
    const shapeText = edge.ductShape === 'rect' ? '□' : '○';
    const part = `${node.id}⭢${segmentText}${edge.to ? `⭢${shapeText}${edge.to}` : ''}`;
    dfs(nodes.find((n) => n.id === edge.to), `${prefix}${part}\n`, lines, outgoing);
  });
}

// 事件綁定
canvas.addEventListener('contextmenu', handleCanvasContextMenu);
contextMenu.addEventListener('click', handleContextMenuClick);
canvas.addEventListener('click', () => hideContextMenu());
document.addEventListener('keydown', handleDeleteKey);

velocityInput.addEventListener('change', (e) => updateVelocity(Number(e.target.value)));
ductShapeSelect.addEventListener('change', (e) => setDuctShape(e.target.value));
scaleInput.addEventListener('change', (e) => updateScale(Number(e.target.value)));

exportTextBtn.addEventListener('click', () => {
  textSummary.textContent = buildSummary();
});

clearSelectionBtn.addEventListener('click', () => {
  selectedNodeId = null;
  connectingStart = null;
  render();
});

addSegmentBtn.addEventListener('click', () => addSegmentRow());
confirmSegmentBtn.addEventListener('click', () => {
  if (!pendingTarget) return;
  const segments = collectSegments();
  createEdge(pendingTarget.fromId, pendingTarget.toId, segments);
  closeSegmentModal();
});
closeModalBtn.addEventListener('click', closeSegmentModal);

// 初始化
render();

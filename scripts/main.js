/**
 * @file main.js
 * @brief 風量管路繪製邏輯：右鍵新增節點、距離推算線段、統一風速與管徑建議（繁中 Doxygen 註解）。
 */

const canvas = document.getElementById("canvas");
const nodeLayer = document.getElementById("nodeLayer");
const labelLayer = document.getElementById("labelLayer");
const svg = document.getElementById("connectionLayer");
const contextMenu = document.getElementById("contextMenu");
const textOutput = document.getElementById("textOutput");
const velocityInput = document.getElementById("velocity");
const shapeInput = document.getElementById("shape");
const scaleInput = document.getElementById("scale");
const connectBtn = document.getElementById("connectBtn");
const toggleGridBtn = document.getElementById("toggleGrid");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const recalcBtn = document.getElementById("recalcBtn");
const statusPill = document.getElementById("status");
const nodeNameInput = document.getElementById("nodeName");
const nodeTypeInput = document.getElementById("nodeType");
const nodeFlowInput = document.getElementById("nodeFlow");
const applyNodeBtn = document.getElementById("applyNode");
const edgeRouteInput = document.getElementById("edgeRoute");
const edgeShapeInput = document.getElementById("edgeShape");
const edgeWidthInput = document.getElementById("edgeWidth");
const edgeHeightInput = document.getElementById("edgeHeight");
const edgeLengthInput = document.getElementById("edgeLength");
const edgeDiameterInput = document.getElementById("edgeDiameter");
const applyEdgeBtn = document.getElementById("applyEdge");
const edgeExtra = document.getElementById("edgeExtra");
const logPanel = document.getElementById("debugLog");

/**
 * @typedef 節點
 * @property {string} id 節點編號
 * @property {string} name 節點名稱
 * @property {"inlet"|"junction"|"outlet"} type 類型
 * @property {number} x 位置 X
 * @property {number} y 位置 Y
 * @property {number} flowCmm 指定風量
 * @property {number} calculatedFlowCmm 計算後風量
 */

/**
 * @typedef 線段
 * @property {"up"|"down"|"left"|"right"} dir 方向
 * @property {number} length 長度（公尺）
 */

/**
 * @typedef 管路
 * @property {string} id 管路編號
 * @property {string} from 起點節點
 * @property {string} to 終點節點
 * @property {線段[]} segments 路徑
 * @property {"round"|"square"} shape 管型
 * @property {number} velocity 風速
 * @property {number} diameterMeters 圓管直徑（公尺）
 * @property {number} widthMm 方管寬（mm）
 * @property {number} heightMm 方管高（mm）
 * @property {number} flowCmm 流量
 * @property {number} lengthMeters 路徑總長（公尺）
 * @property {number} efficiency 效率（%）
 */

const state = {
  nodes: /** @type {節點[]} */ ([]),
  edges: /** @type {管路[]} */ ([]),
  counters: { inlet: 1, junction: 1, outlet: 1 },
  selectedNodeId: /** @type {string|null} */ (null),
  selectedEdgeId: /** @type {string|null} */ (null),
  connectStart: /** @type {string|null} */ (null),
  isDraggingNode: false,
  dragNodeId: /** @type {string|null} */ (null),
  isPanning: false,
  lastPointer: { x: 0, y: 0 },
  pixelsPerMeter: Number(scaleInput.value) || 18,
  defaultVelocity: 13,
  zoom: 1,
  clipboardNode: /** @type {節點|null} */ (null),
};

/** @brief 更新右上狀態並寫入 log。 */
function setStatus(text) {
  statusPill.textContent = text;
  log(`狀態：${text}`);
}

/** @brief 加入一筆除錯訊息。 */
function log(message) {
  if (!logPanel) return;
  const entry = document.createElement("div");
  entry.className = "log-entry";
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  logPanel.prepend(entry);
  while (logPanel.childNodes.length > 50) {
    logPanel.removeChild(logPanel.lastChild);
  }
}

/**
 * @brief 螢幕座標轉為畫布座標。
 * @param {number} clientX 螢幕 X
 * @param {number} clientY 螢幕 Y
 * @returns {{x:number,y:number}} 畫布點位
 */
function toCanvasPos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scale = state.zoom || 1;
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

/** @brief 關閉右鍵選單。 */
function hideMenu() {
  contextMenu.classList.add("hidden");
}

/**
 * @brief 於指定位置開啟右鍵選單。
 * @param {number} x 畫布 X
 * @param {number} y 畫布 Y
 */
function openMenu(x, y) {
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.dataset.x = x.toString();
  contextMenu.dataset.y = y.toString();
  contextMenu.classList.remove("hidden");
}

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const { x, y } = toCanvasPos(event.clientX, event.clientY);
  openMenu(x, y);
  log(`右鍵（畫布）x:${x.toFixed(0)}, y:${y.toFixed(0)}`);
});

nodeLayer.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const { x, y } = toCanvasPos(event.clientX, event.clientY);
  openMenu(x, y);
  log(`右鍵（節點層）x:${x.toFixed(0)}, y:${y.toFixed(0)}`);
});

labelLayer.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const { x, y } = toCanvasPos(event.clientX, event.clientY);
  openMenu(x, y);
});

svg.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const { x, y } = toCanvasPos(event.clientX, event.clientY);
  openMenu(x, y);
});

document.addEventListener(
  "contextmenu",
  (event) => {
    if (!canvas.contains(event.target)) return;
    event.preventDefault();
    const { x, y } = toCanvasPos(event.clientX, event.clientY);
    openMenu(x, y);
    log(`右鍵（捕獲）x:${x.toFixed(0)}, y:${y.toFixed(0)}`);
  },
  { capture: true },
);

document.addEventListener("click", (event) => {
  if (!contextMenu.contains(event.target)) {
    hideMenu();
  }
});

contextMenu.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const type = button.dataset.type;
  const x = Number(contextMenu.dataset.x);
  const y = Number(contextMenu.dataset.y);
  addNode(type, x, y);
  hideMenu();
});

nodeLayer.addEventListener("pointerdown", (event) => {
  const nodeEl = event.target.closest(".node");
  if (!nodeEl || event.button !== 0) return;
  const node = state.nodes.find((item) => item.id === nodeEl.dataset.id);
  if (!node) return;
  state.isDraggingNode = true;
  state.dragNodeId = node.id;
  log(`拖曳開始：${node.name}`);
});

nodeLayer.addEventListener("click", (event) => {
  const nodeEl = event.target.closest(".node");
  if (!nodeEl) return;
  const node = state.nodes.find((item) => item.id === nodeEl.dataset.id);
  if (!node) return;

  state.selectedNodeId = node.id;
  state.selectedEdgeId = null;
  populateNodeForm(node);
  clearEdgeForm();

  if (connectBtn.classList.contains("active")) {
    if (!state.connectStart) {
      state.connectStart = node.id;
      setStatus(`起點：${node.name}，請選終點`);
    } else if (state.connectStart === node.id) {
      state.connectStart = null;
      setStatus("已取消連線");
    } else {
      const ok = buildEdge(state.connectStart, node.id);
      state.connectStart = null;
      connectBtn.classList.remove("active");
      if (ok) {
        setStatus("連線完成，可調整風量與管徑");
      }
    }
  }

  renderNodes();
});

svg.addEventListener("click", (event) => {
  const poly = event.target.closest("polyline");
  if (!poly) return;
  const edge = state.edges.find((item) => item.id === poly.dataset.id);
  if (!edge) return;
  state.selectedEdgeId = edge.id;
  state.selectedNodeId = null;
  populateEdgeForm(edge);
  clearNodeForm();
  renderEdges();
  log(`選取管路：${edge.id}`);
});

/**
 * @brief 滾輪縮放比例（px/m），避免誤捲畫面。
 */
/**
 * @brief 滾輪縮放畫布（視覺縮放，不改變比例數值）。
 */
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
    const next = Math.min(3, Math.max(0.5, state.zoom * factor));
    const rect = canvas.getBoundingClientRect();
    const originX = ((event.clientX - rect.left) / rect.width) * 100;
    const originY = ((event.clientY - rect.top) / rect.height) * 100;
    applyZoom(next, originX, originY);
  },
  { passive: false },
);

/**
 * @brief 套用視覺縮放，維持邏輯比例不變。
 * @param {number} zoom 縮放倍率
 * @param {number} originX 百分比原點 X
 * @param {number} originY 百分比原點 Y
 */
function applyZoom(zoom, originX = 50, originY = 50) {
  state.zoom = zoom;
  const rect = canvas.getBoundingClientRect();
  const baseW = rect.width / (state.zoom || 1);
  const baseH = rect.height / (state.zoom || 1);
  const extraW = Math.max(0, (zoom - 1) * baseW);
  const extraH = Math.max(0, (zoom - 1) * baseH);

  canvas.style.transformOrigin = `${originX}% ${originY}%`;
  canvas.style.transform = `scale(${zoom})`;
  canvas.style.marginRight = `${extraW}px`;
  canvas.style.marginBottom = `${extraH}px`;
}

document.addEventListener("pointermove", (event) => {
  if (state.isDraggingNode && state.dragNodeId) {
    const node = state.nodes.find((item) => item.id === state.dragNodeId);
    if (!node) return;
    const { x, y } = toCanvasPos(event.clientX, event.clientY);
    node.x = x;
    node.y = y;
    renderAll();
    return;
  }
  if (state.isPanning) {
    const { x, y } = toCanvasPos(event.clientX, event.clientY);
    const dx = x - state.lastPointer.x;
    const dy = y - state.lastPointer.y;
    state.nodes.forEach((node) => {
      node.x += dx;
      node.y += dy;
    });
    state.lastPointer = { x, y };
    renderAll();
  }
});

document.addEventListener("pointerup", () => {
  if (state.isDraggingNode && state.dragNodeId) {
    const node = state.nodes.find((item) => item.id === state.dragNodeId);
    if (node) log(`拖曳結束：${node.name}`);
  }
  state.isDraggingNode = false;
  state.dragNodeId = null;
  state.isPanning = false;
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
    state.isPanning = true;
    state.lastPointer = toCanvasPos(event.clientX, event.clientY);
    hideMenu();
    log("平移開始");
  }
});

document.addEventListener("keydown", (event) => {
  // 複製/貼上節點
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    if (state.selectedNodeId) {
      const node = state.nodes.find((item) => item.id === state.selectedNodeId);
      if (node) {
        state.clipboardNode = { ...node };
        log(`已複製節點：${node.name}`);
      }
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
    if (state.clipboardNode) {
      pasteNode(state.clipboardNode);
    }
  }

  if (event.key === "Delete" && state.selectedNodeId) {
    deleteNode(state.selectedNodeId);
    log("刪除節點");
  }
});

connectBtn.addEventListener("click", () => {
  connectBtn.classList.toggle("active");
  state.connectStart = null;
  setStatus(connectBtn.classList.contains("active") ? "連線模式" : "待命");
});

toggleGridBtn.addEventListener("click", () => {
  canvas.classList.toggle("no-grid");
});

exportBtn.addEventListener("click", () => {
  textOutput.value = buildText();
  log("匯出文字結果");
});

clearBtn.addEventListener("click", () => {
  if (!confirm("清除所有節點與管路？")) return;
  state.nodes = [];
  state.edges = [];
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.counters = { inlet: 1, junction: 1, outlet: 1 };
  clearNodeForm();
  clearEdgeForm();
  renderAll();
  textOutput.value = "";
  log("已清除畫布");
});

recalcBtn.addEventListener("click", () => {
  state.pixelsPerMeter = Number(scaleInput.value) || state.pixelsPerMeter;
  recomputeFlows();
});

scaleInput.addEventListener("change", () => {
  state.pixelsPerMeter = Number(scaleInput.value) || state.pixelsPerMeter;
  renderEdges();
});

velocityInput.addEventListener("change", () => {
  state.defaultVelocity = Number(velocityInput.value) || 0;
  state.edges.forEach((edge) => {
    edge.velocity = state.defaultVelocity;
  });
  recomputeFlows();
  setStatus("已同步風速至所有管路");
});

applyNodeBtn.addEventListener("click", () => {
  if (!state.selectedNodeId) return;
  const node = state.nodes.find((item) => item.id === state.selectedNodeId);
  if (!node) return;
  if (node.type === "inlet") {
    node.flowCmm = Number(nodeFlowInput.value) || 0;
    node.calculatedFlowCmm = node.flowCmm;
  }
  renderNodes();
  recomputeFlows();
  log(`更新節點：${node.name}`);
});

applyEdgeBtn.addEventListener("click", () => {
  if (!state.selectedEdgeId) return;
  const edge = state.edges.find((item) => item.id === state.selectedEdgeId);
  if (!edge) return;
  edge.shape = edgeShapeInput.value === "square" ? "square" : "round";
  edge.velocity = state.defaultVelocity;
  edge.widthMm = Number(edgeWidthInput.value) || edge.widthMm || 0;
  edge.heightMm = Number(edgeHeightInput.value) || edge.heightMm || 0;
  recomputeFlows();
  log(`更新管路：${edge.id}`);
});

edgeShapeInput.addEventListener("change", () => {
  edgeExtra.classList.remove("hidden");
});

/**
 * @brief 新增節點並渲染。
 * @param {"inlet"|"junction"|"outlet"} type 節點類型
 * @param {number} x 畫布 X
 * @param {number} y 畫布 Y
 */
function addNode(type, x, y) {
  const prefix = { inlet: "a", junction: "b", outlet: "c" }[type] || "n";
  const node = {
    id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name: `${prefix}${state.counters[type]++}`,
    type,
    x,
    y,
    flowCmm: type === "inlet" ? 30 : 0,
    calculatedFlowCmm: type === "inlet" ? 30 : 0,
  };
  state.nodes.push(node);
  renderNodes();
  setStatus(`起點：${node.name}，請選終點`);
  log(`新增節點 ${node.name} (${type})`);
}

/**
 * @brief 建立管路並以節點距離計算長度。
 * @param {string} fromId 起點 ID
 * @param {string} toId 終點 ID
 */
function buildEdge(fromId, toId) {
  const startNode = state.nodes.find((item) => item.id === fromId);
  const endNode = state.nodes.find((item) => item.id === toId);
  if (!startNode || !endNode) return false;
  const okFrom = startNode.type === "inlet" || startNode.type === "junction";
  const okTo = endNode.type === "junction" || endNode.type === "outlet";
  if (!okFrom || !okTo) {
    setStatus("連線失敗：僅允許 進風口/節點 → 節點/出風口");
    log(`連線失敗：${startNode.type} -> ${endNode.type}`);
    return false;
  }
  const edge = {
    id: `edge-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    from: fromId,
    to: toId,
    segments: [],
    shape: shapeInput.value === "square" ? "square" : "round",
    velocity: state.defaultVelocity,
    diameterMeters: 0,
    widthMm: 0,
    heightMm: 0,
    flowCmm: 0,
    lengthMeters: 0,
    efficiency: 0,
  };
  refreshEdgeGeometry(edge);
  state.edges.push(edge);
  state.selectedEdgeId = edge.id;
  state.selectedNodeId = null;
  populateEdgeForm(edge);
  clearNodeForm();
  recomputeFlows();
  log(`建立管路 ${edge.id}`);
  return true;
}

/**
 * @brief 依目前節點位置更新管路幾何。
 * @param {管路} edge 目標管路
 */
function refreshEdgeGeometry(edge) {
  const start = state.nodes.find((item) => item.id === edge.from);
  const end = state.nodes.find((item) => item.id === edge.to);
  if (!start || !end) return;
  edge.segments = generateSegmentsFromNodes(start, end);
  const dxPx = end.x - start.x;
  const dyPx = end.y - start.y;
  edge.lengthMeters = Math.hypot(dxPx, dyPx) / (state.pixelsPerMeter || 1);
}

/**
 * @brief 依節點距離生成軸向線段。
 * @param {節點} start 起點
 * @param {節點} end 終點
 * @returns {線段[]} 線段陣列
 */
function generateSegmentsFromNodes(start, end) {
  const dxPx = end.x - start.x;
  const dyPx = end.y - start.y;
  const scale = state.pixelsPerMeter || 1;
  const segments = [];
  if (Math.abs(dxPx) > 0.01) {
    segments.push({
      dir: dxPx >= 0 ? "right" : "left",
      length: Math.abs(dxPx) / scale,
    });
  }
  if (Math.abs(dyPx) > 0.01) {
    segments.push({
      dir: dyPx >= 0 ? "down" : "up",
      length: Math.abs(dyPx) / scale,
    });
  }
  if (!segments.length) {
    segments.push({ dir: "right", length: 0 });
  }
  return segments;
}

/** @brief 渲染全部節點。 */
function renderNodes() {
  nodeLayer.innerHTML = "";
  for (const node of state.nodes) {
    const element = document.createElement("div");
    element.className = `node ${node.type}${state.selectedNodeId === node.id ? " selected" : ""}`;
    element.dataset.id = node.id;
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
    element.innerHTML = `<div class="name">${node.name}</div><div class="flow">風量 ${formatNumber(
      node.calculatedFlowCmm ?? node.flowCmm ?? 0,
    )} CMM</div>`;
    nodeLayer.appendChild(element);
  }
}

/** @brief 渲染全部管路與標籤。 */
function renderEdges() {
  svg.innerHTML = "";
  labelLayer.innerHTML = "";
  for (const edge of state.edges) {
    refreshEdgeGeometry(edge);
    const start = state.nodes.find((item) => item.id === edge.from);
    if (!start) continue;
    const points = buildPoints(start, edge.segments);
    const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    poly.setAttribute(
      "points",
      points
        .map((point) => `${point.x},${point.y}`)
        .join(" ")
        .trim(),
    );
    poly.classList.add("edge", edge.shape === "square" ? "square" : "round");
    if (state.selectedEdgeId === edge.id) {
      poly.classList.add("selected");
    }
    poly.dataset.id = edge.id;
    const gaugeMm =
      edge.shape === "square"
        ? (edge.widthMm || edge.heightMm || 0) || ((edge.diameterMeters || 0) * 1000)
        : (edge.diameterMeters || 0) * 1000;
    const strokeWidth = Math.max(2, gaugeMm / 150);
    poly.style.strokeWidth = `${strokeWidth}px`;
    poly.style.pointerEvents = "auto";
    svg.appendChild(poly);

    const labelPos = midPoint(points, edge.segments);
    const label = document.createElement("div");
    label.className = "edge-label";
    if (state.selectedEdgeId === edge.id) {
      label.classList.add("selected");
    }
    const sizeText =
      edge.shape === "square"
        ? `尺寸：${Math.round(edge.widthMm || 0)} x ${Math.round(edge.heightMm || 0)} mm`
        : `直徑：${Math.round((edge.diameterMeters || 0) * 1000)} mm`;
    const effText = `效率：${formatNumber(edge.efficiency || 0)}%`;
    label.innerHTML = `<div>長度：${edge.lengthMeters.toFixed(2)} m</div><div>${sizeText}</div><div>${effText}</div>`;
    label.style.left = `${labelPos.x}px`;
    label.style.top = `${labelPos.y}px`;
    labelLayer.appendChild(label);
  }
  if (state.selectedEdgeId) {
    const edge = state.edges.find((item) => item.id === state.selectedEdgeId);
    if (edge) populateEdgeForm(edge);
  }
}

/**
 * @brief 線段轉折點列表。
 * @param {節點} start 起點
 * @param {線段[]} segments 線段
 * @returns {{x:number,y:number}[]} 點列表
 */
function buildPoints(start, segments) {
  const points = [{ x: start.x, y: start.y }];
  let x = start.x;
  let y = start.y;
  for (const segment of segments) {
    const distancePx = segment.length * state.pixelsPerMeter;
    if (segment.dir === "right") x += distancePx;
    if (segment.dir === "left") x -= distancePx;
    if (segment.dir === "down") y += distancePx;
    if (segment.dir === "up") y -= distancePx;
    points.push({ x, y });
  }
  return points;
}

/**
 * @brief 取得路徑中點，用於標籤位置。
 * @param {{x:number,y:number}[]} points 點列表
 * @param {線段[]} segments 線段
 * @returns {{x:number,y:number}} 中點
 */
function midPoint(points, segments) {
  const total = segments.reduce((acc, seg) => acc + seg.length, 0);
  const half = total / 2;
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const segmentLength = segments[index - 1].length;
    if (walked + segmentLength >= half) {
      const ratio = (half - walked) / segmentLength || 0;
      return {
        x: points[index - 1].x + (points[index].x - points[index - 1].x) * ratio,
        y: points[index - 1].y + (points[index].y - points[index - 1].y) * ratio,
      };
    }
    walked += segmentLength;
  }
  return points[points.length - 1];
}

/** @brief 重算風量、管徑並重新渲染。 */
function recomputeFlows() {
  state.pixelsPerMeter = Number(scaleInput.value) || state.pixelsPerMeter;
  state.defaultVelocity = Number(velocityInput.value) || state.defaultVelocity;

  state.nodes.forEach((node) => {
    node.calculatedFlowCmm = node.type === "inlet" ? node.flowCmm : 0;
  });

  // 反覆累積：與點擊順序無關，直至收斂
  for (let iter = 0; iter < state.nodes.length; iter += 1) {
    let changed = false;
    for (const edge of state.edges) {
      const from = state.nodes.find((item) => item.id === edge.from);
      const to = state.nodes.find((item) => item.id === edge.to);
      if (!from || !to) continue;
      edge.flowCmm = from.calculatedFlowCmm || 0;
      const incoming = state.edges
        .filter((candidate) => candidate.to === to.id)
        .reduce((acc, candidate) => {
          const source = state.nodes.find((item) => item.id === candidate.from);
          return acc + (source?.calculatedFlowCmm || 0);
        }, 0);
      const next = (to.type === "inlet" ? to.flowCmm : 0) + incoming;
      if (Math.abs(next - to.calculatedFlowCmm) > 0.0001) {
        to.calculatedFlowCmm = next;
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const edge of state.edges) {
    edge.velocity = state.defaultVelocity;
    const sizing = calculateSizing(edge.flowCmm || 0, edge.velocity, edge.shape, {
      widthMm: edge.widthMm,
      heightMm: edge.heightMm,
    });
    edge.diameterMeters = sizing.diameterMeters;
    edge.widthMm = sizing.widthMm;
    edge.heightMm = sizing.heightMm;
    edge.efficiency = sizing.efficiency;
  }

  renderNodes();
  renderEdges();
  syncForms();
}

/**
 * @brief 計算建議管徑（50mm 級距，效率>90% 再加 50mm）。
 * @param {number} flowCmm 風量 CMM
 * @param {number} velocity 風速 m/s
 * @param {"round"|"square"} shape 管型
 * @param {{widthMm?:number,heightMm?:number}} size 現有尺寸
 * @returns {{diameterMeters:number,widthMm:number,heightMm:number,efficiency:number}} 建議尺寸
 */
function calculateSizing(flowCmm, velocity, shape, size) {
  if (!flowCmm || !velocity) return { diameterMeters: 0, widthMm: 0, heightMm: 0, efficiency: 0 };
  const flowM3s = flowCmm / 60;
  const theoreticalArea = flowM3s / velocity;
  const theoreticalDiameterM = Math.sqrt((4 * theoreticalArea) / Math.PI);
  const theoreticalMm = theoreticalDiameterM * 1000;

  if (shape === "square") {
    const theoreticalSideMm = Math.sqrt(theoreticalArea) * 1000;
    let widthMm = size.widthMm || roundUp(theoreticalSideMm, 50);
    let heightMm = size.heightMm || roundUp(theoreticalSideMm, 50);
    const actualArea = (widthMm * heightMm) / 1_000_000;
    let efficiency = (theoreticalArea / actualArea) * 100;
    if (efficiency > 90) {
      widthMm += 50;
      heightMm += 50;
      efficiency = (theoreticalArea / ((widthMm * heightMm) / 1_000_000)) * 100;
    }
    const diameterMeters = Math.sqrt((4 * actualArea) / Math.PI);
    return { diameterMeters, widthMm, heightMm, efficiency };
  }

  let recommendedMm = roundUp(theoreticalMm, 50);
  let efficiency = ((theoreticalMm / recommendedMm) ** 2) * 100;
  if (efficiency > 90) {
    recommendedMm += 50;
    efficiency = ((theoreticalMm / recommendedMm) ** 2) * 100;
  }
  return { diameterMeters: recommendedMm / 1000, widthMm: 0, heightMm: 0, efficiency };
}

/**
 * @brief 依級距無條件進位。
 * @param {number} value 原始值
 * @param {number} step 級距
 * @returns {number} 進位後
 */
function roundUp(value, step) {
  if (step <= 0) return value;
  return Math.ceil(value / step) * step;
}

/**
 * @brief 將複製的節點貼上為新節點並偏移。
 * @param {節點} source 原節點
 */
function pasteNode(source) {
  const offset = 40;
  const type = source.type;
  const prefix = { inlet: "a", junction: "b", outlet: "c" }[type] || "n";
  const node = {
    id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    name: `${prefix}${state.counters[type]++}`,
    type,
    x: source.x + offset,
    y: source.y + offset,
    flowCmm: source.flowCmm,
    calculatedFlowCmm: source.type === "inlet" ? source.flowCmm : 0,
  };
  state.nodes.push(node);
  state.selectedNodeId = node.id;
  state.selectedEdgeId = null;
  renderAll();
  setStatus(`貼上節點：${node.name}`);
  log(`貼上節點：${node.name}`);
}

/**
 * @brief 刪除節點與其相關管路。
 * @param {string} id 節點 ID
 */
function deleteNode(id) {
  state.nodes = state.nodes.filter((node) => node.id !== id);
  state.edges = state.edges.filter((edge) => edge.from !== id && edge.to !== id);
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.connectStart = null;
  clearNodeForm();
  clearEdgeForm();
  renderAll();
  recomputeFlows();
  log(`刪除節點並更新連結：${id}`);
}

/** @brief 重繪節點與管路。 */
function renderAll() {
  renderNodes();
  renderEdges();
}

/**
 * @brief 匯出用的路徑敘述。
 * @param {線段[]} segments 線段
 * @returns {string} 敘述文字
 */
function describeSegments(segments) {
  return segments.map((segment) => `${segment.dir} ${segment.length.toFixed(2)}`).join(", ");
}

/** @brief 建立文字輸出。 */
function buildText() {
  const lines = [];
  for (const edge of state.edges) {
    const from = state.nodes.find((node) => node.id === edge.from);
    const to = state.nodes.find((node) => node.id === edge.to);
    const shapeText =
      edge.shape === "square"
        ? `方管 ${Math.round(edge.widthMm || 0)}x${Math.round(edge.heightMm || 0)}mm`
        : `圓管 ${((edge.diameterMeters || 0) * 1000).toFixed(0)}mm`;
    lines.push(
      `${from?.name || "?"} -> ${to?.name || "?"} | ${edge.lengthMeters.toFixed(
        2,
      )}m | ${shapeText} | v=${edge.velocity}m/s | eff=${formatNumber(edge.efficiency)}%`,
    );
  }
  return lines.join("\n");
}

/**
 * @brief 格式化數字。
 * @param {number} num 數值
 * @returns {string} 兩位小數字串
 */
function formatNumber(num) {
  return Number(num || 0).toFixed(2);
}

/**
 * @brief 填入節點表單。
 * @param {節點} node 節點
 */
function populateNodeForm(node) {
  nodeNameInput.value = node.name;
  nodeTypeInput.value = node.type;
  nodeFlowInput.value = node.flowCmm ?? 0;
  nodeFlowInput.disabled = node.type !== "inlet";
}

/**
 * @brief 填入管路表單並展開細節。
 * @param {管路} edge 管路
 */
function populateEdgeForm(edge) {
  edgeShapeInput.value = edge.shape === "square" ? "square" : "round";
  edgeRouteInput.value = describeSegments(edge.segments);
  edgeWidthInput.value = edge.widthMm ? Math.round(edge.widthMm) : "";
  edgeHeightInput.value = edge.heightMm ? Math.round(edge.heightMm) : "";
  edgeLengthInput.value = edge.lengthMeters?.toFixed(2) ?? "";
  edgeDiameterInput.value =
    edge.shape === "square" && edge.widthMm && edge.heightMm
      ? `${Math.round(edge.widthMm)} x ${Math.round(edge.heightMm)} mm`
      : edge.diameterMeters
        ? `${(edge.diameterMeters * 1000).toFixed(0)} mm`
        : "";
  edgeExtra.classList.remove("hidden");
}

/** @brief 清除節點表單。 */
function clearNodeForm() {
  nodeNameInput.value = "";
  nodeTypeInput.value = "";
  nodeFlowInput.value = "";
  nodeFlowInput.disabled = true;
}

/** @brief 清除管路表單並收起細節。 */
function clearEdgeForm() {
  edgeRouteInput.value = "";
  edgeShapeInput.value = "round";
  edgeWidthInput.value = "";
  edgeHeightInput.value = "";
  edgeLengthInput.value = "";
  edgeDiameterInput.value = "";
  edgeExtra.classList.add("hidden");
}

/** @brief 同步表單與選取狀態。 */
function syncForms() {
  if (state.selectedNodeId) {
    const node = state.nodes.find((item) => item.id === state.selectedNodeId);
    if (node) populateNodeForm(node);
  }
  if (state.selectedEdgeId) {
    const edge = state.edges.find((item) => item.id === state.selectedEdgeId);
    if (edge) populateEdgeForm(edge);
  }
}

renderAll();
velocityInput.value = "13";
state.defaultVelocity = 13;
applyZoom(1);
setStatus("待命 | 右鍵可新增節點");
log("程式啟動完成");

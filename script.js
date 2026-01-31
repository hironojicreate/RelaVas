// script.js

// ====== 設定・定数 ======
const ANCHOR_COUNT = 9; 
const SNAP_DISTANCE = 30; 

// ====== 便利関数（マウス・タッチ共通化） ======

// イベントから正しい座標(x,y)を取り出す関数
function getPointerPos(e) {
    // タッチイベントの場合
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    // マウスイベントの場合
    return { x: e.clientX, y: e.clientY };
}

// ====== データ構造（State Managementの第一歩！） ======

// 1. ID生成関数（簡易版UUID）
// これで人物をいくら増やしてもIDが被らないの！
function generateId() {
    return 'id-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
}

// 2. ノードデータ（人物リスト）
// HTMLからデータをここに引っ越したの。
let nodes = [
    { id: "node-a", x: 400, y: 300, label: "人物A" },
    { id: "node-b", x: 700, y: 200, label: "人物B" },
    { id: "node-c", x: 400, y: 550, label: "人物C" },
    { id: "node-d", x: 100, y: 300, label: "人物D" }
];

// 線データ
let connections = [
    {
        id: "conn-1",
        start: { type: "anchor", nodeId: "node-a", side: "top", index: 4 }, 
        end:   { type: "anchor", nodeId: "node-b", side: "left", index: 4 },
        waypoints: []
    },
    {
        id: "conn-2",
        start: { type: "anchor", nodeId: "node-d", side: "right", index: 4 },
        end:   { type: "point", x: 250, y: 350 }, 
        waypoints: []
    }
];

// ====== グローバル変数 ======
const container = document.getElementById('canvas-container');
const svgLayer = document.getElementById('svg-layer');
const snapGuide = document.getElementById('snap-guide');

let isDragging = false;
let currentDragTarget = null; 
let dragInfo = null; 
let dragOffset = { x: 0, y: 0 };
let selectedId = null; // 今選択されているノードのID（なければnull）


// ====== 初期化処理（ノード生成） ======

// ノードデータをもとに、画面にHTML要素を作る関数なの。
function initNodes() {
    // 既存のノードがあればクリア（今はなくてもいいけど、将来のリセット機能用）
    // 注意: snap-guide と svg-layer は消しちゃダメだから、class="node" だけ探して消すとか、
    // 追加のみ行う実装にするの。今回は初回生成なので単純に追加していくわ。

    nodes.forEach(nodeData => {
        createNodeElement(nodeData);
    });
}

// 1つのノードを画面に追加する関数

function createNodeElement(nodeData) {
    const el = document.createElement('div');
    el.className = 'node';
    // もし今作っているこのノードが「選択中のID」と同じなら、クラスをつける
    if (nodeData.id === selectedId) {
        el.classList.add('selected');
    }
    
    el.id = nodeData.id;
    el.textContent = nodeData.label;
    el.style.left = nodeData.x + 'px';
    el.style.top = nodeData.y + 'px';

    // ドラッグ開始

    registerInteraction(el, { type: 'node', id: nodeData.id });

    container.appendChild(el);
}

// 選択状態を切り替える関数
function selectNode(id) {
    selectedId = id;
    
    // 全部のノードから selected クラスを外して
    document.querySelectorAll('.node').forEach(el => el.classList.remove('selected'));
    
    // 指定されたIDのノードにだけつける
    if (id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('selected');
    }
}


// ====== 仮想アンカー計算ロジック ======

function getAnchorCoordinate(nodeId, side, index) {
    const node = document.getElementById(nodeId);
    if (!node) return { x: 0, y: 0 };

    const rect = node.getBoundingClientRect();
    const left = parseFloat(node.style.left);
    const top = parseFloat(node.style.top);
    const width = rect.width;
    const height = rect.height;

    const stepX = width / (ANCHOR_COUNT - 1);
    const stepY = height / (ANCHOR_COUNT - 1);

    let x = 0, y = 0;

    switch(side) {
        case 'top': x = left + (stepX * index); y = top; break;
        case 'bottom': x = left + (stepX * index); y = top + height; break;
        case 'left': x = left; y = top + (stepY * index); break;
        case 'right': x = left + width; y = top + (stepY * index); break;
    }
    return { x, y };
}

function getPointPosition(data) {
    if (data.type === 'anchor') {
        return getAnchorCoordinate(data.nodeId, data.side, data.index);
    } else {
        return { x: data.x, y: data.y };
    }
}

function findClosestAnchor(x, y) {
    let closest = null;
    let minDist = SNAP_DISTANCE; 

    const domNodes = document.querySelectorAll('.node');
    domNodes.forEach(node => {
        const nodeId = node.id;
        const rect = node.getBoundingClientRect();
        
        const buffer = 50;
        const nLeft = parseFloat(node.style.left);
        const nTop = parseFloat(node.style.top);
        if (x < nLeft - buffer || x > nLeft + rect.width + buffer ||
            y < nTop - buffer || y > nTop + rect.height + buffer) {
            return; 
        }

        const sides = ['top', 'bottom', 'left', 'right'];
        sides.forEach(side => {
            for (let i = 0; i < ANCHOR_COUNT; i++) {
                const pos = getAnchorCoordinate(nodeId, side, i);
                const dist = Math.hypot(x - pos.x, y - pos.y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = { nodeId, side, index: i, x: pos.x, y: pos.y };
                }
            }
        });
    });

    return closest;
}

// ====== 描画ロジック（DOM再利用版） ======

function render() {
    // SVG（線）は軽いので全書き換えでOK
    svgLayer.innerHTML = ''; 
    
    // 今回の描画で使った要素のIDを記録するリスト
    const updatedElementIds = new Set();

    connections.forEach(conn => {
        drawConnection(conn, updatedElementIds);
    });

    // 使われなくなった古いハンドル（削除された線のもの等）だけを探して消す
    document.querySelectorAll('.line-handle, .waypoint').forEach(el => {
        if (!updatedElementIds.has(el.id)) {
            el.remove();
        }
    });
}

function drawConnection(conn, updatedIds) {
    let startPos;
    if (conn.start.type === 'anchor') {
        startPos = getAnchorCoordinate(conn.start.nodeId, conn.start.side, conn.start.index);
    } else {
        startPos = { x: conn.start.x, y: conn.start.y };
    }

    let endPos;
    if (conn.end.type === 'anchor') {
        endPos = getAnchorCoordinate(conn.end.nodeId, conn.end.side, conn.end.index);
    } else {
        endPos = { x: conn.end.x, y: conn.end.y };
    }

    let d = `M ${startPos.x} ${startPos.y}`;
    conn.waypoints.forEach(wp => {
        d += ` L ${wp.x} ${wp.y}`;
    });
    d += ` L ${endPos.x} ${endPos.y}`;

    // 線（当たり判定用）
    const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hitPath.setAttribute("d", d);
    hitPath.setAttribute("class", "connection-hit-area");
    hitPath.onclick = (e) => onLineClick(e, conn);
    svgLayer.appendChild(hitPath);

    // 線（見た目用）
    const visualPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    visualPath.setAttribute("d", d);
    visualPath.setAttribute("class", "connection-line");
    visualPath.style.pointerEvents = "none"; 
    svgLayer.appendChild(visualPath);

    // ハンドルの描画（作成 または 更新）
    createOrUpdateHandle(conn, 'start', startPos, updatedIds);
    createOrUpdateHandle(conn, 'end', endPos, updatedIds);

    conn.waypoints.forEach((wp, idx) => {
        createOrUpdateWaypoint(conn, idx, wp, updatedIds);
    });
}

// ハンドルを作る、または位置を更新する関数
function createOrUpdateHandle(conn, type, pos, updatedIds) {
    // ユニークなIDを決める
    const id = `handle-${conn.id}-${type}`;
    updatedIds.add(id); // 「このIDは今回使ったよ」と記録

    let el = document.getElementById(id);
    
    // なければ作る
    if (!el) {
        el = document.createElement('div');
        el.id = id; // IDをつけるのが重要！
        el.className = 'line-handle';
        // タッチしやすくするCSS擬似要素のためにクラスはそのままでOK
        
        registerInteraction(el, { type: 'handle', connId: conn.id, handleType: type });
        container.appendChild(el);
    }

    // あれば（または作った直後に）位置だけ更新
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
}

// ウェイポイント（関節）を作る、または更新する関数
function createOrUpdateWaypoint(conn, index, pos, updatedIds) {
    const id = `waypoint-${conn.id}-${index}`;
    updatedIds.add(id);

    let el = document.getElementById(id);

    if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.className = 'waypoint';
        
        registerInteraction(el, { type: 'waypoint', connId: conn.id, index: index });
        
        // ダブルクリック削除
        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            conn.waypoints.splice(index, 1);
            render();
        });

        container.appendChild(el);
    }

    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
}

// ====== ツールバー機能 ======

// 人物追加ボタン
document.getElementById('btn-add-node').addEventListener('click', () => {
    // 画面中央あたりにランダムに配置
    const x = 100 + Math.random() * 200;
    const y = 100 + Math.random() * 200;
    
    const newNode = {
        id: generateId(),
        x: x,
        y: y,
        label: "新規人物"
    };
    
    nodes.push(newNode);
    
    // 追加したものを即選択状態にする
    selectNode(newNode.id);
    
    // 画面更新（initNodesを呼ぶと全部作り直してくれるように修正が必要ね、後述！）
    refreshScreen();
});

// 削除ボタン
document.getElementById('btn-delete').addEventListener('click', () => {
    if (!selectedId) return; // 何も選んでなければ何もしない

    // 1. ノード一覧から削除
    const nodeIndex = nodes.findIndex(n => n.id === selectedId);
    if (nodeIndex !== -1) {
        nodes.splice(nodeIndex, 1);
        
        // 2. そのノードに関連する線も全部削除（これ重要！）
        connections = connections.filter(conn => {
            // startかendのどちらかが削除対象のIDだったら、その線も消す
            const isRelated = (conn.start.nodeId === selectedId) || (conn.end.nodeId === selectedId);
            return !isRelated;
        });
        
        selectedId = null;
        refreshScreen();
    }
});

// 画面再描画ヘルパー（便利なので作ったわ）
function refreshScreen() {
    // コンテナ内のノードを一旦全部消して作り直す（簡易実装）
    // ※パフォーマンス的には差分更新がいいけど、今はこれで十分
    document.querySelectorAll('.node').forEach(el => el.remove());
    initNodes(); 
    render();
}


// script.js の後半部分をこれに置き換え！

// ====== インタラクション（タッチ対応版） ======

let longPressTimer = null; // 長押し判定用タイマー

function registerInteraction(element, info) {
    // マウス用
    element.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button !== 0) return; 
        handlePointerDown(e, info);
    });

    // タッチ用
    element.addEventListener('touchstart', (e) => {
        // e.stopPropagation(); // あえて止めないでおく（スクロール制御はhandlePointerDownで行う）
        handlePointerDown(e, info);
    }, { passive: false });
}

function handlePointerDown(e, info) {
    // ここで明確にログを出す！
    // console.log(`🔵 GRABBED [${info.type}]`, info);

    if (e.type === 'touchstart') e.preventDefault();

    const pos = getPointerPos(e);
    
    // 選択処理
    if (info.type === 'node') selectNode(info.id);

    // 長押しタイマー
    longPressTimer = setTimeout(() => {
        // console.log("⏰ Long Press Detected");
        // isDragging = false; // 今は無効化しておく
    }, 500);

    isDragging = true;
    dragInfo = info;
    currentDragTarget = e.target;
    
    // オフセット計算
    if (info.type === 'node') {
        // 人物：掴んだ位置をキープ
        const currentLeft = parseFloat(currentDragTarget.style.left) || 0;
        const currentTop = parseFloat(currentDragTarget.style.top) || 0;
        dragOffset.x = pos.x - currentLeft;
        dragOffset.y = pos.y - currentTop;
    } else {
        // 線・ハンドル：指の中心に吸い付ける（コンテナの左上座標を引く）
        const rect = container.getBoundingClientRect();
        dragOffset.x = rect.left;
        dragOffset.y = rect.top;
    }
}


function onLineClick(e, conn) {
    if (e.shiftKey) return; 

    // console.log("🖱️ Line Clicked"); // ログ追加

    const pos = getPointerPos(e);
    const rect = container.getBoundingClientRect();
    const clickX = pos.x - rect.left; 
    const clickY = pos.y - rect.top;

    const allPoints = [getPointPosition(conn.start)];
    conn.waypoints.forEach(wp => allPoints.push(wp));
    allPoints.push(getPointPosition(conn.end));

    let bestIndex = 0;
    let minDetour = Infinity;

    for (let i = 0; i < allPoints.length - 1; i++) {
        const A = allPoints[i];
        const B = allPoints[i+1];
        const distAC = Math.hypot(clickX - A.x, clickY - A.y);
        const distCB = Math.hypot(B.x - clickX, B.y - clickY);
        const distAB = Math.hypot(B.x - A.x, B.y - A.y);
        const detour = (distAC + distCB) - distAB;

        if (detour < minDetour) {
            minDetour = detour;
            bestIndex = i;
        }
    }
    
    conn.waypoints.splice(bestIndex, 0, { x: clickX, y: clickY });
    render();
}


// ====== グローバルイベント（マウス・タッチ共通） =====

// 動き（Move）
['mousemove', 'touchmove'].forEach(evtName => {
    window.addEventListener(evtName, (e) => {
        if (!isDragging) return;
        
        // コンソールがうるさくなりすぎるので移動ログはコメントアウト
        // console.log("MOVE"); 

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        if (e.type === 'touchmove') e.preventDefault();

        const pos = getPointerPos(e); 
        const targetX = pos.x - dragOffset.x;
        const targetY = pos.y - dragOffset.y;

        if (dragInfo.type === 'node') {
            const nodeEl = document.getElementById(dragInfo.id);
            nodeEl.style.left = targetX + 'px';
            nodeEl.style.top = targetY + 'px';

            const nodeData = nodes.find(n => n.id === dragInfo.id);
            if (nodeData) {
                nodeData.x = targetX;
                nodeData.y = targetY;
            }
            render();

        } else if (dragInfo.type === 'handle') {
            const conn = connections.find(c => c.id === dragInfo.connId);
            const snapTarget = findClosestAnchor(targetX, targetY);
            
            if (snapTarget) {
                snapGuide.style.display = 'block';
                snapGuide.style.left = snapTarget.x + 'px';
                snapGuide.style.top = snapTarget.y + 'px';
                conn[dragInfo.handleType] = { 
                    type: 'anchor', 
                    nodeId: snapTarget.nodeId, 
                    side: snapTarget.side, 
                    index: snapTarget.index 
                };
            } else {
                snapGuide.style.display = 'none';
                conn[dragInfo.handleType] = { type: 'point', x: targetX, y: targetY };
            }
            render();

        } else if (dragInfo.type === 'waypoint') {
            const conn = connections.find(c => c.id === dragInfo.connId);
            const wp = conn.waypoints[dragInfo.index];
            let finalX = targetX;
            let finalY = targetY;

            if (e.shiftKey) {
                // (直角維持ロジック省略なし)
                let prevData, nextData;
                if (dragInfo.index === 0) prevData = conn.start;
                else prevData = conn.waypoints[dragInfo.index - 1];

                if (dragInfo.index === conn.waypoints.length - 1) nextData = conn.end;
                else nextData = conn.waypoints[dragInfo.index + 1];

                const prevPos = getPointPosition(prevData);
                const nextPos = getPointPosition(nextData);
                const corner1 = { x: nextPos.x, y: prevPos.y };
                const corner2 = { x: prevPos.x, y: nextPos.y };
                const dist1 = Math.hypot(targetX - corner1.x, targetY - corner1.y);
                const dist2 = Math.hypot(targetX - corner2.x, targetY - corner2.y);
                if (dist1 < dist2) { finalX = corner1.x; finalY = corner1.y; }
                else { finalX = corner2.x; finalY = corner2.y; }
            }
            wp.x = finalX;
            wp.y = finalY;
            render();
        }
    }, { passive: false });
});

// 終了（End）
['mouseup', 'touchend'].forEach(evtName => {
    window.addEventListener(evtName, (e) => {
        if (isDragging) {
            // console.log(`👋 RELEASED [${evtName}]`); // ログ追加
        }

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        isDragging = false;
        dragInfo = null;
        if (snapGuide) snapGuide.style.display = 'none'; 
    });
});

// ★追加：タッチキャンセル（電話着信や3本指ジェスチャなどで中断された時）
window.addEventListener('touchcancel', (e) => {
    // console.log("🚫 TOUCH CANCELED"); // これが出たら原因はOSやブラウザ機能！
    isDragging = false;
    dragInfo = null;
    if (snapGuide) snapGuide.style.display = 'none'; 
});

// 背景操作
['mousedown', 'touchstart'].forEach(evtName => {
    container.addEventListener(evtName, (e) => {
        if (e.target === container || e.target === svgLayer) {
            // console.log("⬜ Background Clicked");
            selectNode(null);
        }
    });
});

// ====== アプリ起動 ======
initNodes();
render();
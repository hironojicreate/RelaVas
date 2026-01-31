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

// ====== 描画ロジック ======

function render() {
    svgLayer.innerHTML = '';
    document.querySelectorAll('.line-handle, .waypoint').forEach(el => el.remove());

    connections.forEach(conn => {
        drawConnection(conn);
    });
}

function drawConnection(conn) {
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

    const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hitPath.setAttribute("d", d);
    hitPath.setAttribute("class", "connection-hit-area");
    hitPath.onclick = (e) => onLineClick(e, conn);
    svgLayer.appendChild(hitPath);

    const visualPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    visualPath.setAttribute("d", d);
    visualPath.setAttribute("class", "connection-line");
    visualPath.style.pointerEvents = "none"; 
    svgLayer.appendChild(visualPath);

    createHandle(conn, 'start', startPos);
    createHandle(conn, 'end', endPos);

    conn.waypoints.forEach((wp, idx) => {
        createWaypointHandle(conn, idx, wp);
    });
}

function createHandle(conn, type, pos) {
    const el = document.createElement('div');
    el.className = 'line-handle';
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    

    registerInteraction(el, { type: 'handle', connId: conn.id, handleType: type });

    container.appendChild(el);
}

function createWaypointHandle(conn, index, pos) {
    const el = document.createElement('div');
    el.className = 'waypoint';
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    

    registerInteraction(el, { type: 'waypoint', connId: conn.id, index: index });
    el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        conn.waypoints.splice(index, 1);
        render();
    });

    container.appendChild(el);
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


// ====== インタラクション（タッチ対応版） ======

let longPressTimer = null; // 長押し判定用タイマー

// マウスダウンとタッチスタートをまとめて登録する関数
function registerInteraction(element, info) {
    // マウス用
    element.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        // 左クリック(0)以外は無視（右クリックはcontextmenuイベントで扱うため）
        if (e.button !== 0) return; 
        handlePointerDown(e, info);
    });

    // タッチ用
    element.addEventListener('touchstart', (e) => {
        // e.stopPropagation(); // タッチはスクロール判定もあるので安易に止めない方がいい場合もあるけど、今回は要素掴むのでOK
        handlePointerDown(e, info);
    }, { passive: false }); // passive: false は preventDefault() を呼ぶために必要
}

// 実際のドラッグ開始・長押し判定ロジック
function handlePointerDown(e, info) {
    // タッチの場合、画面スクロールを防ぐ
    if (e.type === 'touchstart') e.preventDefault();

    const pos = getPointerPos(e);
    
    // 選択処理（ノードの場合）
    if (info.type === 'node') {
        selectNode(info.id);
    }

    // 長押しタイマー開始（500ms動かなかったら長押しとみなす）
    longPressTimer = setTimeout(() => {
        console.log("長押し検知！将来ここにメニューを出すの！");
        // 長押し成立したらドラッグはキャンセル扱いにすると良心的かも
        isDragging = false; 
    }, 500);

    // ドラッグ開始準備
    isDragging = true;
    dragInfo = info;
    currentDragTarget = e.target;
    
    dragOffset.x = 0;
    dragOffset.y = 0;

    // ノードの場合はオフセット計算
    if (info.type === 'node') {
        const el = document.getElementById(info.id);
        dragOffset.x = pos.x - parseFloat(el.style.left);
        dragOffset.y = pos.y - parseFloat(el.style.top);
    }
}

function onLineClick(e, conn) {
    if (e.shiftKey) return; 

    const pos = getPointerPos(e);
    const rect = container.getBoundingClientRect();
    const clickX = pos.x - rect.left; 
    const clickY = pos.y - rect.top;

    // 1. 全座標リスト作成（始点 -> 中継点たち -> 終点）
    const allPoints = [getPointPosition(conn.start)];
    conn.waypoints.forEach(wp => allPoints.push(wp));
    allPoints.push(getPointPosition(conn.end));

    // 2. 最適な挿入位置を探す
    // 「A→クリック地点→B」の距離が、「A→B」の距離と比べてどれだけ遠回りか（Detour）を計算
    // 遠回りが一番少ない（＝ほぼ線上にある）セグメントが正解なの！
    let bestIndex = 0;
    let minDetour = Infinity;

    for (let i = 0; i < allPoints.length - 1; i++) {
        const A = allPoints[i];
        const B = allPoints[i+1];

        // 各点間の距離計算
        const distAC = Math.hypot(clickX - A.x, clickY - A.y);
        const distCB = Math.hypot(B.x - clickX, B.y - clickY);
        const distAB = Math.hypot(B.x - A.x, B.y - A.y);

        // 遠回り度 (0に近いほど、その線分上にいる)
        const detour = (distAC + distCB) - distAB;

        if (detour < minDetour) {
            minDetour = detour;
            bestIndex = i;
        }
    }
    
    // 計算した正しい場所に挿入！
    conn.waypoints.splice(bestIndex, 0, { x: clickX, y: clickY });
    render();
}



// ====== グローバルイベント（マウス・タッチ共通） ======

// 動き（Move）
['mousemove', 'touchmove'].forEach(evtName => {
    window.addEventListener(evtName, (e) => {
        if (!isDragging) return;
        
        // 動いたら長押しタイマーはキャンセル！
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        // タッチ移動中はスクロール禁止
        if (e.type === 'touchmove') e.preventDefault();

        const pos = getPointerPos(e); // ★共通化した関数を使う
        const mouseX = pos.x;
        const mouseY = pos.y;

        if (dragInfo.type === 'node') {
            // ノード移動
            const nodeEl = document.getElementById(dragInfo.id);
            const newX = mouseX - dragOffset.x;
            const newY = mouseY - dragOffset.y;
            
            nodeEl.style.left = newX + 'px';
            nodeEl.style.top = newY + 'px';

            const nodeData = nodes.find(n => n.id === dragInfo.id);
            if (nodeData) {
                nodeData.x = newX;
                nodeData.y = newY;
            }
            render();

        } else if (dragInfo.type === 'handle') {
            // ハンドル移動
            const conn = connections.find(c => c.id === dragInfo.connId);
            const snapTarget = findClosestAnchor(mouseX, mouseY);
            
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
                conn[dragInfo.handleType] = { type: 'point', x: mouseX, y: mouseY };
            }
            render();

        } else if (dragInfo.type === 'waypoint') {
            // ウェイポイント移動
            const conn = connections.find(c => c.id === dragInfo.connId);
            const wp = conn.waypoints[dragInfo.index];

            let targetX = mouseX;
            let targetY = mouseY;

            // Shiftキー判定（タッチにはShiftがないので、将来ボタンで対応する？）
            if (e.shiftKey) {
                // ... (既存の直角ロジックそのまま) ...
                // ※長くなるので省略してないけど、以前のロジックをここに維持してね！
                // 変更点は mouseX/Y を使うところだけよ。
                
                let prevData, nextData;
                if (dragInfo.index === 0) prevData = conn.start;
                else prevData = conn.waypoints[dragInfo.index - 1];

                if (dragInfo.index === conn.waypoints.length - 1) nextData = conn.end;
                else nextData = conn.waypoints[dragInfo.index + 1];

                const prevPos = getPointPosition(prevData);
                const nextPos = getPointPosition(nextData);
                
                const corner1 = { x: nextPos.x, y: prevPos.y };
                const corner2 = { x: prevPos.x, y: nextPos.y };

                const dist1 = Math.hypot(mouseX - corner1.x, mouseY - corner1.y);
                const dist2 = Math.hypot(mouseX - corner2.x, mouseY - corner2.y);

                if (dist1 < dist2) { targetX = corner1.x; targetY = corner1.y; }
                else { targetX = corner2.x; targetY = corner2.y; }
            }
            wp.x = targetX;
            wp.y = targetY;
            render();
        }
    }, { passive: false }); // touchmoveでpreventDefaultするために必要
});

// 終了（End）
['mouseup', 'touchend'].forEach(evtName => {
    window.addEventListener(evtName, () => {
        // 指を離したときもタイマーキャンセル
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        isDragging = false;
        dragInfo = null;
        if (snapGuide) snapGuide.style.display = 'none'; 
    });
});

// キャンバスの背景操作（マウス・タッチ共通）
['mousedown', 'touchstart'].forEach(evtName => {
    container.addEventListener(evtName, (e) => {
        // クリックされたのが背景（コンテナやSVG）そのものだったら解除
        if (e.target === container || e.target === svgLayer) {
            selectNode(null);
        }
    });
});

// ====== アプリ起動 ======

// 最初にノードを作って、その後に線を描画するの！
initNodes();
render();
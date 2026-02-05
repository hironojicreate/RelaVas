// script.js

// ====== 設定・定数 ======
const ANCHOR_COUNT = 21;
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

// ====== ★追加：便利関数（Hex色と透過率を混ぜる） ======
function hexToRgba(hex, opacity100) {
    // hexが透明なら透明を返す
    if (hex === 'transparent') return 'transparent';

    // #RRGGBB 形式を想定
    let c = hex.substring(1).split('');
    if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    c = '0x' + c.join('');

    // 透過率 (0-100) を (0.0-1.0) に変換
    const a = parseInt(opacity100) / 100;

    return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + a + ')';
}

// 2. ノードデータ（A4ガイド対応：中央配置版）
let nodes = [
    // 1. リラ（左上）- 60px正方形
    {
        id: "node-a", x: 400, y: 200, // ガイド中央へ移動 (+250, +100)
        label: "リラ",
        style: {
            width: 60, height: 60, backgroundColor: "#ffffff",
            borderRadius: 10
         },
        text: { x: 30, y: 35 }
    },
    // 2. ヴァス（右下）- 60px正方形
    {
        id: "node-b", x: 650, y: 340, // ガイド中央へ移動
        label: "ヴァス",
        style: {
            width: 60, height: 60, backgroundColor: "#ffffff",
            borderRadius: 10
         },
        text: { x: 30, y: 35 }
    },
    // 3. リラヴァス（リラの下・ヴァスの左）- 70px正方形
    {
        id: "node-c", x: 395, y: 330, // ガイド中央へ移動
        label: "リラヴァス\n世界を見守る者",
        style: {
            width: 70, height: 70, // ヒロさんの設定を維持
            backgroundColor: "#e1bee7",
            borderColor: '#333333',
            borderWidth: 2,
            borderRadius: 10
        },
        text: {
            x: 35, y: 72, // ★微調整：70pxの真ん中は35なので合わせました
            color: '#333333',
            fontSize: 13
        }
    },

    // 4. チュートリアル説明書
    {
        id: "tutorial-box",
        type: 'box',
        x: 360, y: 470, // ガイド中央へ移動
        label: "【基本操作】\n\n📝 部品編集: 右クリック\n🖐️ キャンバス移動: 背景ドラッグ\n📦 まとめて選択: 右クリック＋ドラッグ\n\n✨ 便利技:\n・線クリック: 曲がり角追加\n・線ダブルクリック: 曲がり角削除\n・Shiftドラッグ: 直角配置",
        style: {
            width: 380, height: 180,
            borderColor: '#007bff',
            borderWidth: 2,
            borderStyle: 'dashed',
            backgroundColor: '#f0f7ff',
            opacity: 90,
            boxShadow: 'none',
            borderRadius: 10
        },
        text: {
            color: '#333333',
            fontSize: 14,
            fontWeight: 'normal',
            align: 'left',
            bgColor: 'transparent',
            x: 190, y: 90
        }
    },
    // 5. タイトルボックス
    {
        id: "title-box",
        type: 'box',
        x: 430, y: 420, // ガイド中央へ移動
        label: "矢印を動かしてみよう！",
        style: {
            width: 240, height: 50,
            borderColor: 'transparent',
            backgroundColor: '#fff176',
            opacity: 100,
            boxShadow: '0 3px 5px rgba(0,0,0,0.1)',
            borderRadius: 10
        },
        text: {
            color: '#e65100',
            fontSize: 16,
            fontWeight: 'bold',
            align: 'center',
            bgColor: 'transparent',
            x: 120, y: 25
        }
    }
];

// 線データ
let connections = [
    {
        id: "conn-tutorial",
        start: { type: "anchor", nodeId: "node-a", side: "right", index: 10 },
        end: { type: "anchor", nodeId: "node-b", side: "top", index: 10 },
        waypoints: [
            // リラのY中心(200+30=230) と ヴァスのX中心(650+30=680) の交点
            { x: 680, y: 230 }
        ],
        style: {
            color: '#555',
            width: 2,
            dash: 'solid',
            arrow: 'both'
        },
        label: {
            text: "協力関係",
            fontSize: 12,
            color: '#333',
            bgColor: '#ffffff',
            offsetX: 0,
            offsetY: -60 // 位置をリセット（直角線の真上に来るように）
        }
    }
];

// 4. アプリ全体の保存用設定
let appSettings = {
    backgroundColor: '#f0f2f5', // 初期色
    showGuide: true,
    title: '人物相関図作成アプリ'
};

// ====== グローバル変数（追加分） ======

const canvasContainer = document.getElementById('canvas-container'); // 外枠
const container = document.getElementById('world-layer'); // ★変更：中身（これが動く）
const svgLayer = document.getElementById('svg-layer');
const snapGuide = document.getElementById('snap-guide');

// ★追加：ビューポート（視点）管理
let viewport = { x: 0, y: 0, scale: 1 };
let isPanning = false; // パン操作中フラグ
let panStart = { x: 0, y: 0 };
let isDragging = false;
let currentDragTarget = null;
let dragInfo = null;
let dragOffset = { x: 0, y: 0 };
let selectedId = null; // 今選択されているノードのID（なければnull）
let selectedConnId = null;

let selectedNodeIds = new Set(); // 複数選択用のIDリスト（Setを使うと重複しないの！）
let isSelecting = false;         // 範囲選択中かどうかのフラグ
let selectionStart = { x: 0, y: 0 }; // 範囲選択の開始位置
let selectionBoxEl = null;       // 範囲選択の見た目要素
let selectedConnIds = new Set(); // ★追加：複数の矢印IDを管理する変数

// ★追加：複数選択リサイズ用の変数
let resizeGroupInitialState = new Map(); // 初期状態を保存する地図
let resizeAnchorPoint = { x: 0, y: 0 };  // 拡大縮小の基準点（宇宙の中心！）

// ★さらに追加：矢印のリサイズ用
let resizeConnInitialState = new Map();


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

// createNodeElement 関数の一部書き換え

function createNodeElement(nodeData) {
    const el = document.createElement('div');
    el.className = 'node';
    el.id = nodeData.id;
    if (nodeData.id === selectedId) el.classList.add('selected');

    // 位置とサイズ
    el.style.left = nodeData.x + 'px';
    el.style.top = nodeData.y + 'px';
    const w = nodeData.style?.width || 120;
    const h = nodeData.style?.height || 60;
    el.style.width = w + 'px';
    el.style.height = h + 'px';

    // 枠線（ここはそのまま）
    el.style.borderColor = nodeData.style?.borderColor || '#333333';
    el.style.borderWidth = (nodeData.style?.borderWidth !== undefined ? nodeData.style.borderWidth : 2) + 'px';
    el.style.borderStyle = nodeData.style?.borderStyle || 'solid';

    // 塗りの透過 (RGBA変換)
    // 以前の el.style.opacity = ... は廃止！
    const bgCol = nodeData.style?.backgroundColor || '#ffffff';
    const op = nodeData.style?.opacity !== undefined ? nodeData.style.opacity : 100;
    // ヘルパー関数を使って「半透明の色」を作ってセットするの
    el.style.backgroundColor = hexToRgba(bgCol, op);

    // 1. 幅と高さを取得（style属性からだとまだ設定前かもしれないのでデータから取る）
    const wVal = nodeData.style?.width || 120;
    const hVal = nodeData.style?.height || 60;
    
    // 2. 角丸の計算 (初期値10)
    const rPercent = nodeData.style?.borderRadius !== undefined ? nodeData.style.borderRadius : 10;
    const maxRadius = Math.min(wVal, hVal) / 2;
    const rPx = (rPercent / 100) * maxRadius;
    
    el.style.borderRadius = rPx + 'px';

    // 影
    const boxShd = nodeData.style?.boxShadow || 'none';
    if (boxShd === 'black') el.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)';
    else if (boxShd === 'white') el.style.boxShadow = '0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.4)';
    else el.style.boxShadow = 'none';

    // ★新規：背景画像レイヤーを作成
    const imgLayer = document.createElement('div');
    imgLayer.className = 'node-bg-image';
    imgLayer.id = 'img-' + nodeData.id; // IDをつけておくと後で探しやすい
    
    const bgImg = nodeData.style?.backgroundImage || 'none';
    const imgOp = nodeData.style?.imageOpacity !== undefined ? nodeData.style.imageOpacity : 100; // 画像用透過率
    
    imgLayer.style.backgroundImage = bgImg;
    imgLayer.style.opacity = imgOp / 100; // 画像だけ薄くする
    
    el.appendChild(imgLayer); // ノードに追加

    // --- 2. リサイズハンドル (そのまま) ---
    const directions = ['nw', 'ne', 'sw', 'se'];
    directions.forEach(dir => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${dir}`;
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation(); e.preventDefault();
            startResizeNode(e, nodeData.id, dir);
        });
        el.appendChild(handle);
    });

    // --- 3. テキスト (そのまま) ---
    const labelSpan = document.createElement('span');
    labelSpan.className = 'node-label-real';
    labelSpan.id = 'label-' + nodeData.id;
    labelSpan.innerText = nodeData.label;
    // ...(テキストスタイルの設定は既存のままでOK)...
    // ↓ コピペ用（省略せずに書くなら既存のコードを使ってね）
    labelSpan.style.color = nodeData.text?.color || '#333333';
    labelSpan.style.fontSize = (nodeData.text?.fontSize || 14) + 'px';
    labelSpan.style.fontWeight = nodeData.text?.fontWeight || 'normal';
    labelSpan.style.textAlign = nodeData.text?.align || 'center';
    const textShd = nodeData.text?.shadow || 'none';
    if (textShd === 'black') labelSpan.style.textShadow = '1px 1px 2px rgba(0,0,0,0.6)';
    else if (textShd === 'white') labelSpan.style.textShadow = '1px 1px 2px white';
    else labelSpan.style.textShadow = 'none';
    const txtBg = nodeData.text?.bgColor || 'transparent';
    labelSpan.style.backgroundColor = txtBg;
    if (txtBg !== 'transparent') { labelSpan.style.padding = '2px 4px'; labelSpan.style.borderRadius = '4px'; }
    const tx = nodeData.text?.x !== undefined ? nodeData.text.x : w / 2;
    const ty = nodeData.text?.y !== undefined ? nodeData.text.y : h / 2;
    labelSpan.style.left = tx + 'px';
    labelSpan.style.top = ty + 'px';

    registerInteraction(labelSpan, { type: 'node-text', id: nodeData.id });
    el.appendChild(labelSpan);

    // --- 4. ドラッグ＆ドロップ (少し修正：imgLayerに対して反映する必要あり) ---
    // (createNodeElement内のドロップ処理も、imgLayerを書き換えるように修正が必要だけど
    //  refreshNodeStyle を呼べば解決するから、そのままで大丈夫！)

    el.addEventListener('dragover', (e) => { e.preventDefault(); }); // 簡易化
    el.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (selectedId !== nodeData.id) return;
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                try {
                    const base64 = await readImageFile(file);
                    if (!nodeData.style) nodeData.style = {};
                    nodeData.style.backgroundImage = `url('${base64}')`;
                    refreshNodeStyle(nodeData); // これでimgLayerが更新される
                    if (editingNodeId === nodeData.id) updatePreview(nodeData);
                } catch (err) { console.error(err); }
            }
        }
    });

    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        selectNode(nodeData.id);
        openContextMenu(nodeData, 'node', e.clientX, e.clientY);
    });
    registerInteraction(el, { type: 'node', id: nodeData.id });
    container.appendChild(el);
}

// ★追加：線を選択する関数
function selectConnection(id, addToSelection = false) {
    // 追加選択モードじゃないなら、一旦リセット
    if (!addToSelection) {
        selectedConnIds.clear();
        selectedNodeIds.clear(); // 線を選ぶときはノード選択も解除するのが一般的
        document.querySelectorAll('.node.selected').forEach(el => el.classList.remove('selected'));
        selectedId = null;
    }

    if (id) {
        selectedConnIds.add(id);
        selectedConnId = id; // プロパティパネル用（最後の1つ）
    } else {
        selectedConnId = null;
    }

    render(); // 画面更新
}

// selectNode 関数（書き換え）

function selectNode(id, addToSelection = false) {
    // addToSelection が false (通常クリック) なら、他の選択を解除
    if (!addToSelection) {
        selectedNodeIds.clear();

        // ★修正ポイント：線の選択リスト（Set）もここで確実に消すの！
        selectedConnIds.clear();
        selectedConnId = null;

        // DOM上のクラスも全部消す
        document.querySelectorAll('.node.selected').forEach(el => el.classList.remove('selected'));
    }

    selectedId = id; // プロパティパネル用（最後に選んだやつ）

    if (id) {
        // ★修正ポイント：上で消したから、ここの if (!addToSelection) selectedConnId = null; は不要になったわ

        selectedNodeIds.add(id);
        const el = document.getElementById(id);
        if (el) el.classList.add('selected');
    }

    render(); // 線の選択状態などを更新
}


// ====== プレビュー内テキストのドラッグ ======

const previewText = document.getElementById('preview-text');
let isTextDragging = false;
let textDragOffset = { x: 0, y: 0 }; // ★追加：ズレを記録する変数

previewText.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    isTextDragging = true;

    // ★追加：掴んだ瞬間の「ズレ」を計算する
    const previewBox = document.getElementById('preview-box');
    const boxRect = previewBox.getBoundingClientRect();

    // マウスの「箱の中での座標」
    const mouseInBoxX = e.clientX - boxRect.left;
    const mouseInBoxY = e.clientY - boxRect.top;

    // 文字の「現在の座標」
    // (style.left が空のときは真ん中にあるとみなす)
    const currentTextX = parseFloat(previewText.style.left) || (boxRect.width / 2);
    const currentTextY = parseFloat(previewText.style.top) || (boxRect.height / 2);

    // ズレ ＝ マウス位置 － 文字位置
    textDragOffset.x = mouseInBoxX - currentTextX;
    textDragOffset.y = mouseInBoxY - currentTextY;
});

window.addEventListener('mousemove', (e) => {
    if (!isTextDragging || !editingNodeId) return;

    e.preventDefault();

    const previewBox = document.getElementById('preview-box');
    const boxRect = previewBox.getBoundingClientRect();

    // 現在のマウス位置
    const mouseInBoxX = e.clientX - boxRect.left;
    const mouseInBoxY = e.clientY - boxRect.top;

    // ★修正：マウス位置から「ズレ」を引いて、元の中心位置を割り出す
    let newX = mouseInBoxX - textDragOffset.x;
    let newY = mouseInBoxY - textDragOffset.y;

    updateNodeTextPosition(newX, newY);
});

window.addEventListener('mouseup', () => {
    if (isTextDragging) {
        recordHistory();
    }
    isTextDragging = false;
});

// テキスト位置更新の共通関数
function updateNodeTextPosition(x, y) {
    const node = nodes.find(n => n.id === editingNodeId);
    if (!node) return;

    // データ更新
    if (!node.text) node.text = {};
    node.text.x = x;
    node.text.y = y;

    // 1. プレビューの文字を動かす
    const pText = document.getElementById('preview-text');
    pText.style.left = x + 'px';
    pText.style.top = y + 'px';

    // 2. 本物のノードの文字を動かす
    // さっき createNodeElement で作った span を探して動かすの！
    const realLabel = document.getElementById('label-' + editingNodeId);
    if (realLabel) {
        realLabel.style.left = x + 'px';
        realLabel.style.top = y + 'px';
    }
}

// ====== 仮想アンカー計算ロジック ======

function getAnchorCoordinate(nodeId, side, index) {
    const node = document.getElementById(nodeId);
    if (!node) return { x: 0, y: 0 };

    // ★修正ポイント：getBoundingClientRect() は「見た目のサイズ」だからNG！
    // 代わりに style.width / height から「本当のサイズ」を取得するの。
    const width = parseFloat(node.style.width);
    const height = parseFloat(node.style.height);

    // 位置も style から取得（これは元々OKだった部分）
    const left = parseFloat(node.style.left);
    const top = parseFloat(node.style.top);

    const stepX = width / (ANCHOR_COUNT - 1);
    const stepY = height / (ANCHOR_COUNT - 1);

    let x = 0, y = 0;

    switch (side) {
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

// 近くのアンカーを探す関数（こちらもズーム対応修正！）
function findClosestAnchor(x, y) {
    let closest = null;
    let minDist = SNAP_DISTANCE;

    const domNodes = document.querySelectorAll('.node');
    domNodes.forEach(node => {
        const nodeId = node.id;

        // ★修正ポイント：ここも style からサイズを取得！
        // これでズーム中でも吸着範囲が正しく計算されるわ
        const width = parseFloat(node.style.width);
        const height = parseFloat(node.style.height);

        const nLeft = parseFloat(node.style.left);
        const nTop = parseFloat(node.style.top);

        // 簡易ヒットチェック（範囲外なら計算スキップ）
        const buffer = 50;
        if (x < nLeft - buffer || x > nLeft + width + buffer ||
            y < nTop - buffer || y > nTop + height + buffer) {
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


// ====== カラーパレット定義 ======

// 0番目は透明（固定）、1〜8番目はユーザーが変更可能な色
let globalPaletteColors = [
    'transparent',
    '#ffffff', '#000000',
    '#e74c3c', '#3498db', '#2ecc71',
    '#f1c40f', '#e67e22', '#9b59b6'
];

// メニュー内のパレットボタンを生成する関数
function initColorPalettes() {
    // 新しいHTMLのIDに合わせた設定リスト
    const normalPalettes = [
        { id: 'palette-text', target: 'text' },
        { id: 'palette-text-bg', target: 'text-bg' },
        { id: 'palette-bg', target: 'bg' },         // ★新規：背景色
        { id: 'palette-border', target: 'border' }, // 枠線の色
        
        // 矢印用
        { id: 'palette-conn-stroke', target: 'conn-stroke' },
        { id: 'palette-conn-text', target: 'conn-text' },
        { id: 'palette-conn-bg', target: 'conn-bg' }
    ];

    normalPalettes.forEach(p => {
        const container = document.getElementById(p.id);
        if (!container) return;
        container.innerHTML = '';

        // 1. カラーボタン（グローバル配列から生成）
        globalPaletteColors.forEach((color, index) => {
            const btn = document.createElement('div');
            btn.className = 'color-btn';

            // 透明(index 0)の処理
            if (color === 'transparent') {
                btn.classList.add('transparent');
            } else {
                btn.style.backgroundColor = color;

                // ドロップを受け付ける処理（透明以外）
                btn.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    btn.style.transform = 'scale(1.2)';
                });
                btn.addEventListener('dragleave', () => {
                    btn.style.transform = '';
                });
                btn.addEventListener('drop', (e) => {
                    e.preventDefault();
                    btn.style.transform = '';

                    const newColor = e.dataTransfer.getData('text/plain');
                    if (newColor) {
                        // データを更新
                        globalPaletteColors[index] = newColor;
                        // 全パレットを再描画して同期！
                        initColorPalettes();
                    }
                });
            }

            btn.dataset.color = color;
            btn.addEventListener('click', () => {
                applyColor(p.target, color);
            });
            container.appendChild(btn);
        });

        // 2. カスタムカラー入力エリア（ドラッグ元！）
        const customDiv = document.createElement('div');
        customDiv.style.gridColumn = "span 3";
        customDiv.style.display = "flex";
        customDiv.style.alignItems = "center";
        customDiv.style.gap = "4px";

        customDiv.setAttribute('draggable', 'true');
        customDiv.style.cursor = 'grab';

        customDiv.addEventListener('dragstart', (e) => {
            const pickerVal = customDiv.querySelector('input[type="color"]').value;
            e.dataTransfer.setData('text/plain', pickerVal);
            e.dataTransfer.effectAllowed = 'copy';
        });

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.style.width = '24px';
        picker.style.height = '24px';
        picker.style.padding = '0';
        picker.style.border = 'none';
        picker.style.cursor = 'pointer';
        picker.style.backgroundColor = 'transparent';
        picker.value = '#333333';

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.placeholder = '#HEX';
        textInput.style.flex = '1';
        textInput.style.width = '0';
        textInput.style.fontSize = '11px';
        textInput.style.padding = '2px 4px';
        textInput.style.border = '1px solid #ddd';
        textInput.style.borderRadius = '3px';
        textInput.style.textAlign = 'center';
        textInput.style.color = '#555';

        picker.addEventListener('input', (e) => {
            const val = e.target.value;
            textInput.value = val;
            applyColor(p.target, val);
        });

        textInput.addEventListener('change', (e) => {
            let val = e.target.value;
            if (val && !val.startsWith('#')) val = '#' + val;
            if (/^#([0-9A-F]{3}){1,2}$/i.test(val)) {
                picker.value = val;
                applyColor(p.target, val);
            }
        });

        customDiv.appendChild(picker);
        customDiv.appendChild(textInput);
        container.appendChild(customDiv);
    });

    // ★ここにあったトグルボタンの処理は関数の外に出したの！
}

// ====== タブ切り替え制御 ======
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // 1. ボタンの見た目更新
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // 2. 中身の切り替え
        const targetId = btn.dataset.target;
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
    });
});

// ====== 新しいパレットの初期化設定 ======
// initColorPalettes関数の中身を、新しいIDに合わせて少し修正が必要よ。
// 以下のリストを使って初期化するように修正してね。

/* function initColorPalettes() の中の normalPalettes 配列をこれに置き換えて！
const normalPalettes = [
    { id: 'palette-text', target: 'text' },
    { id: 'palette-text-bg', target: 'text-bg' },
    { id: 'palette-bg', target: 'bg' },         // ★新規（背景色）
    { id: 'palette-border', target: 'border' },
    
    // 矢印用
    { id: 'palette-conn-stroke', target: 'conn-stroke' },
    { id: 'palette-conn-text', target: 'conn-text' },
    { id: 'palette-conn-bg', target: 'conn-bg' }
];
*/

// ★そして applyColor 関数にも、新しい 'bg' ターゲットの処理を追加！
/*
else if (target === 'bg') {
    if (!node.style) node.style = {};
    node.style.backgroundColor = color;
    updatePaletteActiveState('palette-bg', color);
    refreshNodeStyle(node);
}
*/

// 3. トグルボタンのイベント設定（ここは1回だけ実行されればOKなので、関数の外に出す！）
document.querySelectorAll('.toggle-group > button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const group = btn.parentElement;
        const val = btn.dataset.val;

        // 人物用の影
        if (group.id === 'toggle-box-shadow') applyShadow('box', val);
        if (group.id === 'toggle-text-shadow') applyShadow('text', val);

        // 線用の設定
        if (group.id === 'preset-conn-width') {
            updateConnProperty('style', 'width', parseInt(val));
            updateToggleActiveState('preset-conn-width', val);
        }
        if (group.id === 'toggle-conn-dash') {
            updateConnProperty('style', 'dash', val);
            updateToggleActiveState('toggle-conn-dash', val);
        }
        if (group.id === 'toggle-conn-arrow') {
            updateConnProperty('style', 'arrow', val);
            updateToggleActiveState('toggle-conn-arrow', val);
        }
        if (group.id === 'toggle-conn-vertical') {
            updateConnProperty('label', 'isVertical', (val === 'vertical'));
            updateToggleActiveState('toggle-conn-vertical', val);
        }
        if (group.id === 'preset-conn-font-size') {
            document.getElementById('input-conn-font-size').value = val;
            updateConnProperty('label', 'fontSize', parseInt(val));
            updateToggleActiveState('preset-conn-font-size', val);
        }

        if (group.id === 'preset-border-width') {
            document.getElementById('input-border-width').value = val;
            updateNodeProperty('style', 'borderWidth', parseInt(val));
            updateToggleActiveState('preset-border-width', val);
        }
        if (group.id === 'preset-font-size') {
            document.getElementById('input-font-size').value = val;
            updateNodeProperty('text', 'fontSize', parseInt(val));
            updateToggleActiveState('preset-font-size', val);
        }
        recordHistory();
    });
});

// アプリ起動時にパレットを作る！
initColorPalettes();

// ====== 画像アップロード制御 ======

const inputImage = document.getElementById('input-image-file');
const btnUpload = document.getElementById('btn-upload-image');
const btnRemoveImg = document.getElementById('btn-remove-image');

// ボタンを押したら、隠しinputをクリックしたことにする
btnUpload.addEventListener('click', () => {
    inputImage.click();
});

// ファイルが選ばれたら読み込む
inputImage.addEventListener('change', async (e) => {
    if (!editingNodeId) return;
    const file = e.target.files[0];
    if (!file) return;

    try {
        const base64 = await readImageFile(file);
        const node = nodes.find(n => n.id === editingNodeId);
        if (node) {
            if (!node.style) node.style = {};
            node.style.backgroundImage = `url('${base64}')`;

            refreshNodeStyle(node);
            updatePreview(node);

            // inputをクリア（同じファイルを再選択できるように）
            inputImage.value = '';
        }
    } catch (err) {
        console.error(err);
    }
});

// 削除ボタン
btnRemoveImg.addEventListener('click', () => {
    if (!editingNodeId) return;
    const node = nodes.find(n => n.id === editingNodeId);
    if (node && node.style) {
        node.style.backgroundImage = 'none';
        refreshNodeStyle(node);
        updatePreview(node);
    }
});


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


// 線を描画する関数
// drawConnection 関数（矢印ヒット判定修正版）
function drawConnection(conn, updatedIds) {
    // 1. 基本座標
    let startPos = (conn.start.type === 'anchor')
        ? getAnchorCoordinate(conn.start.nodeId, conn.start.side, conn.start.index)
        : { x: conn.start.x, y: conn.start.y };

    let endPos = (conn.end.type === 'anchor')
        ? getAnchorCoordinate(conn.end.nodeId, conn.end.side, conn.end.index)
        : { x: conn.end.x, y: conn.end.y };

    // --- スタイル計算 ---
    const style = conn.style || { color: '#555', width: 2, dash: 'solid', arrow: 'none' };
    const w = style.width || 2;

    // 矢印サイズ計算
    const arrowBaseSize = 12 + (w * 1.5);
    const arrowLen = arrowBaseSize * 1.3;
    const gapSize = arrowLen + 6;
    const marginSize = 6;

// 始点（start）側の調整
    // 次の点（経由点があればそれ、なければ終点）に向かって隙間を空ける
    const nextPoint = (conn.waypoints.length > 0) ? conn.waypoints[0] : endPos;
    
    if (style.arrow === 'start' || style.arrow === 'both') {
        // 矢印があるなら、矢印分＋ゆとりを空ける
        startPos = movePointTowards(startPos, nextPoint, gapSize);
    } else {
        // ★ここが新機能！矢印がなくても、少しだけ（marginSize分）離す！
        startPos = movePointTowards(startPos, nextPoint, marginSize);
    }

    // 終点（end）側の調整
    // 前の点（経由点があればそれ、なければ始点）に向かって隙間を空ける
    const prevPoint = (conn.waypoints.length > 0) ? conn.waypoints[conn.waypoints.length - 1] : startPos;
    
    if (style.arrow === 'end' || style.arrow === 'both') {
        endPos = movePointTowards(endPos, prevPoint, gapSize);
    } else {
        // ★ここも新機能！矢印がなくても離す！
        endPos = movePointTowards(endPos, prevPoint, marginSize);
    }

    // 2. パスデータ
    let d = `M ${startPos.x} ${startPos.y}`;
    conn.waypoints.forEach(wp => { d += ` L ${wp.x} ${wp.y}`; });
    d += ` L ${endPos.x} ${endPos.y}`;

    // 3. マーカー定義（見た目用のみ！）
    const isSelected = (conn.id === selectedConnId || selectedConnIds.has(conn.id));
    const markerColor = isSelected ? '#007bff' : (style.color || '#555');
    const markerEndId = `marker-end-${conn.id}`;
    const markerStartId = `marker-start-${conn.id}`;

    let defs = svgLayer.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        svgLayer.insertBefore(defs, svgLayer.firstChild);
    }

    // 終点矢印（→）の定義
    let markerEnd = document.getElementById(markerEndId);
    if (!markerEnd) {
        markerEnd = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        markerEnd.id = markerEndId;
        markerEnd.setAttribute("markerUnits", "userSpaceOnUse");
        markerEnd.setAttribute("orient", "auto");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        markerEnd.appendChild(path);
        defs.appendChild(markerEnd);
    }
    markerEnd.setAttribute("markerWidth", arrowLen + 2);
    markerEnd.setAttribute("markerHeight", arrowBaseSize);
    markerEnd.setAttribute("refX", "-1");
    markerEnd.setAttribute("refY", arrowBaseSize / 2);
    markerEnd.querySelector('path').setAttribute("d",
        `M0,0 L0,${arrowBaseSize} L${arrowLen},${arrowBaseSize / 2} z`
    );
    markerEnd.querySelector('path').setAttribute("fill", markerColor);


    // 始点矢印（←）の定義
    let markerStart = document.getElementById(markerStartId);
    if (!markerStart) {
        markerStart = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        markerStart.id = markerStartId;
        markerStart.setAttribute("markerUnits", "userSpaceOnUse");
        markerStart.setAttribute("orient", "auto");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        markerStart.appendChild(path);
        defs.appendChild(markerStart);
    }
    markerStart.setAttribute("markerWidth", arrowLen + 2);
    markerStart.setAttribute("markerHeight", arrowBaseSize);
    markerStart.setAttribute("refX", arrowLen + 1);
    markerStart.setAttribute("refY", arrowBaseSize / 2);
    markerStart.querySelector('path').setAttribute("d",
        `M${arrowLen},0 L${arrowLen},${arrowBaseSize} L0,${arrowBaseSize / 2} z`
    );
    markerStart.querySelector('path').setAttribute("fill", markerColor);


    // 4. 透明な当たり判定（hitPath）
    // ★修正：透明マーカーは廃止！純粋に「太い線」として機能させるわ
    const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hitPath.setAttribute("d", d);
    hitPath.setAttribute("class", "connection-hit-area");
    hitPath.style.cursor = isSelected ? 'crosshair' : 'pointer';

    // イベント登録
    // hitPath.onclick = (e) => onLineClick(e, conn);
    hitPath.onmousedown = (e) => handleLineMouseDown(e, conn);
    hitPath.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        selectConnection(conn.id);
        openContextMenu(conn, 'connection', e.clientX, e.clientY);
    });

    svgLayer.appendChild(hitPath);

    // ★★★ ここが新機能！透明な丸を矢印の位置に置く ★★★
    const createHitCircle = (pos) => {
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", pos.x);
        circle.setAttribute("cy", pos.y);
        circle.setAttribute("r", 15); // 半径15pxの当たり判定（矢印を十分カバーするわ）
        circle.setAttribute("fill", "transparent");

        // CSSでポインターイベントを強制的に有効化！
        circle.style.pointerEvents = "all";
        circle.style.cursor = "pointer";

        // イベントは線と同じものを登録
        // circle.onclick = (e) => onLineClick(e, conn);
        circle.onmousedown = (e) => handleLineMouseDown(e, conn);
        circle.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectConnection(conn.id);
            openContextMenu(conn, 'connection', e.clientX, e.clientY);
        });

        svgLayer.appendChild(circle);
    };

    // 矢印がある側にだけ丸を生成
    if (style.arrow === 'start' || style.arrow === 'both') {
        createHitCircle(startPos);
    }
    if (style.arrow === 'end' || style.arrow === 'both') {
        createHitCircle(endPos);
    }
    // ★★★ ここまで ★★★


    // 5. 見た目用の線
    const visualPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    visualPath.setAttribute("d", d);
    visualPath.setAttribute("class", "connection-line");
    visualPath.style.pointerEvents = "none";
    visualPath.style.stroke = isSelected ? '#007bff' : style.color;
    visualPath.style.strokeWidth = w;
    if (style.dash === 'dashed') {
        const dashLen = w * 4;
        const gapLen = w * 2.5;
        visualPath.style.strokeDasharray = `${dashLen}, ${gapLen}`;
    }
    if (style.arrow === 'end' || style.arrow === 'both') {
        visualPath.setAttribute("marker-end", `url(#${markerEndId})`);
    }
    if (style.arrow === 'start' || style.arrow === 'both') {
        visualPath.setAttribute("marker-start", `url(#${markerStartId})`);
    }
    svgLayer.appendChild(visualPath);


    // 6. ラベル（文字）の描画（縦書き改行 修正版）
    if (conn.label && conn.label.text) {
        const l = conn.label;
        const cx = (startPos.x + endPos.x) / 2 + (l.offsetX || 0);
        const cy = (startPos.y + endPos.y) / 2 + (l.offsetY || 0);

        const lines = l.text.split('\n');
        const fSize = l.fontSize || 12;
        const lineHeight = 1.2; 

        // --- 背景（矩形）のサイズ計算 ---
        const maxLineLen = Math.max(...lines.map(line => line.length));
        
        let wRect, hRect;
        if (l.isVertical) {
            // 縦書き：幅＝行数、高さ＝最長行
            wRect = lines.length * (fSize * lineHeight) + 10;
            hRect = maxLineLen * fSize + 10;
        } else {
            // 横書き：幅＝最長行、高さ＝行数
            wRect = maxLineLen * fSize + 10;
            hRect = lines.length * (fSize * lineHeight) + 10;
        }

        // 背景描画
        if (l.bgColor && l.bgColor !== 'transparent') {
            const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            bg.setAttribute("x", cx - wRect / 2);
            bg.setAttribute("y", cy - hRect / 2);
            bg.setAttribute("width", wRect);
            bg.setAttribute("height", hRect);
            bg.setAttribute("fill", l.bgColor);
            bg.setAttribute("rx", 4);
            
            bg.style.pointerEvents = 'all';
            bg.style.cursor = (conn.id === selectedConnId) ? "move" : "pointer";
            registerInteraction(bg, { type: 'conn-label', connId: conn.id });
            bg.addEventListener('contextmenu', (e) => {
                e.preventDefault(); e.stopPropagation();
                selectConnection(conn.id);
                openContextMenu(conn, 'connection', e.clientX, e.clientY);
            });
            svgLayer.appendChild(bg);
        }

        // 文字描画
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        
        let adjX = 0;
        let adjY = 0;
        if (l.isVertical) {
            text.setAttribute("class", "vertical-text");
            adjX = -1;
            adjY = 0;
        } else {
            adjX = 0;
            adjY = 1;
        }

        // text要素自体には座標をセットせず、tspanで制御するスタイルに変更してもいいけど、
        // 基準点としてセットしておくわ
        text.setAttribute("x", cx + adjX);
        text.setAttribute("y", cy + adjY);

        text.setAttribute("fill", l.color || '#333');
        text.setAttribute("font-size", fSize);
        text.setAttribute("font-weight", l.fontWeight || 'normal');
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        
        text.style.pointerEvents = "all";
        text.style.cursor = (conn.id === selectedConnId) ? "move" : "pointer";

        // ★修正ポイント：縦書き・横書きで行送りの計算を変える！
        lines.forEach((lineStr, index) => {
            const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
            tspan.textContent = lineStr;

            if (l.isVertical) {
                // === 縦書き (vertical-rl) の場合 ===
                // 行を変える ＝ 「左（X軸マイナス方向）」へずらすこと
                // index 0（1行目）が一番右に来るように計算するわ

                // 中心からのオフセット量（行数に基づいて計算）
                // 例: 2行なら、0行目は +0.5幅、1行目は -0.5幅 の位置
                const lineOffset = (lines.length - 1) / 2 - index; 
                
                // 行間を含めた移動量
                const xPos = cx + adjX + (lineOffset * (fSize * lineHeight));
                
                tspan.setAttribute("x", xPos);
                tspan.setAttribute("y", cy + adjY); // Yは中心固定（文字数で勝手に伸びる）

            } else {
                // === 横書きの場合 ===
                // 行を変える ＝ 「下（Y軸プラス方向）」へずらすこと (dyを使用)
                
                tspan.setAttribute("x", cx + adjX); // Xは中心固定

                if (index === 0) {
                    // 全体を垂直方向に中央寄せするための初期ズレ
                    const startDy = -((lines.length - 1) * lineHeight) / 2;
                    tspan.setAttribute("dy", startDy + "em");
                } else {
                    // 2行目以降は下へ
                    tspan.setAttribute("dy", lineHeight + "em");
                }
            }

            text.appendChild(tspan);
        });

        registerInteraction(text, { type: 'conn-label', connId: conn.id });
        text.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            selectConnection(conn.id);
            openContextMenu(conn, 'connection', e.clientX, e.clientY);
        });
        svgLayer.appendChild(text);
    }

    // 7. ハンドル・ウェイポイント
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

    if (!el) {
        el = document.createElement('div');
        el.id = id; // IDをつけるのが重要！
        el.className = 'line-handle';
        // タッチしやすくするCSS擬似要素のためにクラスはそのままでOK

        registerInteraction(el, { type: 'handle', connId: conn.id, handleType: type });
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // 標準メニューを出さない
            e.stopPropagation(); // 後ろのキャンバスに反応させない

            // この線を選択状態にして、メニューを開く
            selectConnection(conn.id);
            openContextMenu(conn, 'connection', e.clientX, e.clientY);
        });
        container.appendChild(el);
    }

    el.style.display = 'block';

    // その代わり、選択状態によって「透明度」と「触れるかどうか」を制御するの！
    if (conn.id === selectedConnId) {
        el.style.opacity = '1';          // 見える
        el.style.pointerEvents = 'auto'; // 触れる
    } else {
        el.style.opacity = '0';          // 透明
        el.style.pointerEvents = 'auto'; // ★重要：透明でも触れる！
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

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // 標準メニューを出さない
            e.stopPropagation();

            selectConnection(conn.id);
            openContextMenu(conn, 'connection', e.clientX, e.clientY);
        });

        // ダブルクリック削除
        el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            conn.waypoints.splice(index, 1);
            render(); // メイン画面更新

            // ★追加：もし今編集中の線なら、プレビューも即座に更新！
            if (editingConnId === conn.id) {
                updateConnPreview(conn);
            }

            // ★追加：操作が終わったので履歴に保存！
            recordHistory();
        });

        container.appendChild(el);
    }

    el.style.display = 'block';

    if (conn.id === selectedConnId) {
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
    } else {
        el.style.opacity = '0';
        el.style.pointerEvents = 'auto'; // 透明でも掴めるように！
    }

    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
}

// ====== ツールバー機能 ======

// 1. ツールバーのドラッグ移動
const toolbar = document.getElementById('toolbar');
const toolbarHandle = document.getElementById('toolbar-drag-handle');
let isToolbarDragging = false;
let toolbarOffset = { x: 0, y: 0 };

toolbarHandle.addEventListener('mousedown', (e) => {
    e.stopPropagation(); // キャンバスのクリックイベントを止める
    isToolbarDragging = true;

    // 現在の位置（ウィンドウ内座標）を取得
    const rect = toolbar.getBoundingClientRect();
    toolbarOffset.x = e.clientX - rect.left;
    toolbarOffset.y = e.clientY - rect.top;

    // 右寄せ(right)指定だと動きにくいから、現在のleft/top位置に固定しなおすテクニック
    toolbar.style.right = 'auto';
    toolbar.style.left = rect.left + 'px';
    toolbar.style.top = rect.top + 'px';
});

window.addEventListener('mousemove', (e) => {
    if (!isToolbarDragging) return;
    e.preventDefault();

    const newLeft = e.clientX - toolbarOffset.x;
    const newTop = e.clientY - toolbarOffset.y;

    toolbar.style.left = newLeft + 'px';
    toolbar.style.top = newTop + 'px';
});

window.addEventListener('mouseup', () => {
    isToolbarDragging = false;
});



// 便利関数：現在の画面中央（ワールド座標）を取得して、少しランダムにずらす
function getVisibleCenterWithRandomOffset() {
    // 1. 画面（コンテナ）の真ん中を取得
    const screenX = canvasContainer.clientWidth / 2;
    const screenY = canvasContainer.clientHeight / 2;

    // 2. 現在の視点(viewport)に合わせて「ワールド座標」に変換
    // 式: (画面座標 - 平行移動量) ÷ 拡大率
    const worldX = (screenX - viewport.x) / viewport.scale;
    const worldY = (screenY - viewport.y) / viewport.scale;

    // 3. 少しランダムにずらす（-50px 〜 +50px）
    // これがないと、連続で追加した時に全部重なっちゃうからね！
    const offsetX = (Math.random() * 100) - 50;
    const offsetY = (Math.random() * 100) - 50;

    return { x: worldX + offsetX, y: worldY + offsetY };
}

// 2. 「＋ 矢印」ボタン
document.getElementById('btn-add-conn').addEventListener('click', () => {
    // 画面中央を取得
    const center = getVisibleCenterWithRandomOffset();

    const newConn = {
        id: generateId(),
        // 中心座標から左右に60px広げた位置にする
        start: { type: 'point', x: center.x - 60, y: center.y },
        end: { type: 'point', x: center.x + 60, y: center.y },
        waypoints: [],
        style: {
            color: '#555',
            width: 2,
            dash: 'solid',
            arrow: 'end'
        },
        label: {
            text: "",
            fontSize: 12,
            color: '#333'
        }
    };

    connections.push(newConn);

    selectNode(null);
    selectConnection(newConn.id);
    recordHistory();
});

// 人物追加ボタン
document.getElementById('btn-add-node').addEventListener('click', () => {
    // 画面中央を取得
    const center = getVisibleCenterWithRandomOffset();

    const newNode = {
        id: generateId(),
        x: center.x,
        y: center.y,
        label: "新規人物",
        style: {
            width: 60, height: 60,
            borderColor: '#333333',
            borderWidth: 2,
        },
        text: {
            color: '#333333',
            fontSize: 14,
            fontWeight: 'normal',
            x: 30, y: 30
        }
    };

    nodes.push(newNode);
    selectNode(newNode.id);
    recordHistory();
    refreshScreen();
});

// マルチボックス追加ボタン（初期値をボックスらしく変更！）
document.getElementById('btn-add-box').addEventListener('click', () => {
    // 画面中央を取得
    const center = getVisibleCenterWithRandomOffset();

    const newBox = {
        id: generateId(),
        type: 'box', // ※統合したから type は実はもう不要なんだけど、後で区別したい時のために残しておいてもOK
        x: center.x,
        y: center.y,
        label: "新規ボックス\n改行もできるよ",
        style: {
            width: 150, height: 100,
            borderColor: '#333333',
            borderWidth: 2,
            
            // ★変更点：ここを「破線」「少し半透明」にするの！
            borderStyle: 'solid', 
            backgroundColor: '#ffffff',
            opacity: 100, 
            boxShadow: 'none',
            borderRadius: 10
        },
        text: {
            color: '#333333',
            fontSize: 14,
            fontWeight: 'normal',
            align: 'center',
            bgColor: 'transparent',
            shadow: 'none',
            x: 75, y: 50
        }
    };

    nodes.push(newBox);
    selectNode(newBox.id);
    recordHistory();
    refreshScreen();
});

// 削除ボタン（道連れなし・切り離し対応版）
document.getElementById('btn-delete').addEventListener('click', () => {
    let hasChanges = false;

    // 1. 削除対象のリストを作成
    const nodesToDelete = new Set(selectedNodeIds);
    if (selectedId) nodesToDelete.add(selectedId);

    const connsToDelete = new Set(selectedConnIds);
    if (selectedConnId) connsToDelete.add(selectedConnId);

    // 何も選ばれてなければ終了
    if (nodesToDelete.size === 0 && connsToDelete.size === 0) return;

    // 2. 生き残る線のために「切り離し処理」を行う
    // （ノードが消えるなら、その位置で座標固定の線に変身させるの！）
    connections.forEach(conn => {
        // もしこの線自体が削除対象なら、何もしない（後で消えるから）
        if (connsToDelete.has(conn.id)) return;

        // 始点のチェック：削除されるノードに繋がってる？
        if (conn.start.type === 'anchor' && nodesToDelete.has(conn.start.nodeId)) {
            // 現在の接続位置（座標）を計算して保存
            const pos = getAnchorCoordinate(conn.start.nodeId, conn.start.side, conn.start.index);
            // アンカーから「座標指定(point)」に書き換え！
            conn.start = { type: 'point', x: pos.x, y: pos.y };
            hasChanges = true;
        }

        // 終点のチェック
        if (conn.end.type === 'anchor' && nodesToDelete.has(conn.end.nodeId)) {
            const pos = getAnchorCoordinate(conn.end.nodeId, conn.end.side, conn.end.index);
            conn.end = { type: 'point', x: pos.x, y: pos.y };
            hasChanges = true;
        }
    });

    // 3. 実際の削除処理

    // ノード削除
    if (nodesToDelete.size > 0) {
        const beforeCount = nodes.length;
        nodes = nodes.filter(n => !nodesToDelete.has(n.id));
        if (nodes.length !== beforeCount) hasChanges = true;
    }

    // 線削除（明示的に選ばれたものだけ！）
    if (connsToDelete.size > 0) {
        const beforeCount = connections.length;
        connections = connections.filter(c => !connsToDelete.has(c.id));
        if (connections.length !== beforeCount) hasChanges = true;
    }

    // 4. 更新処理
    if (hasChanges) {
        // 選択解除
        selectedNodeIds.clear();
        selectedConnIds.clear();
        selectedId = null;
        selectedConnId = null;

        document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));

        refreshScreen();
        closeContextMenu();
        recordHistory();
    }
});

// ====== ガイド切り替え機能（新規追加） ======
const btnToggleGuide = document.getElementById('btn-toggle-guide');
const artboardGuide = document.getElementById('artboard-guide');

btnToggleGuide.addEventListener('click', () => {
    // 設定を反転させる (true -> false, false -> true)
    appSettings.showGuide = !appSettings.showGuide;
    
    // 見た目を更新
    updateGuideVisibility();
    
    // 変更を履歴に保存
    recordHistory();
});

// ガイドの見た目を設定に合わせて更新する関数
function updateGuideVisibility() {
    if (appSettings.showGuide) {
        // 表示モード (ON)
        artboardGuide.classList.remove('guide-hidden');
        btnToggleGuide.classList.add('active'); // ボタンを凹ませる
    } else {
        // 非表示モード (OFF)
        artboardGuide.classList.add('guide-hidden');
        btnToggleGuide.classList.remove('active'); // ボタンを元に戻す
    }
}

// ====== 背景色設定機能 ======

const bgPicker = document.getElementById('tool-bg-picker');
const bgHex = document.getElementById('tool-bg-hex');

// 色を変更する関数（共通化）
function updateAppBackground(color) {
    // 1. 状態を保存（これでsave対応バッチリ！）
    appSettings.backgroundColor = color;

    // 2. 画面に反映
    document.body.style.backgroundColor = color;

    // 3. 入力欄を同期
    // (入力中の要素自身を書き換えるとカーソルが飛ぶことがあるのでチェック)
    if (document.activeElement !== bgHex) {
        bgHex.value = color;
    }
    if (document.activeElement !== bgPicker) {
        bgPicker.value = color;
    }
}

// ピッカーを動かした時
bgPicker.addEventListener('input', (e) => {
    updateAppBackground(e.target.value);
});

// ★追加：ピッカーの操作が終わった時（ここで保存！）
bgPicker.addEventListener('change', recordHistory);

// HEXコードを入力した時
bgHex.addEventListener('change', (e) => {
    let val = e.target.value;

    // #が抜けてたら補完
    if (val && !val.startsWith('#')) val = '#' + val;

    // 正しいカラーコードかチェック (3桁か6桁)
    if (/^#([0-9A-F]{3}){1,2}$/i.test(val)) {
        // 3桁なら6桁に直す（例: #fff -> #ffffff）
        if (val.length === 4) {
            val = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
        }
        updateAppBackground(val);
        recordHistory();
    } else {
        // 間違ってたら元の色に戻す（親切設計！）
        bgHex.value = appSettings.backgroundColor;
    }
});

// ★初期化時に色を適用（ロード処理などで役立つわ）
updateAppBackground(appSettings.backgroundColor);


// 画面再描画ヘルパー（便利なので作ったわ）
function refreshScreen() {
    // コンテナ内のノードを一旦全部消して作り直す（簡易実装）
    // ※パフォーマンス的には差分更新がいいけど、今はこれで十分
    document.querySelectorAll('.node').forEach(el => el.remove());
    initNodes();
    render();
}



// ====== コンテキストメニュー制御 ======

const contextMenu = document.getElementById('context-menu');
let editingNodeId = null;
let editingConnId = null; // ★追加：編集中コネクションID

// 引数 `type` を追加して、何を開いたか区別するわ ('node' or 'connection')

// openContextMenu 関数（タブ式対応・統合版）

function openContextMenu(targetData, type, mouseX, mouseY) {
    editingNodeId = (type === 'node' || type === 'box') ? targetData.id : null;
    editingConnId = (type === 'connection') ? targetData.id : null;

    // パネル要素
    const panelNodeCommon = document.getElementById('panel-node-common'); // ★新設
    const panelConn = document.getElementById('panel-conn');
    const tabNav = document.getElementById('node-tabs'); // ★タブバー

    const previewBox = document.getElementById('preview-box');
    const previewConn = document.getElementById('preview-conn-container');

    // 初期化（一旦全部消す）
    panelNodeCommon.style.display = 'none';
    panelConn.style.display = 'none';
    tabNav.classList.add('tab-hidden'); // タブも隠す
    previewBox.style.display = 'none';
    previewConn.style.display = 'none';

    if (type === 'node' || type === 'box') {
        // --- ノード（統合）モード ---
        panelNodeCommon.style.display = 'block';
        tabNav.classList.remove('tab-hidden'); // タブ表示
        previewBox.style.display = 'flex';

        // データを全注入！
        const s = targetData.style || {};
        const t = targetData.text || {};

        // [Tab 1: テキスト]
        document.getElementById('input-label').value = targetData.label || '';
        updateToggleActiveState('toggle-align', t.align || 'center');
        updatePaletteActiveState('palette-text', t.color || '#333');
        document.getElementById('input-font-size').value = t.fontSize || 14;
        updateToggleActiveState('preset-font-size', String(t.fontSize || 14));
        updatePaletteActiveState('palette-text-bg', t.bgColor || 'transparent');
        updateToggleActiveState('toggle-text-shadow', t.shadow || 'none');

        const btnBold = document.getElementById('btn-font-bold');
        if (t.fontWeight === 'bold') btnBold.classList.add('active');
        else btnBold.classList.remove('active');

        // [Tab 2: スタイル]
        document.getElementById('input-width').value = s.width || 120;
        document.getElementById('input-height').value = s.height || 60;
        updatePaletteActiveState('palette-bg', s.backgroundColor || '#ffffff');
        // 角丸スライダーの初期値セット
        const radius = s.borderRadius !== undefined ? s.borderRadius : 10;
        const inputRadius = document.getElementById('input-radius');
        const valRadius = document.getElementById('val-radius');
        if (inputRadius) {
            inputRadius.value = radius;
            valRadius.textContent = radius + '%';
        }

        // 透過率
        const op = s.opacity !== undefined ? s.opacity : 100;
        document.getElementById('input-opacity').value = op;
        document.getElementById('val-opacity').textContent = op + '%';

        updatePaletteActiveState('palette-border', s.borderColor || '#333');
        document.getElementById('input-border-width').value = s.borderWidth !== undefined ? s.borderWidth : 2;
        updateToggleActiveState('toggle-border-style', s.borderStyle || 'solid');
        updateToggleActiveState('toggle-box-shadow', s.boxShadow || 'none');

        // [Tab 3: 画像]
        // 画像削除ボタンの制御
        const btnRemove = document.getElementById('btn-remove-image');
        if (s.backgroundImage && s.backgroundImage !== 'none') {
            btnRemove.style.display = 'flex';
        } else {
            btnRemove.style.display = 'none';
        }

        // 画像透過率（新規追加）
        const imgOp = s.imageOpacity !== undefined ? s.imageOpacity : 100;
        const inputImgOp = document.getElementById('input-image-opacity');
        const valImgOp = document.getElementById('val-image-opacity');
        
        if (inputImgOp) {
            inputImgOp.value = imgOp;
            valImgOp.textContent = imgOp + '%';
        }

        // プレビュー更新
        updatePreview(targetData);
        selectNode(targetData.id);

    } else if (type === 'connection') {
        // --- 矢印モード ---
        panelConn.style.display = 'block';
        previewConn.style.display = 'flex';

        document.querySelectorAll('#conn-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('#conn-tabs .tab-btn[data-target="tab-conn-style"]').classList.add('active');
        
        document.querySelectorAll('#panel-conn .tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById('tab-conn-style').classList.add('active');

        // (矢印のデータセット処理は既存のまま)
        const s = targetData.style || {};
        const l = targetData.label || {};

        updatePaletteActiveState('palette-conn-stroke', s.color || '#555');
        document.getElementById('input-conn-width').value = s.width || 2;
        updateToggleActiveState('preset-conn-width', String(s.width || 2));
        updateToggleActiveState('toggle-conn-dash', s.dash || 'solid');
        updateToggleActiveState('toggle-conn-arrow', s.arrow || 'none');
        document.getElementById('input-conn-label').value = l.text || '';
        updateToggleActiveState('toggle-conn-vertical', l.isVertical ? 'vertical' : 'horizontal');
        updatePaletteActiveState('palette-conn-text', l.color || '#333');
        document.getElementById('input-conn-font-size').value = l.fontSize || 12;
        updateToggleActiveState('preset-conn-font-size', String(l.fontSize || 12));
        updatePaletteActiveState('palette-conn-bg', l.bgColor || 'transparent');

        const btnBold = document.getElementById('btn-conn-bold');
        if (l.fontWeight === 'bold') btnBold.classList.add('active');
        else btnBold.classList.remove('active');

        updateConnPreview(targetData);
        selectConnection(targetData.id);
    }

    // メニュー位置（共通）
    contextMenu.style.display = 'block';
    // (位置調整ロジックは既存のままでOK)
    const menuRect = contextMenu.getBoundingClientRect();
    const windowW = window.innerWidth;
    const windowH = window.innerHeight;
    const padding = 10;
    let posX = mouseX;
    let posY = mouseY;
    if (posX + menuRect.width > windowW - padding) posX = windowW - menuRect.width - padding;
    if (posY + menuRect.height > windowH - padding) posY = windowH - menuRect.height - padding;
    contextMenu.style.left = Math.max(padding, posX) + 'px';
    contextMenu.style.top = Math.max(padding, posY) + 'px';

    // 履歴登録
    const inputs = contextMenu.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        input.removeEventListener('change', recordHistory);
        input.addEventListener('change', recordHistory);
    });
}

function closeContextMenu() {
    contextMenu.style.display = 'none';
    editingNodeId = null;
    editingConnId = null;
}

// ====== ★ここから新規追加：イベントリスナー ======

// 1. 枠の太さ（入力欄）
document.getElementById('input-border-width').addEventListener('input', (e) => {
    updateNodeProperty('style', 'borderWidth', parseInt(e.target.value) || 0);
    // プリセットボタンの見た目も連動させる
    updateToggleActiveState('preset-border-width', e.target.value);
});

// 2. 枠の太さ（プリセットボタン）
document.querySelectorAll('#preset-border-width button').forEach(btn => {
    btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.val);
        document.getElementById('input-border-width').value = val;
        updateNodeProperty('style', 'borderWidth', val);
        updateToggleActiveState('preset-border-width', String(val));
    });
});

// 3. 文字サイズ（入力欄）
document.getElementById('input-font-size').addEventListener('input', (e) => {
    updateNodeProperty('text', 'fontSize', parseInt(e.target.value) || 12);
    updateToggleActiveState('preset-font-size', e.target.value);
});

// 4. 文字サイズ（プリセットボタン）
document.querySelectorAll('#preset-font-size button').forEach(btn => {
    btn.addEventListener('click', () => {
        const val = parseInt(btn.dataset.val);
        document.getElementById('input-font-size').value = val;
        updateNodeProperty('text', 'fontSize', val);
        updateToggleActiveState('preset-font-size', String(val));
    });
});

// 5. 太字ボタン
document.getElementById('btn-font-bold').addEventListener('click', (e) => {
    if (!editingNodeId) return;
    const btn = e.target;
    // クラスをトグル
    btn.classList.toggle('active');
    const isBold = btn.classList.contains('active');

    updateNodeProperty('text', 'fontWeight', isBold ? 'bold' : 'normal');
});

// ====== 線プロパティ用のイベントリスナー ======

// 1. ラベル入力
document.getElementById('input-conn-label').addEventListener('input', (e) => {
    updateConnProperty('label', 'text', e.target.value);
});

// 2. 太さ入力（数値）
document.getElementById('input-conn-width').addEventListener('input', (e) => {
    updateConnProperty('style', 'width', parseInt(e.target.value) || 2);
    updateToggleActiveState('preset-conn-width', e.target.value);
});

// 3. 文字サイズ（数値）
document.getElementById('input-conn-font-size').addEventListener('input', (e) => {
    updateConnProperty('label', 'fontSize', parseInt(e.target.value) || 12);
    updateToggleActiveState('preset-conn-font-size', e.target.value);
});

// 4. 太字ボタン
document.getElementById('btn-conn-bold').addEventListener('click', (e) => {
    if (!editingConnId) return;
    e.target.classList.toggle('active');
    updateConnProperty('label', 'fontWeight', e.target.classList.contains('active') ? 'bold' : 'normal');
});

// 5. 削除ボタン
document.getElementById('btn-conn-delete').addEventListener('click', () => {
    if (!editingConnId) return;
    const idx = connections.findIndex(c => c.id === editingConnId);
    if (idx !== -1) {
        connections.splice(idx, 1);
        refreshScreen();
    }
    closeContextMenu();
});

// ★汎用更新ヘルパー関数
// (いちいち node.style = {} とか書くのが大変だから作ったの！)
function updateNodeProperty(category, key, value) {
    if (!editingNodeId) return;
    const node = nodes.find(n => n.id === editingNodeId);
    if (node) {
        // カテゴリ（styleやtext）がなければ作る
        if (!node[category]) node[category] = {};

        // ★ここが重要！
        // category全体をイコールで書き換えるんじゃなくて、
        // その中の key（fontSizeなど）だけを更新するの。
        node[category][key] = value;

        refreshNodeStyle(node);
        updatePreview(node);
        render();
    }
}

// ヘルパー関数：パレットの見た目更新（線・人物共通 ロジック統一版）
function updatePaletteActiveState(paletteId, activeColor) {
    const container = document.getElementById(paletteId);
    if (!container) return;

    // 1. 丸いボタンの選択状態を更新
    container.querySelectorAll('.color-btn').forEach(btn => {
        if (btn.dataset.color === activeColor) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // 2. 入力欄（HEXとカラーピッカー）も同期
    const picker = container.querySelector('input[type="color"]');
    const textInput = container.querySelector('input[type="text"]');

    // ★重要：線のロジックと同じく、透明なら白(#ffffff)をセットしてピッカーをリセットする
    let targetHex = activeColor;

    if (activeColor === 'transparent') {
        targetHex = '#ffffff'; // 透明のときは白にする
        if (textInput) textInput.value = 'transparent';
    } else {
        if (textInput) textInput.value = activeColor;
    }

    // HEXの整形（3桁→6桁）
    if (targetHex && targetHex.startsWith('#') && targetHex.length === 4) {
        targetHex = '#' + targetHex[1] + targetHex[1] + targetHex[2] + targetHex[2] + targetHex[3] + targetHex[3];
    }

    // ピッカーに値をセット（ここが前の色を引きずらないためのカギ！）
    if (picker && targetHex && targetHex.startsWith('#')) {
        picker.value = targetHex;
    }
}

// ヘルパー関数：トグルの見た目更新
function updateToggleActiveState(groupId, activeVal) {
    // ★ここを変更！ `button` の前に ` > ` を入れるの。
    // これで「孫」や「入れ子」のボタンを無視して、そのグループ直属のボタンだけ操作するわ！
    document.querySelectorAll(`#${groupId} > button`).forEach(btn => {
        if (btn.dataset.val === activeVal) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

// 2点間(p1 -> p2)を指定距離(distance)だけ進めた座標を返す関数
function movePointTowards(p1, p2, distance) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const totalDist = Math.hypot(dx, dy);

    if (totalDist === 0) return p1; // 同じ場所なら動かない

    const ratio = distance / totalDist;
    return {
        x: p1.x + dx * ratio,
        y: p1.y + dy * ratio
    };
}

// ====== スタイル適用ロジック ======
// ★線プロパティ更新ヘルパー
function updateConnProperty(category, key, value) {
    if (!editingConnId) return;
    const conn = connections.find(c => c.id === editingConnId);
    if (conn) {
        if (!conn[category]) conn[category] = {};
        conn[category][key] = value;

        // 画面とプレビュー更新
        render();
        updateConnPreview(conn);
    }
}


// ====== カラー適用関数（統合版） ======
function applyColor(target, color) {
    // 1. ノード（人物・ボックス統合）
    if (['bg', 'border', 'text', 'text-bg'].includes(target)) {
        if (!editingNodeId) return;
        const node = nodes.find(n => n.id === editingNodeId);
        if (!node) return;

        if (target === 'bg') {
            if (!node.style) node.style = {};
            node.style.backgroundColor = color;
            updatePaletteActiveState('palette-bg', color);
        } else if (target === 'border') {
            if (!node.style) node.style = {};
            node.style.borderColor = color;
            updatePaletteActiveState('palette-border', color);
        } else if (target === 'text') {
            if (!node.text) node.text = {};
            node.text.color = color;
            updatePaletteActiveState('palette-text', color);
        } else if (target === 'text-bg') {
            if (!node.text) node.text = {};
            node.text.bgColor = color;
            updatePaletteActiveState('palette-text-bg', color);
        }
        refreshNodeStyle(node);
    }
    // 2. 矢印
    else {
        // （矢印の処理は変更なし、既存のままでOK）
        if (!editingConnId) return;
        const conn = connections.find(c => c.id === editingConnId);
        if (!conn) return;
        
        if (target === 'conn-stroke') {
            if (!conn.style) conn.style = {};
            conn.style.color = color;
            updatePaletteActiveState('palette-conn-stroke', color);
        } else if (target === 'conn-text') {
            if (!conn.label) conn.label = {};
            conn.label.color = color;
            updatePaletteActiveState('palette-conn-text', color);
        } else if (target === 'conn-bg') {
            if (!conn.label) conn.label = {};
            conn.label.bgColor = color;
            updatePaletteActiveState('palette-conn-bg', color);
        }
        render();
        updateConnPreview(conn);
    }
    recordHistory();
}

// ★線のプレビュー更新関数
// プレビューのドラッグ管理用変数
let isPreviewConnDragging = false;
let previewConnDragStart = { x: 0, y: 0 };
let previewConnScale = 1; // 縮小率

// プレビューのSVG内でマウスダウンした時


// プレビューのSVG内でマウスダウンした時
document.getElementById('preview-conn-svg').addEventListener('mousedown', (e) => {
    e.stopPropagation();

    // ★修正：IDでの完全一致判定はやめるの！
    // const targetId = e.target.id;
    // const isLabel = (targetId === 'preview-conn-label');

    // ★変更後：クリックした要素自身、またはその親元を辿ってラベルを探す！
    // これなら <tspan> をクリックしても、親の <text> を見つけてくれるわ。
    const isLabel = e.target.closest('#preview-conn-label');
    
    // 背景矩形はIDで判定しても大丈夫（中に要素がないから）
    const isBg = (e.target.id === 'preview-conn-label-bg');

    if (!isLabel && !isBg) return; // 文字でも背景でもなければ何もしない

    if (!editingConnId) return;

    const svg = document.getElementById('preview-conn-svg');
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;

    if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
        const scaleX = rect.width / viewBox.width;
        const scaleY = rect.height / viewBox.height;
        previewConnScale = Math.min(scaleX, scaleY);
    }

    isPreviewConnDragging = true;
    previewConnDragStart = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mousemove', (e) => {
    if (!isPreviewConnDragging || !editingConnId) return;
    e.preventDefault();

    // 移動量を計算
    const dx = e.clientX - previewConnDragStart.x;
    const dy = e.clientY - previewConnDragStart.y;

    // 次の計算のために位置更新
    previewConnDragStart = { x: e.clientX, y: e.clientY };

    const conn = connections.find(c => c.id === editingConnId);
    if (conn) {
        if (!conn.label) conn.label = {};

        // ★重要：プレビューは縮小されているから、実際の移動量は「逆数」を掛けて大きくするの！
        conn.label.offsetX = (conn.label.offsetX || 0) + (dx / previewConnScale);
        conn.label.offsetY = (conn.label.offsetY || 0) + (dy / previewConnScale);

        render(); // メイン画面更新
        updateConnPreview(conn); // プレビュー更新（これで同期！）
    }
});

window.addEventListener('mouseup', () => {
    if (isPreviewConnDragging) {
        recordHistory();
    }
    isPreviewConnDragging = false;
});

// updateConnPreview 関数（文字位置微調整版）
function updateConnPreview(conn) {
    const s = conn.style || {};
    const l = conn.label || {};

    const svg = document.getElementById('preview-conn-svg');
    const line = document.getElementById('preview-conn-line');
    const label = document.getElementById('preview-conn-label');
    const bg = document.getElementById('preview-conn-label-bg');

    // 1. 座標計算
    let startPos = (conn.start.type === 'anchor')
        ? getAnchorCoordinate(conn.start.nodeId, conn.start.side, conn.start.index)
        : { x: conn.start.x, y: conn.start.y };
    let endPos = (conn.end.type === 'anchor')
        ? getAnchorCoordinate(conn.end.nodeId, conn.end.side, conn.end.index)
        : { x: conn.end.x, y: conn.end.y };

    // スタイル・矢印計算
    const w = s.width || 2;
    const arrowBaseSize = 12 + (w * 1.5);
    const arrowLen = arrowBaseSize * 1.3;
    const gapSize = arrowLen + 4;

    if (s.arrow === 'start' || s.arrow === 'both') {
        const nextPoint = (conn.waypoints.length > 0) ? conn.waypoints[0] : endPos;
        startPos = movePointTowards(startPos, nextPoint, gapSize);
    }
    if (s.arrow === 'end' || s.arrow === 'both') {
        const prevPoint = (conn.waypoints.length > 0) ? conn.waypoints[conn.waypoints.length - 1] : startPos;
        endPos = movePointTowards(endPos, prevPoint, gapSize);
    }

    // 2. パスデータ構築
    const points = [startPos, ...conn.waypoints, endPos];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    let d = `M ${startPos.x} ${startPos.y}`;
    points.forEach(p => {
        d += ` L ${p.x} ${p.y}`;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });

    // スタイル適用
    line.setAttribute("d", d);
    line.setAttribute("stroke", s.color || '#555');
    line.setAttribute("stroke-width", w);

    if (s.dash === 'dashed') {
        const dashLen = w * 4;
        const gapLen = w * 2.5;
        line.setAttribute("stroke-dasharray", `${dashLen}, ${gapLen}`);
    } else {
        line.setAttribute("stroke-dasharray", "none");
    }
    line.setAttribute("fill", "none");


    // 1. マーカーの色を、線の色と同期させる

    const arrowColor = s.color || '#555';
    const markerEnd = document.getElementById('preview-marker-end');
    const markerStart = document.getElementById('preview-marker-start');

    // ★シンプル修正:
    // HTMLで形と向き(auto-start-reverse)は完璧に設定したので、
    // JSでは「色」を変えるだけでOKなの！余計な計算は削除！

    if (markerEnd) {
        markerEnd.querySelector('path').setAttribute('fill', arrowColor);
    }
    if (markerStart) {
        markerStart.querySelector('path').setAttribute('fill', arrowColor);
    }

    // ■ 終点マーカー（End）の更新
    if (markerEnd) {
        // 色
        markerEnd.querySelector('path').setAttribute('fill', arrowColor);

        // サイズと基準点 (JSで直接指定！)
        markerEnd.setAttribute("markerWidth", arrowLen + 2);
        markerEnd.setAttribute("markerHeight", arrowBaseSize);
        markerEnd.setAttribute("refX", "-1"); // メインと同じ設定
        markerEnd.setAttribute("refY", arrowBaseSize / 2);

        // 形 (pathのd属性もサイズに合わせて書き換え！)
        markerEnd.querySelector('path').setAttribute("d",
            `M0,0 L0,${arrowBaseSize} L${arrowLen},${arrowBaseSize / 2} z`
        );
    }

    // ■ 始点マーカー（Start）の更新
    if (markerStart) {
        // 色
        markerStart.querySelector('path').setAttribute('fill', arrowColor);

        // サイズと基準点
        markerStart.setAttribute("markerWidth", arrowLen + 2);
        markerStart.setAttribute("markerHeight", arrowBaseSize);
        markerStart.setAttribute("refX", arrowLen + 1); // メインと同じ設定(外側へ出す)
        markerStart.setAttribute("refY", arrowBaseSize / 2);

        // 形 (左向きの三角形を計算して描画)
        markerStart.querySelector('path').setAttribute("d",
            `M${arrowLen},0 L${arrowLen},${arrowBaseSize} L0,${arrowBaseSize / 2} z`
        );
    }

    // 計算に必要な座標を用意するの
    // startPos, endPos, waypoints はこの関数内で既に計算されている変数を使うわ

    // 始点側の角度計算（始点 → 次の点）
    const nextPoint = (conn.waypoints.length > 0) ? conn.waypoints[0] : endPos;
    const dxStart = nextPoint.x - startPos.x;
    const dyStart = nextPoint.y - startPos.y;
    // Math.atan2 で角度(ラジアン)を出して、180/PI を掛けて「度(deg)」にするの
    const angleStart = Math.atan2(dyStart, dxStart) * (180 / Math.PI);

    // 終点側の角度計算（前の点 → 終点）
    const prevPoint = (conn.waypoints.length > 0) ? conn.waypoints[conn.waypoints.length - 1] : startPos;
    const dxEnd = endPos.x - prevPoint.x;
    const dyEnd = endPos.y - prevPoint.y;
    const angleEnd = Math.atan2(dyEnd, dxEnd) * (180 / Math.PI);

    // 計算した角度をHTMLに注入！
    // 始点用：左向きの絵を使ってるから、線の進行方向(angleStart)をそのまま入れれば、正しく逆を向くの！
    if (markerStart) {
        markerStart.setAttribute('orient', angleStart);
    }

    // 終点用：これも線の進行方向(angleEnd)を入れるだけ！
    if (markerEnd) {
        markerEnd.setAttribute('orient', angleEnd);
    }

    // 2. 矢印をつけるかどうか設定
    // 一旦外して付け直す（ブラウザの更新漏れ防止のおまじない）
    line.removeAttribute("marker-end");
    line.removeAttribute("marker-start");

    if (s.arrow === 'end' || s.arrow === 'both') {
        line.setAttribute("marker-end", "url(#preview-marker-end)");
    }
    if (s.arrow === 'start' || s.arrow === 'both') {
        line.setAttribute("marker-start", "url(#preview-marker-start)");
    }

    // 3. 自動縮小 (viewBox)
    const padding = 50;
    const wBox = maxX - minX + padding * 2;
    const hBox = maxY - minY + padding * 2;
    const viewBoxX = minX - padding;
    const viewBoxY = minY - padding;
    const finalW = Math.max(wBox, 100);
    const finalH = Math.max(hBox, 50);

    svg.setAttribute("viewBox", `${viewBoxX} ${viewBoxY} ${finalW} ${finalH}`);

    const svgRect = svg.getBoundingClientRect();
    if (finalW > 0 && finalH > 0 && svgRect.width > 0) {
        const scaleX = svgRect.width / finalW;
        const scaleY = svgRect.height / finalH;
        previewConnScale = Math.min(scaleX, scaleY);
    }

 
    // 4. ラベル表示
    const cx = (startPos.x + endPos.x) / 2 + (l.offsetX || 0);
    const cy = (startPos.y + endPos.y) / 2 + (l.offsetY || 0);

    // ★修正：テキストを単純代入せずに、改行処理を行う
    // label.textContent = l.text || 'Sample';  <-- これは削除

    const textContent = l.text || 'Sample';
    const lines = textContent.split('\n');
    const fSize = l.fontSize || 12;
    const lineHeight = 1.2;

    // 一旦中身を空にする
    label.innerHTML = '';

    // ★修正ポイント：プレビューでも同じ微調整を適用
    let adjX = 0;
    let adjY = 0;

    if (l.isVertical) {
        label.setAttribute("class", "vertical-text");
        adjX = -1;
        adjY = 0;
    } else {
        label.setAttribute("class", "");
        adjX = 0;
        adjY = 1;
    }

    // label自体の座標設定（基準点）
    label.setAttribute("x", cx + adjX);
    label.setAttribute("y", cy + adjY);

    label.setAttribute("fill", l.color || '#333');
    label.setAttribute("font-size", fSize);
    label.setAttribute("font-weight", l.fontWeight || 'normal');
    label.setAttribute("dominant-baseline", "central");
    label.setAttribute("text-anchor", "middle");

    // ★メイン画面と同じロジックで行ごとのtspanを生成
    lines.forEach((lineStr, index) => {
        const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        tspan.textContent = lineStr;

        if (l.isVertical) {
            // === 縦書きの場合 ===
            // 中心からのオフセット量で行を左右にずらす
            const lineOffset = (lines.length - 1) / 2 - index;
            const xPos = cx + adjX + (lineOffset * (fSize * lineHeight));
            
            tspan.setAttribute("x", xPos);
            tspan.setAttribute("y", cy + adjY); 

        } else {
            // === 横書きの場合 ===
            tspan.setAttribute("x", cx + adjX); // Xは中心固定

            if (index === 0) {
                // 全体を垂直方向に中央寄せするための初期ズレ
                const startDy = -((lines.length - 1) * lineHeight) / 2;
                tspan.setAttribute("dy", startDy + "em");
            } else {
                // 2行目以降は下へ
                tspan.setAttribute("dy", lineHeight + "em");
            }
        }
        
        label.appendChild(tspan);
    });

    // 背景（矩形）のサイズ計算と描画
    if (l.bgColor && l.bgColor !== 'transparent') {
        bg.style.display = 'block';
        bg.setAttribute("fill", l.bgColor);
        
        // ★修正：背景サイズも行数を考慮して計算
        const maxLineLen = Math.max(...lines.map(line => line.length));
        let bw, bh;

        if (l.isVertical) {
            // 縦書き：幅＝行数、高さ＝最長行
            bw = lines.length * (fSize * lineHeight) + 10;
            bh = maxLineLen * fSize + 10;
        } else {
            // 横書き：幅＝最長行、高さ＝行数
            bw = maxLineLen * fSize + 10;
            bh = lines.length * (fSize * lineHeight) + 10;
        }

        bg.setAttribute("x", cx - bw / 2);
        bg.setAttribute("y", cy - bh / 2);
        bg.setAttribute("width", bw);
        bg.setAttribute("height", bh);
        bg.style.pointerEvents = 'auto';
        bg.style.cursor = 'move';
    } else {
        bg.style.display = 'none';
    }
    
    label.style.pointerEvents = 'auto';
    label.style.cursor = 'move';
}


// シャドウ適用ヘルパー（ID修正版）
function applyShadow(target, val) {
    if (!editingNodeId) return;
    const node = nodes.find(n => n.id === editingNodeId);
    if (!node) return;

    if (target === 'box') {
        if (!node.style) node.style = {};
        node.style.boxShadow = val;
    } else {
        if (!node.text) node.text = {};
        node.text.shadow = val;
    }

    // 見た目更新
    refreshNodeStyle(node);
    
    // ★ここを新しいIDに修正！
    updateToggleActiveState(target === 'box' ? 'toggle-box-shadow' : 'toggle-text-shadow', val);
}



// ノードとプレビューのスタイルを一括更新する便利関数（縮小表示対応版）
// refreshNodeStyle 関数（統合・透過率修正版）

function refreshNodeStyle(node) {
    const el = document.getElementById(node.id);
    const label = document.getElementById('label-' + node.id);
    // ★画像レイヤーを取得
    const imgLayer = document.getElementById('img-' + node.id); 
    
    // プレビュー要素
    const previewBox = document.getElementById('preview-box');
    const previewText = document.getElementById('preview-text');
    const isEditing = (editingNodeId === node.id);


    // 1. サイズ
    const w = node.style?.width || 120;
    const h = node.style?.height || 60;
    el.style.width = w + 'px';
    el.style.height = h + 'px';

    // 2. 枠線 & 角丸（ここを整理！）
    el.style.borderColor = nodeDataStyle('borderColor', '#333333');
    
    // ★枠線の太さを先に取得
    const borderWidth = nodeDataStyle('borderWidth', 2);
    el.style.borderWidth = borderWidth + 'px';
    el.style.borderStyle = nodeDataStyle('borderStyle', 'solid');

    // === 角丸の計算（重複を消してこれ1つにする！） ===
    
    // 角丸の強さ (0〜100) を取得
    const rPercent = nodeDataStyle('borderRadius', 10);
    
    // 短い方の辺の半分を「最大半径」とする
    const maxRadius = Math.min(w, h) / 2;
    
    // パーセントをピクセルに変換（外側の半径）
    const rPx = (rPercent / 100) * maxRadius;
    
    // 本体の角丸（外側）
    el.style.borderRadius = rPx + 'px';

    // 画像レイヤーの角丸（内側の計算：隙間埋め）
    if (imgLayer) {
        // 本体の半径から枠線の太さを引く！
        const innerRadius = Math.max(0, rPx - borderWidth);
        
        imgLayer.style.borderRadius = innerRadius + 'px';
        imgLayer.style.overflow = 'hidden'; 
    }

    // 3. ★修正：塗りと透過（ここが変わった！）
    const bgCol = nodeDataStyle('backgroundColor', '#ffffff');
    const op = nodeDataStyle('opacity', 100); // 塗りの透過率
    
    // el.style.opacity ではなく、背景色をRGBAにする
    el.style.backgroundColor = hexToRgba(bgCol, op);
    
    // 本体自体の透明度はリセット（これをしないと全部消えちゃう）
    el.style.opacity = '1'; 

    // 4. ★修正：画像と画像の透過
    const bgImg = nodeDataStyle('backgroundImage', 'none');
    const imgOp = nodeDataStyle('imageOpacity', 100); // 画像の透過率
    
    if (imgLayer) {
        imgLayer.style.backgroundImage = bgImg;
        imgLayer.style.opacity = imgOp / 100;
    }
    // (el.style.backgroundImage はもう使わないので消すか上書き)
    el.style.backgroundImage = 'none';

    // 5. 影 (そのまま)
    const bShd = nodeDataStyle('boxShadow', 'none');
    // ... (影のロジックは既存と同じ)
    let boxCss = 'none';
    if (bShd === 'black') boxCss = '0 4px 8px rgba(0,0,0,0.4)';
    else if (bShd === 'white') boxCss = '0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.4)';
    el.style.boxShadow = boxCss;

    // 6. 文字スタイル (そのまま)
    // ... (label.style... の部分は既存と同じ) ...
    // ↓短縮のためヘルパー関数を使って書くけど、手元のコードはそのままでもOKよ
    const t = node.text || {};
    label.style.color = t.color || '#333';
    label.style.fontSize = (t.fontSize || 14) + 'px';
    label.style.fontWeight = t.fontWeight || 'normal';
    label.style.textAlign = t.align || 'center';
    label.style.textShadow = (t.shadow === 'black') ? '1px 1px 2px rgba(0,0,0,0.6)' : (t.shadow === 'white' ? '1px 1px 2px white' : 'none');
    const txtBgCol = t.bgColor || 'transparent';
    label.style.backgroundColor = txtBgCol;
    label.style.padding = (txtBgCol !== 'transparent') ? '2px 4px' : '0';
    label.style.borderRadius = (txtBgCol !== 'transparent') ? '4px' : '0';

    const tx = t.x !== undefined ? t.x : w / 2;
    const ty = t.y !== undefined ? t.y : h / 2;
    label.style.left = tx + 'px';
    label.style.top = ty + 'px';


    // --- プレビュー反映 (ここも透過ロジックを合わせる) ---
// --- プレビュー反映 ---
    if (isEditing) {
        // ... (サイズ計算ロジックはそのまま) ...
        const MAX_W = 260; const MAX_H = 160;
        let scale = 1;
        if (w > MAX_W || h > MAX_H) scale = Math.min(MAX_W / w, MAX_H / h);
        
        previewBox.style.transform = `scale(${scale})`;
        previewBox.style.width = w + 'px'; 
        previewBox.style.height = h + 'px';
        
        const deltaW = w - (w * scale); 
        const deltaH = h - (h * scale);
        previewBox.style.marginLeft = `-${deltaW / 2}px`; 
        previewBox.style.marginRight = `-${deltaW / 2}px`;
        previewBox.style.marginTop = `-${deltaH / 2}px`; 
        previewBox.style.marginBottom = `-${deltaH / 2}px`;

        previewBox.style.borderColor = el.style.borderColor;
        previewBox.style.borderWidth = el.style.borderWidth;
        previewBox.style.borderStyle = el.style.borderStyle;
        previewBox.style.borderRadius = el.style.borderRadius;
        
        // 背景色は本体にセット
        previewBox.style.backgroundColor = hexToRgba(bgCol, op);
        previewBox.style.boxShadow = boxCss;

        // ★★★ ここが追加魔法！プレビュー用画像レイヤーの生成と制御 ★★★
        
        // 1. レイヤーがあるか探して、なければ作る
        let previewImgLayer = previewBox.querySelector('.preview-bg-image');
        if (!previewImgLayer) {
            previewImgLayer = document.createElement('div');
            previewImgLayer.className = 'preview-bg-image';
            
            // スタイル設定（CSSに書かずにここで完結させるわ）
            previewImgLayer.style.position = 'absolute';
            previewImgLayer.style.top = '0';
            previewImgLayer.style.left = '0';
            previewImgLayer.style.width = '100%';
            previewImgLayer.style.height = '100%';
            previewImgLayer.style.borderRadius = 'inherit'; // 親の角丸を引き継ぐ
            previewImgLayer.style.backgroundSize = 'cover';
            previewImgLayer.style.backgroundPosition = 'center';
            previewImgLayer.style.backgroundRepeat = 'no-repeat';
            previewImgLayer.style.zIndex = '0'; // 文字より後ろ！
            previewImgLayer.style.pointerEvents = 'none';
            
            // プレビューボックスの一番最初に追加（文字の下に敷くため）
            previewBox.insertBefore(previewImgLayer, previewBox.firstChild);
        }

        // 2. 画像と透明度をセット！
        previewImgLayer.style.backgroundImage = bgImg;
        previewImgLayer.style.opacity = imgOp / 100;

        const innerRadiusPreview = Math.max(0, parseFloat(el.style.borderRadius) - parseFloat(el.style.borderWidth));
        previewImgLayer.style.borderRadius = innerRadiusPreview + 'px';

        // 3. 親の背景画像は消しておく（二重表示防止）
        previewBox.style.backgroundImage = 'none';

        // ★★★ ここまで ★★★

        
        // === テキストスタイルの同期（前回のコード） ===
        previewText.textContent = node.label;
        
        previewText.style.zIndex = '1'; // 画像より手前に来るように念押し
        previewText.style.color = label.style.color;
        previewText.style.fontSize = label.style.fontSize;
        previewText.style.fontWeight = label.style.fontWeight;
        previewText.style.textAlign = label.style.textAlign;
        previewText.style.textShadow = label.style.textShadow;
        
        previewText.style.backgroundColor = label.style.backgroundColor;
        previewText.style.padding = label.style.padding;
        previewText.style.borderRadius = label.style.borderRadius;

        previewText.style.left = tx + 'px'; 
        previewText.style.top = ty + 'px';
        
        // ハンドル逆スケール
        previewBox.querySelectorAll('.resize-handle').forEach(hd => hd.style.transform = `scale(${1 / scale})`);
    }
    
    function nodeDataStyle(key, def) {
        return (node.style && node.style[key] !== undefined) ? node.style[key] : def;
    }
}

// プレビュー更新関数（refreshNodeStyleとほぼ同じだけど、初期化時に呼ばれる用）
function updatePreview(nodeData) {
    // refreshNodeStyle の中でプレビュー更新もやってるから、
    // 実は refreshNodeStyle(nodeData) を呼ぶだけでもいいんだけど、
    // ここでは念のため「編集中ID」を一時的に偽装して呼ぶテクニックを使うわ
    const originalId = editingNodeId;
    editingNodeId = nodeData.id;
    refreshNodeStyle(nodeData);
    editingNodeId = originalId;
    
    // 画像削除ボタンの表示制御だけここで行う
    const btnRemove = document.getElementById('btn-remove-image');
    if (btnRemove) {
        if (nodeData.style?.backgroundImage && nodeData.style.backgroundImage !== 'none') {
            btnRemove.style.display = 'flex';
        } else {
            btnRemove.style.display = 'none';
        }
    }
}


// ====== メニューウィンドウのドラッグ移動 ======

const dragHandle = document.getElementById('menu-drag-handle');
let isMenuDragging = false;
let menuDragOffset = { x: 0, y: 0 };

dragHandle.addEventListener('mousedown', (e) => {
    isMenuDragging = true;
    const rect = contextMenu.getBoundingClientRect();
    menuDragOffset.x = e.clientX - rect.left;
    menuDragOffset.y = e.clientY - rect.top;
});

window.addEventListener('mousemove', (e) => {
    if (!isMenuDragging) return;

    // メニューの位置更新
    contextMenu.style.left = (e.clientX - menuDragOffset.x) + 'px';
    contextMenu.style.top = (e.clientY - menuDragOffset.y) + 'px';
});

window.addEventListener('mouseup', () => {
    isMenuDragging = false;
});

// --- イベントリスナー（リアルタイム反映） ---

// 名前変更（input-labelのイベント）
document.getElementById('input-label').addEventListener('input', (e) => {
    if (!editingNodeId) return;
    const val = e.target.value;

    const node = nodes.find(n => n.id === editingNodeId);
    if (node) {
        node.label = val;

        // 本物の文字を更新
        const realLabel = document.getElementById('label-' + editingNodeId);
        if (realLabel) realLabel.textContent = val; // textContentなら改行コードも扱える

        updatePreview(node);
    }
});
// 幅・高さ変更
['input-width', 'input-height'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        if (!editingNodeId) return;

        const w = parseInt(document.getElementById('input-width').value) || 120;
        const h = parseInt(document.getElementById('input-height').value) || 60;

        const node = nodes.find(n => n.id === editingNodeId);
        if (node) {
            // データ構造を作る（なければ初期化）
            if (!node.style) node.style = {};
            node.style.width = w;
            node.style.height = h;

            // 本物を更新
            const el = document.getElementById(editingNodeId);
            el.style.width = w + 'px';
            el.style.height = h + 'px';

            // プレビュー更新
            updatePreview(node);

            // ★重要：箱のサイズが変わると線の位置もズレるから、線を再描画！
            render();
        }
    });
});

// 角の丸み (input-radius)
const inputRadius = document.getElementById('input-radius');
if (inputRadius) {
    inputRadius.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('val-radius').textContent = val + '%';
        // データに保存
        updateNodeProperty('style', 'borderRadius', val);
    });
}

// 削除ボタン（コンテキストメニュー用：道連れなし・救出対応版）
document.getElementById('btn-menu-delete').addEventListener('click', () => {
    if (editingNodeId) {
        const index = nodes.findIndex(n => n.id === editingNodeId);
        if (index !== -1) {

            // 1. ノード削除前に、繋がっている線を「救出」する（座標固定化）
            // これで矢印が消えずに、その場にフワッと残るわ！
            connections.forEach(conn => {
                // 始点のチェック
                if (conn.start.type === 'anchor' && conn.start.nodeId === editingNodeId) {
                    const pos = getAnchorCoordinate(conn.start.nodeId, conn.start.side, conn.start.index);
                    conn.start = { type: 'point', x: pos.x, y: pos.y };
                }
                // 終点のチェック
                if (conn.end.type === 'anchor' && conn.end.nodeId === editingNodeId) {
                    const pos = getAnchorCoordinate(conn.end.nodeId, conn.end.side, conn.end.index);
                    conn.end = { type: 'point', x: pos.x, y: pos.y };
                }
            });

            // 2. ノードを削除
            nodes.splice(index, 1);

            // ※以前あった connections.filter(...) は削除！

            // 3. 画面更新
            refreshScreen();

            // 4. 履歴保存（忘れずに！）
            recordHistory();
        }
        closeContextMenu();
    }
});

// ====== プレビュー箱のリサイズ処理 ======

document.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // メニュー移動や他のイベントを止める
        startResizePreview(e, handle.dataset.dir);
    });
});

let isResizingPreview = false;
let resizeStartPos = { x: 0, y: 0 };
let resizeStartSize = { w: 0, h: 0 };
let resizeDirection = ''; // 'nw', 'se' など

function startResizePreview(e, direction) {
    if (!editingNodeId) return;

    isResizingPreview = true;
    resizeDirection = direction;
    resizeStartPos = { x: e.clientX, y: e.clientY };

    // 現在のプレビューサイズを取得
    // (入力欄の値を使うのが一番確実)
    resizeStartSize = {
        w: parseInt(document.getElementById('input-width').value) || 120,
        h: parseInt(document.getElementById('input-height').value) || 60
    };
}
// ====== script.js (追加コード) ======

// ★プレビューのリサイズ処理（復活！）

window.addEventListener('mousemove', (e) => {
    // プレビューのリサイズ中じゃなければ何もしない
    if (!isResizingPreview) return;
    
    e.preventDefault();

    // 1. 移動量を計算
    const dx = e.clientX - resizeStartPos.x;
    const dy = e.clientY - resizeStartPos.y;

    // 2. 元のサイズを取得
    const startW = resizeStartSize.w;
    const startH = resizeStartSize.h;

    let newW = startW;
    let newH = startH;

    // 3. 方向（nw, ne, sw, se）に合わせてサイズ計算
    // ※プレビューは中央寄せで表示されているから、どのハンドルでも
    //  「右に引けば幅が増える」「下に引けば高さが増える」という単純計算で違和感ないはずなの。
    //  （厳密には左ハンドルだと逆だけど、プレビュー操作なら直感的な「見た目の変化」重視でOK！）
    
    if (resizeDirection.includes('e')) newW = startW + dx;
    if (resizeDirection.includes('w')) newW = startW - dx;
    if (resizeDirection.includes('s')) newH = startH + dy;
    if (resizeDirection.includes('n')) newH = startH - dy;
    
    // 4. 反転対策：左(w)や上(n)ハンドルの場合は、マウスの動きと逆方向にサイズを変える
    //    （右に動かしたら、左側が縮む＝幅が減る、という計算）
    //    → startResizePreviewで取得した resizeDirection を使うよ
    
    // 上の単純計算を少し修正：
    // 右(e)ハンドル: 右へ(+dx)行くと幅増える。OK
    // 左(w)ハンドル: 右へ(+dx)行くと幅減る。なので -dx にする。
    // 下(s)ハンドル: 下へ(+dy)行くと高さ増える。OK
    // 上(n)ハンドル: 下へ(+dy)行くと高さ減る。なので -dy にする。

    // リセットして計算し直し
    newW = startW;
    newH = startH;

    if (resizeDirection.includes('e')) newW += dx;
    else if (resizeDirection.includes('w')) newW -= dx;

    if (resizeDirection.includes('s')) newH += dy;
    else if (resizeDirection.includes('n')) newH -= dy;

    // 5. 最小サイズ制限
    newW = Math.max(30, newW);
    newH = Math.max(30, newH);

    // 5.5 Shiftキーで正方形維持
    if (e.shiftKey) {
        const size = Math.max(newW, newH);
        newW = size;
        newH = size;
    }

    // 6. 適用！
    // 便利な関数 updateNodeSizeFromPreview がすでにあるから、これを呼ぶだけでOK！
    updateNodeSizeFromPreview(Math.round(newW), Math.round(newH));
});

window.addEventListener('mouseup', () => {
    // リサイズ終了処理
    if (isResizingPreview) {
        isResizingPreview = false;
        recordHistory(); // 変更を確定して履歴に保存
    }
});

// リサイズ中の動き（windowのmousemoveに追加）
// ※さっきのメニュー移動のmousemoveとは別に書いてもいいし、まとめてもいいけど、
//  わかりやすく追記する形にするわね。

// script.js - リサイズ用の mousemove リスナー（全盛り対応版）
window.addEventListener('mousemove', (e) => {
    if (!isNodeResizing || !resizeNodeId) return;

    e.preventDefault();

    const dx = e.clientX - nodeResizeStartPos.x;
    const dy = e.clientY - nodeResizeStartPos.y;

    // === A. 複数選択（グループリサイズ） ===
    if (resizeGroupInitialState.size > 0) {
        // 1. リーダーの計算 & 倍率決定
        let startW = nodeResizeStartSize.w;
        let startH = nodeResizeStartSize.h;
        let newLeaderW = startW;
        let newLeaderH = startH;

        if (nodeResizeDir.includes('e')) newLeaderW += dx;
        if (nodeResizeDir.includes('w')) newLeaderW -= dx;
        if (nodeResizeDir.includes('s')) newLeaderH += dy;
        if (nodeResizeDir.includes('n')) newLeaderH -= dy;

        newLeaderW = Math.max(30, newLeaderW);
        newLeaderH = Math.max(30, newLeaderH);

        let scaleX = newLeaderW / startW;
        let scaleY = newLeaderH / startH;

        // アスペクト比維持判定（変化が大きい方）
        let finalScale = 1.0;
        if (Math.abs(scaleX - 1.0) > Math.abs(scaleY - 1.0)) {
            finalScale = scaleX;
        } else {
            finalScale = scaleY;
        }

        // 2. ノード・文字の更新
        resizeGroupInitialState.forEach((initial, id) => {
            const node = nodes.find(n => n.id === id);
            if (!node) return;

            // サイズ
            let targetW = initial.w * finalScale;
            let targetH = initial.h * finalScale;
            targetW = Math.max(10, targetW);
            targetH = Math.max(10, targetH);

            // 座標（World Expand Logic）
            let targetX = resizeAnchorPoint.x + (initial.x - resizeAnchorPoint.x) * finalScale;
            let targetY = resizeAnchorPoint.y + (initial.y - resizeAnchorPoint.y) * finalScale;

            // ★追加：文字位置（相対座標なので単純倍）
            let targetTextX = initial.textX * finalScale;
            let targetTextY = initial.textY * finalScale;
            // ★追加：フォントサイズ
            let targetFontSize = initial.fontSize * finalScale;
            targetFontSize = Math.max(4, targetFontSize); // 最小4pxくらいで止める

            // データ適用
            node.x = targetX;
            node.y = targetY;
            if (!node.style) node.style = {};
            node.style.width = targetW;
            node.style.height = targetH;
            
            if (!node.text) node.text = {};
            node.text.x = targetTextX;
            node.text.y = targetTextY;
            node.text.fontSize = targetFontSize;

            // DOM更新
            refreshNodeStyle(node); // これで一括更新！
            const el = document.getElementById(id);
            if (el) {
                el.style.left = targetX + 'px';
                el.style.top = targetY + 'px';
            }

            // リーダー同期
            if (id === resizeNodeId) {
                updatePreview(node);
                const inputW = document.getElementById('input-width');
                const inputH = document.getElementById('input-height');
                // 文字サイズ入力欄も同期
                const inputFS = document.getElementById('input-font-size');
                
                if (inputW && inputH) {
                    inputW.value = Math.round(targetW);
                    inputH.value = Math.round(targetH);
                }
                if (inputFS) {
                    inputFS.value = Math.round(targetFontSize);
                }
            }
        });

        // 3. ★追加：矢印（Waypoints）の更新
        resizeConnInitialState.forEach((initial, id) => {
            const conn = connections.find(c => c.id === id);
            if (!conn) return;

            // ウェイポイント（関節）の移動
            conn.waypoints.forEach((wp, index) => {
                const initWp = initial.waypoints[index];
                if (initWp) {
                    wp.x = resizeAnchorPoint.x + (initWp.x - resizeAnchorPoint.x) * finalScale;
                    wp.y = resizeAnchorPoint.y + (initWp.y - resizeAnchorPoint.y) * finalScale;
                }
            });

            // 始点・終点が「座標(point)」の場合の移動
            if (initial.start && conn.start.type === 'point') {
                conn.start.x = resizeAnchorPoint.x + (initial.start.x - resizeAnchorPoint.x) * finalScale;
                conn.start.y = resizeAnchorPoint.y + (initial.start.y - resizeAnchorPoint.y) * finalScale;
            }
            if (initial.end && conn.end.type === 'point') {
                conn.end.x = resizeAnchorPoint.x + (initial.end.x - resizeAnchorPoint.x) * finalScale;
                conn.end.y = resizeAnchorPoint.y + (initial.end.y - resizeAnchorPoint.y) * finalScale;
            }
        });
        
        render(); // 全描画更新
    } 
    // === B. 単一選択（既存のまま） ===
    else {
        // (以前の単一選択コードと同じ内容)
        const startW = nodeResizeStartSize.w;
        const startH = nodeResizeStartSize.h;
        const startX = nodeResizeStartCoords.x;
        const startY = nodeResizeStartCoords.y;

        let newW = startW;
        let newH = startH;
        let newX = startX;
        let newY = startY;

        if (nodeResizeDir.includes('e')) newW = startW + dx;
        if (nodeResizeDir.includes('w')) newW = startW - dx;
        if (nodeResizeDir.includes('s')) newH = startH + dy;
        if (nodeResizeDir.includes('n')) newH = startH - dy;

        newW = Math.max(30, newW);
        newH = Math.max(30, newH);

        if (e.shiftKey) {
            const size = Math.max(newW, newH);
            newW = size;
            newH = size;
        }

        if (nodeResizeDir.includes('w')) newX = (startX + startW) - newW;
        if (nodeResizeDir.includes('n')) newY = (startY + startH) - newH;

        const node = nodes.find(n => n.id === resizeNodeId);
        if (node) {
            node.x = newX;
            node.y = newY;
            const el = document.getElementById(resizeNodeId);
            el.style.left = newX + 'px';
            el.style.top = newY + 'px';
            updateNodeSizeFromPreview(newW, newH);
        }
    }
});

window.addEventListener('mouseup', () => {
    if (isNodeResizing) {
        recordHistory();
        resizeGroupInitialState.clear();
        resizeConnInitialState.clear(); // ★これも忘れずにクリア
    }
    isNodeResizing = false;
    resizeNodeId = null;
});


// サイズ更新の一元管理関数
// (リサイズハンドルからも、入力欄からも、これを呼ぶとスムーズよ)
function updateNodeSizeFromPreview(w, h) {
    // 1. 入力欄を更新
    document.getElementById('input-width').value = w;
    document.getElementById('input-height').value = h;

    // 2. 既存のロジックを使ってデータと画面を更新
    // (inputイベントを発火させるテクニックもあるけど、直接処理を書いちゃうのが速いわ)
    const node = nodes.find(n => n.id === editingNodeId);
    if (node) {
        if (!node.style) node.style = {};
        node.style.width = w;
        node.style.height = h;

        // 本物更新
        const el = document.getElementById(editingNodeId);
        el.style.width = w + 'px';
        el.style.height = h + 'px';

        // プレビュー更新
        updatePreview(node);

        // 線更新
        render();
    }
}


// 画像ファイルを読み込んで、適切なサイズにリサイズ・圧縮してBase64にする関数
function readImageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // A3印刷を想定しても、ノード用なら長辺1024pxあれば十分きれいなの！
                const MAX_SIZE = 1024; 
                let w = img.width;
                let h = img.height;

                // 比率を保ったままリサイズ計算
                if (w > h) {
                    if (w > MAX_SIZE) {
                        h *= MAX_SIZE / w;
                        w = MAX_SIZE;
                    }
                } else {
                    if (h > MAX_SIZE) {
                        w *= MAX_SIZE / h;
                        h = MAX_SIZE;
                    }
                }

                // Canvasを使ってリサイズ描画
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                // JPEG形式、画質0.8(80%)で圧縮して書き出し
                // これでJSONサイズが劇的に軽くなるわ！
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
            img.src = e.target.result;
        };
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

const previewBoxDnD = document.getElementById('preview-box'); // 名前が被らないように変数名変えておくわ

if (previewBoxDnD) {
    // ドラッグしてきた時の見た目変化
    previewBoxDnD.addEventListener('dragover', (e) => {
        e.preventDefault();
        previewBoxDnD.style.opacity = '0.7';
        previewBoxDnD.style.borderStyle = 'dashed'; // 破線にして「ここだよ！」とアピール
    });

    // 外れたら元に戻す
    previewBoxDnD.addEventListener('dragleave', (e) => {
        previewBoxDnD.style.opacity = '1';
        previewBoxDnD.style.borderStyle = 'solid';
    });

    // ドロップされた時の処理
    previewBoxDnD.addEventListener('drop', async (e) => {
        e.preventDefault();

        // 見た目を戻す
        previewBoxDnD.style.opacity = '1';
        previewBoxDnD.style.borderStyle = 'solid';

        // 編集中じゃなければ無視
        if (!editingNodeId) return;

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                try {
                    // 画像読み込み
                    const base64 = await readImageFile(file);

                    // データ更新
                    const node = nodes.find(n => n.id === editingNodeId);
                    if (node) {
                        if (!node.style) node.style = {};
                        const urlStr = `url('${base64}')`;
                        node.style.backgroundImage = urlStr;

                        // 画面とプレビューの両方を更新
                        refreshNodeStyle(node);
                        updatePreview(node);
                    }
                } catch (err) {
                    console.error("画像読み込みエラー", err);
                }
            }
        }
    });
}

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


// ドラッグ開始処理の完全版
// handlePointerDown 関数の書き換え
function handlePointerDown(e, info) {
    if (e.type === 'touchstart') e.preventDefault();

    const pos = getPointerPos(e);

    // 長押しタイマー
    longPressTimer = setTimeout(() => { }, 500);

    isDragging = true;
    currentDragTarget = e.target;

    // --- 分岐処理 ---

    // ★追加・変更：文字やラベルを掴んだとき、グループ選択中なら「ノード移動」にすり替える
    let targetInfo = { ...info };

    if (info.type === 'node-text') {
        // 掴んだ文字の親ノードが、すでに複数選択リストに入っているかチェック
        if (selectedNodeIds.has(info.id) && selectedNodeIds.size > 1) {
            targetInfo.type = 'node'; // グループ移動モードへ！
        }
    } else if (info.type === 'conn-label') {
        // 掴んだラベルの線が、すでに選択リストに入っているかチェック
        if (selectedConnIds.has(info.connId)) {
            // 線が選ばれている、または他にも何か選ばれている場合は「ノード移動」と同じ差分移動をさせる
            targetInfo.type = 'node'; 
            targetInfo.id = info.connId; // ダミーIDとしてセット
        }
    }

    if (targetInfo.type === 'node') {
        // [パターンA] ノード本体、またはグループ化された要素のドラッグ

        // まだ選択されていないノードを単体で掴んだ場合（targetInfo.id を使用）
        if (targetInfo.id && !selectedNodeIds.has(targetInfo.id) && !selectedConnIds.has(targetInfo.id)) {
            // info.type が node の時だけ選択し直す（文字からの昇格時は既存の選択を維持）
            if (info.type === 'node') selectNode(targetInfo.id);
        } else {
            selectedId = targetInfo.id;
        }

        // メニュー更新（ノード単体クリック時などの利便性のため）
        const menu = document.getElementById('context-menu');
        if (menu.style.display === 'block' && info.id) {
            const node = nodes.find(n => n.id === info.id);
            if (node) {
                const currentX = parseInt(menu.style.left) || 0;
                const currentY = parseInt(menu.style.top) || 0;
                openContextMenu(node, node.type === 'box' ? 'box' : 'node', currentX, currentY);
            }
        }

        dragInfo = targetInfo;
        dragOffset.x = pos.x;
        dragOffset.y = pos.y;

    } else if (info.type === 'node-text') {
        // [パターンB] 単体での文字移動（グループ選択されていない時）
        if (selectedId !== info.id) {
            selectNode(info.id);
        }
        dragInfo = info;
        dragOffset.x = pos.x;
        dragOffset.y = pos.y;

    } else if (info.type === 'conn-label') {
        // [パターンC] 単体での線ラベル移動（グループ選択されていない時）
        if (selectedConnId !== info.connId) {
            selectNode(null);
            selectConnection(info.connId);
        }
        dragInfo = info;
        dragOffset.x = pos.x;
        dragOffset.y = pos.y;

    } else {
        // [パターンD] ハンドル・ウェイポイント（既存のまま）
        if (selectedConnId !== info.connId) {
            selectNode(null);
            selectConnection(info.connId);
        }
        dragInfo = info;
        const rect = container.getBoundingClientRect();
        dragOffset.x = rect.left;
        dragOffset.y = rect.top;
    }
}

// ★新規追加：線の直線部分を押したときの処理
// ★修正：線の直線部分を押したときの処理（ズーム対応＆右クリ修正版）
function handleLineMouseDown(e, conn) {
    // 1. 右クリック暴発防止（右クリックは button 2 なの）
    // 左クリック(0)以外は、ここで帰ってもらうわ！
    if (e.button !== 0) return;

    if (e.shiftKey) return; // Shiftキーの機能（もしあれば）を阻害しないように
    e.stopPropagation(); // 背景クリックなどを防ぐ

    // 2. 未選択なら「選択」するだけ（ドラッグは開始しない）
    if (selectedConnId !== conn.id) {
        selectNode(null);
        selectConnection(conn.id);

        // メニューが開いていれば切り替え
        const menu = document.getElementById('context-menu');
        if (menu.style.display === 'block') {
            const currentX = parseInt(menu.style.left) || 0;
            const currentY = parseInt(menu.style.top) || 0;
            openContextMenu(conn, 'connection', currentX, currentY);
        }
        return;
    }

    // 3. 選択済みなら「関節を追加」して「即ドラッグ開始」！

    const pos = getPointerPos(e);

    // ★ここが修正のキモ！
    // 画面上のマウス位置(pos)から、viewport(視点)のズレを引いて、
    // さらに scale(倍率) で割ることで、正しい「ワールド座標」を出すの。
    const clickX = (pos.x - viewport.x) / viewport.scale;
    const clickY = (pos.y - viewport.y) / viewport.scale;

    // 挿入位置の計算
    const allPoints = [getPointPosition(conn.start)];
    conn.waypoints.forEach(wp => allPoints.push(wp));
    allPoints.push(getPointPosition(conn.end));

    let bestIndex = 0;
    let minDetour = Infinity;

    for (let i = 0; i < allPoints.length - 1; i++) {
        const A = allPoints[i];
        const B = allPoints[i + 1];

        // ここで計算する距離も、補正後の clickX, clickY を使うから正確になるわ
        const distAC = Math.hypot(clickX - A.x, clickY - A.y);
        const distCB = Math.hypot(B.x - clickX, B.y - clickY);
        const distAB = Math.hypot(B.x - A.x, B.y - A.y);
        const detour = (distAC + distCB) - distAB;

        if (detour < minDetour) {
            minDetour = detour;
            bestIndex = i;
        }
    }

    // 関節を追加（補正済みの座標を使うから、カーソルの真下にできる！）
    conn.waypoints.splice(bestIndex, 0, { x: clickX, y: clickY });

    // 画面更新
    render();
    if (editingConnId === conn.id) updateConnPreview(conn);

    // ドラッグ開始
    isDragging = true;
    dragInfo = {
        type: 'waypoint',
        connId: conn.id,
        index: bestIndex
    };

    // ★重要：mousemoveでの計算用オフセット
    // ここも rect.left ではなく viewport.x を使うことで統一するわ
    dragOffset.x = viewport.x;
    dragOffset.y = viewport.y;
}

// ====== グローバルイベント（マウス・タッチ共通） =====

// 動き（Move）
['mousemove', 'touchmove'].forEach(evtName => {
    window.addEventListener(evtName, (e) => {
        if (!isDragging || !dragInfo) return; // dragInfoがない場合もガード

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        if (e.type === 'touchmove') e.preventDefault();

        const pos = getPointerPos(e);

        // --- タイプ別の移動処理 ---

        // Case 1: 線ラベル or ノード文字 のドラッグ（差分計算方式）
        if (dragInfo.type === 'conn-label' || dragInfo.type === 'node-text') {

            // ★変更：ズーム倍率で割って、ワールド座標での移動量を出す
            const dx = (pos.x - dragOffset.x) / viewport.scale;
            const dy = (pos.y - dragOffset.y) / viewport.scale;

            // 次回のために現在位置を保存
            dragOffset.x = pos.x;
            dragOffset.y = pos.y;

            if (dragInfo.type === 'conn-label') {
                // 線のラベル移動
                const conn = connections.find(c => c.id === dragInfo.connId);
                if (conn) {
                    if (!conn.label) conn.label = {};
                    conn.label.offsetX = (conn.label.offsetX || 0) + dx;
                    conn.label.offsetY = (conn.label.offsetY || 0) + dy;

                    render();
                    if (editingConnId === conn.id) updateConnPreview(conn);
                }
            }
            else if (dragInfo.type === 'node-text') {
                // ノード文字移動
                const node = nodes.find(n => n.id === dragInfo.id);
                if (node) {
                    if (!node.text) node.text = {};
                    // 現在値に加算
                    node.text.x = (node.text.x !== undefined ? node.text.x : 60) + dx;
                    node.text.y = (node.text.y !== undefined ? node.text.y : 30) + dy;

                    // 画面更新
                    refreshNodeStyle(node);
                    if (editingNodeId === node.id) updatePreview(node);
                }
            }
            return; // ここで終了
        }


        // Case 2: それ以外

        // ノード移動（マルチセレクト対応）
        if (dragInfo.type === 'node') {
            // ★変更：ここもズーム倍率で割る！
            const dx = (pos.x - dragOffset.x) / viewport.scale;
            const dy = (pos.y - dragOffset.y) / viewport.scale;

            dragOffset.x = pos.x;
            dragOffset.y = pos.y;

            // 1. ノードを動かす
            selectedNodeIds.forEach(id => {
                const node = nodes.find(n => n.id === id);
                if (node) {
                    node.x += dx;
                    node.y += dy;
                    const el = document.getElementById(id);
                    if (el) {
                        el.style.left = node.x + 'px';
                        el.style.top = node.y + 'px';
                    }
                }
            });

            // 2. 選択されている矢印の「関節」なども一緒に動かす
            selectedConnIds.forEach(id => {
                const conn = connections.find(c => c.id === id);
                if (conn) {
                    conn.waypoints.forEach(wp => {
                        wp.x += dx;
                        wp.y += dy;
                    });
                    if (conn.start.type === 'point') { conn.start.x += dx; conn.start.y += dy; }
                    if (conn.end.type === 'point') { conn.end.x += dx; conn.end.y += dy; }
                }
            });

            render();
            return;
        }

        // --- ハンドル・ウェイポイントの処理 ---
        // ★変更：絶対座標（ターゲット位置）を計算するときも、スケールで補正が必要なの！
        // 「画面上のマウス位置(pos.x)」から「コンテナの左上(dragOffset.x)」を引くと「画面上での距離」が出る。
        // それを scale で割れば、「コンテナ内での本当の距離（ワールド座標）」になるわ。
        const targetX = (pos.x - dragOffset.x) / viewport.scale;
        const targetY = (pos.y - dragOffset.y) / viewport.scale;

        if (dragInfo.type === 'handle') {
            // ハンドル移動
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
            if (editingConnId === conn.id) updateConnPreview(conn);

        } else if (dragInfo.type === 'waypoint') {

            // 画面外に出たかチェック（削除判定）
            const margin = 50;
            const w = window.innerWidth;
            const h = window.innerHeight;

            // ※削除判定は「画面上の見た目」で行うから、pos.x (生の座標) を使うのが正解よ
            if (pos.x < margin || pos.x > w - margin || pos.y < margin || pos.y > h - margin) {
                const conn = connections.find(c => c.id === dragInfo.connId);
                if (conn) {
                    conn.waypoints.splice(dragInfo.index, 1);
                    render();
                    if (editingConnId === conn.id) updateConnPreview(conn);
                    recordHistory();
                }
                isDragging = false;
                dragInfo = null;
                return;
            }

            // ウェイポイント移動
            const conn = connections.find(c => c.id === dragInfo.connId);
            const wp = conn.waypoints[dragInfo.index];
            let finalX = targetX;
            let finalY = targetY;

            if (e.shiftKey) {
                // L字コーナー補正（ここも座標計算が必要だけど、targetX/Yが既に補正済みだからそのままでOK）
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

                if (dist1 < dist2) {
                    finalX = corner1.x;
                    finalY = corner1.y;
                } else {
                    finalX = corner2.x;
                    finalY = corner2.y;
                }
            }

            wp.x = finalX;
            wp.y = finalY;
            render();
            if (editingConnId === conn.id) updateConnPreview(conn);
        }

    }, { passive: false });
});

// 終了（End）
['mouseup', 'touchend'].forEach(evtName => {
    window.addEventListener(evtName, (e) => {
        if (isDragging) {
            // console.log(`👋 RELEASED [${evtName}]`); // ログ追加
            recordHistory();
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
            selectConnection(null);
            closeContextMenu();
            // ★追加：サブメニューも閉じる
            subToolbar.classList.remove('open');
            btnMenuToggle.classList.remove('active');
        }
    });
});


// ====== メインキャンバスでのノードリサイズ（修正版） ======

let isNodeResizing = false;
let resizeNodeId = null;
let nodeResizeStartPos = { x: 0, y: 0 };
let nodeResizeStartSize = { w: 0, h: 0 };
let nodeResizeStartCoords = { x: 0, y: 0 };
let nodeResizeDir = '';

function startResizeNode(e, nodeId, dir) {
    isNodeResizing = true;
    resizeNodeId = nodeId;
    nodeResizeDir = dir;
    nodeResizeStartPos = { x: e.clientX, y: e.clientY };

    editingNodeId = nodeId;

    // --- 複数選択（グループリサイズ）の場合 ---
    if (selectedNodeIds.size > 1 && selectedNodeIds.has(nodeId)) {
        // 1. ノード情報の保存（文字情報も追加！）
        resizeGroupInitialState.clear();
        selectedNodeIds.forEach(id => {
            const n = nodes.find(node => node.id === id);
            if (n) {
                // テキスト情報がない場合の安全策
                const t = n.text || {};
                
                resizeGroupInitialState.set(id, {
                    x: n.x,
                    y: n.y,
                    w: parseInt(n.style?.width) || 120,
                    h: parseInt(n.style?.height) || 60,
                    // ★追加：文字の位置とサイズも覚える
                    textX: t.x !== undefined ? t.x : (parseInt(n.style?.width)||120)/2,
                    textY: t.y !== undefined ? t.y : (parseInt(n.style?.height)||60)/2,
                    fontSize: t.fontSize || 14
                });
            }
        });

        // 2. ★追加：選択された矢印情報の保存（ラベル情報も追加！）
        resizeConnInitialState.clear();
        selectedConnIds.forEach(id => {
            const conn = connections.find(c => c.id === id);
            if (conn) {
                // Waypointsの完全コピー
                const wpCopy = conn.waypoints.map(p => ({ ...p }));
                let startPoint = (conn.start.type === 'point') ? { ...conn.start } : null;
                let endPoint = (conn.end.type === 'point') ? { ...conn.end } : null;
                
                // ★追加：ラベル情報の保存
                const l = conn.label || {};

                resizeConnInitialState.set(id, {
                    waypoints: wpCopy,
                    start: startPoint,
                    end: endPoint,
                    // ここが追加分！
                    fontSize: l.fontSize || 12,
                    offsetX: l.offsetX || 0,
                    offsetY: l.offsetY || 0
                });
            }
        });

        // 3. 基準点（アンカー）の計算
        const leader = resizeGroupInitialState.get(nodeId);
        if (dir === 'nw') {
            resizeAnchorPoint = { x: leader.x + leader.w, y: leader.y + leader.h };
        } else if (dir === 'ne') {
            resizeAnchorPoint = { x: leader.x, y: leader.y + leader.h };
        } else if (dir === 'sw') {
            resizeAnchorPoint = { x: leader.x + leader.w, y: leader.y };
        } else if (dir === 'se') {
            resizeAnchorPoint = { x: leader.x, y: leader.y };
        }
        
        nodeResizeStartSize = { w: leader.w, h: leader.h };
        
    } else {
        // --- 単一選択（既存のまま） ---
        resizeGroupInitialState.clear();
        resizeConnInitialState.clear(); // クリアしておく
        
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            nodeResizeStartSize = {
                w: parseInt(node.style?.width) || 120,
                h: parseInt(node.style?.height) || 60
            };
            nodeResizeStartCoords = { x: node.x, y: node.y };
        }
    }
}

// リサイズ中の動き

// script.js - リサイズ用の mousemove リスナー（グループリサイズ対応版）
window.addEventListener('mousemove', (e) => {
    // ★ここが目印！これ以外の mousemove は消さないでね
    if (!isNodeResizing || !resizeNodeId) return;

    e.preventDefault();

    const dx = e.clientX - nodeResizeStartPos.x;
    const dy = e.clientY - nodeResizeStartPos.y;

    // === A. 複数選択（グループリサイズ）の場合 ===
    if (resizeGroupInitialState.size > 0) {
        // 1. リーダーの「仮の新しいサイズ」を計算（倍率算出のためだけ）
        let startW = nodeResizeStartSize.w;
        let startH = nodeResizeStartSize.h;
        let newLeaderW = startW;
        let newLeaderH = startH;

        // ハンドル操作によるサイズ変化量
        if (nodeResizeDir.includes('e')) newLeaderW += dx;
        if (nodeResizeDir.includes('w')) newLeaderW -= dx;
        if (nodeResizeDir.includes('s')) newLeaderH += dy;
        if (nodeResizeDir.includes('n')) newLeaderH -= dy;

        // 最小サイズ制限（リーダーが潰れないように）
        newLeaderW = Math.max(30, newLeaderW);
        newLeaderH = Math.max(30, newLeaderH);

        // 2. 倍率（Scale）の計算
        let scaleX = newLeaderW / startW;
        let scaleY = newLeaderH / startH;

        // ★承認済みロジック：変化が大きい方を採用してアスペクト比維持！
        let finalScale = 1.0;
        // 1.0からのズレ（絶対値）を比較
        if (Math.abs(scaleX - 1.0) > Math.abs(scaleY - 1.0)) {
            finalScale = scaleX;
        } else {
            finalScale = scaleY;
        }


        // 3. ★追加：矢印（Waypoints & Label）の更新
        resizeConnInitialState.forEach((initial, id) => {
            const conn = connections.find(c => c.id === id);
            if (!conn) return;

            // --- A. 形状（座標）の更新 ---
            conn.waypoints.forEach((wp, index) => {
                const initWp = initial.waypoints[index];
                if (initWp) {
                    wp.x = resizeAnchorPoint.x + (initWp.x - resizeAnchorPoint.x) * finalScale;
                    wp.y = resizeAnchorPoint.y + (initWp.y - resizeAnchorPoint.y) * finalScale;
                }
            });

            if (initial.start && conn.start.type === 'point') {
                conn.start.x = resizeAnchorPoint.x + (initial.start.x - resizeAnchorPoint.x) * finalScale;
                conn.start.y = resizeAnchorPoint.y + (initial.start.y - resizeAnchorPoint.y) * finalScale;
            }
            if (initial.end && conn.end.type === 'point') {
                conn.end.x = resizeAnchorPoint.x + (initial.end.x - resizeAnchorPoint.x) * finalScale;
                conn.end.y = resizeAnchorPoint.y + (initial.end.y - resizeAnchorPoint.y) * finalScale;
            }

            // --- B. ★追加：ラベル（サイズと位置）の更新 ---
            if (!conn.label) conn.label = {};

            // 1. フォントサイズ
            let targetConnFS = initial.fontSize * finalScale;
            targetConnFS = Math.max(8, targetConnFS); // 最小8pxくらいでガード
            conn.label.fontSize = targetConnFS;

            // 2. 位置（オフセット）
            // これで「線からの距離」も倍率に合わせて広がるから、見た目の位置関係が保たれるの！
            conn.label.offsetX = initial.offsetX * finalScale;
            conn.label.offsetY = initial.offsetY * finalScale;

            // 3. プロパティパネル同期（もしこの線を選択中なら）
            if (editingConnId === id) {
                const inputConnFS = document.getElementById('input-conn-font-size');
                if (inputConnFS) {
                    inputConnFS.value = Math.round(targetConnFS);
                }
                updateConnPreview(conn);
            }
        });
        
        // 線の位置もズレるから再描画！
        render();
    } 
    // === B. 単一選択（通常リサイズ）の場合 ===
    else {
        // --- 既存のロジック（そのまま） ---
        const startW = nodeResizeStartSize.w;
        const startH = nodeResizeStartSize.h;
        const startX = nodeResizeStartCoords.x;
        const startY = nodeResizeStartCoords.y;

        let newW = startW;
        let newH = startH;
        let newX = startX;
        let newY = startY;

        if (nodeResizeDir.includes('e')) newW = startW + dx;
        if (nodeResizeDir.includes('w')) newW = startW - dx;
        if (nodeResizeDir.includes('s')) newH = startH + dy;
        if (nodeResizeDir.includes('n')) newH = startH - dy;

        newW = Math.max(30, newW);
        newH = Math.max(30, newH);

        // Shiftキー（正方形維持）
        if (e.shiftKey) {
            const size = Math.max(newW, newH);
            newW = size;
            newH = size;
        }

        if (nodeResizeDir.includes('w')) {
            newX = (startX + startW) - newW;
        }
        if (nodeResizeDir.includes('n')) {
            newY = (startY + startH) - newH;
        }

        const node = nodes.find(n => n.id === resizeNodeId);
        if (node) {
            node.x = newX;
            node.y = newY;
            const el = document.getElementById(resizeNodeId);
            el.style.left = newX + 'px';
            el.style.top = newY + 'px';
            updateNodeSizeFromPreview(newW, newH);
        }
    }
});

window.addEventListener('mouseup', () => {
    if (isNodeResizing) {
        recordHistory();
        resizeGroupInitialState.clear(); // ★追加：初期状態マップをクリア
    }
    isNodeResizing = false;
    resizeNodeId = null;
});

// ====== [統合] ノードプロパティのイベントリスナー ======
// ※以前の「マルチボックス用」イベントリスナーは全て削除して、これに置き換えてね！

// 1. 透過率 (input-opacity)
const inputOpacity = document.getElementById('input-opacity');
if (inputOpacity) {
    inputOpacity.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('val-opacity').textContent = val + '%';
        updateNodeProperty('style', 'opacity', val);
    });
}

// 2. 枠線の種類 (toggle-border-style)
document.querySelectorAll('#toggle-border-style button').forEach(btn => {
    btn.addEventListener('click', () => {
        updateNodeProperty('style', 'borderStyle', btn.dataset.val);
        updateToggleActiveState('toggle-border-style', btn.dataset.val);
    });
});

// 3. テキスト配置 (toggle-align)
document.querySelectorAll('#toggle-align button').forEach(btn => {
    btn.addEventListener('click', () => {
        updateNodeProperty('text', 'align', btn.dataset.val);
        updateToggleActiveState('toggle-align', btn.dataset.val);
    });
});

// 4. 箱の影 (toggle-box-shadow)
document.querySelectorAll('#toggle-box-shadow button').forEach(btn => {
    btn.addEventListener('click', () => {
        // applyShadow関数は共通化済み
        applyShadow('box', btn.dataset.val);
        updateToggleActiveState('toggle-box-shadow', btn.dataset.val);
    });
});

// 5. 文字の影 (toggle-text-shadow)
document.querySelectorAll('#toggle-text-shadow button').forEach(btn => {
    btn.addEventListener('click', () => {
        applyShadow('text', btn.dataset.val);
        updateToggleActiveState('toggle-text-shadow', btn.dataset.val);
    });
});

// 6. 画像削除ボタン
const btnRemoveImgUnified = document.getElementById('btn-remove-image');
if (btnRemoveImgUnified) {
    btnRemoveImgUnified.addEventListener('click', () => {
        if (!editingNodeId) return;
        const node = nodes.find(n => n.id === editingNodeId);
        if (node && node.style) {
            node.style.backgroundImage = 'none';
            refreshNodeStyle(node);
            updatePreview(node);
            
            // ボタンを隠す
            btnRemoveImgUnified.style.display = 'none';
        }
    });
}

// ※ 補足: 
// input-border-width, input-font-size, btn-font-bold などのリスナーは、
// 以前の「人物用」として書かれていたコード（このブロックより上にあるはず）が
// そのまま統合版として動くから、ここには書かなくて大丈夫なの！


// ====== 複製機能 ======

document.getElementById('btn-duplicate').addEventListener('click', () => {
    // 1. 人物（ノード）の複製
    if (editingNodeId) {
        const original = nodes.find(n => n.id === editingNodeId);
        if (!original) return;

        // ディープコピー（完全に独立したコピーを作る魔法）
        const clone = JSON.parse(JSON.stringify(original));

        // 新しいIDを発行
        clone.id = generateId();

        // 位置を少し右下にずらす（重なると見えないからね！）
        clone.x += 30;
        clone.y += 30;

        // ラベルに「コピー」ってつけておくと親切かも（お好みで！）
        // clone.label += " (コピー)"; 

        nodes.push(clone);

        recordHistory();
        // 画面更新
        refreshScreen();

        // 複製した新しい方を選択状態にして、メニューも開き直す
        // (メニューの位置はそのままキープしたいから、今のstyle.left/topを取得して渡すの)
        const menu = document.getElementById('context-menu');
        const currentX = parseInt(menu.style.left);
        const currentY = parseInt(menu.style.top);

        selectNode(clone.id);
        openContextMenu(clone, 'node', currentX, currentY);
    }
    // 2. 線（コネクション）の複製
    else if (editingConnId) {
        const original = connections.find(c => c.id === editingConnId);
        if (!original) return;

        const clone = JSON.parse(JSON.stringify(original));
        clone.id = generateId();

        // ★修正：位置をずらすロジックを追加
        const OFFSET = 30; // ずらす量

        // A. 始点・終点が「座標指定(point)」なら、その座標をずらす
        if (clone.start.type === 'point') { clone.start.x += OFFSET; clone.start.y += OFFSET; }
        if (clone.end.type === 'point') { clone.end.x += OFFSET; clone.end.y += OFFSET; }

        // B. 経由点(waypoints)の処理
        if (clone.waypoints.length > 0) {
            // 経由点があるなら、それらを全部ずらす
            clone.waypoints.forEach(wp => {
                wp.x += OFFSET;
                wp.y += OFFSET;
            });
        } else {
            // 経由点がない（直線の）場合
            // 重なって見えなくなるのを防ぐため、真ん中に「ずらした経由点」を1個作るの！

            // 元の線の始点・終点の座標を計算（便利関数を拝借！）
            const sPos = getPointPosition(original.start);
            const ePos = getPointPosition(original.end);

            const midX = (sPos.x + ePos.x) / 2;
            const midY = (sPos.y + ePos.y) / 2;

            // 中間点から少しずらした位置にウェイポイントを追加
            clone.waypoints.push({ x: midX + OFFSET, y: midY + OFFSET });
        }

        connections.push(clone);

        recordHistory();
        refreshScreen();

        // 新しい線を選択してメニューを開く
        const menu = document.getElementById('context-menu');
        const currentX = parseInt(menu.style.left);
        const currentY = parseInt(menu.style.top);

        selectConnection(clone.id);
        openContextMenu(clone, 'connection', currentX, currentY);
    }
});

// ====== 重なり順の変更機能 ======

// 最前面へ（配列の末尾に移動）
document.getElementById('btn-order-front').addEventListener('click', () => {
    changeOrder('front');
    recordHistory();
});

// 最背面へ（配列の先頭に移動）
document.getElementById('btn-order-back').addEventListener('click', () => {
    changeOrder('back');
    recordHistory();
});

function changeOrder(direction) {
    // 1. ノード（人物・ボックス）の場合
    if (editingNodeId) {
        const idx = nodes.findIndex(n => n.id === editingNodeId);
        if (idx === -1) return;

        const targetNode = nodes[idx];

        // 配列から削除
        nodes.splice(idx, 1);

        if (direction === 'front') {
            // 末尾に追加（最前面）
            nodes.push(targetNode);
        } else {
            // 先頭に追加（最背面）
            nodes.unshift(targetNode);
        }

        // 画面全体を描き直して反映
        refreshScreen();

        // 選択状態とメニューを維持したまま、フォーカスし直す
        // (refreshScreenでDOMが作り直されると選択が外れることがあるため)
        selectNode(targetNode.id);
    }
    // 2. 矢印（コネクション）の場合
    else if (editingConnId) {
        const idx = connections.findIndex(c => c.id === editingConnId);
        if (idx === -1) return;

        const targetConn = connections[idx];

        connections.splice(idx, 1);

        if (direction === 'front') {
            connections.push(targetConn);
        } else {
            connections.unshift(targetConn);
        }

        // 矢印は render() だけで反映されるわ
        render();
        selectConnection(targetConn.id);
    }
}

// ====== アコーディオン制御 ======

// 全てのアコーディオンヘッダーにクリックイベントを登録
document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
        // 親要素（item）を取得
        const item = header.parentElement;

        // クラス 'open' を付け外しする（これでCSSが反応して開閉する）
        item.classList.toggle('open');
    });
});


// ====== 歴史管理システム（Undo/Redo） ======

const MAX_HISTORY = 50; // 50回まで戻れる
let historyStack = [];
let historyIndex = -1;

// 現在の状態を保存する関数
function recordHistory() {
    // 未来の履歴（Redo用）を断ち切る
    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }

    // データの完全コピー（スナップショット）を作成
    const snapshot = JSON.stringify({
        nodes: nodes,
        connections: connections,
        appSettings: appSettings
    });

    // 同じ状態の連続保存を防ぐ（軽量化）
    if (historyStack.length > 0 && historyStack[historyIndex] === snapshot) {
        return;
    }

    historyStack.push(snapshot);
    if (historyStack.length > MAX_HISTORY) {
        historyStack.shift(); // 古い履歴を捨てる
    } else {
        historyIndex++;
    }

    updateHistoryButtons();
}

// 履歴を復元する関数
function restoreHistory(jsonString) {
    const data = JSON.parse(jsonString);

    nodes = data.nodes;
    connections = data.connections;
    appSettings = data.appSettings;

    // ガイド復元（前回のコード）
    if (appSettings.showGuide === undefined) appSettings.showGuide = true;
    
    // タイトルの復元
    if (!appSettings.title) appSettings.title = '人物相関図作成アプリ'; // 古いデータ用

    const wm = document.getElementById('print-watermark');
    if (wm) wm.textContent = appSettings.title;

    // 入力欄とキャンバスの文字を同期
    if (inputAppTitle) inputAppTitle.value = appSettings.title;
    if (artboardTitleText) artboardTitleText.textContent = appSettings.title;

    refreshScreen();
    document.body.style.backgroundColor = appSettings.backgroundColor;
    document.getElementById('tool-bg-picker').value = appSettings.backgroundColor;
    document.getElementById('tool-bg-hex').value = appSettings.backgroundColor;
    updateGuideVisibility();
}

// アンドゥ実行
function executeUndo() {
    if (historyIndex > 0) {
        historyIndex--;
        restoreHistory(historyStack[historyIndex]);
        updateHistoryButtons();
        // 選択状態などはリセットするのが無難
        selectNode(null);
        closeContextMenu();
    }
}

// リドゥ実行
function executeRedo() {
    if (historyIndex < historyStack.length - 1) {
        historyIndex++;
        restoreHistory(historyStack[historyIndex]);
        updateHistoryButtons();
        selectNode(null);
        closeContextMenu();
    }
}

// ボタンの見た目更新
function updateHistoryButtons() {
    document.getElementById('btn-undo').disabled = (historyIndex <= 0);
    document.getElementById('btn-redo').disabled = (historyIndex >= historyStack.length - 1);
}

// イベント登録
document.getElementById('btn-undo').addEventListener('click', executeUndo);
document.getElementById('btn-redo').addEventListener('click', executeRedo);

// キーボードショートカット (Ctrl+Z / Ctrl+Y)
window.addEventListener('keydown', (e) => {
    // 入力欄にいるときは発動しない
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        executeUndo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { // MacはShift+Cmd+Zも一般的
        e.preventDefault();
        executeRedo();
    }
});

// ★追加：ビューポートを更新する関数
function updateViewport() {
    // world-layer 全体を動かす＆拡大縮小する魔法
    // transform-origin は CSS で 0 0 に設定済みなので、左上基準で変形してから移動する計算になるわ
    container.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
}

// ★追加：初期位置を「A4ガイドが画面ど真ん中」に来るようにセット
function initViewport() {
    const artboardW = 1123;
    const artboardH = 794;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // 画面中央 - アートボード中央
    viewport.x = (screenW - artboardW) / 2;
    viewport.y = (screenH - artboardH) / 2;

    updateViewport();
}

// ====== パン（視点移動）操作の実装 ======

// 背景（canvasContainer）でのマウスダウン
canvasContainer.addEventListener('mousedown', (e) => {
    // ツールバーやメニューの上なら何もしない
    if (e.target.closest('#toolbar') || e.target.closest('#ui-layer') || e.target.closest('#context-menu')) return;

    if (e.button !== 0) return;
    // 背景、またはSVG背景(線がないところ)、またはガイド枠をクリックした時
    if (e.target === canvasContainer || e.target === svgLayer || e.target.id === 'artboard-guide' || e.target === container) {
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };

        // 選択解除
        selectNode(null);
        selectConnection(null);
        closeContextMenu();

        const subToolbar = document.getElementById('sub-toolbar');
        const btnMenuToggle = document.getElementById('btn-menu-toggle');
        if (subToolbar) subToolbar.classList.remove('open');
        if (btnMenuToggle) btnMenuToggle.classList.remove('active');

        canvasContainer.style.cursor = 'grabbing';
    }
});

// マウスムーブ（ウィンドウ全体で監視）
window.addEventListener('mousemove', (e) => {
    if (isPanning) {
        e.preventDefault();
        const dx = e.clientX - panStart.x;
        const dy = e.clientY - panStart.y;

        panStart = { x: e.clientX, y: e.clientY };

        viewport.x += dx;
        viewport.y += dy;

        updateViewport();
    }
});

// マウスアップ
window.addEventListener('mouseup', () => {
    if (isPanning) {
        isPanning = false;
        canvasContainer.style.cursor = 'grab';
    }
});


// ====== 範囲選択（右ドラッグ）の実装 ======

// 右クリックメニューが出ないようにする（コンテナ上のみ）
canvasContainer.addEventListener('contextmenu', (e) => {
    if (e.target === canvasContainer || e.target === svgLayer || e.target === container) {
        e.preventDefault();
    }
});

// 範囲選択の開始（mousedown）
canvasContainer.addEventListener('mousedown', (e) => {
    // 右クリック(button 2) かつ、背景などをクリックした時
    if (e.button === 2 && (e.target === canvasContainer || e.target === svgLayer || e.target === container || e.target.id === 'artboard-guide')) {
        e.stopPropagation();

        isSelecting = true;

        // ★修正ポイント：ここも scale で割って「ワールド座標」にするの！
        selectionStart = {
            x: (e.clientX - viewport.x) / viewport.scale,
            y: (e.clientY - viewport.y) / viewport.scale
        };

        // ボックス要素を作成
        selectionBoxEl = document.createElement('div');
        selectionBoxEl.className = 'selection-box';
        container.appendChild(selectionBoxEl);

        updateSelectionBox(selectionStart.x, selectionStart.y, 0, 0);
    }
});

// 範囲選択中の動き（mousemove）
window.addEventListener('mousemove', (e) => {
    if (!isSelecting || !selectionBoxEl) return;

    e.preventDefault();

    // ★修正ポイント：ここも scale で割る！
    const currentX = (e.clientX - viewport.x) / viewport.scale;
    const currentY = (e.clientY - viewport.y) / viewport.scale;

    // 始点と現在地から、左上の座標(x,y)と幅高さ(w,h)を計算
    const x = Math.min(selectionStart.x, currentX);
    const y = Math.min(selectionStart.y, currentY);
    const w = Math.abs(currentX - selectionStart.x);
    const h = Math.abs(currentY - selectionStart.y);

    updateSelectionBox(x, y, w, h);
});

// 範囲選択の終了（mouseup）
window.addEventListener('mouseup', (e) => {
    if (isSelecting) {
        // 範囲内のノードを探して選択する判定処理
        finishSelection();

        // 後片付け
        isSelecting = false;
        if (selectionBoxEl) {
            selectionBoxEl.remove();
            selectionBoxEl = null;
        }
    }
});

// ボックスの見た目を更新するヘルパー
function updateSelectionBox(x, y, w, h) {
    if (selectionBoxEl) {
        selectionBoxEl.style.left = x + 'px';
        selectionBoxEl.style.top = y + 'px';
        selectionBoxEl.style.width = w + 'px';
        selectionBoxEl.style.height = h + 'px';
    }
}

// 選択判定ロジック
// ★書き換え：選択判定ロジック
function finishSelection() {
    if (!selectionBoxEl) return;

    // ボックスの座標（世界座標）
    const boxLeft = parseFloat(selectionBoxEl.style.left);
    const boxTop = parseFloat(selectionBoxEl.style.top);
    const boxRight = boxLeft + parseFloat(selectionBoxEl.style.width);
    const boxBottom = boxTop + parseFloat(selectionBoxEl.style.height);

    // 一旦クリア
    selectNode(null);
    selectConnection(null);

    // 1. ノードの判定
    nodes.forEach(node => {
        const w = node.style?.width || 120;
        const h = node.style?.height || 60;
        const nRight = node.x + w;
        const nBottom = node.y + h;

        // ボックスに触れていれば選択
        if (node.x < boxRight && nRight > boxLeft &&
            node.y < boxBottom && nBottom > boxTop) {

            selectedNodeIds.add(node.id);
            const el = document.getElementById(node.id);
            if (el) el.classList.add('selected');
        }
    });

    // 2. ★追加：矢印の判定（始点・終点・関節のどれかが入っていたら選択！）
    connections.forEach(conn => {
        const points = [];
        points.push(getPointPosition(conn.start)); // 始点
        points.push(getPointPosition(conn.end));   // 終点
        conn.waypoints.forEach(wp => points.push(wp)); // 関節

        // どれか1つでもボックスに入っていれば「選択」とみなすわ
        const isHit = points.some(p =>
            p.x >= boxLeft && p.x <= boxRight &&
            p.y >= boxTop && p.y <= boxBottom
        );

        if (isHit) {
            selectedConnIds.add(conn.id);
        }
    });

    render();

    // パネル更新用（最後の選択物をセット）
    if (selectedNodeIds.size > 0) {
        selectedId = Array.from(selectedNodeIds).pop();
    } else if (selectedConnIds.size > 0) {
        selectedConnId = Array.from(selectedConnIds).pop();
    }
}

// ====== ズーム機能（マウスホイール） ======

canvasContainer.addEventListener('wheel', (e) => {
    e.preventDefault(); // ブラウザ標準のスクロールを止める

    // 1. ズーム感度の設定（Macのトラックパッドは移動量が小さいので少し敏感にする）
    // e.deltaY がマイナスなら拡大、プラスなら縮小
    const zoomIntensity = 0.001;
    let newScale = viewport.scale - (e.deltaY * zoomIntensity * viewport.scale); // 現在のscaleに比例させるとなめらか

    // 2. 制限（10% 〜 500%）
    newScale = Math.max(0.1, Math.min(newScale, 5.0));

    // 3. マウス位置を中心にする計算（ここが数学！）
    // マウスのスクリーン座標
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // 現在の「マウス位置に対応するワールド座標」を計算
    // worldX = (mouseX - viewport.x) / oldScale
    const worldMouseX = (mouseX - viewport.x) / viewport.scale;
    const worldMouseY = (mouseY - viewport.y) / viewport.scale;

    // 新しいスケールを適用
    viewport.scale = newScale;

    // 新しいスケールでも「マウス位置に対応するワールド座標」が同じ場所に来るように viewport.x/y を逆算
    // mouseX = worldX * newScale + newViewportX
    // newViewportX = mouseX - worldX * newScale
    viewport.x = mouseX - worldMouseX * newScale;
    viewport.y = mouseY - worldMouseY * newScale;

    updateViewport();

}, { passive: false }); // passive: false にしないと preventDefault できないブラウザがあるの


// 画像透過率スライダーのイベント
const inputImgOpacity = document.getElementById('input-image-opacity');
if (inputImgOpacity) {
    inputImgOpacity.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('val-image-opacity').textContent = val + '%';
        updateNodeProperty('style', 'imageOpacity', val);
    });
}

// ====== スポットライト機能 ======

const spotlightLayer = document.getElementById('spotlight-layer');
const btnSpotlight = document.getElementById('btn-spotlight');
let isSpotlightOn = false;

// 1. 切り替えボタン
btnSpotlight.addEventListener('click', () => {
    isSpotlightOn = !isSpotlightOn;

    if (isSpotlightOn) {
        spotlightLayer.classList.add('active');
        btnSpotlight.classList.add('active');
        document.body.classList.add('presentation-mode');
    } else {
        spotlightLayer.classList.remove('active');
        btnSpotlight.classList.remove('active');
        document.body.classList.remove('presentation-mode');
    }
});

// 2. マウス追従（穴の位置を更新）
window.addEventListener('mousemove', (e) => {
    // スポットライトがOFFなら計算しない（省エネ）
    if (!isSpotlightOn) return;

    // CSS変数 (--x, --y) に現在のマウス座標を渡す
    // これだけで、CSS側の radial-gradient の中心が動くの！
    spotlightLayer.style.setProperty('--x', e.clientX + 'px');
    spotlightLayer.style.setProperty('--y', e.clientY + 'px');
});


// タイトル入力のイベントリスナー（ツールバー機能のあたりに追加）

const inputAppTitle = document.getElementById('input-app-title');
const artboardTitleText = document.getElementById('artboard-title-text');

// 入力が確定した時（エンターキーやフォーカスが外れた時）に更新＆履歴保存
inputAppTitle.addEventListener('change', (e) => {
    const val = e.target.value;
    
    // 空っぽならデフォルトに戻す？ それとも空のまま？
    // 今回は空なら「無題」とかにせず、そのまま反映させるね
    appSettings.title = val;
    
    // 画面の文字を更新
    if (artboardTitleText) {
        artboardTitleText.textContent = val || 'タイトル'; // 空なら「タイトル」と表示
    }
    
    // 印刷用の透かし文字も更新！
    const wm = document.getElementById('print-watermark');
    if (wm) wm.textContent = val || '';

    recordHistory();
});

// キー入力中もリアルタイムで画面の文字が変わると楽しいかも？（お好みで！）
inputAppTitle.addEventListener('input', (e) => {
    if (artboardTitleText) {
        artboardTitleText.textContent = e.target.value || 'タイトル';
    }
});


// 印刷ボタン
document.getElementById('btn-print').addEventListener('click', () => {
    // 選択状態を解除してキレイにしてから印刷画面へ
    selectNode(null);
    selectConnection(null);
    closeContextMenu();
    
    // ブラウザの印刷ダイアログを起動
    window.print();
});


// 1. 保存機能
document.getElementById('btn-save').addEventListener('click', () => {
    // 最新のタイトルを確実に取得
    const currentTitle = appSettings.title || '人物相関図';

    const saveData = {
        version: "0.5",
        timestamp: new Date().toISOString(),
        appSettings: appSettings,
        nodes: nodes,
        connections: connections
    };

    const jsonString = JSON.stringify(saveData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);

    // ★ここがファイル名生成の魔法！
    
    // 1. ファイル名に使えない記号をアンダーバーに置換（安全対策）
    const safeTitle = currentTitle.replace(/[\\/:*?"<>|]/g, '_');
    
    // 2. 日時フォーマット (YYYYMMDD-HHmm)
    const now = new Date();
    const dateStr = now.getFullYear() +
                    String(now.getMonth() + 1).padStart(2, '0') +
                    String(now.getDate()).padStart(2, '0') + '-' +
                    String(now.getHours()).padStart(2, '0') +
                    String(now.getMinutes()).padStart(2, '0');

    // 3. 結合！ (rilavas → relavas に揃えておくね。もし rilavas が良ければ書き換えて！)
    link.download = `relavas_${safeTitle}_${dateStr}.json`; 
    
    link.click();
    URL.revokeObjectURL(link.href);
});


// 2. 読み込みボタン（隠しinputをクリック）
document.getElementById('btn-load').addEventListener('click', () => {
    document.getElementById('file-input').click(); // input type="file" を起動
});

// 3. ファイルが選択されたら読み込む
document.getElementById('file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const json = e.target.result;
            const data = JSON.parse(json);

            // データ形式の簡易チェック（nodesがあるか？）
            if (!data.nodes || !data.connections) {
                alert("データの形式が正しくないようです…ごめんねなの。");
                return;
            }

            // データを復元
            nodes = data.nodes;
            connections = data.connections;
            if (data.appSettings) {
                appSettings = data.appSettings;
            }

            // 画面反映
            refreshScreen();
            updateAppBackground(appSettings.backgroundColor);

            // 読み込んだ設定に合わせて、ガイドの表示/非表示を切り替えるの！
            if (typeof updateGuideVisibility === 'function') {
                 updateGuideVisibility();
            }
            // データにタイトルがない場合（古いファイルなど）はデフォルトに戻す
            if (!appSettings.title) appSettings.title = '人物相関図';

            // 1. 入力欄に反映
            const inputTitle = document.getElementById('input-app-title');
            if (inputTitle) {
                inputTitle.value = appSettings.title;
            }

            // 2. 印刷ガイドの横の文字に反映
            const artboardTitle = document.getElementById('artboard-title-text');
            if (artboardTitle) {
                artboardTitle.textContent = appSettings.title;
            }

            // 履歴にも保存（Undoできるように）
            recordHistory();

            // inputを空にする（同じファイルを再度開けるように）
            document.getElementById('file-input').value = '';
            
            // 完了メッセージ（なくてもいいけど、あると安心）
            // alert("ファイルを読み込みました！"); 

        } catch (err) {
            console.error(err);
            alert("読み込みに失敗しました…ファイルが壊れているかも？");
        }
    };
    reader.readAsText(file);
});

// script.js

// サブメニューの開閉制御
const btnMenuToggle = document.getElementById('btn-menu-toggle');
const subToolbar = document.getElementById('sub-toolbar');

btnMenuToggle.addEventListener('click', (e) => {
    e.stopPropagation(); // 親への伝播を止める（背景クリック判定と干渉しないように）
    
    // クラスを付け外しして表示切り替え
    subToolbar.classList.toggle('open');
    btnMenuToggle.classList.toggle('active');
});

// サブメニュー内をクリックしても閉じないようにする
subToolbar.addEventListener('click', (e) => {
    e.stopPropagation();
});

// ====== アプリ起動 ======
initViewport(); // ★追加：最初に画面位置を合わせる！
initNodes();
render();
updateGuideVisibility();
recordHistory();
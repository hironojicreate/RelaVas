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
        style: { width: 60, height: 60, backgroundColor: "#ffffff" },
        text: { x: 30, y: 35 }
    },
    // 2. ヴァス（右下）- 60px正方形
    {
        id: "node-b", x: 650, y: 340, // ガイド中央へ移動
        label: "ヴァス",
        style: { width: 60, height: 60, backgroundColor: "#ffffff" },
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
            borderWidth: 2
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
        label: "【基本操作】\n\n📝 部品編集: 右クリック\n🖐️ 移動: 背景ドラッグ\n📦 まとめて移動: 右クリック＋ドラッグ\n\n✨ 便利技:\n・線クリック: 曲がり角追加\n・線ダブルクリック: 曲がり角削除\n・Shiftドラッグ: 直角配置",
        style: {
            width: 380, height: 180,
            borderColor: '#007bff',
            borderWidth: 2,
            borderStyle: 'dashed',
            backgroundColor: '#f0f7ff',
            opacity: 90,
            boxShadow: 'none'
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
            boxShadow: '0 3px 5px rgba(0,0,0,0.1)'
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
    backgroundColor: '#f0f2f5' // 初期色
};

// ====== グローバル変数（追加分） ======

const canvasContainer = document.getElementById('canvas-container'); // 外枠
const container = document.getElementById('world-layer'); // ★変更：中身（これが動く）
const svgLayer = document.getElementById('svg-layer');
const snapGuide = document.getElementById('snap-guide');

// ★追加：ビューポート（視点）管理
let viewport = { x: 0, y: 0 };
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

// script.js - createNodeElement 関数（完全版・貼り付け用）

function createNodeElement(nodeData) {
    const el = document.createElement('div');
    el.className = 'node';
    // ボックスタイプならクラス追加（CSSでの拡張用）
    if (nodeData.type === 'box') el.classList.add('node-box');

    // 選択状態の復元
    if (nodeData.id === selectedId) el.classList.add('selected');

    el.id = nodeData.id;

    // --- 共通スタイル適用 ---
    el.style.left = nodeData.x + 'px';
    el.style.top = nodeData.y + 'px';
    const w = nodeData.style?.width || 120;
    const h = nodeData.style?.height || 60;
    el.style.width = w + 'px';
    el.style.height = h + 'px';

    // 枠線の設定
    el.style.borderColor = nodeData.style?.borderColor || '#333333';
    el.style.borderWidth = (nodeData.style?.borderWidth || 2) + 'px';
    // ★追加：線種（実線・破線）
    el.style.borderStyle = nodeData.style?.borderStyle || 'solid';

    // 背景設定（ボックスと人物で分岐）
    const bgCol = nodeData.style?.backgroundColor || '#ffffff';

    if (nodeData.type === 'box') {
        // ボックス：色と透過率を組み合わせてRGBAにする
        const op = nodeData.style?.opacity !== undefined ? nodeData.style.opacity : 100;
        // ※ hexToRgba関数が定義されている前提
        el.style.backgroundColor = hexToRgba(bgCol, op);
        el.style.backgroundImage = 'none'; // ボックスは画像なし
    } else {
        // 人物：画像表示機能を維持
        el.style.backgroundColor = 'white';
        el.style.backgroundImage = nodeData.style?.backgroundImage || 'none';
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
    }

    // 影の設定
    const boxShd = nodeData.style?.boxShadow || 'none';
    if (boxShd === 'black') el.style.boxShadow = '0 4px 8px rgba(0,0,0,0.4)';
    else if (boxShd === 'white') el.style.boxShadow = '0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.4)';
    else el.style.boxShadow = 'none';

    // --- リサイズハンドル（共通） ---
    const directions = ['nw', 'ne', 'sw', 'se'];
    directions.forEach(dir => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${dir}`;
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation(); // ノード自体の移動を止める
            e.preventDefault();  // ブラウザの挙動防止
            startResizeNode(e, nodeData.id, dir);
        });
        el.appendChild(handle);
    });

    // --- 文字の作成 ---
    const labelSpan = document.createElement('span');
    labelSpan.className = 'node-label-real';
    labelSpan.id = 'label-' + nodeData.id;

    // ★変更：改行コード(\n)をHTML上で改行として扱うために innerText を使用
    labelSpan.innerText = nodeData.label;

    // 文字スタイル
    labelSpan.style.color = nodeData.text?.color || '#333333';
    labelSpan.style.fontSize = (nodeData.text?.fontSize || 14) + 'px';
    labelSpan.style.fontWeight = nodeData.text?.fontWeight || 'normal';

    // ★追加：テキスト配置（左・中・右）
    labelSpan.style.textAlign = nodeData.text?.align || 'center';

    // 文字影
    const textShd = nodeData.text?.shadow || 'none';
    if (textShd === 'black') labelSpan.style.textShadow = '2px 2px 2px rgba(0,0,0,0.6)';
    else if (textShd === 'white') labelSpan.style.textShadow = '0 0 4px white, 0 0 8px white';
    else labelSpan.style.textShadow = 'none';

    // 文字背景
    const txtBg = nodeData.text?.bgColor || 'transparent';
    labelSpan.style.backgroundColor = txtBg;
    if (txtBg !== 'transparent') {
        labelSpan.style.padding = '2px 4px';
        labelSpan.style.borderRadius = '4px';
    }

    // 座標配置
    const tx = nodeData.text?.x !== undefined ? nodeData.text.x : w / 2;
    const ty = nodeData.text?.y !== undefined ? nodeData.text.y : h / 2;
    labelSpan.style.left = tx + 'px';
    labelSpan.style.top = ty + 'px';

    // 文字インタラクション登録
    registerInteraction(labelSpan, { type: 'node-text', id: nodeData.id });
    el.appendChild(labelSpan);


    // --- ★画像DnD (人物ノードのみ有効) ---
    // ボックスに画像をドロップすると「破線設定」などが上書きされて壊れるのを防ぐため分岐
    if (nodeData.type !== 'box') {
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            // 選択中なら視覚フィードバック
            if (selectedId === nodeData.id) {
                el.style.opacity = '0.7';
                el.style.borderStyle = 'dashed';
            }
        });

        el.addEventListener('dragleave', (e) => {
            el.style.opacity = '1';
            el.style.borderStyle = 'solid'; // 人物は基本solidに戻す
        });

        el.addEventListener('drop', async (e) => {
            e.preventDefault();
            el.style.opacity = '1';
            el.style.borderStyle = 'solid';

            // 選択中のノードにだけドロップ可能にする
            if (selectedId !== nodeData.id) return;

            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                const file = files[0];
                if (file.type.startsWith('image/')) {
                    try {
                        const base64 = await readImageFile(file);
                        // データ更新
                        if (!nodeData.style) nodeData.style = {};
                        nodeData.style.backgroundImage = `url('${base64}')`;

                        // 画面更新
                        refreshNodeStyle(nodeData);

                        // もしプロパティが開いていればプレビューも更新
                        if (editingNodeId === nodeData.id) {
                            updatePreview(nodeData);
                        }
                    } catch (err) {
                        console.error(err);
                    }
                }
            }
        });
    }

    // イベント登録（右クリックなど）
    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        selectNode(nodeData.id);
        // type情報を渡してメニューを開く（ボックスか人物かを判定）
        openContextMenu(nodeData, nodeData.type === 'box' ? 'box' : 'node', e.clientX, e.clientY);
    });
    /*
    // ダブルクリックでもメニューを開く
    el.addEventListener('dblclick', (e) => {
        e.preventDefault(); 
        e.stopPropagation(); // 裏にあるものの反応を防ぐ
        
        selectNode(nodeData.id);
        // 右クリックと同じようにメニューを開く
        openContextMenu(nodeData, nodeData.type === 'box' ? 'box' : 'node', e.clientX, e.clientY);
    });
    */

    // 本体ドラッグ登録
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
        // DOM上のクラスも全部消す
        document.querySelectorAll('.node.selected').forEach(el => el.classList.remove('selected'));
    }

    selectedId = id; // プロパティパネル用（最後に選んだやつ）

    if (id) {
        // 線を選んでいたら解除
        if (!addToSelection) selectedConnId = null;

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

    const rect = node.getBoundingClientRect();
    const left = parseFloat(node.style.left);
    const top = parseFloat(node.style.top);
    const width = rect.width;
    const height = rect.height;

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
    const normalPalettes = [
        { id: 'palette-border', target: 'border' },
        { id: 'palette-text', target: 'text' },
        { id: 'palette-text-bg', target: 'text-bg' },
        { id: 'palette-conn-stroke', target: 'conn-stroke' },
        { id: 'palette-conn-text', target: 'conn-text' },
        { id: 'palette-conn-bg', target: 'conn-bg' },
        { id: 'palette-box-border', target: 'box-border' },
        { id: 'palette-box-bg', target: 'box-bg' },
        { id: 'palette-box-text', target: 'box-text' },
        { id: 'palette-box-text-bg', target: 'box-text-bg' }
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
    const gapSize = arrowLen + 4;

    // 矢印がある場合、線を少し短くする（矢印のスペース確保）
    if (style.arrow === 'start' || style.arrow === 'both') {
        const nextPoint = (conn.waypoints.length > 0) ? conn.waypoints[0] : endPos;
        startPos = movePointTowards(startPos, nextPoint, gapSize);
    }
    if (style.arrow === 'end' || style.arrow === 'both') {
        const prevPoint = (conn.waypoints.length > 0) ? conn.waypoints[conn.waypoints.length - 1] : startPos;
        endPos = movePointTowards(endPos, prevPoint, gapSize);
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


    // 6. ラベル（文字）の描画
    if (conn.label && conn.label.text) {
        const l = conn.label;
        const cx = (startPos.x + endPos.x) / 2 + (l.offsetX || 0);
        const cy = (startPos.y + endPos.y) / 2 + (l.offsetY || 0);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.textContent = l.text;

        // 文字位置の微調整
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

        text.setAttribute("x", cx + adjX);
        text.setAttribute("y", cy + adjY);

        text.setAttribute("fill", l.color || '#333');
        text.setAttribute("font-size", l.fontSize || 12);
        text.setAttribute("font-weight", l.fontWeight || 'normal');
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");

        text.style.pointerEvents = "all";
        text.style.cursor = (conn.id === selectedConnId) ? "move" : "pointer";
        registerInteraction(text, { type: 'conn-label', connId: conn.id });

        text.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            selectConnection(conn.id);
            openContextMenu(conn, 'connection', e.clientX, e.clientY);
        });

        if (l.bgColor && l.bgColor !== 'transparent') {
            const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            const fSize = l.fontSize || 12;
            let wRect, hRect;
            if (l.isVertical) { wRect = fSize + 10; hRect = l.text.length * fSize + 10; }
            else { wRect = l.text.length * fSize + 10; hRect = fSize + 10; }

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


// 2. 「＋ 矢印」ボタン（独立した線を生成）
document.getElementById('btn-add-conn').addEventListener('click', () => {
    // 画面中央あたりを基準に、ランダムにずらして配置するわ
    // (-100 〜 +100 の範囲でズレるようにしたの)
    const offsetX = (Math.random() * 200) - 100;
    const offsetY = (Math.random() * 200) - 100;

    const cx = (window.innerWidth / 2) + offsetX;
    const cy = (window.innerHeight / 2) + offsetY;

    const newConn = {
        id: generateId(),
        // 始点と終点を座標指定で作る
        start: { type: 'point', x: cx - 60, y: cy },
        end: { type: 'point', x: cx + 60, y: cy },
        waypoints: [],
        style: {
            color: '#555',
            width: 2,
            dash: 'solid',
            arrow: 'end' // デフォルトで矢印つき
        },
        label: {
            text: "新規の線",
            fontSize: 12,
            color: '#333'
        }
    };

    connections.push(newConn);

    // 追加した線を即選択！
    selectNode(null); // ノード選択解除
    selectConnection(newConn.id);

    // 履歴保存もお忘れなく
    recordHistory();
});

// 人物追加ボタン
document.getElementById('btn-add-node').addEventListener('click', () => {
    // 画面中央あたりにランダムに配置
    const x = 100 + Math.random() * 200;
    const y = 100 + Math.random() * 200;

    const newNode = {
        id: generateId(),
        x: x,
        y: y,
        label: "新規人物",
        style: {
            width: 60, height: 60, // ★変更：90x90の正方形に！
            borderColor: '#333333',
            borderWidth: 2,
        },
        text: {
            color: '#333333',
            fontSize: 14,
            fontWeight: 'normal',
            x: 30, y: 30 // ★変更：真ん中になるように調整（60の半分）
        }
    };

    nodes.push(newNode);

    // 追加したものを即選択状態にする
    selectNode(newNode.id);

    // 画面更新（initNodesを呼ぶと全部作り直してくれるように修正が必要ね、後述！）
    recordHistory();
    refreshScreen();
});

// ====== マルチボックス追加ボタン ======
document.getElementById('btn-add-box').addEventListener('click', () => {
    const x = 100 + Math.random() * 200;
    const y = 100 + Math.random() * 200;

    const newBox = {
        id: generateId(),
        type: 'box', // ★重要：タイプで区別
        x: x,
        y: y,
        label: "新規ボックス\n改行もできるよ",
        style: {
            width: 150, height: 100,
            borderColor: '#333333',
            borderWidth: 2,
            borderStyle: 'solid',      // ★初期値：実線
            backgroundColor: '#ffffff', // ★初期値：白
            opacity: 100,              // ★初期値：不透明(100%)
            boxShadow: 'none'
        },
        text: {
            color: '#333333',
            fontSize: 14,
            fontWeight: 'normal',
            align: 'center', // ★初期値：中央揃え
            bgColor: 'transparent',
            shadow: 'none',
            x: 75, y: 50 // 真ん中
        }
    };

    nodes.push(newBox);
    selectNode(newBox.id);
    recordHistory();
    refreshScreen();
});

// 削除ボタン
document.getElementById('btn-delete').addEventListener('click', () => {
    // 1. 人物・ボックスが選ばれている場合
    if (selectedId) {
        const nodeIndex = nodes.findIndex(n => n.id === selectedId);
        if (nodeIndex !== -1) {
            nodes.splice(nodeIndex, 1);

            // 関連する線も削除
            connections = connections.filter(conn => {
                const isRelated = (conn.start.nodeId === selectedId) || (conn.end.nodeId === selectedId);
                return !isRelated;
            });

            selectedId = null;
            recordHistory();
            refreshScreen();
        }
    }
    // 2. 線だけが選ばれている場合（★追加）
    else if (selectedConnId) {
        const connIndex = connections.findIndex(c => c.id === selectedConnId);
        if (connIndex !== -1) {
            connections.splice(connIndex, 1); // 線リストから削除

            selectedConnId = null;
            render(); // 再描画
            closeContextMenu(); // メニューが開いてたら閉じる
            recordHistory();
        }
    }
});

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
function openContextMenu(targetData, type, mouseX, mouseY) {
    // IDリセット

    editingNodeId = (type === 'node' || type === 'box') ? targetData.id : null; // ★boxもID記録
    editingConnId = (type === 'connection') ? targetData.id : null;

    // パネル要素
    const panelNode = document.getElementById('panel-node');
    const panelConn = document.getElementById('panel-conn');
    const panelBox = document.getElementById('panel-box'); // ★追加

    // 一旦全部隠す
    panelNode.style.display = 'none';
    panelConn.style.display = 'none';
    panelBox.style.display = 'none';

    const previewBox = document.getElementById('preview-box');
    const previewConn = document.getElementById('preview-conn-container');

    // --- 分岐処理 ---
    if (type === 'node') {
        panelNode.style.display = 'block';
        previewBox.style.display = 'flex';
        previewConn.style.display = 'none';

        // --- 人物データのセット ---
        document.getElementById('input-label').value = targetData.label;
        document.getElementById('input-width').value = targetData.style?.width || 120;
        document.getElementById('input-height').value = targetData.style?.height || 60;

        // ★ここを修正！データを取得して変数をセット
        const borderColor = targetData.style?.borderColor || '#333333';
        const txtColor = targetData.text?.color || '#333333';
        // 背景色がない場合は transparent をセット
        const txtBgColor = targetData.text?.bgColor || 'transparent';

        // 各パレットを更新
        updatePaletteActiveState('palette-border', borderColor);
        updatePaletteActiveState('palette-text', txtColor);
        // ★ここ！正しく透明（または色）が渡されるはずよ
        updatePaletteActiveState('palette-text-bg', txtBgColor);

        // ★ここから完全復元したロジックよ！

        // 1. 影の設定（ボタンの見た目更新）
        updateToggleActiveState('toggle-box-shadow', targetData.style?.boxShadow || 'none');
        updateToggleActiveState('toggle-text-shadow', targetData.text?.shadow || 'none');

        // 2. 枠の太さ
        document.getElementById('input-border-width').value = targetData.style?.borderWidth || 2;
        updateToggleActiveState('preset-border-width', String(targetData.style?.borderWidth || 2));

        // 3. 文字サイズ
        document.getElementById('input-font-size').value = targetData.text?.fontSize || 14;
        updateToggleActiveState('preset-font-size', String(targetData.text?.fontSize || 14));

        // 4. 太字ボタンの状態復元（これが抜けてたの！）
        const isBold = (targetData.text?.fontWeight === 'bold');
        const btnBold = document.getElementById('btn-font-bold');
        if (isBold) btnBold.classList.add('active');
        else btnBold.classList.remove('active');

        // 5. 画像削除ボタンの表示切り替え（これも大事！）
        const btnRemove = document.getElementById('btn-remove-image');
        if (targetData.style?.backgroundImage && targetData.style.backgroundImage !== 'none') {
            btnRemove.style.display = 'flex';
        } else {
            btnRemove.style.display = 'none';
        }

        // プレビュー更新
        updatePreview(targetData);
        selectNode(targetData.id);

    } else if (type === 'box') {
        // ★追加：ボックス用パネル表示
        panelBox.style.display = 'block';
        previewBox.style.display = 'flex'; // プレビュー箱は共通利用！
        previewConn.style.display = 'none';

        // 値のセット（ボックス専用）
        const s = targetData.style || {};
        const t = targetData.text || {};

        // 枠
        updatePaletteActiveState('palette-box-border', s.borderColor || '#333');
        document.getElementById('input-box-border-width').value = s.borderWidth || 2;
        updateToggleActiveState('toggle-box-border-style', s.borderStyle || 'solid');

        // 塗り
        updatePaletteActiveState('palette-box-bg', s.backgroundColor || '#ffffff');

        // 透過率
        const op = s.opacity !== undefined ? s.opacity : 100;
        document.getElementById('input-box-opacity').value = op;
        document.getElementById('val-box-opacity').textContent = op + '%';

        // 影
        updateToggleActiveState('toggle-box-box-shadow', s.boxShadow || 'none');

        // テキスト
        document.getElementById('input-box-label').value = targetData.label || '';
        updateToggleActiveState('toggle-box-align', t.align || 'center');
        updatePaletteActiveState('palette-box-text', t.color || '#333');
        document.getElementById('input-box-font-size').value = t.fontSize || 14;
        updateToggleActiveState('preset-box-font-size', String(t.fontSize || 14));

        // 太字
        const btnBold = document.getElementById('btn-box-bold');
        if (t.fontWeight === 'bold') btnBold.classList.add('active');
        else btnBold.classList.remove('active');

        // 文字背景・影
        updatePaletteActiveState('palette-box-text-bg', t.bgColor || 'transparent');
        updateToggleActiveState('toggle-box-text-shadow', t.shadow || 'none');

        // プレビュー更新
        updatePreview(targetData);
        selectNode(targetData.id);

    } else if (type === 'connection') {
        panelNode.style.display = 'none';
        panelConn.style.display = 'block';
        previewBox.style.display = 'none';
        previewConn.style.display = 'flex';

        // --- 線データのセット ---
        const s = targetData.style || {};
        const l = targetData.label || {};

        updatePaletteActiveState('palette-conn-stroke', s.color || '#555');
        document.getElementById('input-conn-width').value = s.width || 2;
        updateToggleActiveState('preset-conn-width', String(s.width || 2));
        updateToggleActiveState('toggle-conn-dash', s.dash || 'solid');
        // ★修正：デフォルトは none
        updateToggleActiveState('toggle-conn-arrow', s.arrow || 'none');

        document.getElementById('input-conn-label').value = l.text || '';
        updatePaletteActiveState('palette-conn-text', l.color || '#333');
        document.getElementById('input-conn-font-size').value = l.fontSize || 12;
        updateToggleActiveState('preset-conn-font-size', String(l.fontSize || 12));
        updatePaletteActiveState('palette-conn-bg', l.bgColor || 'transparent');

        // ★追加：縦書きボタンの状態反映
        const vState = l.isVertical ? 'vertical' : 'horizontal';
        updateToggleActiveState('toggle-conn-vertical', vState);

        // 太字ボタン
        const btnBold = document.getElementById('btn-conn-bold');
        if (l.fontWeight === 'bold') btnBold.classList.add('active');
        else btnBold.classList.remove('active');

        // プレビュー更新
        updateConnPreview(targetData);
        selectConnection(targetData.id);
    }

    // 2. メニュー位置合わせ（共通）
    contextMenu.style.display = 'block';
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

    // ★追加：パネル内の全入力要素に「変更確定したら履歴保存」を仕込む
    const inputs = contextMenu.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        // 重複登録を防ぐために一旦削除してから登録（簡易手法）
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


// ★色適用ヘルパー（人物・ボックス・線 統合版）
function applyColor(target, color) {
    // 1. 人物ノード用の処理
    if (target === 'border' || target === 'text' || target === 'text-bg') {
        if (!editingNodeId) return;
        const node = nodes.find(n => n.id === editingNodeId);
        if (!node) return;

        if (target === 'border') {
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
    // 2. ★追加：ボックス用の処理（ここに追加したかったやつ！）
    else if (target === 'box-border' || target === 'box-bg' || target === 'box-text' || target === 'box-text-bg') {
        if (!editingNodeId) return;
        const node = nodes.find(n => n.id === editingNodeId);
        if (!node) return;

        if (target === 'box-border') {
            if (!node.style) node.style = {};
            node.style.borderColor = color;
            updatePaletteActiveState('palette-box-border', color);
        }
        else if (target === 'box-bg') {
            if (!node.style) node.style = {};
            node.style.backgroundColor = color;
            updatePaletteActiveState('palette-box-bg', color);
        }
        else if (target === 'box-text') {
            if (!node.text) node.text = {};
            node.text.color = color;
            updatePaletteActiveState('palette-box-text', color);
        }
        else if (target === 'box-text-bg') {
            if (!node.text) node.text = {};
            node.text.bgColor = color;
            updatePaletteActiveState('palette-box-text-bg', color);
        }
        refreshNodeStyle(node);
    }
    // 3. 線（コネクション）用の処理
    else {
        if (!editingConnId) return;
        const conn = connections.find(c => c.id === editingConnId);
        if (!conn) return;

        if (target === 'conn-stroke') {
            if (!conn.style) conn.style = {};
            conn.style.color = color;
            updatePaletteActiveState('palette-conn-stroke', color);
        }
        else if (target === 'conn-text') {
            if (!conn.label) conn.label = {};
            conn.label.color = color;
            updatePaletteActiveState('palette-conn-text', color);
        }
        else if (target === 'conn-bg') {
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

    // ★修正1：クリックしたのが「文字」か「文字背景」じゃなければ無視する！
    // IDで判定するのが一番確実よ
    const targetId = e.target.id;
    const isLabel = (targetId === 'preview-conn-label');
    const isBg = (targetId === 'preview-conn-label-bg');

    if (!isLabel && !isBg) return; // 文字以外なら何もしない（リターン）

    if (!editingConnId) return;

    // ★修正2：ドラッグ直前にスケールを再計算する（これで「飛び」を防ぐ！）
    const svg = document.getElementById('preview-conn-svg');
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;

    // viewBoxが設定されていれば、現在の表示サイズとの比率を計算
    if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
        const scaleX = rect.width / viewBox.width;
        const scaleY = rect.height / viewBox.height;
        // updateConnPreviewと同じ「小さい方に合わせる」ロジックで更新
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

    /*
        // ■ 計算ロジックをメインキャンバス(drawConnection)から移植！
        const arrowBaseSize = 12 + (w * 1.5);
        const arrowLen = arrowBaseSize * 1.3;
        
        // マーカー要素を取得
        const markerEnd = document.getElementById('preview-marker-end');
        const markerStart = document.getElementById('preview-marker-start');
        const arrowColor = s.color || '#555';
    */
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

    label.textContent = l.text || 'Sample';

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

    label.setAttribute("x", cx + adjX);
    label.setAttribute("y", cy + adjY);

    label.setAttribute("fill", l.color || '#333');
    label.setAttribute("font-size", l.fontSize || 12);
    label.setAttribute("font-weight", l.fontWeight || 'normal');

    // ★変更：ここも central に変更
    label.setAttribute("dominant-baseline", "central");
    label.setAttribute("text-anchor", "middle");

    // 背景（矩形）
    if (l.bgColor && l.bgColor !== 'transparent') {
        bg.style.display = 'block';
        bg.setAttribute("fill", l.bgColor);
        const fSize = l.fontSize || 12;
        let bw, bh;
        if (l.isVertical) {
            bw = fSize + 10;
            bh = (l.text ? l.text.length : 0) * fSize + 10;
        } else {
            bw = (l.text ? l.text.length : 0) * fSize + 10;
            bh = fSize + 10;
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
    updateToggleActiveState(target === 'box' ? 'toggle-box-shadow' : 'toggle-text-shadow', val);
}



// ノードとプレビューのスタイルを一括更新する便利関数（縮小表示対応版）
function refreshNodeStyle(node) {
    const el = document.getElementById(node.id);
    const label = document.getElementById('label-' + node.id);
    const previewBox = document.getElementById('preview-box');
    const previewText = document.getElementById('preview-text');

    // 1. サイズ
    const w = node.style?.width || 120;
    const h = node.style?.height || 60;
    el.style.width = w + 'px';
    el.style.height = h + 'px';

    // --- ★ここから縮小ロジック（updatePreviewと同じ） ---
    if (editingNodeId === node.id) {
        // 基本サイズ適用
        previewBox.style.width = w + 'px';
        previewBox.style.height = h + 'px';

        const MAX_W = 260;
        const MAX_H = 160;
        let scale = 1;

        if (w > MAX_W || h > MAX_H) {
            scale = Math.min(MAX_W / w, MAX_H / h);
        }

        previewBox.style.transform = `scale(${scale})`;
        previewBox.style.transformOrigin = 'center center';

        // ネガティブマージンで位置調整
        const deltaW = w - (w * scale);
        const deltaH = h - (h * scale);
        previewBox.style.marginLeft = `-${deltaW / 2}px`;
        previewBox.style.marginRight = `-${deltaW / 2}px`;
        previewBox.style.marginTop = `-${deltaH / 2}px`;
        previewBox.style.marginBottom = `-${deltaH / 2}px`;

        // ハンドルの逆スケール
        const handles = previewBox.querySelectorAll('.resize-handle');
        handles.forEach(hd => {
            hd.style.transform = `scale(${1 / scale})`;
        });
    }
    // --- ★縮小ロジックここまで ---


    // 2. 枠線
    const borderCol = node.style?.borderColor || '#333333';
    const bWidth = node.style?.borderWidth !== undefined ? node.style.borderWidth : 2;
    const bStyle = node.style?.borderStyle || 'solid';

    el.style.borderColor = borderCol;
    el.style.borderWidth = bWidth + 'px';
    el.style.borderStyle = bStyle;

    if (editingNodeId === node.id) {
        previewBox.style.borderColor = borderCol;
        previewBox.style.borderWidth = bWidth + 'px';
        previewBox.style.borderStyle = bStyle;
    }

    // 3. 背景（分岐処理）
    const bgCol = node.style?.backgroundColor || '#ffffff';

    if (node.type === 'box') {
        // ボックス
        const op = node.style?.opacity !== undefined ? node.style.opacity : 100;
        const rgba = hexToRgba(bgCol, op);

        el.style.backgroundColor = rgba;
        el.style.backgroundImage = 'none';

        if (editingNodeId === node.id) {
            previewBox.style.backgroundColor = rgba;
            previewBox.style.backgroundImage = 'none';
        }
    } else {
        // 人物
        const bgImg = node.style?.backgroundImage || 'none';

        el.style.backgroundColor = 'white';
        el.style.backgroundImage = bgImg;

        if (editingNodeId === node.id) {
            previewBox.style.backgroundColor = 'white';
            previewBox.style.backgroundImage = bgImg;
        }
    }

    // 4. 文字スタイル
    const col = node.text?.color || '#333333';
    const fSize = node.text?.fontSize || 14;
    const fWeight = node.text?.fontWeight || 'normal';
    const align = node.text?.align || 'center';

    label.style.color = col;
    label.style.fontSize = fSize + 'px';
    label.style.fontWeight = fWeight;
    label.style.textAlign = align;

    if (editingNodeId === node.id) {
        previewText.style.color = col;
        previewText.style.fontSize = fSize + 'px';
        previewText.style.fontWeight = fWeight;
        previewText.style.textAlign = align;
    }

    // 文字背景
    const txtBgCol = node.text?.bgColor || 'transparent';
    label.style.backgroundColor = txtBgCol;

    if (txtBgCol !== 'transparent') {
        label.style.padding = '2px 4px';
        label.style.borderRadius = '4px';
    } else {
        label.style.padding = '0';
        label.style.borderRadius = '0';
    }

    if (editingNodeId === node.id) {
        previewText.style.backgroundColor = txtBgCol;
        if (txtBgCol !== 'transparent') {
            previewText.style.padding = '2px 4px';
            previewText.style.borderRadius = '4px';
        } else {
            previewText.style.padding = '0';
            previewText.style.borderRadius = '0';
        }
    }

    // 5. 影
    const bShd = node.style?.boxShadow || 'none';
    let boxCss = 'none';
    if (bShd === 'black') boxCss = '0 4px 8px rgba(0,0,0,0.4)';
    else if (bShd === 'white') boxCss = '0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.4)';

    el.style.boxShadow = boxCss;
    if (editingNodeId === node.id) previewBox.style.boxShadow = boxCss;

    const tShd = node.text?.shadow || 'none';
    let txtCss = 'none';
    if (tShd === 'black') txtCss = '2px 2px 2px rgba(0,0,0,0.6)';
    else if (tShd === 'white') txtCss = '0 0 4px white, 0 0 8px white';

    label.style.textShadow = txtCss;
    if (editingNodeId === node.id) previewText.style.textShadow = txtCss;

    // 6. 文字位置
    const tx = node.text?.x !== undefined ? node.text.x : w / 2;
    const ty = node.text?.y !== undefined ? node.text.y : h / 2;

    label.style.left = tx + 'px';
    label.style.top = ty + 'px';

    if (editingNodeId === node.id) {
        previewText.style.left = tx + 'px';
        previewText.style.top = ty + 'px';
    }
}

// プレビューと本物を同期させる関数

// プレビューをデータに合わせて更新する関数（縮小表示対応版）
function updatePreview(nodeData) {
    const previewBox = document.getElementById('preview-box');
    const previewText = document.getElementById('preview-text');

    // 1. 基本サイズ
    const w = nodeData.style?.width || 120;
    const h = nodeData.style?.height || 60;

    // --- ★ここから縮小ロジック ---
    const MAX_W = 260; // プレビューエリアの最大幅
    const MAX_H = 160; // プレビューエリアの最大高さ

    let scale = 1;
    // もし最大サイズを超えていたら、収まるように縮小率を計算
    if (w > MAX_W || h > MAX_H) {
        scale = Math.min(MAX_W / w, MAX_H / h);
    }

    // 実際のサイズはそのままセット（テキストの折り返しなどを正しく保つため）
    previewBox.style.width = w + 'px';
    previewBox.style.height = h + 'px';

    // トランスフォームで縮小！
    previewBox.style.transform = `scale(${scale})`;
    previewBox.style.transformOrigin = 'center center';

    // ★重要：縮小してもDOM上の占有スペースは変わらないから、ネガティブマージンで詰める！
    const deltaW = w - (w * scale);
    const deltaH = h - (h * scale);
    previewBox.style.marginLeft = `-${deltaW / 2}px`;
    previewBox.style.marginRight = `-${deltaW / 2}px`;
    previewBox.style.marginTop = `-${deltaH / 2}px`;
    previewBox.style.marginBottom = `-${deltaH / 2}px`;

    // ★おまけ：ハンドルが小さくなりすぎないように逆スケールをかける（操作しやすく！）
    const handles = previewBox.querySelectorAll('.resize-handle');
    handles.forEach(hd => {
        // スケールが小さい時は、ハンドルを逆に大きくして見やすくする
        hd.style.transform = `scale(${1 / scale})`;
    });
    // --- ★縮小ロジックここまで ---


    // 2. 枠線
    previewBox.style.borderColor = nodeData.style?.borderColor || '#333333';
    previewBox.style.borderWidth = (nodeData.style?.borderWidth !== undefined ? nodeData.style.borderWidth : 2) + 'px';
    previewBox.style.borderStyle = nodeData.style?.borderStyle || 'solid';

    // 3. 背景（分岐処理）
    const btnRemove = document.getElementById('btn-remove-image');

    if (nodeData.type === 'box') {
        // ボックス：透過色
        const bgCol = nodeData.style?.backgroundColor || '#ffffff';
        const op = nodeData.style?.opacity !== undefined ? nodeData.style.opacity : 100;

        previewBox.style.backgroundColor = hexToRgba(bgCol, op);
        previewBox.style.backgroundImage = 'none';

        if (btnRemove) btnRemove.style.display = 'none';
    } else {
        // 人物：画像
        previewBox.style.backgroundColor = 'white';
        previewBox.style.backgroundImage = nodeData.style?.backgroundImage || 'none';

        if (btnRemove) {
            if (nodeData.style?.backgroundImage && nodeData.style.backgroundImage !== 'none') {
                btnRemove.style.display = 'flex';
            } else {
                btnRemove.style.display = 'none';
            }
        }
    }

    // 4. 箱の影
    const bShd = nodeData.style?.boxShadow || 'none';
    let boxCss = 'none';
    if (bShd === 'black') boxCss = '0 4px 8px rgba(0,0,0,0.4)';
    else if (bShd === 'white') boxCss = '0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.4)';
    previewBox.style.boxShadow = boxCss;

    // 5. 文字内容
    previewText.textContent = nodeData.label;

    // 6. 文字スタイル
    previewText.style.color = nodeData.text?.color || '#333333';
    const fSize = nodeData.text?.fontSize || 14;
    previewText.style.fontSize = fSize + 'px';
    previewText.style.fontWeight = nodeData.text?.fontWeight || 'normal';
    previewText.style.textAlign = nodeData.text?.align || 'center';

    // 文字影
    const tShd = nodeData.text?.shadow || 'none';
    let txtCss = 'none';
    if (tShd === 'black') txtCss = '2px 2px 2px rgba(0,0,0,0.6)';
    else if (tShd === 'white') txtCss = '0 0 4px white, 0 0 8px white';
    previewText.style.textShadow = txtCss;

    // 文字背景
    const bgCol = nodeData.text?.bgColor || 'transparent';
    previewText.style.backgroundColor = bgCol;

    if (bgCol !== 'transparent') {
        previewText.style.padding = '2px 4px';
        previewText.style.borderRadius = '4px';
    } else {
        previewText.style.padding = '0';
        previewText.style.borderRadius = '0';
    }

    // 7. 文字位置
    const tx = nodeData.text?.x !== undefined ? nodeData.text.x : w / 2;
    const ty = nodeData.text?.y !== undefined ? nodeData.text.y : h / 2;

    previewText.style.left = tx + 'px';
    previewText.style.top = ty + 'px';
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

// 削除ボタン
document.getElementById('btn-menu-delete').addEventListener('click', () => {
    if (editingNodeId) {
        // 既存の削除ロジックを再利用したいけど、今回は直接実装
        const index = nodes.findIndex(n => n.id === editingNodeId);
        if (index !== -1) {
            nodes.splice(index, 1);
            connections = connections.filter(c => c.start.nodeId !== editingNodeId && c.end.nodeId !== editingNodeId);
            refreshScreen();
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

// リサイズ中の動き（windowのmousemoveに追加）
// ※さっきのメニュー移動のmousemoveとは別に書いてもいいし、まとめてもいいけど、
//  わかりやすく追記する形にするわね。

window.addEventListener('mousemove', (e) => {
    if (!isResizingPreview || !editingNodeId) return;

    e.preventDefault(); // テキスト選択などを防ぐ

    const dx = e.clientX - resizeStartPos.x;
    const dy = e.clientY - resizeStartPos.y;

    let newW = resizeStartSize.w;
    let newH = resizeStartSize.h;

    // 方向によって計算を変える
    // 右下(se)なら、マウスが右・下に行くほど大きくなる（+dx, +dy）
    // 左上(nw)なら、マウスが左・上に行くほど大きくなる（-dx, -dy）

    if (resizeDirection.includes('e')) newW += dx; // East (右)
    if (resizeDirection.includes('w')) newW -= dx; // West (左)
    if (resizeDirection.includes('s')) newH += dy; // South (下)
    if (resizeDirection.includes('n')) newH -= dy; // North (上)

    // 最小サイズ制限（小さくなりすぎ防止）
    newW = Math.max(30, newW);
    newH = Math.max(30, newH);

    // Shiftキーが押されていたら正方形にする！
    if (e.shiftKey) {
        const size = Math.max(newW, newH);
        newW = size;
        newH = size;
    }

    // 値を更新する関数を呼ぶ（これで全部連動する！）
    updateNodeSizeFromPreview(newW, newH);
});

window.addEventListener('mouseup', () => {
    if (isResizingPreview) {
        recordHistory();
    }
    isResizingPreview = false;
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

// 画像ファイルを読み込んでBase64データにする関数
function readImageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
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


// ★書き換え：ドラッグ開始処理の完全版
function handlePointerDown(e, info) {
    if (e.type === 'touchstart') e.preventDefault();

    const pos = getPointerPos(e);

    // 長押しタイマー
    longPressTimer = setTimeout(() => { }, 500);

    isDragging = true;
    currentDragTarget = e.target;

    // --- 分岐処理 ---

    if (info.type === 'node') {
        // [パターンA] ノード本体のドラッグ

        // まだ選択されていないノードを掴んだ場合
        if (!selectedNodeIds.has(info.id)) {
            selectNode(info.id);
        } else {
            // すでに選択されているノードを掴んだ場合
            selectedId = info.id;
            // ★重要：ここで render() を呼んではいけない！
            // 呼ぶとDOMがリセットされてドラッグが途切れる原因になるの
        }

        // メニュー更新
        const menu = document.getElementById('context-menu');
        if (menu.style.display === 'block') {
            const node = nodes.find(n => n.id === info.id);
            if (node) {
                const currentX = parseInt(menu.style.left) || 0;
                const currentY = parseInt(menu.style.top) || 0;
                openContextMenu(node, node.type === 'box' ? 'box' : 'node', currentX, currentY);
            }
        }

        dragInfo = info;
        // ★重要：移動ロジックを統一するため、ここでも「絶対座標」を記録する
        dragOffset.x = pos.x;
        dragOffset.y = pos.y;

    } else if (info.type === 'node-text') {
        // [パターンB] ノード内の文字ドラッグ

        // 複数選択の一部なら、文字移動ではなく「ノード移動（全体）」にする
        if (selectedNodeIds.has(info.id)) {
             dragInfo = { ...info, type: 'node' }; // 強制的にノード移動モードへ
             dragOffset.x = pos.x;
             dragOffset.y = pos.y;
             return;
        }
        
        // 未選択ノードの文字を掴んだ場合も、ノード全体移動へ
        if (selectedId !== info.id) {
            dragInfo = { ...info, type: 'node' };
            selectNode(info.id);
            
            // メニュー更新
            const menu = document.getElementById('context-menu');
            if (menu.style.display === 'block') {
                const node = nodes.find(n => n.id === info.id);
                if (node) openContextMenu(node, node.type === 'box' ? 'box' : 'node', parseInt(menu.style.left)||0, parseInt(menu.style.top)||0);
            }

            dragOffset.x = pos.x;
            dragOffset.y = pos.y;
            return;
        }

        // 単一選択での文字位置調整モード
        dragInfo = info; 
        dragOffset.x = pos.x;
        dragOffset.y = pos.y;

    } else if (info.type === 'conn-label') {
        // [パターンC] 線ラベル
        if (selectedConnId !== info.connId) {
            selectNode(null);
            selectConnection(info.connId);
        }
        dragInfo = info;
        dragOffset.x = pos.x;
        dragOffset.y = pos.y;

    } else {
        // [パターンD] ハンドル・ウェイポイント
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
function handleLineMouseDown(e, conn) {
    if (e.shiftKey) return; // Shiftキーの機能（もしあれば）を阻害しないように
    e.stopPropagation(); // 背景クリックなどを防ぐ

    // 1. 未選択なら「選択」するだけ（ドラッグは開始しない）
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

    // 2. 選択済みなら「関節を追加」して「即ドラッグ開始」！

    const pos = getPointerPos(e);
    const rect = container.getBoundingClientRect();
    const clickX = pos.x - rect.left;
    const clickY = pos.y - rect.top;

    // 挿入位置の計算（既存ロジックと同じ）
    const allPoints = [getPointPosition(conn.start)];
    conn.waypoints.forEach(wp => allPoints.push(wp));
    allPoints.push(getPointPosition(conn.end));

    let bestIndex = 0;
    let minDetour = Infinity;

    for (let i = 0; i < allPoints.length - 1; i++) {
        const A = allPoints[i];
        const B = allPoints[i + 1];
        const distAC = Math.hypot(clickX - A.x, clickY - A.y);
        const distCB = Math.hypot(B.x - clickX, B.y - clickY);
        const distAB = Math.hypot(B.x - A.x, B.y - A.y);
        const detour = (distAC + distCB) - distAB;

        if (detour < minDetour) {
            minDetour = detour;
            bestIndex = i;
        }
    }

    // 関節を追加
    conn.waypoints.splice(bestIndex, 0, { x: clickX, y: clickY });

    // 画面更新（これで新しい関節のDOMが生成される）
    render();
    if (editingConnId === conn.id) updateConnPreview(conn);

    // ★ここが魔法！今作った関節を強制的にドラッグ状態にする
    isDragging = true;
    dragInfo = {
        type: 'waypoint',
        connId: conn.id,
        index: bestIndex
    };

    // オフセット設定（絶対位置指定なのでコンテナの左上を基準にする）
    dragOffset.x = rect.left;
    dragOffset.y = rect.top;

    // ※マウスアップ時に履歴保存されるので、ここでは何もしなくてOK
}

// （注意：古い function onLineClick(e, conn) {...} は削除してね！）

/*
function onLineClick(e, conn) {
    if (e.shiftKey) return;

    // ★変更：もし「この線がまだ選択されていなかったら」
    if (selectedConnId !== conn.id) {
        selectNode(null);          // 人物の選択解除
        selectConnection(conn.id); // 線を選択

        // ====== メニューが開いていたら、内容をこの線に切り替える ======
        const menu = document.getElementById('context-menu');
        if (menu.style.display === 'block') {
            // 現在の位置をキープ
            const currentX = parseInt(menu.style.left) || 0;
            const currentY = parseInt(menu.style.top) || 0;

            // 切り替え実行！
            openContextMenu(conn, 'connection', currentX, currentY);
        }

        return; // ★ここで処理を終わらせる（関節は作らない！）
    }

    // console.log("🖱️ Line Clicked"); // ログ追加
    selectNode(null); // 人物の選択は外す


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
        const B = allPoints[i + 1];
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
*/

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

            // 前回位置からの差分(Delta)を計算
            const dx = pos.x - dragOffset.x;
            const dy = pos.y - dragOffset.y;

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
            return; // ここで終了（下の処理には行かせない）
        }



        // Case 2: それ以外
        
        // ★修正：ノード移動（マルチセレクト対応）
        if (dragInfo.type === 'node') {
            const dx = pos.x - dragOffset.x;
            const dy = pos.y - dragOffset.y;
            
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
            
            // 2. ★追加：選択されている矢印の「関節」なども一緒に動かす！
            selectedConnIds.forEach(id => {
                const conn = connections.find(c => c.id === id);
                if (conn) {
                    // 関節(waypoints)を全部ずらす
                    conn.waypoints.forEach(wp => {
                        wp.x += dx;
                        wp.y += dy;
                    });
                    
                    // もし始点・終点がノード接続じゃなく「座標指定(point)」なら、それも動かす
                    // (独立した矢印を動かすために必要よ！)
                    if (conn.start.type === 'point') { conn.start.x += dx; conn.start.y += dy; }
                    if (conn.end.type === 'point') { conn.end.x += dx; conn.end.y += dy; }
                }
            });

            render(); 
            return;
        }

        // --- ハンドル・ウェイポイントの処理（既存のまま）---
        // 絶対座標（ターゲット位置）を計算
        const targetX = pos.x - dragOffset.x;
        const targetY = pos.y - dragOffset.y;
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
            const margin = 50; // 画面端から50px以内
            const w = window.innerWidth;
            const h = window.innerHeight;

            if (pos.x < margin || pos.x > w - margin || pos.y < margin || pos.y > h - margin) {
                // 範囲外に出た！削除実行！
                const conn = connections.find(c => c.id === dragInfo.connId);
                if (conn) {
                    conn.waypoints.splice(dragInfo.index, 1);

                    // 即座に画面更新
                    render();
                    if (editingConnId === conn.id) updateConnPreview(conn);

                    // 履歴保存
                    recordHistory();
                }

                // ★重要：ドラッグを強制終了させる（これ以上動かすとエラーになるから）
                isDragging = false;
                dragInfo = null;
                return; // ここで処理を抜けるの！
            }

            // ウェイポイント移動
            const conn = connections.find(c => c.id === dragInfo.connId);
            const wp = conn.waypoints[dragInfo.index];
            let finalX = targetX;
            let finalY = targetY;

            if (e.shiftKey) {
                // ★修正：完全な直角（L字コーナー）を作るロジックに戻したわ！
                let prevData, nextData;

                // 前の点
                if (dragInfo.index === 0) prevData = conn.start;
                else prevData = conn.waypoints[dragInfo.index - 1];

                // 次の点
                if (dragInfo.index === conn.waypoints.length - 1) nextData = conn.end;
                else nextData = conn.waypoints[dragInfo.index + 1];

                const prevPos = getPointPosition(prevData);
                const nextPos = getPointPosition(nextData);

                // 2つの「直角コーナー候補」を計算
                // 候補1: 横に進んでから縦 (prev.yの高さで、next.xの位置へ)
                const corner1 = { x: nextPos.x, y: prevPos.y };
                // 候補2: 縦に進んでから横 (prev.xの位置で、next.yの高さへ)
                const corner2 = { x: prevPos.x, y: nextPos.y };

                // マウスに近い方のコーナーにパチッと吸着させるの！
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

    // 編集中としてIDをセット（これでプロパティパネルとも連動！）
    editingNodeId = nodeId;

    const node = nodes.find(n => n.id === nodeId);
    if (node) {
        // 数値であることを保証して取得
        nodeResizeStartSize = {
            w: parseInt(node.style?.width) || 120,
            h: parseInt(node.style?.height) || 60
        };
        // 現在の座標も記録！
        nodeResizeStartCoords = {
            x: node.x, // または parseFloat(node.style.left)
            y: node.y
        };
    }
}

// リサイズ中の動き

// script.js - リサイズ用の mousemove リスナー（丸ごと置き換え）
window.addEventListener('mousemove', (e) => {
    // ★ここが目印！これ以外の mousemove は消さないでね
    if (!isNodeResizing || !resizeNodeId) return;

    e.preventDefault();

    const dx = e.clientX - nodeResizeStartPos.x;
    const dy = e.clientY - nodeResizeStartPos.y;

    // 開始時の情報
    const startW = nodeResizeStartSize.w;
    const startH = nodeResizeStartSize.h;
    const startX = nodeResizeStartCoords.x;
    const startY = nodeResizeStartCoords.y;

    let newW = startW;
    let newH = startH;
    let newX = startX;
    let newY = startY;

    // --- 1. 幅と高さの計算 ---
    if (nodeResizeDir.includes('e')) newW = startW + dx;
    if (nodeResizeDir.includes('w')) newW = startW - dx;
    if (nodeResizeDir.includes('s')) newH = startH + dy;
    if (nodeResizeDir.includes('n')) newH = startH - dy;

    // 最小サイズ制限
    newW = Math.max(30, newW);
    newH = Math.max(30, newH);

    // Shiftキー（正方形維持）
    if (e.shiftKey) {
        const size = Math.max(newW, newH);
        newW = size;
        newH = size;
    }

    // --- 2. 位置（X, Y）の補正計算 ---
    // 左(w)を動かしている時
    if (nodeResizeDir.includes('w')) {
        newX = (startX + startW) - newW;
    }

    // 上(n)を動かしている時
    if (nodeResizeDir.includes('n')) {
        newY = (startY + startH) - newH;
    }

    // --- 3. 反映 ---
    const node = nodes.find(n => n.id === resizeNodeId);
    if (node) {
        node.x = newX;
        node.y = newY;

        // DOM要素の位置更新
        const el = document.getElementById(resizeNodeId);
        el.style.left = newX + 'px';
        el.style.top = newY + 'px';

        // サイズ更新（既存関数を利用）
        updateNodeSizeFromPreview(newW, newH);
    }
});

window.addEventListener('mouseup', () => {
    if (isNodeResizing) {
        recordHistory();
    }
    isNodeResizing = false;
    resizeNodeId = null;
});

// ====== ★追加：マルチボックス用イベントリスナー ======

// 1. 枠設定
// initColorPalettesForBox(); // パレット初期化（後で作る）

document.getElementById('input-box-border-width').addEventListener('input', (e) => {
    updateNodeProperty('style', 'borderWidth', parseInt(e.target.value) || 0);
});

document.querySelectorAll('#toggle-box-border-style button').forEach(btn => {
    btn.addEventListener('click', () => {
        updateNodeProperty('style', 'borderStyle', btn.dataset.val);
        updateToggleActiveState('toggle-box-border-style', btn.dataset.val);
    });
});

// 2. 塗り・透過率
document.getElementById('input-box-opacity').addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('val-box-opacity').textContent = val + '%';
    updateNodeProperty('style', 'opacity', parseInt(val));
});

// 3. 影
document.querySelectorAll('#toggle-box-box-shadow button').forEach(btn => {
    btn.addEventListener('click', () => {
        applyShadow('box', btn.dataset.val); // 既存関数流用
        updateToggleActiveState('toggle-box-box-shadow', btn.dataset.val);
    });
});

// 4. テキスト内容（Textarea）
document.getElementById('input-box-label').addEventListener('input', (e) => {
    if (!editingNodeId) return;
    const node = nodes.find(n => n.id === editingNodeId);
    if (node) {
        node.label = e.target.value;
        const realLabel = document.getElementById('label-' + editingNodeId);
        if (realLabel) realLabel.innerText = e.target.value; // 改行反映
        updatePreview(node);
    }
});

// 5. テキスト配置
document.querySelectorAll('#toggle-box-align button').forEach(btn => {
    btn.addEventListener('click', () => {
        updateNodeProperty('text', 'align', btn.dataset.val);
        updateToggleActiveState('toggle-box-align', btn.dataset.val);
    });
});

// 6. 文字設定（色、サイズ、太字、影、背景）
// ※パレットイベントは initColorPalettes で一括登録するからOK
document.getElementById('input-box-font-size').addEventListener('input', (e) => {
    updateNodeProperty('text', 'fontSize', parseInt(e.target.value) || 14);
    updateToggleActiveState('preset-box-font-size', e.target.value);
});
document.querySelectorAll('#preset-box-font-size button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('input-box-font-size').value = btn.dataset.val;
        updateNodeProperty('text', 'fontSize', parseInt(btn.dataset.val));
        updateToggleActiveState('preset-box-font-size', btn.dataset.val);
    });
});
document.getElementById('btn-box-bold').addEventListener('click', (e) => {
    e.target.classList.toggle('active');
    updateNodeProperty('text', 'fontWeight', e.target.classList.contains('active') ? 'bold' : 'normal');
});
document.querySelectorAll('#toggle-box-text-shadow button').forEach(btn => {
    btn.addEventListener('click', () => {
        applyShadow('text', btn.dataset.val);
        updateToggleActiveState('toggle-box-text-shadow', btn.dataset.val);
    });
});

// 7. 削除ボタン
document.getElementById('btn-box-delete').addEventListener('click', () => {
    // 既存の削除ボタンをクリックしたことにする（処理共通化）
    document.getElementById('btn-menu-delete').click();
});


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

    // データを書き戻す
    nodes = data.nodes;
    connections = data.connections;
    appSettings = data.appSettings;

    // 画面を復元
    refreshScreen(); // ノード・線を描画
    document.body.style.backgroundColor = appSettings.backgroundColor;
    document.getElementById('tool-bg-picker').value = appSettings.backgroundColor;
    document.getElementById('tool-bg-hex').value = appSettings.backgroundColor;
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
    // world-layer 全体を動かす魔法
    container.style.transform = `translate(${viewport.x}px, ${viewport.y}px)`;
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
    // 何もない場所、またはSVG背景での右クリックならメニューを抑制して範囲選択へ
    if (e.target === canvasContainer || e.target === svgLayer || e.target === container) {
        e.preventDefault();
    }
});

// 範囲選択の開始（mousedown）
canvasContainer.addEventListener('mousedown', (e) => {
    // 右クリック(button 2) かつ、背景をクリックした時
    if (e.button === 2 && (e.target === canvasContainer || e.target === svgLayer || e.target === container || e.target.id === 'artboard-guide')) {
        e.stopPropagation();

        isSelecting = true;

        // ★修正：getBoundingClientRect ではなく、viewport変数を使う！
        // 「マウスの画面座標」から「視点のズレ」を引けば、世界の中での座標になるの
        selectionStart = {
            x: e.clientX - viewport.x,
            y: e.clientY - viewport.y
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

    // ★修正：ここも viewport を基準に計算するわ
    const currentX = e.clientX - viewport.x;
    const currentY = e.clientY - viewport.y;

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

// ====== アプリ起動 ======
initViewport(); // ★追加：最初に画面位置を合わせる！
initNodes();
render();
recordHistory();
# W7 UI

以 [three.js](https://threejs.org/) 為渲染基底、[Yoga](https://www.yogalayout.dev/)（Facebook flexbox 排版引擎）為排版引擎的 2D UI 系統。
介面以 XML 描述，修改 `scene.xml` 後畫面會自動熱更新。

不使用框架與打包工具：原生 ES Modules + importmap，從 CDN 載入 `three@0.170.0`、`yoga-layout@3.2.1`。

## 啟動

讀取 `scene.xml` 需要透過 HTTP，不能直接用 `file://` 開啟：

```bash
python3 -m http.server 5177
# 開啟 http://localhost:5177
```

## 生成流程

```
scene.xml ──fetch──▶ DOMParser ──▶ 元件樹 (W7Node) ──▶ Yoga calculateLayout ──▶ sync 到 three 物件 ──▶ render
     ▲                                                                                              │
     └──────────────────────────── 每秒輪詢，內容變更時重建 ◀────────────────────────────────────────┘
```

1. `W7Engine.reload()` 讀取 `scene.xml`
2. `parser.js` 將 XML 節點轉換成對應元件，每個元件持有一個 Yoga node 與一個 `THREE.Group`
3. `W7Engine.layout()` 呼叫 Yoga 計算排版，再由 `sync()` 把座標與尺寸同步到 three 物件

XML 解析失敗或使用未知元件時，畫面保留上一版，並在底部顯示錯誤訊息。

## 頁面內編輯器

右上角「編輯 XML」開啟側邊編輯器（窄螢幕時在下方），直接修改目前畫面的 XML：

- **即時套用**：停止輸入 0.4 秒後自動套用；關閉後用「套用」或 `Ctrl/⌘ + Enter`
- 修改後**暫停熱更新**，避免被磁碟上的 scene.xml 覆蓋
- **重設**：捨棄修改，重新載入磁碟上的 scene.xml 並恢復熱更新
- **下載**：把編輯內容匯出成 scene.xml
- 只套用到目前頁面，**不會寫回磁碟**；重新整理頁面後修改會消失

## 範例

```xml
<W7Layout dir="v" padding="24" gap="16">
  <W7Label fontSize="22" bold="true">標題</W7Label>
  <W7Image src="./assets/banner.svg" height="120" fit="cover" />
  <W7List type="grid" cols="3" gap="8" cellHeight="80" grow="1">
    <W7Image src="./assets/icon1.svg" fit="contain" />
    <W7Image src="./assets/icon2.svg" fit="contain" />
  </W7List>
</W7Layout>
```

> 需為合法 XML：沒有子元件的 tag 要自我關閉，例如 `<W7Image src="./a.png" />`。

根元素若未指定 `width` / `height`，會自動填滿視窗。

## 元件

### W7Label — 文字

文字寫在 tag 內容或 `text` 屬性（`\n` 換行）。依可用寬度自動換行，CJK 逐字斷行、拉丁文字以單字斷行。

| 屬性 | 預設 | 說明 |
|---|---|---|
| `text` | tag 內容 | 文字內容 |
| `fontSize` | `16` | 字級（px） |
| `lineHeight` | `1.35` | 行高倍數 |
| `color` | `#ffffff` | 文字顏色，可用 `rgba(255,255,255,0.6)` 做次要文字 |
| `weight` | `400` | 字重，例如 `500` / `600` / `700` |
| `bold` | `false` | 等同 `weight="700"` |
| `letterSpacing` | `0` | 字距（px） |
| `textShadow` | | `"x y blur color"`，`true` 使用預設柔和陰影 |
| `opacity` | `1` | 透明度 |
| `font` | 系統字體（SF / PingFang TC 等） | font-family |
| `textAlign` | `left` | `left` / `center` / `right` |
| `verticalAlign` | `top` | `top` / `center` / `bottom` |

### W7Image — 圖片

| 屬性 | 預設 | 說明 |
|---|---|---|
| `src` | | 圖片路徑（相對於 `scene.xml`） |
| `fit` | `fill` | `fill` / `contain` / `cover` |
| `radius` | `0` | 圖片圓角（裁切圖片本身） |
| `borderColor` `borderWidth` `borderOpacity` | | 圖片邊框 |
| `opacity` | `1` | 透明度 |
| `tint` | | 顏色疊加 |

未指定尺寸時使用原圖尺寸；只指定寬或高時依原圖比例推算另一邊。

### W7Layout — 排版容器

| 屬性 | 預設 | 說明 |
|---|---|---|
| `dir` | `v` | `v` 垂直 / `h` 水平 |

### W7List — 滾動選單

| 屬性 | 預設 | 說明 |
|---|---|---|
| `type` | `v` | `v` 垂直 / `h` 水平 / `grid` 網格（垂直捲動） |
| `cols` | `3` | grid 欄數，子元件寬度自動等分 |
| `cellHeight` | | grid 子元件高度 |
| `scrollbar` | `true` | `false` 隱藏捲軸 |
| `scrollbarColor` | `#ffffff` | 捲軸顏色 |

- 滑鼠滾輪或拖曳捲動；內層捲到底時改捲外層 List
- 滑鼠進入滾動區時 scrollbar 淡入（0.15s），離開後淡出（0.4s）；拖曳中即使滑鼠移出也保持顯示
- 超出範圍的內容以 clipping planes 裁切，巢狀 List 取各層可視範圍的交集

### W7Button — 按鈕

文字寫在 tag 內容或 `text` 屬性，內部以 W7Label 顯示。

```xml
<W7Button onClick="buy" bg="#2bb673">購買</W7Button>
```

```js
w7.on('buy', (button, event) => console.log(button.attrs.id));
```

| 屬性 | 預設 | 說明 |
|---|---|---|
| `onClick` | | 點擊時觸發的事件名稱，用 `w7.on(name, fn)` 註冊；`on()` 會回傳取消註冊的函式 |
| `bg` / `bgTo` | `#7c83ff` → `#5b48f0` | 背景漸層；只給 `bg` 時為純色 |
| `shadow` | 依 `bgTo` 顏色的光暈 | 同共用屬性，`false` 關閉 |
| `hoverBg` | `bg` 提亮 | hover 背景色 |
| `pressBg` | `bg` 壓暗 | 按下時的背景色 |
| `disabled` | `false` | 停用：半透明且不觸發事件 |
| `padding` | `10 22` | |
| `radius` | `12` | |
| `fontSize` `color` `weight` `bold` `font` `lineHeight` `letterSpacing` `textShadow` | 白色、字重 600 | 傳給內部的 W7Label |

- 放開時游標仍在同一顆按鈕上才算點擊
- 在 W7List 內按下後拖曳超過 6px 視為捲動，取消點擊

## 共用屬性

### 排版（對應 Yoga）

| 屬性 | 值 |
|---|---|
| `width` `height` `minWidth` `minHeight` `maxWidth` `maxHeight` `basis` | 數字（px）、`50%`、`auto` |
| `flex` `grow` `shrink` | 數字 |
| `padding` `margin` | 同 CSS 縮寫：`8`、`8 16`、`8 16 8 16` |
| `paddingTop` `paddingRight` `paddingBottom` `paddingLeft` | 單邊 padding |
| `marginTop` `marginRight` `marginBottom` `marginLeft` | 單邊 margin |
| `gap` `rowGap` `columnGap` | 數字 |
| `align` `alignSelf` `alignContent` | `auto` `start` `center` `end` `stretch` `baseline` |
| `justify` | `start` `center` `end` `between` `around` `evenly` |
| `wrap` | `true` 換行 |
| `position` | `absolute`，搭配 `top` `right` `bottom` `left` |

### 外觀

| 屬性 | 說明 |
|---|---|
| `bg` | 背景色 |
| `bgTo` | 漸層終點色（由上到下，從 `bg` 到 `bgTo`） |
| `bgOpacity` | 背景透明度（預設 `1`） |
| `radius` | 圓角（`999` 為膠囊形） |
| `borderColor` `borderWidth` `borderOpacity` | 內側邊框，`borderWidth` 預設 `1` |
| `shadow` | 柔和陰影 `"x y blur color opacity"`，`true` 使用預設值，`false` 關閉 |
| `id` | 識別名稱（會帶入 three 物件的 `name`） |

## 背景

`src/Background.js` 在 UI 之下渲染：

- 每次載入隨機配色的 mesh 漸層：4 個色塊緩慢漂移，加上暗角與 dithering（避免色帶）
- 一個旋轉、上下漂浮的 3D 物件（`TorusKnotGeometry`），使用帶 clearcoat 與彩虹膜（iridescence）的 `MeshPhysicalMaterial`，以 `RoomEnvironment` 做環境反射，ACES tone mapping

每一幀先畫背景、清除深度後再疊上 UI。UI 材質不套用 tone mapping，顏色與 XML 設定一致。要更換形狀，修改 `Background.js` 中的 geometry 即可。

## 渲染品質

- 背景、邊框、陰影、圖片都由 `Rect.js` 的 SDF shader 繪製：圓角邊緣以 `fwidth` 抗鋸齒，任何 DPI 都銳利
- SVG 圖片以最高 4 倍（上限 2048px）點陣化，並啟用 mipmap 與 anisotropic filtering，縮放時不模糊、不閃爍
- 同一張圖片的所有 W7Image 共用一個 texture

## 專案結構

```
index.html              importmap 與進入點
scene.xml               介面描述
assets/                 範例圖片
src/
  main.js               建立 W7Engine
  W7Engine.js           讀檔、熱更新、Yoga 排版、捲動與按鈕輸入、render loop
  editor.js             頁面內 XML 編輯器
  Background.js         隨機漸層背景 + 旋轉 3D 物件
  parser.js             XML → 元件樹
  style.js              XML 屬性 → Yoga style
  Rect.js               背景矩形（含圓角）
  components/
    W7Node.js           元件基底：Yoga node + THREE.Group、sync、hit test
    W7Label.js
    W7Image.js
    W7Layout.js
    W7List.js
    W7Button.js
    index.js            元件註冊表
```

## 擴充元件

1. 在 `src/components/` 繼承 `W7Node`
2. 需要自行量測尺寸時用 `this.yoga.setMeasureFunc()`，並設 `static acceptsChildren = false`
3. 在 `updateVisual()` 依 `this.width` / `this.height` 更新 mesh，把 mesh 加進 `this.meshes` 以套用 renderOrder 與裁切
4. 在 `src/components/index.js` 的 `registry` 註冊後，即可在 XML 使用

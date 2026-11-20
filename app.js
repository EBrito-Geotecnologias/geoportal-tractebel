// Configuração Inicial do Mapa
const RMB_CENTER = [-1.40, -48.35];
const RMB_ZOOM = 10;

window.GEOPORTAL_DATA = window.GEOPORTAL_DATA || {};
window.GEOPORTAL_RASTERS = window.GEOPORTAL_RASTERS || {};

const map = L.map('map', {
    zoomControl: false,
    preferCanvas: true // Renderização via Canvas para alta performance com grandes camadas
}).setView(RMB_CENTER, RMB_ZOOM);

// Cache de padrões de hachura diagonal para o renderizador Canvas do Leaflet
const hatchPatternsCache = {};

function getDiagonalHatchPattern(ctx, hexColor, opacity = 0.75) {
    const key = `${hexColor}_${opacity}`;
    if (hatchPatternsCache[key]) return hatchPatternsCache[key];

    const pCanvas = document.createElement('canvas');
    pCanvas.width = 10;
    pCanvas.height = 10;
    const pCtx = pCanvas.getContext('2d');

    pCtx.strokeStyle = hexColor || '#00e676';
    pCtx.lineWidth = 2.0;
    pCtx.globalAlpha = opacity;

    // Desenha linhas diagonais a 45° perfeitamente contínuas (tileable)
    pCtx.beginPath();
    pCtx.moveTo(0, 10);
    pCtx.lineTo(10, 0);
    pCtx.moveTo(-2, 2);
    pCtx.lineTo(2, -2);
    pCtx.moveTo(8, 12);
    pCtx.lineTo(12, 8);
    pCtx.stroke();

    const pattern = ctx.createPattern(pCanvas, 'repeat');
    hatchPatternsCache[key] = pattern;
    return pattern;
}

// Estende o renderizador Canvas do Leaflet para suportar hachura diagonal (_fillStroke)
if (L.Canvas && !L.Canvas.prototype._hatchPatched) {
    const origFillStroke = L.Canvas.prototype._fillStroke;
    L.Canvas.prototype._fillStroke = function (ctx, layer) {
        const options = layer.options;
        if (options.fill && options.fillMode === 'hatch') {
            ctx.globalAlpha = 1;
            ctx.fillStyle = getDiagonalHatchPattern(
                ctx,
                options.fillColor || options.color,
                options.fillOpacity !== undefined ? Math.max(0.25, options.fillOpacity) : 0.75
            );
            ctx.fill(options.fillRule || 'evenodd');

            if (options.stroke && options.weight !== 0) {
                if (ctx.setLineDash) {
                    ctx.setLineDash((layer.options && layer.options._dashArray) || []);
                }
                ctx.globalAlpha = options.opacity;
                ctx.lineWidth = options.weight;
                ctx.strokeStyle = options.color;
                ctx.lineCap = options.lineCap;
                ctx.lineJoin = options.lineJoin;
                ctx.stroke();
            }
        } else {
            origFillStroke.call(this, ctx, layer);
        }
    };
    L.Canvas.prototype._hatchPatched = true;
}

// Pane exclusivo para camadas Raster para que fiquem abaixo dos polígonos/vetores e acima do mapa base
map.createPane('rasterPane');
map.getPane('rasterPane').style.zIndex = 250;

L.control.zoom({
    position: 'bottomright'
}).addTo(map);

// Barra de escala dinâmica que varia automaticamente conforme o zoom do mapa
L.control.scale({
    position: 'bottomleft',
    metric: true,
    imperial: false,
    maxWidth: 160
}).addTo(map);

// Definição dos Mapas de Fundo (Basemaps) - Incluindo Google Satélite atualizado (Airbus 2026) e Esri
const basemaps = {
    google_hybrid: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 21,
        attribution: 'Imagery &copy; 2026 Google, Airbus'
    }),
    google_sat: L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 21,
        attribution: 'Imagery &copy; 2026 Google, Airbus'
    }),
    google_streets: L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 21,
        attribution: 'Map data &copy; 2026 Google'
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
    }),
    topo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, USGS'
    })
};

// Adiciona o Google Satélite Híbrido como mapa base padrão
basemaps.google_hybrid.addTo(map);

// Controle de Basemaps na Sidebar
document.querySelectorAll('input[name="basemap"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const selected = e.target.value;
        Object.values(basemaps).forEach(layer => map.removeLayer(layer));
        basemaps[selected].addTo(map);
    });
});

// Catálogo organizado de camadas (Vetoriais e Raster MapBiomas)
const layerFiles = [
    // Limites e Divisão Territorial (Municípios da RMB em 1º lugar na árvore)
    { id: 'municipios_rmb', name: 'Municípios RMB', category: 'Limites e Divisão Territorial', color: '#000000', fillMode: 'outline', weight: 2.5, fillOpacity: 0, defaultVisible: true },
    { id: 'rmb_limite', name: 'Região Metropolitana de Belém (RMB)', category: 'Limites e Divisão Territorial', color: '#00e676', fillMode: 'outline', weight: 3, fillOpacity: 0, defaultVisible: true },
    { id: 'pa_bairros', name: 'Bairros (PA)', category: 'Limites e Divisão Territorial', color: '#38bdf8' },
    { id: 'pa_distritos', name: 'Distritos (PA)', category: 'Limites e Divisão Territorial', color: '#818cf8' },
    { id: 'concentracoes_urbanas', name: 'Concentrações Urbanas', category: 'Limites e Divisão Territorial', color: '#fb7185' },
    { id: 'poligonos_fcus', name: 'Polígonos FCUs', category: 'Limites e Divisão Territorial', color: '#f43f5e' },

    // Uso e Cobertura do Solo (MapBiomas)
    { id: 'usos_2025', name: 'Uso e Cobertura do Solo 2025 (MapBiomas Col. 11)', type: 'raster', category: 'Uso e Cobertura do Solo (MapBiomas)', color: '#1f8d49', defaultVisible: true },
    { id: 'usos_2024', name: 'Uso e Cobertura do Solo 2024 (MapBiomas)', type: 'raster', category: 'Uso e Cobertura do Solo (MapBiomas)', color: '#007785', defaultVisible: false },

    // Unidades de Conservação e Parques (RMB)
    { id: 'parque_utinga', name: 'Parque Estadual do Utinga', category: 'Unidades de Conservação e Parques', color: '#10b981', defaultVisible: true },
    { id: 'apa_belem', name: 'APA Belém', category: 'Unidades de Conservação e Parques', color: '#22c55e', defaultVisible: true },
    { id: 'apa_combu', name: 'APA Ilha do Combu', category: 'Unidades de Conservação e Parques', color: '#84cc16', defaultVisible: true },
    { id: 'revis', name: 'Refúgio da Vida Silvestre (REVIS)', category: 'Unidades de Conservação e Parques', color: '#14b8a6', defaultVisible: true },
    { id: 'corredor_ecologico', name: 'Corredor Ecológico RMB', category: 'Unidades de Conservação e Parques', color: '#a3e635' },
    { id: 'corredor_mesclado', name: 'Corredor Ecológico Mesclado', category: 'Unidades de Conservação e Parques', color: '#4ade80' },
    { id: 'ucs_rmb', name: 'UCs Estaduais / RMB', category: 'Unidades de Conservação e Parques', color: '#059669' },
    { id: 'parque_danubio', name: 'Parque Ambiental Antônio Danúbio', category: 'Unidades de Conservação e Parques', color: '#34d399' },
    { id: 'cristo_redentor', name: 'Cristo Redentor', category: 'Unidades de Conservação e Parques', color: '#2dd4bf' },
    { id: 'parque_kmz', name: 'Parque (KMZ)', category: 'Unidades de Conservação e Parques', color: '#6ee7b7' },
    { id: 'za_setor_1', name: 'Zona de Amortecimento - Setor I', category: 'Unidades de Conservação e Parques', color: '#fde047' },
    { id: 'za_setor_2', name: 'Zona de Amortecimento - Setor II', category: 'Unidades de Conservação e Parques', color: '#facc15' },
    { id: 'za_setor_3', name: 'Zona de Amortecimento - Setor III', category: 'Unidades de Conservação e Parques', color: '#eab308' },
    { id: 'br_ucs_pa', name: 'Unidades de Conservação (Pará/BR)', category: 'Unidades de Conservação e Parques', color: '#16a34a' },

    // Quilombos e Assentamentos
    { id: 'quilombolas_rmb', name: 'Áreas Quilombolas RMB', category: 'Quilombos e Assentamentos', color: '#f97316', defaultVisible: true },
    { id: 'quilombolas_estaduais', name: 'Áreas Quilombolas Estaduais', category: 'Quilombos e Assentamentos', color: '#fb923c' },
    { id: 'assentamentos_incra_rmb', name: 'Assentamentos INCRA RMB', category: 'Quilombos e Assentamentos', color: '#f59e0b' },
    { id: 'assentamentos_federais_rmb', name: 'Assentamentos Federais RMB', category: 'Quilombos e Assentamentos', color: '#d97706' },
    { id: 'assentamentos_rec_incra', name: 'Assentamentos Reconhecidos INCRA', category: 'Quilombos e Assentamentos', color: '#fbbf24' },
    { id: 'assentamentos_peas', name: 'Assentamentos Estaduais (PEAS)', category: 'Quilombos e Assentamentos', color: '#ef4444' },
    { id: 'assentamentos_peaex', name: 'Assentamentos PEAEX', category: 'Quilombos e Assentamentos', color: '#f87171' },

    // Áreas Públicas, Glebas e Colônias
    { id: 'glebas_estaduais_rmb', name: 'Glebas Estaduais RMB', category: 'Áreas Públicas, Glebas e Colônias', color: '#a855f7' },
    { id: 'colonias_rmb', name: 'Colônias RMB', category: 'Áreas Públicas, Glebas e Colônias', color: '#c084fc' },
    { id: 'colonias_estaduais_rmb', name: 'Colônias Estaduais RMB', category: 'Áreas Públicas, Glebas e Colônias', color: '#e879f9' },
    { id: 'colonias_estaduais', name: 'Colônias Estaduais (Geral)', category: 'Áreas Públicas, Glebas e Colônias', color: '#d946ef' },
    { id: 'sigef_publico_rmb', name: 'Imóveis SIGEF Público RMB', category: 'Áreas Públicas, Glebas e Colônias', color: '#3b82f6' },
    { id: 'sigef_privado_rmb', name: 'Imóveis SIGEF Privado RMB', category: 'Áreas Públicas, Glebas e Colônias', color: '#60a5fa' },

    // Hidrografia e Monitoramento
    { id: 'massas_dagua_rmb', name: "Massas D'Água RMB", category: 'Hidrografia e Monitoramento', color: '#0ea5e9' },
    { id: 'hidrografia_primaria_rmb', name: 'Hidrografia Primária RMB', category: 'Hidrografia e Monitoramento', color: '#0284c7' },
    { id: 'nascentes_rmb', name: 'Nascentes RMB', geomType: 'point', category: 'Hidrografia e Monitoramento', color: '#38bdf8', pointRadius: 2.5 },
    { id: 'focos_calor_pontos_2025', name: 'Focos de Calor 2025 (Pontos)', geomType: 'point', category: 'Hidrografia e Monitoramento', color: '#ef4444', pointRadius: 3.0 },
    { id: 'focos_calor_areas_2025', name: 'Áreas de Calor 2025', category: 'Hidrografia e Monitoramento', color: '#dc2626' }
];

const loadedLayers = {};
const layerCheckboxes = {};
const layerSwatches = {};
const layerControlsContainer = document.getElementById('layer-controls');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// Paleta de cores predefinidas para os arquivos GeoJSON (incluindo Branco e Preto)
const PRESET_PALETTE_COLORS = [
    '#ffffff', '#000000', '#00e676', '#10b981', '#16a34a', '#84cc16',
    '#eab308', '#f59e0b', '#f97316', '#ef4444', '#f43f5e', '#ec4899',
    '#d946ef', '#a855f7', '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6'
];

let activePaletteConfig = null;
let deletedLayerIds = new Set();

function loadDeletedLayers() {
    try {
        const saved = JSON.parse(localStorage.getItem('geoportal_deleted_layers') || '[]');
        if (Array.isArray(saved)) {
            deletedLayerIds = new Set(saved);
        }
    } catch (e) {}
    updateRestoreButtonVisibility();
}

function saveDeletedLayers() {
    try {
        localStorage.setItem('geoportal_deleted_layers', JSON.stringify(Array.from(deletedLayerIds)));
    } catch (e) {}
    updateRestoreButtonVisibility();
}

function updateRestoreButtonVisibility() {
    const btnRestore = document.getElementById('btn-restore-layers');
    if (btnRestore) {
        if (deletedLayerIds.size > 0) {
            btnRestore.classList.remove('hidden');
            btnRestore.title = `Restaurar ${deletedLayerIds.size} camada(s) excluída(s)`;
        } else {
            btnRestore.classList.add('hidden');
        }
    }
}

// Exclui uma camada da árvore de camadas e a remove do mapa se estiver ativa
function deleteLayerFromTree(config, labelEl) {
    if (!confirm(`Deseja excluir a camada "${config.name}" da árvore de camadas?`)) {
        return;
    }

    const layer = loadedLayers[config.id];
    if (layer && map.hasLayer(layer)) {
        map.removeLayer(layer);
    }
    if (config.id === 'usos_2025' || config.id === 'usos_2024') {
        const mbLegend = document.getElementById('mapbiomas-legend');
        if (mbLegend) mbLegend.classList.add('hidden');
    }

    const popover = document.getElementById('color-palette-popover');
    if (popover && activePaletteConfig && activePaletteConfig.id === config.id) {
        popover.classList.add('hidden');
        activePaletteConfig = null;
    }

    deletedLayerIds.add(config.id);
    saveDeletedLayers();

    // Se for uma camada adicionada pelo usuário, remove também do armazenamento local
    if (config.isUserUploaded) {
        removeUserUploadedLayerFromStorage(config.id);
    }

    if (labelEl && labelEl.parentNode) {
        const category = config.category;
        const sizePanel = layerControlsContainer.querySelector(`.layer-inline-size-panel[data-layer-id="${config.id}"]`);
        if (sizePanel) sizePanel.remove();
        labelEl.remove();
        // Se todas as camadas daquela categoria foram excluídas, remove também o cabeçalho da categoria
        if (category) {
            const remainingInCat = layerControlsContainer.querySelectorAll(`.checkbox-label[data-category="${category}"]`);
            if (remainingInCat.length === 0) {
                const catHeader = layerControlsContainer.querySelector(`.category-header[data-category="${category}"]`);
                if (catHeader) catHeader.remove();
            }
        }
    } else {
        buildLayerSidebar();
    }
}

// Carrega cores, modo de preenchimento (sólido, só borda, hachura) e tamanhos personalizados salvos no navegador
function loadSavedLayerStyles() {
    try {
        const saved = JSON.parse(localStorage.getItem('geoportal_layer_styles') || '{}');
        layerFiles.forEach(cfg => {
            if (cfg.type !== 'raster' && saved[cfg.id]) {
                if (saved[cfg.id].color) cfg.color = saved[cfg.id].color;
                if (saved[cfg.id].fillOpacity !== undefined) cfg.fillOpacity = saved[cfg.id].fillOpacity;
                if (saved[cfg.id].pointRadius !== undefined) cfg.pointRadius = saved[cfg.id].pointRadius;
                if (saved[cfg.id].fillMode) cfg.fillMode = saved[cfg.id].fillMode;
                if (saved[cfg.id].weight !== undefined) cfg.weight = saved[cfg.id].weight;
            }
        });
    } catch (e) {}
}

function saveLayerStyle(config) {
    try {
        const saved = JSON.parse(localStorage.getItem('geoportal_layer_styles') || '{}');
        saved[config.id] = {
            color: config.color,
            fillOpacity: config.fillOpacity !== undefined ? config.fillOpacity : 0.30,
            pointRadius: config.pointRadius !== undefined ? config.pointRadius : 3.5,
            fillMode: config.fillMode || 'solid',
            weight: config.weight !== undefined ? config.weight : 2
        };
        localStorage.setItem('geoportal_layer_styles', JSON.stringify(saved));
    } catch (e) {}
}

// Paleta oficial do MapBiomas Coleção 11 para colorização automática de GeoTIFFs categóricos de 1 banda
const MAPBIOMAS_COLORS_RGB = {
    1: [31, 141, 73], 3: [31, 141, 73], 4: [125, 201, 117], 5: [4, 56, 29],
    6: [0, 119, 133], 7: [34, 140, 112], 9: [122, 89, 0], 10: [214, 188, 116],
    11: [81, 151, 153], 12: [214, 188, 116], 13: [216, 159, 92], 14: [255, 239, 195],
    15: [237, 222, 142], 18: [233, 116, 237], 19: [194, 123, 160], 20: [219, 112, 147],
    21: [255, 239, 195], 22: [212, 39, 30], 23: [255, 160, 122], 24: [212, 39, 30],
    25: [219, 77, 79], 26: [37, 50, 228], 29: [173, 81, 0], 30: [156, 0, 39],
    31: [9, 16, 119], 32: [252, 129, 20], 33: [37, 50, 228], 35: [144, 101, 208],
    36: [208, 130, 222], 39: [245, 179, 200], 40: [199, 21, 133], 41: [245, 76, 169],
    46: [214, 143, 226], 47: [153, 50, 204], 48: [230, 204, 255], 49: [2, 214, 89],
    50: [255, 170, 95], 62: [255, 105, 180], 75: [117, 114, 114], 77: [134, 176, 116],
    84: [129, 219, 191], 91: [64, 61, 62]
};

// Converte coordenadas UTM (SIRGAS 2000 / WGS84 Zona 21S, 22S, 23S) para Latitude/Longitude
function utmToLatLonJS(easting, northing, zone = 22, southern = true) {
    const a = 6378137.0;
    const f = 1 / 298.257222101;
    const b = a * (1 - f);
    const e = Math.sqrt(1 - (b / a) ** 2);
    const e1sq = (e * e) / (1 - e * e);
    const k0 = 0.9996;
    const x = easting - 500000.0;
    const y = northing - (southern ? 10000000.0 : 0.0);
    const m = y / k0;
    const mu = m / (a * (1 - e ** 2 / 4 - 3 * e ** 4 / 64 - 5 * e ** 6 / 256));
    const e1 = (1 - Math.sqrt(1 - e ** 2)) / (1 + Math.sqrt(1 - e ** 2));
    const j1 = (3 * e1) / 2 - (27 * e1 ** 3) / 32;
    const j2 = (21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32;
    const j3 = (151 * e1 ** 3) / 96;
    const j4 = (1097 * e1 ** 4) / 512;
    const fp = mu + j1 * Math.sin(2 * mu) + j2 * Math.sin(4 * mu) + j3 * Math.sin(6 * mu) + j4 * Math.sin(8 * mu);
    const c1 = e1sq * Math.cos(fp) ** 2;
    const t1 = Math.tan(fp) ** 2;
    const r1 = (a * (1 - e ** 2)) / Math.pow(1 - (e * Math.sin(fp)) ** 2, 1.5);
    const n1 = a / Math.sqrt(1 - (e * Math.sin(fp)) ** 2);
    const d = x / (n1 * k0);
    const q1 = (n1 * Math.tan(fp)) / r1;
    const q2 = d ** 2 / 2;
    const q3 = ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * e1sq) * d ** 4) / 24;
    const q4 = ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 3 * c1 ** 2 - 252 * e1sq) * d ** 6) / 720;
    const lat = fp - q1 * (q2 - q3 + q4);
    const q5 = d;
    const q6 = ((1 + 2 * t1 + c1) * d ** 3) / 6;
    const q7 = ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * e1sq + 24 * t1 ** 2) * d ** 5) / 120;
    const lon0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;
    const lon = lon0 + (q5 - q6 + q7) / Math.cos(fp);
    return [lat * (180 / Math.PI), lon * (180 / Math.PI)];
}

// Processa um arquivo GeoTIFF (.tif / .tiff) direto no navegador e gera dataUrl PNG + bounds WGS84
async function parseGeoTiffFile(file) {
    if (typeof GeoTIFF === 'undefined') {
        throw new Error('Biblioteca GeoTIFF não carregada.');
    }
    const arrayBuffer = await file.arrayBuffer();
    const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    const origWidth = image.getWidth();
    const origHeight = image.getHeight();

    // Redimensiona proporcionalmente se for muito grande (> 2500px) para manter fluidez no navegador
    const maxDim = 2500;
    const scale = Math.min(1, maxDim / Math.max(origWidth, origHeight));
    const width = Math.max(1, Math.round(origWidth * scale));
    const height = Math.max(1, Math.round(origHeight * scale));

    const rasters = await image.readRasters({ width, height, resampleMethod: 'nearest' });
    const fileDir = image.getFileDirectory();
    const colorMap = fileDir.ColorMap; // Caso o TIFF tenha tabela de cores embutida

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    const numPixels = width * height;
    const numBands = rasters.length;

    if (numBands >= 3) {
        // Raster RGB ou RGBA
        const rBand = rasters[0];
        const gBand = rasters[1];
        const bBand = rasters[2];
        const aBand = numBands >= 4 ? rasters[3] : null;
        for (let i = 0; i < numPixels; i++) {
            const r = rBand[i];
            const g = gBand[i];
            const b = bBand[i];
            const a = aBand ? aBand[i] : ((r === 0 && g === 0 && b === 0) ? 0 : 255);
            const idx = i * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
        }
    } else {
        // Raster de 1 banda (categórico MapBiomas, paleta indexada ou escala de cinza/DEM)
        const band = rasters[0];
        let minVal = Infinity;
        let maxVal = -Infinity;
        let isMapBiomasLike = true;
        let nonZeroCount = 0;
        let mapBiomasMatches = 0;

        for (let i = 0; i < numPixels; i++) {
            const v = band[i];
            if (v !== 0 && !isNaN(v)) {
                nonZeroCount++;
                if (v < minVal) minVal = v;
                if (v > maxVal) maxVal = v;
                if (MAPBIOMAS_COLORS_RGB[v]) mapBiomasMatches++;
            }
        }
        isMapBiomasLike = nonZeroCount > 0 && (mapBiomasMatches / nonZeroCount) > 0.7;

        for (let i = 0; i < numPixels; i++) {
            const v = band[i];
            const idx = i * 4;
            if (v === 0 || isNaN(v) || v < -9000) {
                data[idx + 3] = 0;
                continue;
            }
            if (colorMap && v >= 0 && v < colorMap.length / 3) {
                const n = colorMap.length / 3;
                data[idx] = Math.round(colorMap[v] / 257);
                data[idx + 1] = Math.round(colorMap[v + n] / 257);
                data[idx + 2] = Math.round(colorMap[v + 2 * n] / 257);
                data[idx + 3] = 255;
            } else if (isMapBiomasLike && MAPBIOMAS_COLORS_RGB[v]) {
                const rgb = MAPBIOMAS_COLORS_RGB[v];
                data[idx] = rgb[0];
                data[idx + 1] = rgb[1];
                data[idx + 2] = rgb[2];
                data[idx + 3] = 255;
            } else {
                const norm = maxVal > minVal ? (v - minVal) / (maxVal - minVal) : 0.5;
                const gray = Math.round(norm * 255);
                data[idx] = gray;
                data[idx + 1] = gray;
                data[idx + 2] = gray;
                data[idx + 3] = 255;
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');

    // Extrai bounding box geográfico do GeoTIFF
    let bounds = null;
    try {
        const bbox = image.getBoundingBox(); // [minX, minY, maxX, maxY]
        if (bbox && bbox.length === 4) {
            let [minX, minY, maxX, maxY] = bbox;
            if (Math.abs(minX) > 180 || Math.abs(maxX) > 180 || Math.abs(minY) > 90 || Math.abs(maxY) > 90) {
                // Converte de UTM (Zona 22S padrão RMB) para Lat/Lon
                const sw = utmToLatLonJS(minX, minY, 22, true);
                const ne = utmToLatLonJS(maxX, maxY, 22, true);
                bounds = [sw, ne];
            } else {
                bounds = [[minY, minX], [maxY, maxX]];
            }
        }
    } catch (e) {}

    if (!bounds) {
        const mapB = map.getBounds();
        bounds = [
            [mapB.getSouth(), mapB.getWest()],
            [mapB.getNorth(), mapB.getEast()]
        ];
    }

    return { dataUrl, bounds, width, height };
}

// Lê um arquivo de imagem comum (.png, .jpg, .webp) e ajusta à visualização atual ou limites da RMB
function parseStandardImageFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            // Usa a extensão da tela atual como georreferência inicial para a imagem
            const b = map.getBounds();
            const bounds = [
                [b.getSouth(), b.getWest()],
                [b.getNorth(), b.getEast()]
            ];
            resolve({ dataUrl, bounds });
        };
        reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
        reader.readAsDataURL(file);
    });
}

// Detecta se um GeoJSON (ou array de FeatureCollections) contém feições de Ponto
function detectIsPointGeoJSON(geojsonData) {
    const collections = Array.isArray(geojsonData) ? geojsonData : [geojsonData];
    for (const fc of collections) {
        if (!fc) continue;
        const feats = fc.features || (fc.type === 'Feature' ? [fc] : []);
        for (const f of feats) {
            if (f && f.geometry && (f.geometry.type === 'Point' || f.geometry.type === 'MultiPoint')) {
                return true;
            }
        }
    }
    return false;
}

// Gerenciamento de camadas GeoJSON/KML/ZIP e Rasters adicionadas diretamente pelo usuário
function loadUserUploadedLayersFromStorage() {
    try {
        let saved = JSON.parse(localStorage.getItem('geoportal_user_layers') || '[]');
        if (!Array.isArray(saved)) return;

        // Remove duplicata manual de Municípios_RMB do final da árvore, pois agora é a 1ª camada nativa do portal
        const filteredSaved = saved.filter(item => {
            if (!item || !item.name) return false;
            const n = item.name.toLowerCase();
            return !(n.includes('municipios_rmb') || n.includes('municípios_rmb'));
        });
        if (filteredSaved.length !== saved.length) {
            saved = filteredSaved;
            localStorage.setItem('geoportal_user_layers', JSON.stringify(saved));
        }

        saved.forEach(item => {
            if (!item || !item.id) return;
            if (item.type === 'raster' && item.rasterData) {
                window.GEOPORTAL_RASTERS[item.id] = item.rasterData;
                if (!layerFiles.some(l => l.id === item.id)) {
                    layerFiles.push({
                        id: item.id,
                        name: item.name,
                        type: 'raster',
                        category: item.category || 'Camadas Adicionadas pelo Usuário',
                        color: item.color || '#10b981',
                        fillOpacity: item.fillOpacity !== undefined ? item.fillOpacity : 0.85,
                        defaultVisible: true,
                        isUserUploaded: true
                    });
                }
            } else if (item.geojson) {
                window.GEOPORTAL_DATA[item.id] = item.geojson;
                const isPt = item.geomType === 'point' || detectIsPointGeoJSON(item.geojson);
                if (!layerFiles.some(l => l.id === item.id)) {
                    layerFiles.push({
                        id: item.id,
                        name: item.name,
                        geomType: isPt ? 'point' : 'polygon',
                        pointRadius: item.pointRadius !== undefined ? item.pointRadius : 3.5,
                        category: item.category || 'Camadas Adicionadas pelo Usuário',
                        color: item.color || '#00e676',
                        fillOpacity: item.fillOpacity !== undefined ? item.fillOpacity : 0.30,
                        defaultVisible: true,
                        isUserUploaded: true
                    });
                }
            }
        });
    } catch (e) {
        console.warn('Não foi possível restaurar camadas salvas do usuário:', e);
    }
}

function saveUserUploadedLayerToStorage(config, payloadData) {
    try {
        const saved = JSON.parse(localStorage.getItem('geoportal_user_layers') || '[]');
        const filtered = saved.filter(i => i.id !== config.id);
        const entry = {
            id: config.id,
            name: config.name,
            type: config.type || 'vector',
            geomType: config.geomType || 'polygon',
            pointRadius: config.pointRadius !== undefined ? config.pointRadius : 3.5,
            category: config.category || 'Camadas Adicionadas pelo Usuário',
            color: config.color,
            fillOpacity: config.fillOpacity !== undefined ? config.fillOpacity : (config.type === 'raster' ? 0.85 : 0.30)
        };
        if (config.type === 'raster') {
            entry.rasterData = payloadData;
        } else {
            entry.geojson = payloadData;
        }
        filtered.push(entry);
        localStorage.setItem('geoportal_user_layers', JSON.stringify(filtered));
    } catch (e) {
        // Caso o arquivo ultrapasse o limite de 5MB do localStorage, permanece ativo na sessão atual
        console.warn('Camada muito grande para salvar no histórico permanente do navegador, mantida na sessão atual.');
    }
}

// Salva e restaura a ordem e a categoria personalizada de todas as camadas na árvore
function saveLayerTreeOrder() {
    try {
        const orderData = layerFiles.map(c => ({ id: c.id, category: c.category }));
        localStorage.setItem('geoportal_layer_order', JSON.stringify(orderData));
        // Atualiza também a categoria das camadas adicionadas pelo usuário
        const savedUser = JSON.parse(localStorage.getItem('geoportal_user_layers') || '[]');
        if (Array.isArray(savedUser) && savedUser.length > 0) {
            let changed = false;
            savedUser.forEach(u => {
                const match = layerFiles.find(l => l.id === u.id);
                if (match && match.category !== u.category) {
                    u.category = match.category;
                    changed = true;
                }
            });
            if (changed) {
                localStorage.setItem('geoportal_user_layers', JSON.stringify(savedUser));
            }
        }
    } catch (e) {}
}

function loadLayerTreeOrder() {
    try {
        // Garante que a nova estrutura com Municípios RMB em 1º lugar seja aplicada
        const orderVersion = localStorage.getItem('geoportal_order_version');
        if (orderVersion !== 'v2_municipios_first') {
            localStorage.removeItem('geoportal_layer_order');
            localStorage.setItem('geoportal_order_version', 'v2_municipios_first');
            return;
        }

        const saved = JSON.parse(localStorage.getItem('geoportal_layer_order') || '[]');
        if (!Array.isArray(saved) || saved.length === 0) return;

        const posMap = new Map();
        saved.forEach((item, index) => {
            if (item && item.id) {
                posMap.set(item.id, { index, category: item.category });
            }
        });

        layerFiles.forEach(cfg => {
            if (posMap.has(cfg.id)) {
                const info = posMap.get(cfg.id);
                if (info.category) cfg.category = info.category;
            }
        });

        layerFiles.sort((a, b) => {
            const posA = posMap.has(a.id) ? posMap.get(a.id).index : 99999;
            const posB = posMap.has(b.id) ? posMap.get(b.id).index : 99999;
            return posA - posB;
        });
    } catch (e) {}
}

let draggedLayerId = null;

// Move uma camada arrastada para antes/depois de outra camada ou para dentro de uma categoria
function moveLayerInTree(sourceId, targetId, targetCategory, placeAfter = false) {
    if (!sourceId || sourceId === targetId) return;
    const srcIdx = layerFiles.findIndex(c => c.id === sourceId);
    if (srcIdx === -1) return;

    const [movedConfig] = layerFiles.splice(srcIdx, 1);

    if (targetId) {
        const tgtIdx = layerFiles.findIndex(c => c.id === targetId);
        if (tgtIdx !== -1) {
            movedConfig.category = layerFiles[tgtIdx].category;
            const insertIdx = placeAfter ? tgtIdx + 1 : tgtIdx;
            layerFiles.splice(insertIdx, 0, movedConfig);
        } else {
            layerFiles.push(movedConfig);
        }
    } else if (targetCategory) {
        movedConfig.category = targetCategory;
        // Insere logo no início da categoria de destino
        const firstInCatIdx = layerFiles.findIndex(c => c.category === targetCategory);
        if (firstInCatIdx !== -1) {
            layerFiles.splice(firstInCatIdx, 0, movedConfig);
        } else {
            layerFiles.push(movedConfig);
        }
    } else {
        layerFiles.push(movedConfig);
    }

    saveLayerTreeOrder();
    buildLayerSidebar();

    // Preserva o estado marcado (checked) das camadas que já estão ativas no mapa
    Object.keys(loadedLayers).forEach(id => {
        const lyr = loadedLayers[id];
        if (lyr && map.hasLayer(lyr) && layerCheckboxes[id]) {
            layerCheckboxes[id].checked = true;
        }
    });
}

function removeUserUploadedLayerFromStorage(layerId) {
    try {
        const saved = JSON.parse(localStorage.getItem('geoportal_user_layers') || '[]');
        const filtered = saved.filter(i => i.id !== layerId);
        localStorage.setItem('geoportal_user_layers', JSON.stringify(filtered));
    } catch (e) {}
}

// Processa um arquivo selecionado pelo usuário (.geojson, .json, .kml, .kmz, .zip, .gpx, .tif, .tiff, .png, .jpg)
async function handleUserFileUpload(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        showLoading(`Importando arquivo: ${file.name}...`);

        try {
            const isRasterExt = ['tif', 'tiff', 'png', 'jpg', 'jpeg', 'webp'].includes(ext);

            if (isRasterExt) {
                let rasterData = null;
                if (ext === 'tif' || ext === 'tiff') {
                    rasterData = await parseGeoTiffFile(file);
                } else {
                    rasterData = await parseStandardImageFile(file);
                }

                const layerId = 'user_raster_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
                const newConfig = {
                    id: layerId,
                    name: `${baseName} (Raster)`,
                    type: 'raster',
                    category: 'Camadas Adicionadas pelo Usuário',
                    color: '#10b981',
                    fillOpacity: 0.85,
                    defaultVisible: true,
                    isUserUploaded: true
                };

                window.GEOPORTAL_RASTERS[layerId] = rasterData;
                layerFiles.push(newConfig);
                saveUserUploadedLayerToStorage(newConfig, rasterData);

                const imageOverlay = L.imageOverlay(rasterData.dataUrl, rasterData.bounds, {
                    opacity: 0.85,
                    pane: 'rasterPane',
                    className: 'mapbiomas-raster-img',
                    interactive: false
                });
                loadedLayers[layerId] = imageOverlay;
                imageOverlay.addTo(map);

                buildLayerSidebar();
                Object.keys(loadedLayers).forEach(id => {
                    const lyr = loadedLayers[id];
                    if (lyr && map.hasLayer(lyr) && layerCheckboxes[id]) {
                        layerCheckboxes[id].checked = true;
                    }
                });

                try {
                    const bounds = imageOverlay.getBounds();
                    if (bounds.isValid()) {
                        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
                    }
                } catch (e) {}
                continue;
            }

            let geojsonData = null;

            if (ext === 'geojson' || ext === 'json') {
                const text = await file.text();
                geojsonData = JSON.parse(text);
            } else if (ext === 'kml') {
                const text = await file.text();
                const dom = new DOMParser().parseFromString(text, 'text/xml');
                geojsonData = toGeoJSON.kml(dom);
            } else if (ext === 'gpx') {
                const text = await file.text();
                const dom = new DOMParser().parseFromString(text, 'text/xml');
                geojsonData = toGeoJSON.gpx(dom);
            } else if (ext === 'kmz') {
                const zip = await JSZip.loadAsync(file);
                const kmlFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.kml'));
                if (kmlFile) {
                    const text = await kmlFile.async('string');
                    const dom = new DOMParser().parseFromString(text, 'text/xml');
                    geojsonData = toGeoJSON.kml(dom);
                }
            } else if (ext === 'zip') {
                const buffer = await file.arrayBuffer();
                geojsonData = await shp(buffer);
            } else {
                alert(`Formato .${ext} não suportado. Use .geojson, .json, .tif, .tiff, .png, .jpg, .kml, .kmz, .gpx ou .zip.`);
                continue;
            }

            if (!geojsonData) {
                throw new Error('Não foi possível extrair feições geográficas do arquivo.');
            }

            const layerId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
            const randomColor = PRESET_PALETTE_COLORS[layerFiles.length % PRESET_PALETTE_COLORS.length];
            const isPointLayer = detectIsPointGeoJSON(geojsonData);

            const newConfig = {
                id: layerId,
                name: baseName,
                geomType: isPointLayer ? 'point' : 'polygon',
                pointRadius: 3.5,
                category: 'Camadas Adicionadas pelo Usuário',
                color: randomColor,
                fillOpacity: 0.30,
                defaultVisible: true,
                isUserUploaded: true
            };

            window.GEOPORTAL_DATA[layerId] = geojsonData;
            layerFiles.push(newConfig);
            saveUserUploadedLayerToStorage(newConfig, geojsonData);

            // Constrói a camada, adiciona ao mapa e atualiza a árvore
            const leafletLayer = buildLeafletLayer(geojsonData, newConfig);
            loadedLayers[layerId] = leafletLayer;
            leafletLayer.addTo(map);

            buildLayerSidebar();
            // Sincroniza checkboxes com camadas atualmente visíveis no mapa
            Object.keys(loadedLayers).forEach(id => {
                const lyr = loadedLayers[id];
                if (lyr && map.hasLayer(lyr) && layerCheckboxes[id]) {
                    layerCheckboxes[id].checked = true;
                }
            });

            try {
                const bounds = leafletLayer.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
                }
            } catch (e) {}

        } catch (err) {
            console.error(`Erro ao importar arquivo ${file.name}:`, err);
            alert(`Não foi possível carregar o arquivo "${file.name}". Verifique se é um GeoJSON, Raster (.tif/.png/.jpg), KML, KMZ ou Shapefile (.zip) válido.`);
        }
    }
    hideLoading();
}

// Atualiza a aparência da amostra (quadradinho/círculo) na árvore conforme a cor e o modo (sólido, só borda, hachura)
function updateSwatchAppearance(swatchEl, config) {
    if (!swatchEl) return;
    const color = config.color || '#00e676';
    const mode = config.fillMode || 'solid';
    swatchEl.classList.remove('outline-swatch', 'hatch-swatch');

    if (config.geomType === 'point' || config.type === 'raster') {
        swatchEl.style.background = '';
        swatchEl.style.backgroundColor = color;
        swatchEl.style.borderColor = config.geomType === 'point' ? '#ffffff' : 'rgba(255,255,255,0.45)';
        return;
    }

    if (mode === 'outline') {
        swatchEl.classList.add('outline-swatch');
        swatchEl.style.background = 'transparent';
        swatchEl.style.borderColor = color;
    } else if (mode === 'hatch') {
        swatchEl.classList.add('hatch-swatch');
        swatchEl.style.borderColor = color;
        swatchEl.style.background = `repeating-linear-gradient(-45deg, ${color}, ${color} 2px, transparent 2px, transparent 5px)`;
    } else {
        swatchEl.style.background = '';
        swatchEl.style.backgroundColor = color;
        swatchEl.style.borderColor = 'rgba(255,255,255,0.45)';
    }
}

// Atualiza em tempo real a cor, modo de preenchimento (sólido, só borda, hachura), opacidade e tamanho/espessura de uma camada GeoJSON
function applyLayerColorStyle(config, newColor, newFillOpacity, newPointRadius, newFillMode) {
    if (newColor) config.color = newColor;
    if (newFillOpacity !== undefined) config.fillOpacity = newFillOpacity;
    if (newFillMode) config.fillMode = newFillMode;
    if (newPointRadius !== undefined) {
        if (config.geomType === 'point') {
            config.pointRadius = newPointRadius;
        } else {
            config.weight = newPointRadius;
        }
    }

    const swatchEl = layerSwatches[config.id];
    updateSwatchAppearance(swatchEl, config);

    // Sincroniza a barra deslizante inline na árvore (caso exista para esta camada de ponto)
    const inlinePanel = layerControlsContainer.querySelector(`.layer-inline-size-panel[data-layer-id="${config.id}"]`);
    if (inlinePanel && newPointRadius !== undefined && config.geomType === 'point') {
        const slider = inlinePanel.querySelector('input[type="range"]');
        const badge = inlinePanel.querySelector('.size-badge');
        if (slider) slider.value = newPointRadius;
        if (badge) badge.textContent = `${newPointRadius} px`;
    }

    const group = loadedLayers[config.id];
    if (group && group.eachLayer) {
        const mode = config.fillMode || 'solid';
        const baseOp = config.fillOpacity !== undefined ? config.fillOpacity : 0.30;
        const effectiveFillOp = mode === 'outline' ? 0 : baseOp;
        const fixedR = config.pointRadius !== undefined ? config.pointRadius : 3.5;
        const strokeW = config.weight !== undefined ? config.weight : (mode === 'outline' ? 2.5 : 2);

        const polyStyle = {
            color: config.color,
            weight: strokeW,
            opacity: 0.95,
            fill: mode !== 'outline',
            fillMode: mode,
            fillColor: config.color,
            fillOpacity: effectiveFillOp
        };

        group.eachLayer(subLayer => {
            if (subLayer.setStyle) {
                subLayer.setStyle(polyStyle);
            }
            if (subLayer.eachLayer) {
                subLayer.eachLayer(featLayer => {
                    if (featLayer instanceof L.CircleMarker) {
                        featLayer.setRadius(fixedR);
                        featLayer.setStyle({
                            fillColor: config.color,
                            color: '#ffffff',
                            weight: Math.max(0.8, Math.min(2, fixedR * 0.3)),
                            fillOpacity: mode === 'outline' ? 0.05 : Math.min(1, baseOp + 0.55)
                        });
                    } else if (featLayer.setStyle) {
                        featLayer.setStyle(polyStyle);
                        if (featLayer._renderer && featLayer._renderer._redraw) {
                            featLayer._renderer._redraw();
                        }
                    }
                });
            }
        });
    }

    saveLayerStyle(config);
}

// Abre o popover da paleta de cores ao lado da camada clicada na barra lateral
function openColorPalettePopover(config, anchorEl) {
    const popover = document.getElementById('color-palette-popover');
    const titleEl = document.getElementById('palette-layer-title');
    const swatchesContainer = document.getElementById('palette-swatches');
    const customInput = document.getElementById('palette-custom-input');
    const opacityInput = document.getElementById('palette-fill-opacity');
    const opacityVal = document.getElementById('palette-opacity-val');
    const radiusInput = document.getElementById('palette-point-radius');
    const radiusVal = document.getElementById('palette-radius-val');

    if (!popover || !swatchesContainer) return;

    activePaletteConfig = config;
    if (titleEl) titleEl.textContent = config.name;

    const currentColor = (config.color || '#00e676').toLowerCase();
    if (customInput) customInput.value = currentColor;

    const currentMode = config.fillMode || 'solid';
    document.querySelectorAll('#color-palette-popover .fillmode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === currentMode);
    });

    const currentOp = Math.round((config.fillOpacity !== undefined ? config.fillOpacity : 0.30) * 100);
    if (opacityInput) opacityInput.value = currentOp;
    if (opacityVal) opacityVal.textContent = `${currentOp}%`;

    const currentSize = config.geomType === 'point'
        ? (config.pointRadius !== undefined ? config.pointRadius : 3.5)
        : (config.weight !== undefined ? config.weight : 2);
    if (radiusInput) radiusInput.value = currentSize;
    if (radiusVal) radiusVal.textContent = `${currentSize} px`;

    swatchesContainer.innerHTML = '';
    PRESET_PALETTE_COLORS.forEach(hex => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'palette-swatch-item' + (hex.toLowerCase() === currentColor ? ' active' : '');
        btn.style.backgroundColor = hex;
        btn.title = hex;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            swatchesContainer.querySelectorAll('.palette-swatch-item').forEach(el => el.classList.remove('active'));
            btn.classList.add('active');
            if (customInput) customInput.value = hex;
            applyLayerColorStyle(config, hex, undefined, undefined, undefined);
        });
        swatchesContainer.appendChild(btn);
    });

    // Posiciona o popover próximo ao item clicado
    const rect = anchorEl.getBoundingClientRect();
    const topPos = Math.min(window.innerHeight - 360, Math.max(12, rect.top - 20));
    const leftPos = Math.min(window.innerWidth - 260, rect.right + 14);
    popover.style.top = `${topPos}px`;
    popover.style.left = `${leftPos}px`;
    popover.classList.remove('hidden');
}

// Faz o download de um objeto GeoJSON ou Raster para o computador do usuário
function triggerBrowserDownload(urlOrBlob, filename) {
    const a = document.createElement('a');
    if (urlOrBlob instanceof Blob) {
        const objUrl = URL.createObjectURL(urlOrBlob);
        a.href = objUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objUrl), 2000);
    } else {
        a.href = urlOrBlob;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// Faz o download de uma camada completa (GeoJSON ou Raster PNG) direto da árvore de camadas
async function downloadLayerData(config) {
    try {
        showLoading(`Preparando download: ${config.name}...`);
        const safeName = config.name.replace(/[\\/:*?"<>|]+/g, '_').trim();

        if (config.type === 'raster') {
            const rasterData = await loadRasterScript(config.id);
            if (rasterData && rasterData.dataUrl) {
                triggerBrowserDownload(rasterData.dataUrl, `${safeName}.png`);
            }
            return;
        }

        const geojsonData = await loadLayerScript(config.id);
        let exportObj = geojsonData;
        if (Array.isArray(geojsonData)) {
            const allFeatures = [];
            geojsonData.forEach(fc => {
                if (fc && Array.isArray(fc.features)) {
                    allFeatures.push(...fc.features);
                }
            });
            exportObj = { type: 'FeatureCollection', features: allFeatures };
        }

        const jsonStr = JSON.stringify(exportObj, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/geo+json;charset=utf-8' });
        triggerBrowserDownload(blob, `${safeName}.geojson`);
    } catch (err) {
        console.error(`Erro ao baixar a camada ${config.name}:`, err);
        alert(`Não foi possível baixar a camada "${config.name}".`);
    } finally {
        hideLoading();
    }
}

// Faz o download de uma única feição individual selecionada no popup do mapa
function downloadSingleFeatureGeoJSON(feature, layerName) {
    const safeLayer = layerName.replace(/[\\/:*?"<>|]+/g, '_').trim();
    const fc = {
        type: 'FeatureCollection',
        features: [feature]
    };
    const jsonStr = JSON.stringify(fc, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/geo+json;charset=utf-8' });
    triggerBrowserDownload(blob, `${safeLayer}_feicao.geojson`);
}

function showLoading(msg) {
    loadingText.textContent = msg;
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

// Formata os atributos da feição para exibição no Popup (com botão para baixar a feição em GeoJSON)
function createPopupContent(feature, layerName) {
    const container = document.createElement('div');
    let html = `<div class="popup-header">${layerName}</div>`;
    if (!feature.properties || Object.keys(feature.properties).length === 0) {
        html += '<p style="font-size:12px;color:#94a3b8;">Sem atributos adicionais</p>';
    } else {
        html += '<table class="popup-table">';
        for (const key in feature.properties) {
            const val = feature.properties[key];
            if (val !== null && val !== undefined && val !== '') {
                html += `<tr><th>${key}</th><td>${val}</td></tr>`;
            }
        }
        html += '</table>';
    }
    container.innerHTML = html;

    const dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'popup-download-btn';
    dlBtn.innerHTML = '<i class="fa-solid fa-download"></i> Baixar esta feição (.geojson)';
    dlBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        downloadSingleFeatureGeoJSON(feature, layerName);
    });
    container.appendChild(dlBtn);

    return container;
}

// Converte o dado GeoJSON em camada Leaflet
function buildLeafletLayer(geojsonData, config) {
    const collections = Array.isArray(geojsonData) ? geojsonData : [geojsonData];
    const group = L.featureGroup();

    const mode = config.fillMode || 'solid';
    const baseOp = config.fillOpacity !== undefined ? config.fillOpacity : 0.30;
    const effectiveFillOp = mode === 'outline' ? 0 : baseOp;
    const strokeW = config.weight !== undefined ? config.weight : (mode === 'outline' ? 2.5 : 2);

    const style = {
        color: config.color || '#00e676',
        weight: strokeW,
        opacity: 0.95,
        fill: mode !== 'outline',
        fillMode: mode,
        fillColor: config.color || '#00e676',
        fillOpacity: effectiveFillOp
    };

    const fixedR = config.pointRadius !== undefined ? config.pointRadius : 3.5;

    collections.forEach(fc => {
        const layer = L.geoJSON(fc, {
            style: () => style,
            pointToLayer: (feature, latlng) => {
                return L.circleMarker(latlng, {
                    radius: fixedR,
                    fillColor: style.fillColor,
                    color: '#ffffff',
                    weight: Math.max(0.8, Math.min(2, fixedR * 0.3)),
                    opacity: 1,
                    fillOpacity: mode === 'outline' ? 0.05 : 0.9
                });
            },
            onEachFeature: (feature, lyr) => {
                lyr.bindPopup(() => createPopupContent(feature, config.name));
            }
        });
        group.addLayer(layer);
    });

    return group;
}

// Carrega o script JS sob demanda (funciona tanto em file:// quanto em http:// sem CORS!)
function loadLayerScript(layerId) {
    return new Promise((resolve, reject) => {
        if (window.GEOPORTAL_DATA && window.GEOPORTAL_DATA[layerId]) {
            resolve(window.GEOPORTAL_DATA[layerId]);
            return;
        }
        const script = document.createElement('script');
        script.src = `data_js/${layerId}.js`;
        script.onload = () => {
            if (window.GEOPORTAL_DATA && window.GEOPORTAL_DATA[layerId]) {
                resolve(window.GEOPORTAL_DATA[layerId]);
            } else {
                reject(new Error(`Dados não encontrados para ${layerId}`));
            }
        };
        script.onerror = () => reject(new Error(`Falha ao carregar data_js/${layerId}.js`));
        document.body.appendChild(script);
    });
}

// Carrega o script JS do Raster MapBiomas sob demanda
function loadRasterScript(rasterId) {
    return new Promise((resolve, reject) => {
        if (window.GEOPORTAL_RASTERS && window.GEOPORTAL_RASTERS[rasterId]) {
            resolve(window.GEOPORTAL_RASTERS[rasterId]);
            return;
        }
        const script = document.createElement('script');
        script.src = `data_js/${rasterId}_raster.js`;
        script.onload = () => {
            if (window.GEOPORTAL_RASTERS && window.GEOPORTAL_RASTERS[rasterId]) {
                resolve(window.GEOPORTAL_RASTERS[rasterId]);
            } else {
                reject(new Error(`Raster não encontrado para ${rasterId}`));
            }
        };
        script.onerror = () => reject(new Error(`Falha ao carregar data_js/${rasterId}_raster.js`));
        document.body.appendChild(script);
    });
}

// Preenche e exibe a legenda oficial MapBiomas
function renderMapBiomasLegend(classes, layerId) {
    const legendContainer = document.getElementById('legend-items');
    const titleEl = document.getElementById('legend-main-title');
    if (titleEl && layerId) {
        const yearStr = layerId === 'usos_2024' ? '2024' : '2025';
        titleEl.innerHTML = `<i class="fa-solid fa-palette"></i> Uso e Cobertura do Solo (${yearStr})`;
    }
    if (!legendContainer || !classes) return;
    legendContainer.innerHTML = '';
    classes.forEach(cls => {
        const row = document.createElement('div');
        row.className = 'legend-item';
        row.innerHTML = `
            <div class="legend-color-box" style="background-color: ${cls.color};"></div>
            <span class="legend-label">${cls.label}</span>
            <span class="legend-pct">${cls.percent}%</span>
        `;
        legendContainer.appendChild(row);
    });
}

// Obtém e constrói a camada Leaflet (Vetorial ou Raster) com cache
async function fetchAndParseLayer(config) {
    if (loadedLayers[config.id]) {
        if (config.type === 'raster' && window.GEOPORTAL_RASTERS[config.id] && window.GEOPORTAL_RASTERS[config.id].classes) {
            renderMapBiomasLegend(window.GEOPORTAL_RASTERS[config.id].classes, config.id);
        }
        return loadedLayers[config.id];
    }

    if (config.type === 'raster') {
        const rasterData = await loadRasterScript(config.id);
        if (rasterData.classes) {
            renderMapBiomasLegend(rasterData.classes, config.id);
        }
        const opacityInput = document.getElementById('raster-opacity');
        const initialOpacity = opacityInput ? parseInt(opacityInput.value, 10) / 100 : 0.85;
        const imageOverlay = L.imageOverlay(rasterData.dataUrl, rasterData.bounds, {
            opacity: initialOpacity,
            pane: 'rasterPane',
            className: 'mapbiomas-raster-img',
            interactive: false
        });
        loadedLayers[config.id] = imageOverlay;
        return imageOverlay;
    }

    const geojsonData = await loadLayerScript(config.id);
    const leafletLayer = buildLeafletLayer(geojsonData, config);
    loadedLayers[config.id] = leafletLayer;
    return leafletLayer;
}

// Ativa ou desativa uma camada no mapa
async function toggleLayer(config, checked, fitBoundsOnLoad = false, statusEl = null) {
    const mbLegend = document.getElementById('mapbiomas-legend');
    const isMapBiomasRaster = config.id === 'usos_2025' || config.id === 'usos_2024';
    try {
        if (checked) {
            showLoading(`Carregando: ${config.name}...`);
            if (statusEl) statusEl.textContent = '...';
            const layer = await fetchAndParseLayer(config);
            if (statusEl) statusEl.textContent = '';
            layer.addTo(map);
            if (isMapBiomasRaster && mbLegend) {
                mbLegend.classList.remove('hidden');
            }
            if (fitBoundsOnLoad) {
                try {
                    const bounds = layer.getBounds();
                    if (bounds.isValid()) {
                        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
                    }
                } catch (e) {}
            }
        } else {
            const layer = loadedLayers[config.id];
            if (layer && map.hasLayer(layer)) {
                map.removeLayer(layer);
            }
            if (isMapBiomasRaster && mbLegend) {
                const otherId = config.id === 'usos_2025' ? 'usos_2024' : 'usos_2025';
                const otherLayer = loadedLayers[otherId];
                if (!otherLayer || !map.hasLayer(otherLayer)) {
                    mbLegend.classList.add('hidden');
                } else if (window.GEOPORTAL_RASTERS[otherId] && window.GEOPORTAL_RASTERS[otherId].classes) {
                    renderMapBiomasLegend(window.GEOPORTAL_RASTERS[otherId].classes, otherId);
                }
            }
        }
    } catch (error) {
        console.error(`Erro ao carregar a camada ${config.name}:`, error);
        if (statusEl) statusEl.textContent = 'Erro';
        if (layerCheckboxes[config.id]) {
            layerCheckboxes[config.id].checked = false;
        }
    } finally {
        hideLoading();
    }
}

// Renderiza a lista de camadas imediatamente na interface (com suporte a Drag & Drop entre categorias)
function buildLayerSidebar() {
    layerControlsContainer.innerHTML = '';
    let currentCategory = '';

    layerFiles.forEach(config => {
        if (deletedLayerIds.has(config.id)) {
            return;
        }

        if (config.category && config.category !== currentCategory) {
            currentCategory = config.category;
            const catHeader = document.createElement('div');
            catHeader.className = 'category-header';
            catHeader.dataset.category = currentCategory;
            catHeader.textContent = currentCategory;
            catHeader.title = 'Arraste uma camada para cá para movê-la para esta categoria';

            // Permite soltar uma camada diretamente sobre o cabeçalho da categoria
            catHeader.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                catHeader.classList.add('drag-over-category');
            });
            catHeader.addEventListener('dragleave', () => {
                catHeader.classList.remove('drag-over-category');
            });
            catHeader.addEventListener('drop', (e) => {
                e.preventDefault();
                catHeader.classList.remove('drag-over-category');
                const srcId = draggedLayerId || e.dataTransfer.getData('text/plain');
                if (srcId) {
                    moveLayerInTree(srcId, null, catHeader.dataset.category, false);
                }
            });

            layerControlsContainer.appendChild(catHeader);
        }

        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.dataset.layerId = config.id;
        label.dataset.layerName = config.name.toLowerCase();
        label.dataset.category = config.category || '';
        label.draggable = true;

        // Ícone de alça (grip) para arrastar e soltar a camada
        const dragHandle = document.createElement('span');
        dragHandle.className = 'layer-drag-handle';
        dragHandle.title = 'Segure e arraste para mover esta camada para outra posição ou categoria';
        dragHandle.innerHTML = '<i class="fa-solid fa-grip-vertical"></i>';

        label.addEventListener('dragstart', (e) => {
            draggedLayerId = config.id;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', config.id);
            setTimeout(() => label.classList.add('dragging'), 0);
        });

        label.addEventListener('dragend', () => {
            draggedLayerId = null;
            label.classList.remove('dragging');
            layerControlsContainer.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over-category').forEach(el => {
                el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-category');
            });
        });

        label.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggedLayerId || draggedLayerId === config.id) return;
            e.dataTransfer.dropEffect = 'move';
            const rect = label.getBoundingClientRect();
            const isAfter = (e.clientY - rect.top) > (rect.height / 2);
            label.classList.toggle('drag-over-top', !isAfter);
            label.classList.toggle('drag-over-bottom', isAfter);
        });

        label.addEventListener('dragleave', () => {
            label.classList.remove('drag-over-top', 'drag-over-bottom');
        });

        label.addEventListener('drop', (e) => {
            e.preventDefault();
            const isAfter = label.classList.contains('drag-over-bottom');
            label.classList.remove('drag-over-top', 'drag-over-bottom');
            const srcId = draggedLayerId || e.dataTransfer.getData('text/plain');
            if (srcId && srcId !== config.id) {
                moveLayerInTree(srcId, config.id, config.category, isAfter);
            }
        });

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(config.defaultVisible);
        layerCheckboxes[config.id] = input;

        const spanBtn = document.createElement('div');
        spanBtn.className = 'check-btn';

        const isPointLayer = config.geomType === 'point';

        const colorSwatch = document.createElement('div');
        colorSwatch.className = 'layer-color-swatch'
            + (config.type !== 'raster' ? ' editable' : '')
            + (isPointLayer ? ' point-swatch' : '');
        layerSwatches[config.id] = colorSwatch;
        updateSwatchAppearance(colorSwatch, config);

        if (config.type !== 'raster') {
            colorSwatch.title = isPointLayer
                ? 'Ponto: clique para alterar a cor ou ajustar o tamanho'
                : 'Clique para alterar a cor ou modo (Sólido / Só Borda / Hachura)';
            colorSwatch.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openColorPalettePopover(config, label);
            });
        }

        const spanText = document.createElement('span');
        spanText.className = 'layer-name';
        spanText.textContent = config.name;

        const statusEl = document.createElement('span');
        statusEl.className = 'layer-status';

        let paletteBtn = null;
        if (config.type !== 'raster') {
            paletteBtn = document.createElement('button');
            paletteBtn.type = 'button';
            paletteBtn.className = 'layer-palette-btn';
            paletteBtn.title = 'Paleta de cores e preenchimento (Sólido / Só Borda / Hachura)';
            paletteBtn.innerHTML = '<i class="fa-solid fa-palette"></i>';
            paletteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openColorPalettePopover(config, label);
            });
        }

        const downloadBtn = document.createElement('button');
        downloadBtn.type = 'button';
        downloadBtn.className = 'layer-download-btn';
        downloadBtn.title = config.type === 'raster'
            ? 'Baixar imagem Raster (.png)'
            : 'Baixar arquivo desta camada (.geojson)';
        downloadBtn.innerHTML = '<i class="fa-solid fa-download"></i>';
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await downloadLayerData(config);
        });

        const zoomBtn = document.createElement('button');
        zoomBtn.type = 'button';
        zoomBtn.className = 'layer-zoom-btn';
        zoomBtn.title = 'Centralizar nesta camada';
        zoomBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass-location"></i>';

        zoomBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!input.checked) {
                input.checked = true;
                if (inlineSizePanel) inlineSizePanel.classList.remove('hidden');
                await toggleLayer(config, true, true, statusEl);
            } else {
                const layer = loadedLayers[config.id];
                if (layer) {
                    try {
                        const bounds = layer.getBounds();
                        if (bounds.isValid()) {
                            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
                        }
                    } catch (err) {}
                }
            }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'layer-delete-btn';
        deleteBtn.title = 'Excluir camada da árvore';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';

        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteLayerFromTree(config, label);
        });

        // Painel inline exclusivo para camadas de Ponto: aparece logo abaixo da camada na árvore ao marcá-la
        let inlineSizePanel = null;
        if (isPointLayer) {
            inlineSizePanel = document.createElement('div');
            inlineSizePanel.className = 'layer-inline-size-panel' + (input.checked ? '' : ' hidden');
            inlineSizePanel.dataset.layerId = config.id;
            inlineSizePanel.dataset.layerName = config.name.toLowerCase();

            const curR = config.pointRadius !== undefined ? config.pointRadius : 3.5;

            const sizeLabel = document.createElement('label');
            sizeLabel.innerHTML = '<i class="fa-solid fa-circle-dot"></i> Tamanho do ponto:';

            const sizeSlider = document.createElement('input');
            sizeSlider.type = 'range';
            sizeSlider.min = '1';
            sizeSlider.max = '14';
            sizeSlider.step = '0.5';
            sizeSlider.value = curR;

            const sizeBadge = document.createElement('span');
            sizeBadge.className = 'size-badge';
            sizeBadge.textContent = `${curR} px`;

            sizeSlider.addEventListener('input', (e) => {
                e.stopPropagation();
                const newR = parseFloat(e.target.value);
                sizeBadge.textContent = `${newR} px`;
                applyLayerColorStyle(config, undefined, undefined, newR, undefined);
            });

            inlineSizePanel.appendChild(sizeLabel);
            inlineSizePanel.appendChild(sizeSlider);
            inlineSizePanel.appendChild(sizeBadge);
        }

        input.addEventListener('change', async (e) => {
            if (inlineSizePanel) {
                inlineSizePanel.classList.toggle('hidden', !e.target.checked);
            }
            await toggleLayer(config, e.target.checked, e.target.checked, statusEl);
        });

        label.appendChild(dragHandle);
        label.appendChild(input);
        label.appendChild(spanBtn);
        label.appendChild(colorSwatch);
        label.appendChild(spanText);
        label.appendChild(statusEl);
        if (paletteBtn) label.appendChild(paletteBtn);
        label.appendChild(downloadBtn);
        label.appendChild(zoomBtn);
        label.appendChild(deleteBtn);

        layerControlsContainer.appendChild(label);
        if (inlineSizePanel) {
            layerControlsContainer.appendChild(inlineSizePanel);
        }
    });
}

// Inicializa as camadas padrão ao abrir o Geoportal
async function initGeoportal() {
    loadUserUploadedLayersFromStorage();
    loadLayerTreeOrder();
    loadSavedLayerStyles();
    loadDeletedLayers();
    buildLayerSidebar();

    // Botão de Adicionar Nova Camada (GeoJSON / KML / KMZ / Shapefile ZIP / GPX)
    const btnAddLayer = document.getElementById('btn-add-layer');
    const fileUploadInput = document.getElementById('file-upload-input');
    if (btnAddLayer && fileUploadInput) {
        btnAddLayer.addEventListener('click', () => {
            fileUploadInput.value = '';
            fileUploadInput.click();
        });
        fileUploadInput.addEventListener('change', async (e) => {
            await handleUserFileUpload(e.target.files);
        });
    }

    // Eventos do Popover de Paleta de Cores GeoJSON
    const popover = document.getElementById('color-palette-popover');
    const btnClosePalette = document.getElementById('btn-close-palette');
    const customColorInput = document.getElementById('palette-custom-input');
    const fillOpacityInput = document.getElementById('palette-fill-opacity');
    const fillOpacityVal = document.getElementById('palette-opacity-val');
    const pointRadiusInput = document.getElementById('palette-point-radius');
    const pointRadiusVal = document.getElementById('palette-radius-val');

    if (btnClosePalette && popover) {
        btnClosePalette.addEventListener('click', () => {
            popover.classList.add('hidden');
            activePaletteConfig = null;
        });
    }

    document.querySelectorAll('#color-palette-popover .fillmode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!activePaletteConfig) return;
            document.querySelectorAll('#color-palette-popover .fillmode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const selectedMode = btn.dataset.mode;
            applyLayerColorStyle(activePaletteConfig, undefined, undefined, undefined, selectedMode);
        });
    });

    if (customColorInput) {
        customColorInput.addEventListener('input', (e) => {
            if (!activePaletteConfig) return;
            const hex = e.target.value;
            document.querySelectorAll('#palette-swatches .palette-swatch-item').forEach(el => el.classList.remove('active'));
            applyLayerColorStyle(activePaletteConfig, hex, undefined, undefined, undefined);
        });
    }

    if (fillOpacityInput) {
        fillOpacityInput.addEventListener('input', (e) => {
            if (!activePaletteConfig) return;
            const pct = parseInt(e.target.value, 10);
            if (fillOpacityVal) fillOpacityVal.textContent = `${pct}%`;
            applyLayerColorStyle(activePaletteConfig, undefined, pct / 100, undefined, undefined);
        });
    }

    if (pointRadiusInput) {
        pointRadiusInput.addEventListener('input', (e) => {
            if (!activePaletteConfig) return;
            const r = parseFloat(e.target.value);
            if (pointRadiusVal) pointRadiusVal.textContent = `${r} px`;
            applyLayerColorStyle(activePaletteConfig, undefined, undefined, r, undefined);
        });
    }

    document.addEventListener('click', (e) => {
        if (popover && !popover.classList.contains('hidden')) {
            if (!popover.contains(e.target) && !e.target.closest('.layer-color-swatch') && !e.target.closest('.layer-palette-btn')) {
                popover.classList.add('hidden');
                activePaletteConfig = null;
            }
        }
    });

    // Filtro de busca de camadas
    const searchInput = document.getElementById('layer-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            document.querySelectorAll('#layer-controls .checkbox-label').forEach(lbl => {
                const match = lbl.dataset.layerName.includes(term);
                lbl.style.display = match ? 'flex' : 'none';
                const lid = lbl.dataset.layerId;
                const sizePanel = layerControlsContainer.querySelector(`.layer-inline-size-panel[data-layer-id="${lid}"]`);
                if (sizePanel) {
                    const cb = layerCheckboxes[lid];
                    sizePanel.classList.toggle('hidden', !match || !(cb && cb.checked));
                }
            });
        });
    }

    // Botão centralizar na RMB
    const btnFitRmb = document.getElementById('btn-fit-rmb');
    if (btnFitRmb) {
        btnFitRmb.addEventListener('click', () => {
            const rmbLayer = loadedLayers['rmb_limite'];
            if (rmbLayer) {
                try {
                    map.fitBounds(rmbLayer.getBounds(), { padding: [20, 20] });
                    return;
                } catch (e) {}
            }
            map.setView(RMB_CENTER, RMB_ZOOM);
        });
    }

    // Botão restaurar camadas excluídas da árvore
    const btnRestore = document.getElementById('btn-restore-layers');
    if (btnRestore) {
        btnRestore.addEventListener('click', () => {
            if (confirm('Deseja restaurar todas as camadas excluídas na árvore?')) {
                deletedLayerIds.clear();
                saveDeletedLayers();
                buildLayerSidebar();
                // Sincroniza checkboxes com camadas que já estejam visíveis no mapa
                Object.keys(loadedLayers).forEach(id => {
                    const lyr = loadedLayers[id];
                    if (lyr && map.hasLayer(lyr) && layerCheckboxes[id]) {
                        layerCheckboxes[id].checked = true;
                    }
                });
            }
        });
    }

    // Botão limpar todas as camadas ativas
    const btnClear = document.getElementById('btn-clear-layers');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            Object.keys(loadedLayers).forEach(id => {
                const layer = loadedLayers[id];
                if (layer && map.hasLayer(layer)) {
                    map.removeLayer(layer);
                }
            });
            Object.values(layerCheckboxes).forEach(cb => {
                cb.checked = false;
            });
            const mbLegend = document.getElementById('mapbiomas-legend');
            if (mbLegend) mbLegend.classList.add('hidden');
        });
    }

    // Controle de Opacidade e Minimizar Legenda MapBiomas
    const opacityInput = document.getElementById('raster-opacity');
    const opacityVal = document.getElementById('opacity-val');
    if (opacityInput) {
        opacityInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (opacityVal) opacityVal.textContent = `${val}%`;
            ['usos_2025', 'usos_2024'].forEach(rId => {
                const rasterLayer = loadedLayers[rId];
                if (rasterLayer && rasterLayer.setOpacity) {
                    rasterLayer.setOpacity(val / 100);
                }
            });
        });
    }

    const btnToggleLegendBody = document.getElementById('btn-toggle-legend-body');
    const legendBody = document.getElementById('legend-body');
    if (btnToggleLegendBody && legendBody) {
        btnToggleLegendBody.addEventListener('click', () => {
            const isCollapsed = legendBody.classList.toggle('collapsed');
            btnToggleLegendBody.querySelector('i').className = isCollapsed
                ? 'fa-solid fa-chevron-up'
                : 'fa-solid fa-chevron-down';
        });
    }

    // Botão Sol/Lua para alternar Identidade Visual (Tema Escuro / Tema Claro)
    const btnTheme = document.getElementById('btn-theme-toggle');
    const themeLabel = document.getElementById('theme-label');
    if (btnTheme) {
        const savedTheme = localStorage.getItem('geoportal_theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
            btnTheme.querySelector('i').className = 'fa-solid fa-moon';
            if (themeLabel) themeLabel.textContent = 'Modo Escuro';
        }

        btnTheme.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-theme');
            const icon = btnTheme.querySelector('i');
            if (isLight) {
                icon.className = 'fa-solid fa-moon';
                if (themeLabel) themeLabel.textContent = 'Modo Escuro';
                localStorage.setItem('geoportal_theme', 'light');
            } else {
                icon.className = 'fa-solid fa-sun';
                if (themeLabel) themeLabel.textContent = 'Modo Claro';
                localStorage.setItem('geoportal_theme', 'dark');
            }
        });
    }

    // Botão Abrir no Google Earth Web 3D na coordenada e altitude atuais com inclinação 3D
    const btnEarth3d = document.getElementById('btn-google-earth-3d');
    if (btnEarth3d) {
        btnEarth3d.addEventListener('click', () => {
            const center = map.getCenter();
            const zoom = map.getZoom();
            const lat = center.lat.toFixed(6);
            const lng = center.lng.toFixed(6);
            // Calcula distância aproximada da câmera em metros com base no zoom atual
            const dist = Math.max(250, Math.round(40000000 / Math.pow(2, zoom + 1)));
            // Inclinação de 55 graus (55t) para visualização 3D imediata dos edifícios e relevo
            const earthUrl = `https://earth.google.com/web/@${lat},${lng},15a,${dist}d,35y,0h,55t,0r`;
            window.open(earthUrl, '_blank');
        });
    }

    // Carrega as camadas marcadas como visíveis por padrão (exceto se foram excluídas pelo usuário)
    const defaultLayers = layerFiles.filter(c => c.defaultVisible && !deletedLayerIds.has(c.id));
    const mbLegend = document.getElementById('mapbiomas-legend');
    showLoading('Carregando camadas principais da RMB...');
    for (const config of defaultLayers) {
        try {
            const layer = await fetchAndParseLayer(config);
            layer.addTo(map);
            if ((config.id === 'usos_2025' || config.id === 'usos_2024') && mbLegend) {
                mbLegend.classList.remove('hidden');
            }
        } catch (err) {
            console.error(`Falha ao inicializar camada padrão ${config.name}:`, err);
        }
    }
    hideLoading();
}

window.addEventListener('DOMContentLoaded', initGeoportal);

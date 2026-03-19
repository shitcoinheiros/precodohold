/**
 * APP.JS - Versão com Proxy Anti-CORS e Delay de Requisição
 */

const BINANCE_BASE = 'https://api.binance.com/api/v3';
// Proxy gratuito para evitar erro de CORS
const PROXY = 'https://api.allorigins.win/raw?url=';
const GECKO_BASE = 'https://api.geckoterminal.com/api/v2';

let chart = null;
let candleSeries = null;

// Helper para dar uma pausa entre requisições (evita erro 429)
const delay = ms => new Promise(res => setTimeout(res, ms));

// --- 1. BUSCA DE DADOS (COM PROXY E TRATAMENTO DE ERRO) ---
async function fetchAssetData(asset) {
    try {
        if (asset.type === 'binance') {
            const res = await fetch(`${BINANCE_BASE}/ticker/24hr?symbol=${asset.symbol}`);
            const data = await res.json();
            return { price: parseFloat(data.lastPrice), change: parseFloat(data.priceChangePercent), status: 'ok' };
        } 
        
        if (asset.type === 'gecko') {
            const targetUrl = `${GECKO_BASE}/networks/${asset.network}/tokens/${asset.address}`;
            // Usamos o Proxy apenas para a GeckoTerminal
            const res = await fetch(PROXY + encodeURIComponent(targetUrl));
            
            if (res.status === 429) return { status: 'limit' };
            
            const json = await res.json();
            const attr = json.data?.attributes;
            if (!attr) return { status: 'error' };

            return {
                price: parseFloat(attr.price_usd),
                change: parseFloat(attr.price_change_percentage?.h24 || 0),
                status: 'ok'
            };
        }
    } catch (e) { 
        return { status: 'error' }; 
    }
}

// --- 2. RENDERIZAÇÃO DA TABELA (CARREGAMENTO LENTO PARA NÃO SER BANIDO) ---
async function renderTable(filter = "") {
    const tbody = document.getElementById('crypto-table-body');
    const filtered = TRACKED_ASSETS.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()));
    
    // Se for a primeira carga ou filtro, limpa a tabela
    if (!filter || tbody.innerHTML === "") {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-xs opacity-50">Sincronizando com as redes...</td></tr>';
    }

    let html = '';
    for (const asset of filtered) {
        const data = await fetchAssetData(asset);
        
        // Se a Gecko travar por limite, espera 500ms antes da próxima
        if (data.status === 'limit' || asset.type === 'gecko') await delay(600);

        const price = data.status === 'ok' 
            ? `$${data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: data.price < 1 ? 8 : 4 })}`
            : (data.status === 'limit' ? "Limite API" : "Carregando...");

        const change = data.status === 'ok' ? `${data.change.toFixed(2)}%` : "--";
        const color = data.change >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]';

        html += `
            <tr class="cmc-table-row border-b border-[#2b3139]" onclick='openChart(${JSON.stringify(asset)})'>
                <td class="px-4 py-4">
                    <div class="flex flex-col">
                        <span class="font-bold text-white text-sm">${asset.name}</span>
                        <span class="text-[10px] text-gray-400 uppercase">${asset.ticker}</span>
                    </div>
                </td>
                <td class="px-4 py-4 text-right mono font-bold text-sm">${price}</td>
                <td class="px-4 py-4 text-right font-bold text-xs ${color}">${change}</td>
            </tr>`;
    }
    tbody.innerHTML = html;
}

// --- 3. GRÁFICO INTERNO ---
async function openChart(asset) {
    document.getElementById('chart-modal').style.display = 'flex';
    document.getElementById('modal-coin-name').innerText = asset.name;
    const container = document.getElementById('main-chart-container');
    container.innerHTML = '<div class="flex h-full items-center justify-center text-xs opacity-50">Desenhando gráfico...</div>';

    chart = LightweightCharts.createChart(container, {
        layout: { background: { color: '#0b0e11' }, textColor: '#848e9c' },
        grid: { vertLines: { color: '#161a1e' }, horzLines: { color: '#161a1e' } },
        timeScale: { timeVisible: true }
    });

    candleSeries = chart.addCandlestickSeries({ upColor: '#0ecb81', downColor: '#f6465d' });

    try {
        let candles = [];
        if (asset.type === 'binance') {
            const res = await fetch(`${BINANCE_BASE}/klines?symbol=${asset.symbol}&interval=1h&limit=100`);
            const data = await res.json();
            candles = data.map(d => ({ time: d[0]/1000, open: +d[1], high: +d[2], low: +d[3], close: +d[4] }));
        } else {
            // Busca o Pool e depois os Candles via Proxy
            const poolUrl = `${GECKO_BASE}/networks/${asset.network}/tokens/${asset.address}/pools`;
            const poolRes = await fetch(PROXY + encodeURIComponent(poolUrl));
            const poolJson = await poolRes.json();
            const poolAddr = poolJson.data[0].attributes.address;

            const ohlcvUrl = `${GECKO_BASE}/networks/${asset.network}/pools/${poolAddr}/ohlcv/hour?limit=100`;
            const ohlcvRes = await fetch(PROXY + encodeURIComponent(ohlcvUrl));
            const ohlcvJson = await ohlcvRes.json();
            
            candles = ohlcvJson.data.attributes.ohlcv_list.map(d => ({
                time: d[0], open: +d[1], high: +d[2], low: +d[3], close: +d[4]
            })).sort((a,b) => a.time - b.time);
        }
        candleSeries.setData(candles);
        chart.timeScale().fitContent();
    } catch (e) {
        container.innerHTML = `<div class="p-10 text-center text-xs text-red-500">Erro: Limite de requisições atingido. Tente novamente em instantes.</div>`;
    }
}

function closeChart() {
    document.getElementById('chart-modal').style.display = 'none';
    if(chart) chart.remove();
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    renderTable();
    // Atualização lenta (2 minutos) para evitar bloqueios constantes
    setInterval(() => renderTable(document.getElementById('searchInput').value), 120000);
});

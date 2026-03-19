/**
 * APP.JS - Gráfico Interno para Binance e GeckoTerminal
 */

const BINANCE_BASE = 'https://api.binance.com/api/v3';
const GECKO_BASE = 'https://api.geckoterminal.com/api/v2/networks';

let chart = null;
let candleSeries = null;

// --- 1. BUSCA DE DADOS (TABELA) ---
async function fetchAssetData(asset) {
    try {
        if (asset.type === 'binance') {
            const res = await fetch(`${BINANCE_BASE}/ticker/24hr?symbol=${asset.symbol}`);
            const data = await res.json();
            return {
                price: parseFloat(data.lastPrice),
                change: parseFloat(data.priceChangePercent),
                status: 'ok'
            };
        } 
        if (asset.type === 'gecko') {
            const res = await fetch(`${GECKO_BASE}/${asset.network}/tokens/${asset.address}`);
            const json = await res.json();
            const attr = json.data?.attributes;
            if (!attr) return { status: 'error' };
            return {
                price: parseFloat(attr.price_usd),
                change: parseFloat(attr.price_change_percentage?.h24 || 0),
                status: 'ok'
            };
        }
    } catch (e) { return { status: 'error' }; }
}

// --- 2. RENDERIZAÇÃO DA TABELA ---
async function renderTable(filter = "") {
    const tbody = document.getElementById('crypto-table-body');
    const filtered = TRACKED_ASSETS.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()));
    
    tbody.innerHTML = '';
    for (const asset of filtered) {
        const data = await fetchAssetData(asset);
        if (!data || data.status === 'error') continue;

        const row = document.createElement('tr');
        row.className = 'cmc-table-row';
        row.onclick = () => openChart(asset);
        
        row.innerHTML = `
            <td class="px-4 py-4">
                <div class="flex flex-col">
                    <span class="font-bold text-white text-sm">${asset.name}</span>
                    <span class="text-[10px] text-gray-500 uppercase">${asset.type} • ${asset.ticker}</span>
                </div>
            </td>
            <td class="px-4 py-4 text-right mono font-bold text-sm">
                $${data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: data.price < 1 ? 8 : 4 })}
            </td>
            <td class="px-4 py-4 text-right font-bold text-xs ${data.change >= 0 ? 'positive-price' : 'negative-price'}">
                ${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}%
            </td>
        `;
        tbody.appendChild(row);
    }
}

// --- 3. LÓGICA DO GRÁFICO UNIFICADO ---
async function openChart(asset) {
    document.getElementById('chart-modal').style.display = 'flex';
    document.getElementById('modal-coin-name').innerText = asset.name;
    document.getElementById('live-price-badge').innerText = "Carregando...";

    const container = document.getElementById('main-chart-container');
    container.innerHTML = ''; // Limpa gráfico anterior

    // Configuração básica do gráfico
    chart = LightweightCharts.createChart(container, {
        layout: { background: { color: '#0b0e11' }, textColor: '#848e9c' },
        grid: { vertLines: { color: '#161a1e' }, horzLines: { color: '#161a1e' } },
        timeScale: { borderColor: '#2b3139', timeVisible: true },
        rightPriceScale: { borderColor: '#2b3139' }
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#0ecb81', downColor: '#f6465d', borderVisible: false,
        wickUpColor: '#0ecb81', wickDownColor: '#f6465d'
    });

    let candleData = [];

    try {
        if (asset.type === 'binance') {
            // Dados da Binance
            const res = await fetch(`${BINANCE_BASE}/klines?symbol=${asset.symbol}&interval=1h&limit=100`);
            const data = await res.json();
            candleData = data.map(d => ({
                time: d[0] / 1000,
                open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4])
            }));
        } else {
            /** 
             * Dados da GeckoTerminal (DEX)
             * Precisamos buscar o pool da moeda para pegar o OHLCV
             * Usamos o endpoint de tokens/pools para achar o pool principal
             */
            const poolRes = await fetch(`${GECKO_BASE}/${asset.network}/tokens/${asset.address}/pools`);
            const poolJson = await poolRes.json();
            const poolAddress = poolJson.data[0].attributes.address;

            // Busca OHLCV (candles de 1 hora)
            const ohlcvRes = await fetch(`${GECKO_BASE}/${asset.network}/pools/${poolAddress}/ohlcv/hour?limit=100`);
            const ohlcvJson = await ohlcvRes.json();
            
            // A Gecko retorna [timestamp, open, high, low, close, volume]
            candleData = ohlcvJson.data.attributes.ohlcv_list.map(d => ({
                time: d[0],
                open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4])
            })).sort((a, b) => a.time - b.time);
        }

        candleSeries.setData(candleData);
        chart.timeScale().fitContent();
        
        // Atualiza o preço no topo do modal
        const lastCandle = candleData[candleData.length - 1];
        document.getElementById('live-price-badge').innerText = `$${lastCandle.close.toLocaleString()}`;
        document.getElementById('live-price-badge').style.color = lastCandle.close >= lastCandle.open ? '#0ecb81' : '#f6465d';

    } catch (e) {
        container.innerHTML = `<div class="flex h-full items-center justify-center text-red-500">Erro ao carrergar histórico do gráfico</div>`;
    }
}

function closeChart() {
    document.getElementById('chart-modal').style.display = 'none';
    if (chart) { chart.remove(); chart = null; }
}

// --- 4. INICIALIZAÇÃO ---
document.getElementById('searchInput').addEventListener('input', (e) => renderTable(e.target.value));

document.addEventListener('DOMContentLoaded', () => {
    renderTable();
    // Atualiza tabela a cada 1 min
    setInterval(() => renderTable(document.getElementById('searchInput').value), 60000);
});

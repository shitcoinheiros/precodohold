const BINANCE_REST = 'https://api.binance.com/api/v3/ticker/24hr';
const GECKO_API = 'https://api.geckoterminal.com/api/v2/networks';
const FNG_API = 'https://api.alternative.me/fng/?limit=1';

let chart = null;
let candleSeries = null;
let lastPrices = {};

// 1. Busca de Dados Híbrida
async function fetchAssetData(asset) {
    try {
        if (asset.type === 'binance') {
            const res = await fetch(`${BINANCE_REST}?symbol=${asset.symbol}`);
            const data = await res.json();
            return {
                price: parseFloat(data.lastPrice),
                change: parseFloat(data.priceChangePercent),
                volume: parseFloat(data.quoteVolume)
            };
        } else {
            const res = await fetch(`${GECKO_API}/${asset.network}/tokens/${asset.address}`);
            const json = await res.json();
            const attr = json.data.attributes;
            return {
                price: parseFloat(attr.price_usd),
                change: parseFloat(attr.price_change_percentage.h24),
                volume: parseFloat(attr.volume_usd.h24)
            };
        }
    } catch (e) { return null; }
}

// 2. Renderização da Tabela (Filtra por NOME)
async function renderTable(filter = "") {
    const tbody = document.getElementById('crypto-table-body');
    const filtered = TRACKED_ASSETS.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()));
    
    tbody.innerHTML = '';
    for (const asset of filtered) {
        const data = await fetchAssetData(asset);
        if (!data) continue;

        const row = document.createElement('tr');
        row.className = 'cmc-table-row';
        row.onclick = () => openChart(asset);
        row.innerHTML = `
            <td class="px-4 py-4">
                <span class="font-bold text-white">${asset.name}</span>
                <span class="text-[10px] text-gray-500 block">${asset.ticker} (${asset.type})</span>
            </td>
            <td class="px-4 py-4 text-right mono font-bold" id="price-${asset.ticker}">
                $${data.price.toLocaleString(undefined, {minimumFractionDigits: 2})}
            </td>
            <td class="px-4 py-4 text-right font-bold text-xs ${data.change >= 0 ? 'positive-price' : 'negative-price'}">
                ${data.change.toFixed(2)}%
            </td>
        `;
        tbody.appendChild(row);
    }
}

// 3. Gráfico (Binance ou Link Externo para Gecko)
function openChart(asset) {
    if (asset.type === 'gecko') {
        window.open(`https://www.geckoterminal.com/${asset.network}/pools/${asset.address}`, '_blank');
        return;
    }
    
    document.getElementById('chart-modal').style.display = 'flex';
    document.getElementById('modal-coin-name').innerText = asset.name;
    initBinanceChart(asset.symbol);
}

async function initBinanceChart(symbol) {
    const container = document.getElementById('main-chart-container');
    container.innerHTML = '';
    chart = LightweightCharts.createChart(container, {
        layout: { background: { color: '#0b0e11' }, textColor: '#848e9c' },
        grid: { vertLines: { color: '#161a1e' }, horzLines: { color: '#161a1e' } },
    });
    candleSeries = chart.addCandlestickSeries();
    
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`);
    const data = await res.json();
    candleSeries.setData(data.map(d => ({
        time: d[0] / 1000, open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4])
    })));
}

function closeChart() {
    document.getElementById('chart-modal').style.display = 'none';
    if(chart) chart.remove();
}

// Busca em Tempo Real por Nome
document.getElementById('searchInput').addEventListener('input', (e) => {
    renderTable(e.target.value);
});

// Inicialização
renderTable();

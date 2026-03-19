/**
 * APP.JS - Lógica de Integração Híbrida (Binance & GeckoTerminal)
 */

const BINANCE_REST = 'https://api.binance.com/api/v3/ticker/24hr';
const GECKO_BASE = 'https://api.geckoterminal.com/api/v2/networks';
const FNG_API = 'https://api.alternative.me/fng/?limit=1';

let chart = null;
let candleSeries = null;

// --- 1. BUSCA DE DADOS (O AJUSTE PRINCIPAL) ---
async function fetchAssetData(asset) {
    try {
        if (asset.type === 'binance') {
            const res = await fetch(`${BINANCE_REST}?symbol=${asset.symbol}`);
            const data = await res.json();
            
            if (data.code) throw new Error("Símbolo Binance não encontrado");

            return {
                price: parseFloat(data.lastPrice),
                change: parseFloat(data.priceChangePercent),
                volume: parseFloat(data.quoteVolume),
                status: 'ok'
            };
        } 
        
        if (asset.type === 'gecko') {
            // Endpoint específico para obter dados de um Token pelo contrato
            const url = `${GECKO_BASE}/${asset.network}/tokens/${asset.address}`;
            const res = await fetch(url);
            const json = await res.json();
            
            if (!json.data || !json.data.attributes) {
                console.warn(`Dados não encontrados para ${asset.name} na Gecko`);
                return null;
            }

            const attr = json.data.attributes;
            return {
                // Gecko retorna strings, convertemos para float
                price: parseFloat(attr.price_usd) || 0,
                // Pegamos a variação de 24h
                change: parseFloat(attr.price_change_percentage.h24) || 0,
                volume: parseFloat(attr.volume_usd.h24) || 0,
                status: 'ok'
            };
        }
    } catch (e) {
        console.error(`Erro ao buscar ${asset.name}:`, e);
        return { status: 'error' };
    }
}

// --- 2. RENDERIZAÇÃO DA TABELA ---
async function renderTable(filter = "") {
    const tbody = document.getElementById('crypto-table-body');
    
    // Filtra os ativos pelo NOME definido no config.js
    const filtered = TRACKED_ASSETS.filter(a => 
        a.name.toLowerCase().includes(filter.toLowerCase())
    );

    // Limpa a tabela antes de reconstruir
    tbody.innerHTML = '';

    // Loop sequencial para evitar bloqueio de Rate Limit (especialmente na Gecko)
    for (const asset of filtered) {
        const data = await fetchAssetData(asset);
        
        const row = document.createElement('tr');
        row.className = 'cmc-table-row animate-pulse'; // Efeito de carregamento
        
        // Formatação de Preço (mais casas decimais para moedas baratas/memes)
        const priceFormatted = data?.status === 'ok' 
            ? `$${data.price.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: asset.type === 'gecko' ? 8 : 4 
              })}` 
            : "Sincronizando...";

        const changeFormatted = data?.status === 'ok' 
            ? `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}%` 
            : "--";

        const changeClass = data?.status === 'ok' 
            ? (data.change >= 0 ? 'positive-price' : 'negative-price') 
            : '';

        row.className = 'cmc-table-row';
        row.onclick = () => openChart(asset);
        
        row.innerHTML = `
            <td class="px-4 py-4">
                <div class="flex flex-col">
                    <span class="font-bold text-white text-sm">${asset.name}</span>
                    <span class="text-[10px] text-gray-500 uppercase tracking-widest">
                        ${asset.type} • ${asset.ticker}
                    </span>
                </div>
            </td>
            <td class="px-4 py-4 text-right mono font-bold text-sm">
                ${priceFormatted}
            </td>
            <td class="px-4 py-4 text-right font-bold text-xs ${changeClass}">
                ${changeFormatted}
            </td>
        `;
        
        tbody.appendChild(row);
    }
}

// --- 3. GRÁFICO E MODAL ---
function openChart(asset) {
    const modal = document.getElementById('chart-modal');
    const title = document.getElementById('modal-coin-name');
    
    modal.style.display = 'flex';
    title.innerText = `${asset.name} (${asset.type.toUpperCase()})`;

    if (asset.type === 'binance') {
        initBinanceChart(asset.symbol);
    } else {
        // Se for GeckoTerminal, mostramos um aviso e link (API gratuita não tem Klines via WebSocket)
        const container = document.getElementById('main-chart-container');
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full p-6 text-center">
                <i class="fas fa-external-link-alt text-3xl mb-4 text-[var(--binance-yellow)]"></i>
                <p class="text-sm mb-4 text-gray-400">Gráficos em tempo real para DEX via API gratuita são limitados.</p>
                <a href="https://www.geckoterminal.com/${asset.network}/pools/${asset.address}" 
                   target="_blank" 
                   class="bg-[var(--binance-yellow)] text-black px-6 py-2 rounded-lg font-bold">
                   Ver no GeckoTerminal
                </a>
            </div>
        `;
    }
}

async function initBinanceChart(symbol) {
    const container = document.getElementById('main-chart-container');
    container.innerHTML = '';
    
    chart = LightweightCharts.createChart(container, {
        layout: { background: { color: '#0b0e11' }, textColor: '#848e9c' },
        grid: { vertLines: { color: '#161a1e' }, horzLines: { color: '#161a1e' } },
        timeScale: { borderColor: '#2b3139' },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#0ecb81', downColor: '#f6465d', borderVisible: false,
        wickUpColor: '#0ecb81', wickDownColor: '#f6465d'
    });

    try {
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`);
        const data = await res.json();
        const candles = data.map(d => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]), high: parseFloat(d[2]),
            low: parseFloat(d[3]), close: parseFloat(d[4])
        }));
        candleSeries.setData(candles);
        chart.timeScale().fitContent();
    } catch (e) { console.error("Erro ao carregar candles"); }
}

function closeChart() {
    document.getElementById('chart-modal').style.display = 'none';
    if (chart) {
        chart.remove();
        chart = null;
    }
}

// --- 4. EXTRAS (FEAR & GREED) ---
async function updateFearGreed() {
    try {
        const res = await fetch(FNG_API);
        const json = await res.json();
        const val = json.data[0].value;
        const label = json.data[0].value_classification;
        
        document.getElementById('fg-value').innerText = val;
        document.getElementById('fg-label').innerText = label;
    } catch (e) { /* silent */ }
}

// --- 5. EVENTOS E INICIALIZAÇÃO ---
document.getElementById('searchInput').addEventListener('input', (e) => {
    renderTable(e.target.value);
});

// Inicializa o App
document.addEventListener('DOMContentLoaded', () => {
    renderTable();
    updateFearGreed();
    
    // Atualiza a tabela a cada 60 segundos (para não estourar limite da Gecko)
    setInterval(() => {
        const currentSearch = document.getElementById('searchInput').value;
        renderTable(currentSearch);
    }, 60000);
});

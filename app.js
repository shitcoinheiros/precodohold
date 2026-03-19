/**
 * APP.JS - Versão Estabilizada com Tratamento de Erros 404 e Atributos
 */

const BINANCE_REST = 'https://api.binance.com/api/v3/ticker/24hr';
const GECKO_BASE = 'https://api.geckoterminal.com/api/v2/networks';
const FNG_API = 'https://api.alternative.me/fng/?limit=1';

let chart = null;
let candleSeries = null;

// --- 1. BUSCA DE DADOS (COM PROTEÇÃO CONTRA UNDEFINED) ---
async function fetchAssetData(asset) {
    try {
        if (asset.type === 'binance') {
            const res = await fetch(`${BINANCE_REST}?symbol=${asset.symbol}`);
            const data = await res.json();
            
            if (data.code || !data.lastPrice) return { status: 'error' };

            return {
                price: parseFloat(data.lastPrice),
                change: parseFloat(data.priceChangePercent),
                volume: parseFloat(data.quoteVolume),
                status: 'ok'
            };
        } 
        
        if (asset.type === 'gecko') {
            const url = `${GECKO_BASE}/${asset.network}/tokens/${asset.address}`;
            const res = await fetch(url);
            
            if (res.status === 404) {
                console.warn(`404: Contrato ${asset.address} não encontrado na rede ${asset.network}`);
                return { status: 'not_found' };
            }

            const json = await res.json();
            const attr = json.data?.attributes;

            if (!attr) return { status: 'error' };

            // PROTEÇÃO: A GeckoTerminal às vezes retorna price_change_percentage como um objeto 
            // ou pode não ter a chave 'h24' disponível no momento.
            return {
                price: parseFloat(attr.price_usd) || 0,
                // Usamos o operador ?. para evitar o erro "Cannot read properties of undefined"
                change: parseFloat(attr.price_change_percentage?.h24 || attr.price_change_percentage?.last_24h || 0),
                volume: parseFloat(attr.volume_usd?.h24 || attr.volume_usd?.last_24h || 0),
                status: 'ok'
            };
        }
    } catch (e) {
        console.error(`Erro crítico em ${asset.name}:`, e);
        return { status: 'error' };
    }
}

// --- 2. RENDERIZAÇÃO DA TABELA ---
async function renderTable(filter = "") {
    const tbody = document.getElementById('crypto-table-body');
    const filtered = TRACKED_ASSETS.filter(a => 
        a.name.toLowerCase().includes(filter.toLowerCase())
    );

    // Mantém o que já existe ou limpa para recarregar
    tbody.innerHTML = '';

    for (const asset of filtered) {
        const data = await fetchAssetData(asset);
        
        let priceFormatted = "Erro API";
        let changeFormatted = "--";
        let changeClass = "";

        if (data?.status === 'ok') {
            priceFormatted = `$${data.price.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: data.price < 1 ? 8 : 4 
            })}`;
            changeFormatted = `${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)}%`;
            changeClass = data.change >= 0 ? 'positive-price' : 'negative-price';
        } else if (data?.status === 'not_found') {
            priceFormatted = "Ref. Inválida";
        }

        const row = document.createElement('tr');
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
    modal.style.display = 'flex';
    document.getElementById('modal-coin-name').innerText = asset.name;

    const container = document.getElementById('main-chart-container');
    container.innerHTML = '';

    if (asset.type === 'binance') {
        initBinanceChart(asset.symbol);
    } else {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full p-6 text-center">
                <i class="fas fa-external-link-alt text-2xl mb-4 text-[var(--binance-yellow)]"></i>
                <a href="https://www.geckoterminal.com/${asset.network}/pools/${asset.address}" 
                   target="_blank" class="bg-[var(--binance-yellow)] text-black px-6 py-2 rounded-lg font-bold">
                   Abrir no GeckoTerminal
                </a>
            </div>`;
    }
}

async function initBinanceChart(symbol) {
    const container = document.getElementById('main-chart-container');
    chart = LightweightCharts.createChart(container, {
        layout: { background: { color: '#0b0e11' }, textColor: '#848e9c' },
        grid: { vertLines: { color: '#161a1e' }, horzLines: { color: '#161a1e' } },
    });
    candleSeries = chart.addCandlestickSeries();
    
    try {
        const res = await fetch(`${BINANCE_REST.replace('ticker/24hr','klines')}?symbol=${symbol}&interval=1h&limit=50`);
        const data = await res.json();
        candleSeries.setData(data.map(d => ({
            time: d[0] / 1000, open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4])
        })));
        chart.timeScale().fitContent();
    } catch (e) {}
}

function closeChart() {
    document.getElementById('chart-modal').style.display = 'none';
    if (chart) { chart.remove(); chart = null; }
}

// --- 4. INICIALIZAÇÃO ---
document.getElementById('searchInput').addEventListener('input', (e) => renderTable(e.target.value));

document.addEventListener('DOMContentLoaded', () => {
    renderTable();
    setInterval(() => renderTable(document.getElementById('searchInput').value), 60000);
});

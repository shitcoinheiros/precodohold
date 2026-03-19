// config.js
const TRACKED_ASSETS = [
    { name: "Bitcoin", ticker: "BTC", type: "binance", symbol: "BTCUSDT" },
    { name: "Ethereum", ticker: "ETH", type: "binance", symbol: "ETHUSDT" },
    { name: "Solana", ticker: "SOL", type: "binance", symbol: "SOLUSDT" },
    // Para GeckoTerminal: network (ex: eth, solana, bsc) e address (contrato do pool ou token)
    { name: "Pepe Coin", ticker: "PEPE", type: "gecko", network: "56", address: "0x6982508145454ce325ddbe47a25d4ec3d2311933" },
    { name: "Bonk", ticker: "BONK", type: "gecko", network: "solana", address: "DezXAZ8z7Pnrn9jzX2K5VRe48QDEJat46RndfXWf5kyL" }
];

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, QrCode, ArrowRight, Loader2, CheckCircle2, Copy } from 'lucide-react';
import { ResellerApi } from '../../services/reseller/resellerApi';
import { useNavigate } from 'react-router-dom';

export const AddFunds = () => {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('10');
  const [step, setStep] = useState<'input' | 'qr' | 'success'>('input');
  const [loading, setLoading] = useState(false);
  const [txId, setTxId] = useState('');
  const [copied, setCopied] = useState(false);

  const predefinedAmounts = ['1', '5', '10', '50', '100'];
  const binancePayId = '758110599';

  const handleGenerateQR = async () => {
    setLoading(true);
    // Simulate Binance API call
    await new Promise(r => setTimeout(r, 800));
    setStep('qr');
    setLoading(false);
  };

  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txId) return;

    setLoading(true);
    try {
      const result = await ResellerApi.addFunds(parseFloat(amount), txId);
      if (result.status === 'completed') {
        alert(result.message || 'Payment verified automatically!');
      } else {
        alert(result.message || 'Payment sent for manual review.');
      }
      setStep('success');
      setTimeout(() => {
        navigate('/reseller/dashboard');
      }, 3000);
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Failed to verify transaction. Please check your TxID.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(binancePayId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-xl mx-auto mt-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#111111]/80 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl shadow-black/50"
      >
        <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 p-8 border-b border-white/5 text-center">
          <div className="mx-auto w-16 h-16 bg-[#1a1a1a] border border-white/10 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Wallet className="h-8 w-8 text-yellow-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Add Funds</h1>
          <p className="text-yellow-200/60">Top up your balance using Binance Pay.</p>
        </div>

        <div className="p-8">
          {step === 'input' && (
            <div className="space-y-8">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {predefinedAmounts.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setAmount(amt)}
                    className={`py-3 rounded-xl text-sm font-medium transition-all ${
                      amount === amt 
                        ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/25 scale-105' 
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/5'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300 ml-1">Custom Amount (USD)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-gray-500 text-lg">$</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="block w-full pl-8 pr-4 py-4 bg-[#0a0a0a] border border-white/10 rounded-2xl text-white text-2xl font-bold focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all placeholder:text-gray-600"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <button
                onClick={handleGenerateQR}
                disabled={loading || !amount || parseFloat(amount) < 1}
                className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-300 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black shadow-lg shadow-yellow-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    Continue to Payment <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
          )}

          {step === 'qr' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center space-y-6"
            >
              <div className="p-6 bg-white rounded-2xl shadow-xl">
                {/* Mock QR Code */}
                <div className="w-48 h-48 bg-gray-200 rounded-lg flex items-center justify-center relative overflow-hidden">
                  <QrCode className="h-32 w-32 text-gray-800" />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-transparent animate-[scan_2s_ease-in-out_infinite]" />
                </div>
              </div>
              
              <div className="text-center space-y-2 w-full">
                <p className="text-gray-400">Scan QR or send to Binance Pay ID:</p>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="text-2xl font-bold text-white">{binancePayId}</span>
                  <button 
                    onClick={handleCopy}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                  >
                    {copied ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
                  </button>
                </div>
                <p className="text-2xl font-bold text-yellow-500 mb-4">${parseFloat(amount).toFixed(2)}</p>
              </div>

              <div className="w-full h-px bg-white/10 my-4" />

              <form onSubmit={handleSubmitVerification} className="w-full space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300 ml-1">Binance Transaction ID</label>
                  <input
                    type="text"
                    required
                    value={txId}
                    onChange={(e) => setTxId(e.target.value)}
                    className="block w-full px-4 py-3 bg-[#0a0a0a] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all placeholder:text-gray-600"
                    placeholder="e.g. 1234567890123456"
                  />
                  <p className="text-xs text-gray-500 ml-1">Enter the Order ID or Transaction ID after sending payment.</p>
                </div>

                <button
                  type="submit"
                  disabled={loading || !txId}
                  className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-300 bg-white/10 hover:bg-white/20 text-white border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Submit for Verification'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="w-full text-sm text-gray-500 hover:text-white transition-colors py-2"
                >
                  Cancel
                </button>
              </form>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center py-8 space-y-4"
            >
              <div className="h-20 w-20 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 mb-4">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h2 className="text-2xl font-bold text-white">Request Submitted!</h2>
              <p className="text-gray-400 text-center max-w-md">
                Your deposit request for ${parseFloat(amount).toFixed(2)} is pending verification. The balance will be added once an admin approves it.
              </p>
              <p className="text-sm text-yellow-500/80 mt-4 animate-pulse">Redirecting to dashboard...</p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

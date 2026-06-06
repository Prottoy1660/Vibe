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
  const binancePayId = import.meta.env.VITE_BINANCE_PAY_UID || '1115056911';

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
    <div className="w-full pb-10 flex flex-col lg:flex-row gap-6 lg:gap-8">
      
      {/* Left Side - Pure Text/Info */}
      <div className="lg:w-1/3 flex flex-col">
        <div className="sticky top-28">
          <h1 className="text-3xl lg:text-4xl font-bold text-white mb-3 tracking-tight">Add Funds</h1>
          <p className="text-gray-400 text-sm lg:text-base leading-relaxed mb-6">
            Top up your balance securely to activate users. We accept payments via Binance Pay.
          </p>
          
          <div className="space-y-4 hidden sm:block">
            <div className="flex items-start gap-3 text-gray-300">
              <CheckCircle2 className="h-5 w-5 text-white shrink-0 mt-0.5" />
              <span className="text-sm font-medium">Zero transaction fees</span>
            </div>
            <div className="flex items-start gap-3 text-gray-300">
              <CheckCircle2 className="h-5 w-5 text-white shrink-0 mt-0.5" />
              <span className="text-sm font-medium">Fast crypto processing</span>
            </div>
            <div className="flex items-start gap-3 text-gray-300">
              <CheckCircle2 className="h-5 w-5 text-white shrink-0 mt-0.5" />
              <span className="text-sm font-medium">Secure and verifiable</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="lg:w-2/3 flex flex-col">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
        >
          <div className="p-8 lg:p-12">
            {step === 'input' && (
              <div className="space-y-8">
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                  {predefinedAmounts.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setAmount(amt)}
                      className={`py-4 rounded-2xl text-base font-bold transition-all ${
                        amount === amt 
                          ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black shadow-lg shadow-yellow-500/25 scale-[1.02]' 
                          : 'bg-[#111111] text-gray-400 hover:bg-[#1a1a1a] hover:text-white border border-white/5'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>

                <div className="space-y-3 mt-8">
                  <label className="text-sm font-semibold text-gray-300 ml-1">Custom Amount (USD)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                      <span className="text-gray-500 text-xl font-bold">$</span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="block w-full pl-12 pr-6 py-5 bg-[#111111] border border-white/10 rounded-2xl text-white text-3xl font-black focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all placeholder:text-gray-700 shadow-inner"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <button
                  onClick={handleGenerateQR}
                  disabled={loading || !amount || parseFloat(amount) < 1}
                  className="w-full py-5 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 bg-white hover:bg-gray-200 text-black shadow-xl shadow-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-lg mt-8"
                >
                  {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <>
                      Continue to Payment <ArrowRight className="h-6 w-6" />
                    </>
                  )}
                </button>
              </div>
            )}

            {step === 'qr' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center space-y-8"
              >
                <div className="text-center space-y-3 w-full">
                  <p className="text-gray-400 font-medium">Send exactly to Binance Pay ID:</p>
                  <div className="flex items-center justify-center gap-3 mb-6 bg-[#111111] py-4 px-6 rounded-2xl border border-white/5 w-max mx-auto">
                    <span className="text-3xl font-black text-white tracking-widest">{binancePayId}</span>
                    <button 
                      onClick={handleCopy}
                      className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
                    >
                      {copied ? <CheckCircle2 className="h-6 w-6 text-emerald-400" /> : <Copy className="h-6 w-6" />}
                    </button>
                  </div>
                  <p className="text-3xl font-black text-yellow-500">${parseFloat(amount).toFixed(2)}</p>
                </div>

                <div className="w-full h-px bg-white/5 my-4" />

                <form onSubmit={handleSubmitVerification} className="w-full space-y-6">
                  <div className="space-y-3">
                    <label className="text-sm font-semibold text-gray-300 ml-1">Binance Transaction ID</label>
                    <input
                      type="text"
                      required
                      value={txId}
                      onChange={(e) => setTxId(e.target.value)}
                      className="block w-full px-6 py-4 bg-[#111111] border border-white/10 rounded-2xl text-white focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all placeholder:text-gray-600 shadow-inner text-lg font-mono"
                      placeholder="e.g. 1234567890123456"
                    />
                    <p className="text-sm text-gray-500 ml-1 mt-2">Enter the Order ID or Transaction ID after sending payment.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <button
                      type="submit"
                      disabled={loading || !txId}
                      className="w-full py-5 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-300 bg-white hover:bg-gray-200 text-black shadow-xl shadow-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                    >
                      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : 'Submit for Verification'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('input')}
                      className="w-full text-sm font-medium text-gray-400 hover:text-white transition-colors py-3"
                    >
                      Cancel and Go Back
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center py-12 space-y-6"
              >
                <div className="h-24 w-24 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 mb-2">
                  <CheckCircle2 className="h-12 w-12" />
                </div>
                <h2 className="text-3xl font-black text-white">Request Submitted!</h2>
                <p className="text-gray-400 text-center max-w-md text-lg leading-relaxed">
                  Your deposit request for <span className="text-white font-bold">${parseFloat(amount).toFixed(2)}</span> is pending verification. The balance will be added once an admin approves it.
                </p>
                <div className="mt-8 flex items-center gap-3 px-6 py-3 bg-white/5 rounded-full text-yellow-500/80 text-sm font-medium animate-pulse border border-white/5">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirecting to dashboard...
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

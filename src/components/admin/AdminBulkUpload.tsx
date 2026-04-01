import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, X, Database, Info } from 'lucide-react';

export const AdminBulkUpload = ({ onUploadSuccess }: { onUploadSuccess?: () => void }) => {
  const [activeTab, setActiveTab] = useState<'paste' | 'csv'>('paste');
  const [bulkUploadText, setBulkUploadText] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  // Preview State
  const [previewAccounts, setPreviewAccounts] = useState<{email: string, password: string, valid: boolean, error?: string}[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const validateAndParseText = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const accounts = [];
    
    for (const line of lines) {
      // Split by comma or tab (in case they copy-paste from Excel)
      const parts = line.split(/[,	]/).map(s => s.trim());
      const email = parts[0];
      const password = parts.slice(1).join(',').trim(); // In case password has commas

      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const isValidPassword = password && password.length > 0;
      
      let valid = true;
      let error = undefined;
      
      if (!isValidEmail) {
        valid = false;
        error = 'Invalid email format';
      } else if (!isValidPassword) {
        valid = false;
        error = 'Missing password';
      }
      
      accounts.push({
        email,
        password,
        valid,
        error
      });
    }
    
    setPreviewAccounts(accounts);
    setShowPreview(true);
    setUploadMessage(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      validateAndParseText(text);
      setBulkUploadText(text); // Also sync it to the text area
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleConfirmUpload = async () => {
    const validAccounts = previewAccounts.filter(a => a.valid);
    if (validAccounts.length === 0) {
      setUploadMessage({ type: 'error', text: 'No valid accounts to upload.' });
      return;
    }

    setUploadLoading(true);
    setUploadMessage(null);

    try {
      const newEmails = validAccounts.map(a => ({
        email: a.email,
        password: a.password,
        status: 'available'
      }));

      const { error } = await supabase
        .from('emails_pool')
        .insert(newEmails);

      if (error) {
        if (error.code === '23505') {
          setUploadMessage({ type: 'error', text: 'Upload failed: One or more emails already exist in the database.' });
        } else {
          throw error;
        }
      } else {
        setUploadMessage({ type: 'success', text: `Successfully uploaded ${newEmails.length} accounts to the inventory pool!` });
        setBulkUploadText('');
        setShowPreview(false);
        setPreviewAccounts([]);
        if (onUploadSuccess) onUploadSuccess();
      }
    } catch (error) {
      console.error('Error uploading emails:', error);
      setUploadMessage({ type: 'error', text: 'An error occurred during upload. Please check your data and try again.' });
    } finally {
      setUploadLoading(false);
    }
  };

  const validCount = previewAccounts.filter(a => a.valid).length;
  const invalidCount = previewAccounts.length - validCount;

  return (
    <div className="bg-white dark:bg-[#151518] rounded-xl shadow-soft dark:shadow-none border border-gray-100 dark:border-[#26262d] overflow-hidden flex flex-col h-full">
      <div className="p-6 border-b border-gray-100 dark:border-[#26262d] flex justify-between items-center bg-gray-50/50 dark:bg-white/5">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center">
            <Database className="w-5 h-5 mr-2 text-primary" />
            Bulk Email Import
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Add multiple Adobe accounts to the inventory pool securely.</p>
        </div>
      </div>

      {!showPreview ? (
        <div className="p-6 flex-1 flex flex-col">
          {/* Tabs */}
          <div className="flex p-1 bg-gray-100 dark:bg-white/10 rounded-lg mb-6 w-fit">
            <button
              onClick={() => setActiveTab('paste')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                activeTab === 'paste' ? 'bg-white dark:bg-[#151518] text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-200'
              }`}
            >
              Paste Text
            </button>
            <button
              onClick={() => setActiveTab('csv')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                activeTab === 'csv' ? 'bg-white dark:bg-[#151518] text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-200'
              }`}
            >
              Upload CSV File
            </button>
          </div>

          {activeTab === 'paste' ? (
            <div className="flex-1 flex flex-col">
              <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg text-sm text-indigo-800 mb-4 flex items-start">
                <Info className="w-5 h-5 mr-2 flex-shrink-0 text-indigo-600" />
                <p>Format: <span className="font-mono bg-indigo-100 px-1 rounded">email@domain.com,password123</span> (One per line)</p>
              </div>
              <textarea
                value={bulkUploadText}
                onChange={(e) => setBulkUploadText(e.target.value)}
                placeholder="email1@example.com,pass1&#10;email2@example.com,pass2"
                className="flex-1 w-full p-4 border border-gray-300 dark:border-[#303038] rounded-xl text-sm focus:ring-primary focus:border-primary outline-none font-mono resize-none min-h-[200px]"
              />
              <button
                onClick={() => validateAndParseText(bulkUploadText)}
                disabled={!bulkUploadText.trim()}
                className="mt-4 w-full py-3 bg-gradient-primary text-white rounded-xl font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center"
              >
                Review Accounts
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-[#303038] rounded-xl bg-gray-50 dark:bg-white/5 p-12 text-center min-h-[250px]">
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Upload CSV File</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mb-6 max-w-sm">
                Your CSV file should contain two columns: Email and Password without any headers.
              </p>
              <label className="cursor-pointer">
                <span className="px-6 py-3 bg-white dark:bg-[#151518] border border-gray-300 dark:border-[#303038] text-gray-700 dark:text-gray-200 rounded-xl font-medium shadow-sm hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 transition-colors inline-flex items-center">
                  <Upload className="w-4 h-4 mr-2" />
                  Select File
                </span>
                <input 
                  type="file" 
                  accept=".csv,.txt" 
                  className="hidden" 
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          )}

          {uploadMessage && (
            <div className={`mt-4 p-3 rounded-lg flex items-start text-sm ${
              uploadMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {uploadMessage.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 mr-2 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
              )}
              <span>{uploadMessage.text}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 flex flex-col h-full">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">Review Import Data</h4>
            <button 
              onClick={() => setShowPreview(false)}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-4 mb-4">
            <div className="bg-green-50 text-green-800 px-3 py-1.5 rounded-lg text-sm font-medium border border-green-100 flex items-center">
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              {validCount} Valid
            </div>
            {invalidCount > 0 && (
              <div className="bg-red-50 text-red-800 px-3 py-1.5 rounded-lg text-sm font-medium border border-red-100 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1.5" />
                {invalidCount} Invalid
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-[#26262d] rounded-xl max-h-[300px]">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-white/5 sticky top-0">
                <tr>
                  <th className="py-2 px-4 font-semibold text-gray-600 dark:text-gray-300">Email</th>
                  <th className="py-2 px-4 font-semibold text-gray-600 dark:text-gray-300">Password</th>
                  <th className="py-2 px-4 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {previewAccounts.map((acc, idx) => (
                  <tr key={idx} className={acc.valid ? 'bg-white dark:bg-[#151518]' : 'bg-red-50/50'}>
                    <td className="py-2 px-4 font-medium">{acc.email || <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>}</td>
                    <td className="py-2 px-4 text-gray-600 dark:text-gray-300 font-mono">{acc.password || <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>}</td>
                    <td className="py-2 px-4">
                      {acc.valid ? (
                        <span className="text-green-600 flex items-center text-xs"><CheckCircle2 className="w-3 h-3 mr-1" /> OK</span>
                      ) : (
                        <span className="text-red-600 flex items-center text-xs"><AlertCircle className="w-3 h-3 mr-1" /> {acc.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex space-x-3">
            <button
              onClick={() => setShowPreview(false)}
              className="flex-1 py-3 border border-gray-300 dark:border-[#303038] text-gray-700 dark:text-gray-200 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-[#1c1c21] dark:bg-white/5 transition-colors"
            >
              Back to Edit
            </button>
            <button
              onClick={handleConfirmUpload}
              disabled={validCount === 0 || uploadLoading}
              className="flex-1 py-3 bg-gradient-primary text-white rounded-xl font-medium shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center"
            >
              {uploadLoading ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="w-5 h-5 mr-2" /> Confirm & Import {validCount} Accounts</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

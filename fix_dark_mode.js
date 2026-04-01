import fs from 'fs';
import path from 'path';

const TARGET_FILES = [
  'src/components/admin/AdminUserEmails.tsx',
  'src/components/admin/AdminAnalytics.tsx',
  'src/components/admin/AdminUserDetails.tsx',
  'src/components/admin/AdminProducts.tsx',
  'src/components/admin/AdminUsers.tsx',
  'src/components/admin/AdminOrders.tsx',
  'src/components/admin/AdminEmails.tsx',
  'src/components/admin/AdminNotices.tsx',
  'src/components/admin/AdminBulkUpload.tsx',
  'src/components/admin/AdminCoupons.tsx',
  'src/pages/AdobeEmail.tsx',
  'src/pages/Profile.tsx',
  'src/pages/Orders.tsx',
  'src/pages/RedeemCoupon.tsx',
  'src/pages/Checkout.tsx',
  'src/pages/Store.tsx',
  'src/pages/AdminDashboard.tsx'
];

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Fix Backgrounds
    content = content.replace(/bg-white(?!\/)(?!\s+dark:bg)/g, 'bg-white dark:bg-[#1A1A24]');
    content = content.replace(/bg-gray-50(?!\/)(?!\s+dark:bg)/g, 'bg-gray-50 dark:bg-white/5');
    content = content.replace(/bg-gray-100(?!\/)(?!\s+dark:bg)/g, 'bg-gray-100 dark:bg-white/10');
    content = content.replace(/bg-gray-50\/50(?!\s+dark:bg)/g, 'bg-gray-50/50 dark:bg-white/5');
    
    // Fix Text Colors
    content = content.replace(/text-gray-900(?!\s+dark:text)/g, 'text-gray-900 dark:text-white');
    content = content.replace(/text-gray-800(?!\s+dark:text)/g, 'text-gray-800 dark:text-gray-100');
    content = content.replace(/text-gray-700(?!\s+dark:text)/g, 'text-gray-700 dark:text-gray-200');
    content = content.replace(/text-gray-600(?!\s+dark:text)/g, 'text-gray-600 dark:text-gray-300');
    content = content.replace(/text-gray-500(?!\s+dark:text)/g, 'text-gray-500 dark:text-gray-400');
    content = content.replace(/text-gray-400(?!\s+dark:text)/g, 'text-gray-400 dark:text-gray-500');

    // Fix Borders
    content = content.replace(/border-gray-100(?!\s+dark:border)/g, 'border-gray-100 dark:border-white/10');
    content = content.replace(/border-gray-200(?!\s+dark:border)/g, 'border-gray-200 dark:border-white/10');
    content = content.replace(/border-gray-300(?!\s+dark:border)/g, 'border-gray-300 dark:border-white/20');
    
    // Fix Inputs and Selects (specifically for dark mode visibility)
    content = content.replace(/bg-transparent text-white/g, 'bg-transparent text-gray-900 dark:text-white');
    content = content.replace(/outline-none"/g, 'outline-none dark:bg-[#111116] dark:text-white"');
    content = content.replace(/outline-none transition-colors"/g, 'outline-none transition-colors dark:bg-[#111116] dark:text-white"');

    // Table specific fixes
    content = content.replace(/divide-gray-200(?!\s+dark:divide)/g, 'divide-gray-200 dark:divide-white/10');
    content = content.replace(/divide-gray-100(?!\s+dark:divide)/g, 'divide-gray-100 dark:divide-white/5');

    // Fix specific hardcoded black text that breaks dark mode
    content = content.replace(/text-black/g, 'text-black dark:text-white');

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  } catch (err) {
    console.error(`Failed to process ${filePath}:`, err.message);
  }
}

TARGET_FILES.forEach(processFile);
console.log("Dark mode classes applied via script.");

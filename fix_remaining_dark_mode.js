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
  'src/pages/AdminDashboard.tsx',
  'src/pages/Dashboard.tsx'
];

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Deep background fixes
    content = content.replace(/bg-background(?!\s+dark:bg)/g, 'bg-background dark:bg-[#0A0A0A]');
    
    // Check for any text-gray-900 that might have been missed
    content = content.replace(/text-gray-900(?!\s+dark:text)/g, 'text-gray-900 dark:text-white');
    content = content.replace(/text-black(?!\/)(?!\s+dark:text)/g, 'text-black dark:text-white');
    
    // Ensure all tables and cards have proper backgrounds
    content = content.replace(/bg-white(?!\/)(?!\s+dark:bg)/g, 'bg-white dark:bg-[#1A1A24]');

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  } catch (err) {
    console.error(`Failed to process ${filePath}:`, err.message);
  }
}

TARGET_FILES.forEach(processFile);
console.log("Deep dark mode sweep completed.");

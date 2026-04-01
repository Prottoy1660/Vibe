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
  'src/pages/Dashboard.tsx',
  'src/components/Layout.tsx'
];

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Premium Dark Mode Palette
    // Main bg: #0a0a0b (very deep dark, almost black)
    // Sidebar/Header bg: #111113 (slightly lighter)
    // Card bg: #151518 (surface)
    // Hover state: #1c1c21
    // Border: #26262d

    // 1. Fix Hardcoded background colors to semantic premium colors
    content = content.replace(/dark:bg-\[\#0A0A0A\]/g, 'dark:bg-[#0a0a0b]');
    content = content.replace(/dark:bg-\[\#111116\]/g, 'dark:bg-[#111113]');
    content = content.replace(/dark:bg-\[\#1A1A24\]/g, 'dark:bg-[#151518]');
    
    // 2. Fix Light mode hover states (they were breaking because of generic replacements)
    // Standardize row/card hovers for BOTH modes
    content = content.replace(/hover:bg-gray-50(?!\/)(?!\s+dark:hover)/g, 'hover:bg-gray-50 dark:hover:bg-[#1c1c21]');
    content = content.replace(/hover:bg-gray-50\/50(?!\s+dark:hover)/g, 'hover:bg-gray-50/50 dark:hover:bg-[#1c1c21]/50');
    content = content.replace(/hover:bg-gray-100(?!\/)(?!\s+dark:hover)/g, 'hover:bg-gray-100 dark:hover:bg-[#1c1c21]');

    // 3. Fix borders to be very subtle in dark mode
    content = content.replace(/dark:border-white\/5/g, 'dark:border-[#26262d]');
    content = content.replace(/dark:border-white\/10/g, 'dark:border-[#26262d]');
    content = content.replace(/dark:border-white\/20/g, 'dark:border-[#303038]');

    // 4. Fix input backgrounds to match the card surfaces
    content = content.replace(/dark:bg-\[\#111116\]/g, 'dark:bg-[#111113]'); // For inputs inside cards

    // 5. Fix Shadows (Dark mode shouldn't have light shadow-soft, it needs a glow or no shadow)
    content = content.replace(/shadow-soft(?!\s+dark:shadow)/g, 'shadow-soft dark:shadow-none');

    // 6. Fix text colors to be premium (not pure white)
    content = content.replace(/dark:text-white/g, 'dark:text-gray-100');

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  } catch (err) {
    console.error(`Failed to process ${filePath}:`, err.message);
  }
}

TARGET_FILES.forEach(processFile);
console.log("Premium dark mode and hover fixes applied.");
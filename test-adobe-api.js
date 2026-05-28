import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const ADOBE_API_KEY = process.env.ADOBE_API_KEY || '';
const ADOBE_BASE_URL = 'https://reseller.ado-besoft.com/api/credits-pool/external';

async function testApi() {
  const body = {
    email: 'mahmudulhasan1660@gmail.com',
    durationMonths: '1'
  };

  const timestamp = Date.now().toString();
  const payload = timestamp + JSON.stringify(body);
  const signature = crypto
    .createHmac('sha256', ADOBE_API_KEY)
    .update(payload)
    .digest('hex');

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': ADOBE_API_KEY,
    'x-timestamp': timestamp,
    'x-signature': signature,
  };

  console.log('Sending request to:', \\/add-user\);
  console.log('Headers:', headers);
  console.log('Body:', body);

  try {
    const response = await fetch(\\/add-user\, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    console.log('\nResponse Status:', response.status, response.statusText);
    const text = await response.text();
    console.log('Raw Response Text:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testApi();

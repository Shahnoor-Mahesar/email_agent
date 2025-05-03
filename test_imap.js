const Imap = require('imap');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const imap = new Imap({
  user: process.env.EMAIL_ADDRESS,
  password: process.env.EMAIL_PASSWORD,
  host: process.env.IMAP_SERVER,
  port: parseInt(process.env.IMAP_PORT, 10),
  tls: true,
  connTimeout: 10000,
  authTimeout: 10000
});

imap.once('ready', () => {
  console.log('Connected to IMAP server');
  imap.end();
});

imap.once('error', (err) => {
  console.error(`IMAP error: ${err.message}`);
});

imap.once('end', () => {
  console.log('Disconnected');
});

imap.connect();
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({
  path: path.join(__dirname, '..', '.env'),
  override: process.env.NODE_ENV !== 'production',
});
